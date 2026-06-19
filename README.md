# px-diff

Visual pixel-by-pixel comparison of web pages. Renders pages in a headless browser, compares every pixel, and outputs clear diff images showing exactly what changed and where.

## Install

```bash
npm i px-diff
```

## Usage

```bash
# Compare two URLs
px-diff https://example.com https://google.com

# Compare local HTML files
px-diff ./old.html ./new.html

# Compare multiple URLs (all pairs)
px-diff https://a.com https://b.com https://c.com

# Custom output directory
px-diff url1 url2 --out ./my-diffs

# Output as JSON with base64 images (for CI/programmatic use)
px-diff url1 url2 --json --base64
```

## Example

```
$ px-diff https://staging.app https://prod.app

  Comparing 2 URLs (1 pair)

  ─── https://staging.app
   vs  https://prod.app
  Resolution:  1440x900
  Difference:  3.21% (41,602 px)
  Match:       96.79%
  Regions:     4
    Region 1: (24,12) 320x48    →  .px-diff/region-1-diff.png
    Region 2: (140,210) 680x90  →  .px-diff/region-2-diff.png
    Region 3: (500,410) 120x36  →  .px-diff/region-3-diff.png
    Region 4: (0,840) 1440x60   →  .px-diff/region-4-diff.png
  Full overlay: .px-diff/diff-full.png
```

```
$ cat .px-diff/info.txt

px-diff

staging.app  vs  prod.app
Viewport: 1440x900
Rendered: 1440x900

Difference: 3.21%
Match: 96.79%
Mismatched pixels: 41,602 / 1,296,000

Diff regions: 4

  Region 1: position (24, 12) size 320x48
    Image: region-1-diff.png  (side-by-side: staging.app left, prod.app right)
  Region 2: position (140, 210) size 680x90
    Image: region-2-diff.png  (side-by-side: staging.app left, prod.app right)
  Region 3: position (500, 410) size 120x36
    Image: region-3-diff.png  (side-by-side: staging.app left, prod.app right)
  Region 4: position (0, 840) size 1440x60
    Image: region-4-diff.png  (side-by-side: staging.app left, prod.app right)

Full overlay: diff-full.png  (prod.app with red outlines on diff regions)
```

## Output

All output is written to `.px-diff/` by default:

- **`info.txt`** — Plain-text summary with diff %, regions, and image references
- **`diff-full.png`** — Full page screenshot with red outlines around differences
- **`region-N-diff.png`** — Side-by-side crops of each diff region

## Options

| Flag | Description | Default |
|---|---|---|
| `--width <px>` | Viewport width | `1440` |
| `--height <px>` | Viewport height | `900` |
| `--threshold <0-1>` | Pixel sensitivity (0 = exact, 1 = lenient) | `0.1` |
| `--padding <px>` | Context around cropped diff regions | `40` |
| `--merge-gap <px>` | Merge regions closer than this | `40` |
| `--gap <px>` | Side-by-side gap width | `5` |
| `--gap-bg <r,g,b>` | Side-by-side gap color | `240,240,240` |
| `--overlay-opacity <0-1>` | White wash intensity on full diff | `0.4` |
| `--outline-color <r,g,b>` | Outline box color | `255,0,0` |
| `--outline-thickness <px>` | Outline box width | `3` |
| `--outline-padding <px>` | Space inside outline box | `10` |
| `--out <dir>` | Output directory | `.px-diff` |
| `--concurrency <n>` | Max parallel browsers | `3` |
| `--base64` | Return images as base64 (no disk writes) | `false` |
| `--json` | Output results as JSON | `false` |

## Programmatic API

```ts
import { comparePair, defaults } from "px-diff";

const result = await comparePair(
  "https://staging.app",
  "https://prod.app",
  { ...defaults },
  "staging-vs-prod",
);

result.diffPercent       // 3.21
result.matchPercent      // 96.79
result.mismatchedPixels  // 41602
result.regions           // [{ x1, y1, x2, y2 }, ...]
result.outputDir         // ".px-diff/staging-vs-prod"
```
