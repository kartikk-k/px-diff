#!/usr/bin/env bun

import path from "path";
import { defaults } from "./config.ts";
import type { DiffOptions } from "./config.ts";
import { comparePair } from "./compare.ts";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Resolve a CLI argument to a full URL (handles local file paths) */
function toUrl(input: string): string {
  if (/^https?:\/\//.test(input) || input.startsWith("file://")) {
    return input;
  }
  return "file://" + path.resolve(input);
}

/** Parse an RGB string like "255,0,0" into { r, g, b } */
function parseRgb(str: string): { r: number; g: number; b: number } {
  const parts = str.split(",").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid RGB value: "${str}". Expected format: "r,g,b" (e.g. "255,0,0")`);
  }
  return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
}

/** Create a sanitized directory name from a URL */
function urlToLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
  } catch {
    return url.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 50);
  }
}

/** Run async tasks with a concurrency limit */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]!();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ─── PLAYWRIGHT CHECK ─────────────────────────────────────────────────────────

async function ensurePlaywright(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch (err: any) {
    const msg = String(err?.message || err);

    // Browser binary not installed
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      console.error("\n  Playwright browsers are not installed.\n");

      // In CI, just install automatically
      if (process.env.CI) {
        console.log("  CI detected — installing Chromium automatically...\n");
        const proc = Bun.spawn(["bunx", "playwright", "install", "chromium", "--with-deps"], {
          stdout: "inherit",
          stderr: "inherit",
        });
        const code = await proc.exited;
        if (code !== 0) {
          console.error("  Failed to install Playwright browsers.");
          return false;
        }
        console.log("");
        return true;
      }

      // Interactive — ask the user
      process.stdout.write("  Would you like to install them now? (y/n): ");
      const response = await new Promise<string>((resolve) => {
        process.stdin.once("data", (data) => resolve(data.toString().trim().toLowerCase()));
      });

      if (response === "y" || response === "yes") {
        console.log("\n  Installing Chromium...\n");
        const proc = Bun.spawn(["bunx", "playwright", "install", "chromium"], {
          stdout: "inherit",
          stderr: "inherit",
        });
        const code = await proc.exited;
        if (code !== 0) {
          console.error("  Failed to install Playwright browsers.");
          return false;
        }
        console.log("");
        return true;
      }

      console.error("  px-diff requires a Playwright browser (Chromium) to render pages.");
      console.error("  Run: bunx playwright install chromium\n");
      return false;
    }

    // Some other error
    console.error("Unexpected error launching browser:", msg);
    return false;
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  px-diff — Visual pixel-by-pixel comparison of web pages

  USAGE
    px-diff <url1> <url2> [url3 ...] [options]

  Compares every pair of provided URLs and outputs diff images.
  Minimum 2 URLs required, maximum ${defaults.maxUrls}.

  OPTIONS
    --width <px>              Viewport width                     (default: ${defaults.viewportWidth})
    --height <px>             Viewport height                    (default: ${defaults.viewportHeight})
    --threshold <0-1>         Pixel sensitivity                  (default: ${defaults.pixelThreshold})
    --padding <px>            Context around diff regions        (default: ${defaults.regionPadding})
    --merge-gap <px>          Merge regions closer than this     (default: ${defaults.mergeGap})
    --gap <px>                Side-by-side gap width             (default: ${defaults.sideBySideGap})
    --gap-bg <r,g,b>          Side-by-side gap color             (default: 240,240,240)
    --overlay-opacity <0-1>   White wash intensity               (default: ${defaults.overlayOpacity})
    --outline-color <r,g,b>   Outline box color                  (default: 255,0,0)
    --outline-thickness <px>  Outline box width                  (default: ${defaults.outlineThickness})
    --outline-padding <px>    Space inside outline box           (default: ${defaults.outlinePadding})
    --out <dir>               Output directory                   (default: .px-diff)
    --concurrency <n>         Max parallel browsers              (default: ${defaults.concurrency})
    --base64                  Output images as base64 to stdout  (default: false)
    --json                    Output results as JSON             (default: false)
    --help                    Show this help message

  EXAMPLES
    px-diff https://example.com https://google.com
    px-diff ./old.html ./new.html --threshold 0.2
    px-diff https://a.com https://b.com https://c.com --concurrency 2
    px-diff https://a.com https://b.com --base64 --json
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  // Separate URLs from flags
  const urls: string[] = [];
  let wantsBase64 = false;
  let wantsJson = false;

  const opts: DiffOptions = {
    viewportWidth: defaults.viewportWidth,
    viewportHeight: defaults.viewportHeight,
    pixelThreshold: defaults.pixelThreshold,
    regionPadding: defaults.regionPadding,
    mergeGap: defaults.mergeGap,
    sideBySideGap: defaults.sideBySideGap,
    sideBySideBg: { ...defaults.sideBySideBg },
    overlayOpacity: defaults.overlayOpacity,
    outlineColor: { ...defaults.outlineColor },
    outlineThickness: defaults.outlineThickness,
    outlinePadding: defaults.outlinePadding,
    outDir: defaults.outDir,
    concurrency: defaults.concurrency,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = () => {
      if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
      return args[++i]!;
    };

    switch (arg) {
      case "--width":            opts.viewportWidth = parseInt(next()); break;
      case "--height":           opts.viewportHeight = parseInt(next()); break;
      case "--threshold":        opts.pixelThreshold = parseFloat(next()); break;
      case "--padding":          opts.regionPadding = parseInt(next()); break;
      case "--merge-gap":        opts.mergeGap = parseInt(next()); break;
      case "--gap":              opts.sideBySideGap = parseInt(next()); break;
      case "--gap-bg":           opts.sideBySideBg = parseRgb(next()); break;
      case "--overlay-opacity":  opts.overlayOpacity = parseFloat(next()); break;
      case "--outline-color":    opts.outlineColor = parseRgb(next()); break;
      case "--outline-thickness": opts.outlineThickness = parseInt(next()); break;
      case "--outline-padding":  opts.outlinePadding = parseInt(next()); break;
      case "--out":              opts.outDir = next(); break;
      case "--concurrency":      opts.concurrency = parseInt(next()); break;
      case "--base64":           wantsBase64 = true; break;
      case "--json":             wantsJson = true; break;
      case "--help":             printHelp(); process.exit(0);
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown flag: ${arg}\nRun px-diff --help for usage.`);
          process.exit(1);
        }
        urls.push(arg);
    }
  }

  // Validate URL count
  if (urls.length < defaults.minUrls) {
    console.error(`Error: At least ${defaults.minUrls} URLs are required. Got ${urls.length}.`);
    console.error("Run px-diff --help for usage.");
    process.exit(1);
  }
  if (urls.length > defaults.maxUrls) {
    console.error(`Error: Maximum ${defaults.maxUrls} URLs allowed. Got ${urls.length}.`);
    process.exit(1);
  }

  // Resolve URLs
  const resolvedUrls = urls.map(toUrl);

  // Ensure playwright is available
  const ready = await ensurePlaywright();
  if (!ready) process.exit(1);

  // Build all unique pairs: (0,1), (0,2), ..., (n-2, n-1)
  const pairs: { a: number; b: number }[] = [];
  for (let i = 0; i < resolvedUrls.length; i++) {
    for (let j = i + 1; j < resolvedUrls.length; j++) {
      pairs.push({ a: i, b: j });
    }
  }

  if (!wantsJson) {
    console.log(`\n  Comparing ${resolvedUrls.length} URLs (${pairs.length} pair${pairs.length === 1 ? "" : "s"})\n`);
  }

  // Run comparisons with concurrency control
  const tasks = pairs.map(({ a, b }) => {
    const labelA = urlToLabel(resolvedUrls[a]!);
    const labelB = urlToLabel(resolvedUrls[b]!);
    const pairLabel = resolvedUrls.length === 2 ? "" : `${labelA}_vs_${labelB}`;

    return () => comparePair(resolvedUrls[a]!, resolvedUrls[b]!, opts, pairLabel, wantsBase64);
  });

  const results = await runWithConcurrency(tasks, opts.concurrency);

  // Output results
  if (wantsJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const result of results) {
    console.log(`  ─── ${result.urlA}`);
    console.log(`   vs  ${result.urlB}`);
    console.log(`  Resolution:  ${result.width}x${result.height}`);
    console.log(`  Difference:  ${result.diffPercent.toFixed(2)}% (${result.mismatchedPixels.toLocaleString()} px)`);
    console.log(`  Match:       ${result.matchPercent.toFixed(2)}%`);
    console.log(`  Regions:     ${result.regions.length}`);

    if (!wantsBase64) {
      for (let i = 0; i < result.regions.length; i++) {
        const r = result.regions[i]!;
        const rw = r.x2 - r.x1 + 1;
        const rh = r.y2 - r.y1 + 1;
        console.log(`    Region ${i + 1}: (${r.x1},${r.y1}) ${rw}x${rh}  →  ${path.join(result.outputDir, `region-${i + 1}-diff.png`)}`);
      }
      console.log(`  Full overlay: ${path.join(result.outputDir, "diff-full.png")}`);
    }

    console.log("");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
