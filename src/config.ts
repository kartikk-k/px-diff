// ─── DEFAULT CONFIGURATION ────────────────────────────────────────────────────
// All values here can be overridden via CLI flags.

export const defaults = {
  // Browser viewport size for screenshots
  viewportWidth: 1440,
  viewportHeight: 900,

  // Pixelmatch sensitivity: 0 = exact match, 1 = very lenient
  pixelThreshold: 0.1,

  // Context padding (px) around each cropped diff region
  regionPadding: 40,

  // Merge diff regions closer than this many px into one
  mergeGap: 40,

  // Side-by-side region diff images
  sideBySideGap: 5,                                     // px gap between the two crops
  sideBySideBg: { r: 240, g: 240, b: 240 } as RGB,     // gap fill color

  // Full diff overlay — white wash over unchanged areas
  overlayOpacity: 0.4,     // 0 = no wash, 1 = fully white

  // Full diff overlay — outline boxes around diff regions
  outlineColor: { r: 255, g: 0, b: 0 } as RGB,  // red
  outlineThickness: 3,     // px
  outlinePadding: 10,      // extra space inside the outline box

  // Output directory (relative to cwd)
  outDir: ".px-diff",

  // Concurrency: how many browsers to run in parallel
  concurrency: 3,

  // URL limits
  minUrls: 2,
  maxUrls: 100,
} as const;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Region {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DiffOptions {
  viewportWidth: number;
  viewportHeight: number;
  pixelThreshold: number;
  regionPadding: number;
  mergeGap: number;
  sideBySideGap: number;
  sideBySideBg: RGB;
  overlayOpacity: number;
  outlineColor: RGB;
  outlineThickness: number;
  outlinePadding: number;
  outDir: string;
  concurrency: number;
}

/** Result of comparing two URLs */
export interface ComparisonResult {
  urlA: string;
  urlB: string;
  width: number;
  height: number;
  totalPixels: number;
  mismatchedPixels: number;
  diffPercent: number;
  matchPercent: number;
  regions: Region[];
  outputDir: string;
}
