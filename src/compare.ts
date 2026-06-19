import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import fs from "fs";
import path from "path";
import type { DiffOptions, Region, ComparisonResult } from "./config.js";
import { screenshotPage } from "./screenshot.js";
import { padImage, cropRegion, createSideBySide, createFullDiffOverlay } from "./image.js";

/** Extract domain+path from a URL, or return the raw string for file paths */
function toShortLabel(url: string): string {
  if (url.startsWith("file://")) {
    return url.replace("file://", "");
  }
  try {
    const parsed = new URL(url);
    const pathStr = parsed.pathname === "/" ? "" : parsed.pathname;
    return parsed.host + pathStr;
  } catch {
    return url;
  }
}

// ─── DIFF REGION DETECTION ────────────────────────────────────────────────────

/** Find contiguous clusters of diff pixels via flood fill */
function findDiffRegions(diff: PNG): Region[] {
  const visited = new Uint8Array(diff.width * diff.height);
  const regions: Region[] = [];

  for (let y = 0; y < diff.height; y++) {
    for (let x = 0; x < diff.width; x++) {
      const idx = y * diff.width + x;
      if (visited[idx]) continue;

      const px = idx * 4;
      const r = diff.data[px]!;
      const g = diff.data[px + 1]!;
      const a = diff.data[px + 3]!;

      // pixelmatch marks diff pixels as bright red
      if (!(a > 0 && r > 200 && g < 100)) continue;

      const region: Region = { x1: x, y1: y, x2: x, y2: y };
      const stack = [[x, y]];

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (cx! < 0 || cx! >= diff.width || cy! < 0 || cy! >= diff.height) continue;
        const ci = cy! * diff.width + cx!;
        if (visited[ci]) continue;

        const cpx = ci * 4;
        const cr = diff.data[cpx]!;
        const cg = diff.data[cpx + 1]!;
        const ca = diff.data[cpx + 3]!;
        if (!(ca > 0 && cr > 200 && cg < 100)) continue;

        visited[ci] = 1;
        region.x1 = Math.min(region.x1, cx!);
        region.y1 = Math.min(region.y1, cy!);
        region.x2 = Math.max(region.x2, cx!);
        region.y2 = Math.max(region.y2, cy!);

        stack.push([cx! - 1, cy!], [cx! + 1, cy!], [cx!, cy! - 1], [cx!, cy! + 1]);
      }

      regions.push(region);
    }
  }

  return regions;
}

/** Iteratively merge regions that are within `gap` px of each other */
function mergeCloseRegions(regions: Region[], gap: number): Region[] {
  if (regions.length === 0) return [];

  const sorted = [...regions].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const merged: Region[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    let didMerge = false;

    for (let j = 0; j < merged.length; j++) {
      const existing = merged[j]!;
      const xClose = current.x1 <= existing.x2 + gap && current.x2 >= existing.x1 - gap;
      const yClose = current.y1 <= existing.y2 + gap && current.y2 >= existing.y1 - gap;

      if (xClose && yClose) {
        existing.x1 = Math.min(existing.x1, current.x1);
        existing.y1 = Math.min(existing.y1, current.y1);
        existing.x2 = Math.max(existing.x2, current.x2);
        existing.y2 = Math.max(existing.y2, current.y2);
        didMerge = true;
        break;
      }
    }

    if (!didMerge) {
      merged.push({ ...current });
    }
  }

  // Repeat until stable — merging can create new overlaps
  if (merged.length < regions.length) {
    return mergeCloseRegions(merged, gap);
  }

  return merged;
}

// ─── CORE COMPARISON ──────────────────────────────────────────────────────────

/**
 * Compare two URLs pixel-by-pixel.
 * Writes output images to `opts.outDir/<pairLabel>/` and returns structured results.
 * If `base64` is true, output images are returned as base64 strings instead of being written to disk.
 */
export async function comparePair(
  urlA: string,
  urlB: string,
  opts: DiffOptions,
  pairLabel: string,
  base64: boolean = false,
): Promise<ComparisonResult & { images?: Record<string, string> }> {
  const viewport = { width: opts.viewportWidth, height: opts.viewportHeight };

  // Take screenshots
  const [bufA, bufB] = await Promise.all([
    screenshotPage(urlA, viewport),
    screenshotPage(urlB, viewport),
  ]);

  const imgA = PNG.sync.read(bufA);
  const imgB = PNG.sync.read(bufB);

  // Normalize to same dimensions
  const width = Math.max(imgA.width, imgB.width);
  const height = Math.max(imgA.height, imgB.height);
  const paddedA = padImage(imgA, width, height);
  const paddedB = padImage(imgB, width, height);

  // Pixel diff
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(
    paddedA.data,
    paddedB.data,
    diff.data,
    width,
    height,
    { threshold: opts.pixelThreshold },
  );

  const totalPixels = width * height;
  const diffPercent = (mismatchedPixels / totalPixels) * 100;
  const matchPercent = 100 - diffPercent;

  // Detect and merge diff regions
  const rawRegions = findDiffRegions(diff);
  const regions = mergeCloseRegions(rawRegions, opts.mergeGap);
  regions.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

  // Generate output images
  const images: Record<string, Buffer> = {};

  // Full diff overlay (based on page B)
  const fullOverlay = createFullDiffOverlay(
    paddedB, regions,
    opts.overlayOpacity, opts.outlineColor, opts.outlineThickness, opts.outlinePadding,
  );
  images["diff-full.png"] = Buffer.from(PNG.sync.write(fullOverlay));

  // Side-by-side crop for each region
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]!;
    const cropA = cropRegion(paddedA, region, opts.regionPadding);
    const cropB = cropRegion(paddedB, region, opts.regionPadding);
    const sideBySide = createSideBySide(cropA, cropB, opts.sideBySideGap, opts.sideBySideBg);
    images[`region-${i + 1}-diff.png`] = Buffer.from(PNG.sync.write(sideBySide));
  }

  // Build info.txt
  const labelA = toShortLabel(urlA);
  const labelB = toShortLabel(urlB);

  const infoLines: string[] = [
    `px-diff`,
    ``,
    `${labelA}  vs  ${labelB}`,
    `Viewport: ${opts.viewportWidth}x${opts.viewportHeight}`,
    `Rendered: ${width}x${height}`,
    ``,
    `Difference: ${diffPercent.toFixed(2)}%`,
    `Match: ${matchPercent.toFixed(2)}%`,
    `Mismatched pixels: ${mismatchedPixels.toLocaleString()} / ${totalPixels.toLocaleString()}`,
    ``,
    `Diff regions: ${regions.length}`,
  ];

  if (regions.length > 0) {
    infoLines.push(``);
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]!;
      const rw = r.x2 - r.x1 + 1;
      const rh = r.y2 - r.y1 + 1;
      infoLines.push(`  Region ${i + 1}: position (${r.x1}, ${r.y1}) size ${rw}x${rh}`);
      infoLines.push(`    Image: region-${i + 1}-diff.png  (side-by-side: ${labelA} left, ${labelB} right)`);
    }
  }

  infoLines.push(``);
  infoLines.push(`Full overlay: diff-full.png  (${labelB} with red outlines on diff regions)`);
  infoLines.push(``);

  const infoTxt = infoLines.join("\n");

  // Write to disk or collect as base64
  const pairDir = path.join(opts.outDir, pairLabel);
  let base64Images: Record<string, string> | undefined;

  if (base64) {
    base64Images = { "info.txt": Buffer.from(infoTxt).toString("base64") };
    for (const [name, buf] of Object.entries(images)) {
      base64Images[name] = buf.toString("base64");
    }
  } else {
    if (fs.existsSync(pairDir)) fs.rmSync(pairDir, { recursive: true });
    fs.mkdirSync(pairDir, { recursive: true });

    const writePromises = Object.entries(images).map(([name, buf]) =>
      fs.promises.writeFile(path.join(pairDir, name), buf),
    );
    writePromises.push(fs.promises.writeFile(path.join(pairDir, "info.txt"), infoTxt));
    await Promise.all(writePromises);
  }

  return {
    urlA,
    urlB,
    width,
    height,
    totalPixels,
    mismatchedPixels,
    diffPercent,
    matchPercent,
    regions,
    outputDir: pairDir,
    images: base64Images,
  };
}
