# px-diff

Visual pixel-by-pixel comparison of web pages. Renders pages in a headless browser, compares every pixel, and outputs clear diff images showing exactly what changed and where.

## Install

```bash
bun install px-diff
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

## Output

For each pair of URLs, px-diff generates:

- **`diff-full.png`** — Full page screenshot with red outlines around differences and a light white wash over unchanged areas
- **`region-N-diff.png`** — Side-by-side crops of each diff region (page 1 on the left, page 2 on the right)

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
| `--out <dir>` | Output directory | `./diff-output` |
| `--concurrency <n>` | Max parallel browsers | `3` |
| `--base64` | Return images as base64 (no disk writes) | `false` |
| `--json` | Output results as JSON | `false` |

## Programmatic API

```ts
import { comparePair, defaults } from "px-diff";

const result = await comparePair(
  "https://example.com",
  "https://google.com",
  { ...defaults },
  "my-comparison",
);

console.log(result.diffPercent); // e.g. 2.63
console.log(result.regions);    // array of { x1, y1, x2, y2 }
```
