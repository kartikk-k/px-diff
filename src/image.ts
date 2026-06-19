import { PNG } from "pngjs";
import type { Region, RGB } from "./config.ts";

/** Pad an image to target dimensions, filling extra space with transparent black */
export function padImage(img: PNG, targetWidth: number, targetHeight: number): PNG {
  if (img.width === targetWidth && img.height === targetHeight) return img;

  const padded = new PNG({ width: targetWidth, height: targetHeight });
  padded.data.fill(0);

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      padded.data[dstIdx] = img.data[srcIdx]!;
      padded.data[dstIdx + 1] = img.data[srcIdx + 1]!;
      padded.data[dstIdx + 2] = img.data[srcIdx + 2]!;
      padded.data[dstIdx + 3] = img.data[srcIdx + 3]!;
    }
  }

  return padded;
}

/** Crop a rectangular region from an image with optional padding */
export function cropRegion(img: PNG, region: Region, padding: number): PNG {
  const x1 = Math.max(0, region.x1 - padding);
  const y1 = Math.max(0, region.y1 - padding);
  const x2 = Math.min(img.width - 1, region.x2 + padding);
  const y2 = Math.min(img.height - 1, region.y2 + padding);
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;

  const cropped = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y1 + y) * img.width + (x1 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      cropped.data[dstIdx] = img.data[srcIdx]!;
      cropped.data[dstIdx + 1] = img.data[srcIdx + 1]!;
      cropped.data[dstIdx + 2] = img.data[srcIdx + 2]!;
      cropped.data[dstIdx + 3] = img.data[srcIdx + 3]!;
    }
  }
  return cropped;
}

/** Place two images side by side with a colored gap between them */
export function createSideBySide(left: PNG, right: PNG, gap: number, bg: RGB): PNG {
  const height = Math.max(left.height, right.height);
  const width = left.width + gap + right.width;

  const out = new PNG({ width, height });

  // Fill with background color
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = bg.r;
    out.data[i * 4 + 1] = bg.g;
    out.data[i * 4 + 2] = bg.b;
    out.data[i * 4 + 3] = 255;
  }

  // Draw left image
  for (let y = 0; y < left.height; y++) {
    for (let x = 0; x < left.width; x++) {
      const srcIdx = (y * left.width + x) * 4;
      const dstIdx = (y * width + x) * 4;
      out.data[dstIdx] = left.data[srcIdx]!;
      out.data[dstIdx + 1] = left.data[srcIdx + 1]!;
      out.data[dstIdx + 2] = left.data[srcIdx + 2]!;
      out.data[dstIdx + 3] = left.data[srcIdx + 3]!;
    }
  }

  // Draw right image
  const offsetX = left.width + gap;
  for (let y = 0; y < right.height; y++) {
    for (let x = 0; x < right.width; x++) {
      const srcIdx = (y * right.width + x) * 4;
      const dstIdx = (y * width + (offsetX + x)) * 4;
      out.data[dstIdx] = right.data[srcIdx]!;
      out.data[dstIdx + 1] = right.data[srcIdx + 1]!;
      out.data[dstIdx + 2] = right.data[srcIdx + 2]!;
      out.data[dstIdx + 3] = right.data[srcIdx + 3]!;
    }
  }

  return out;
}

/** Render the full-page diff overlay: base image with white wash on unchanged areas + outline boxes */
export function createFullDiffOverlay(
  baseImg: PNG,
  regions: Region[],
  overlayOpacity: number,
  outlineColor: RGB,
  outlineThickness: number,
  outlinePadding: number,
): PNG {
  const { width, height } = baseImg;
  const out = new PNG({ width, height });

  // Build a mask: 1 = inside a diff region box
  const insideRegion = new Uint8Array(width * height);
  for (const r of regions) {
    const rx1 = Math.max(0, r.x1 - outlinePadding);
    const ry1 = Math.max(0, r.y1 - outlinePadding);
    const rx2 = Math.min(width - 1, r.x2 + outlinePadding);
    const ry2 = Math.min(height - 1, r.y2 + outlinePadding);
    for (let y = ry1; y <= ry2; y++) {
      for (let x = rx1; x <= rx2; x++) {
        insideRegion[y * width + x] = 1;
      }
    }
  }

  // Copy base image, applying white wash to unchanged areas
  for (let i = 0; i < width * height; i++) {
    const px = i * 4;
    const r = baseImg.data[px]!;
    const g = baseImg.data[px + 1]!;
    const b = baseImg.data[px + 2]!;
    const a = baseImg.data[px + 3]!;

    if (insideRegion[i]) {
      out.data[px] = r;
      out.data[px + 1] = g;
      out.data[px + 2] = b;
      out.data[px + 3] = a;
    } else {
      out.data[px] = Math.round(r + (255 - r) * overlayOpacity);
      out.data[px + 1] = Math.round(g + (255 - g) * overlayOpacity);
      out.data[px + 2] = Math.round(b + (255 - b) * overlayOpacity);
      out.data[px + 3] = a;
    }
  }

  // Draw outline boxes
  for (const r of regions) {
    const bx1 = Math.max(0, r.x1 - outlinePadding);
    const by1 = Math.max(0, r.y1 - outlinePadding);
    const bx2 = Math.min(width - 1, r.x2 + outlinePadding);
    const by2 = Math.min(height - 1, r.y2 + outlinePadding);

    for (let t = 0; t < outlineThickness; t++) {
      for (let x = bx1; x <= bx2; x++) {
        if (by1 + t < height) setPixel(out, x, by1 + t, outlineColor);
        if (by2 - t >= 0)     setPixel(out, x, by2 - t, outlineColor);
      }
      for (let y = by1; y <= by2; y++) {
        if (bx1 + t < width) setPixel(out, bx1 + t, y, outlineColor);
        if (bx2 - t >= 0)    setPixel(out, bx2 - t, y, outlineColor);
      }
    }
  }

  return out;
}

function setPixel(img: PNG, x: number, y: number, color: RGB) {
  const idx = (y * img.width + x) * 4;
  img.data[idx] = color.r;
  img.data[idx + 1] = color.g;
  img.data[idx + 2] = color.b;
  img.data[idx + 3] = 255;
}
