/**
 * Generate the PWA icon set from one SVG (milestone 7 phase C §2).
 *
 *   node scripts/generate-icons.mjs
 *
 * Output PNGs are committed, so the build has no image-tooling dependency.
 * The mark: Intra Relay — two nodes and the line between them (a request
 * handed from one party to the other), in the "calm clinic" forest green.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const BG = "#0f3e17"; // forest ink
const FG = "#fffefc"; // linen white

/** `pad` is the fraction of the canvas kept clear on each edge (maskable safe zone). */
function markSvg({ pad = 0.16, rounded = true } = {}) {
  const s = 512;
  const r = rounded ? 96 : 0;
  const inset = s * pad;
  const span = s - inset * 2;
  const cy = s / 2;
  const x1 = inset + span * 0.16;
  const x2 = inset + span * 0.84;
  const node = span * 0.11;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${r}" fill="${BG}"/>
  <line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${FG}" stroke-width="${node * 0.55}" stroke-linecap="round"/>
  <circle cx="${x1}" cy="${cy}" r="${node}" fill="${FG}"/>
  <circle cx="${x2}" cy="${cy}" r="${node}" fill="${BG}" stroke="${FG}" stroke-width="${node * 0.5}"/>
</svg>`;
}

const OUT = join(process.cwd(), "public", "icons");

const targets = [
  { file: "icon-192.png", size: 192, svg: markSvg({ pad: 0.14 }) },
  { file: "icon-512.png", size: 512, svg: markSvg({ pad: 0.14 }) },
  { file: "icon-maskable-512.png", size: 512, svg: markSvg({ pad: 0.22, rounded: false }) },
  { file: "apple-touch-icon.png", size: 180, svg: markSvg({ pad: 0.12 }) },
];

await mkdir(OUT, { recursive: true });
for (const t of targets) {
  const png = await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toBuffer();
  await writeFile(join(OUT, t.file), png);
  console.log(`wrote public/icons/${t.file} (${t.size}px)`);
}
