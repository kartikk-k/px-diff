# px-diff

Pixel-by-pixel visual comparison of web pages.

Renders each URL in headless Chromium via Playwright, compares every pixel, detects diff regions, and outputs side-by-side crops and a full-page overlay with red outlines on changed areas.

## Install

```
npm i px-diff
```

## CLI

```
px-diff <url1> <url2> [url3 ...] [options]
```

Minimum 2 URLs, maximum 100. Every unique pair is compared.

### Flags

```
--width <px>              Viewport width                     (default: 1440)
--height <px>             Viewport height                    (default: 900)
--threshold <0-1>         Pixel sensitivity                  (default: 0.1)
--padding <px>            Context around diff regions        (default: 40)
--merge-gap <px>          Merge regions closer than this     (default: 40)
--gap <px>                Side-by-side gap width             (default: 5)
--gap-bg <r,g,b>          Side-by-side gap color             (default: 240,240,240)
--overlay-opacity <0-1>   White wash intensity               (default: 0.4)
--outline-color <r,g,b>   Outline box color                  (default: 255,0,0)
--outline-thickness <px>  Outline box width                  (default: 3)
--outline-padding <px>    Space inside outline box           (default: 10)
--out <dir>               Output directory                   (default: .px-diff)
--concurrency <n>         Max parallel browsers              (default: 3)
--base64                  Images as base64 strings           (default: false)
--json                    Output as JSON                     (default: false)
```

### Output

All output is written to `.px-diff/` (or the directory specified by `--out`).

```
.px-diff/
  info.txt              Plain-text summary (read this first)
  diff-full.png         Full page with red outlines on diff regions
  region-1-diff.png     Side-by-side crop (left = page A, right = page B)
  region-2-diff.png
  ...
```

`info.txt` contains:
- Both URLs (shown as domain/path)
- Viewport and rendered resolution
- Difference and match percentages
- Pixel counts
- Each region with position, size, and its image filename

When comparing 3+ URLs, each pair gets its own subdirectory named `domainA_vs_domainB/`.

### Examples

```sh
# Compare two URLs
px-diff https://staging.app https://prod.app

# Compare local HTML files
px-diff ./old.html ./new.html

# Lenient threshold, custom output dir
px-diff url1 url2 --threshold 0.3 --out ./my-diffs

# Multiple URLs (3 pairs compared)
px-diff https://a.com https://b.com https://c.com --concurrency 2

# JSON output with base64 images (for CI / programmatic use)
px-diff url1 url2 --json --base64
```

## Programmatic API

```ts
import { comparePair, defaults } from "px-diff";
import type { DiffOptions, ComparisonResult, Region } from "px-diff";

const result: ComparisonResult = await comparePair(
  "https://staging.app",
  "https://prod.app",
  { ...defaults },       // DiffOptions — all flags as an object
  "staging-vs-prod",     // label used for output subdirectory
);

result.diffPercent       // number — e.g. 3.21
result.matchPercent      // number — e.g. 96.79
result.mismatchedPixels  // number — e.g. 41602
result.totalPixels       // number — e.g. 1296000
result.width             // number — rendered width
result.height            // number — rendered height
result.regions           // Region[] — { x1, y1, x2, y2 }
result.outputDir         // string — path where images were written
```

To get base64 images instead of writing to disk:

```ts
const result = await comparePair(urlA, urlB, { ...defaults }, "label", true);
result.images            // Record<string, string> — filename → base64 PNG
```

## Defaults object

```ts
{
  viewportWidth: 1440,
  viewportHeight: 900,
  pixelThreshold: 0.1,
  regionPadding: 40,
  mergeGap: 40,
  sideBySideGap: 5,
  sideBySideBg: { r: 240, g: 240, b: 240 },
  overlayOpacity: 0.4,
  outlineColor: { r: 255, g: 0, b: 0 },
  outlineThickness: 3,
  outlinePadding: 10,
  outDir: ".px-diff",
  concurrency: 3,
}
```

## Requirements

- Node.js 18+ or Bun
- Playwright (installed automatically on first run if missing)
