/**
 * Production social, presentation, screenshot, diagram, and preview assets.
 * Run through build-assets.mjs so core identity derivatives are rebuilt first.
 * All geometry, color, and copy derive from brand/brand.json and the canonical
 * Handoff mark. Bracketed text remains editable placeholder content.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const BRAND = join(ROOT, "brand");
const C = {
  ivory: "#faf9f5",
  surface: "#ffffff",
  accent: "#f0eee6",
  sage: "#dfe9df",
  mist: "#ccdbe8",
  border: "#dedcd1",
  strong: "#b7b7b5",
  text: "#141413",
  muted: "#3d3d3a",
  subtle: "#73726c",
  ink: "#1f1e1d",
  success: "#28563a",
  successWash: "#e3f0e6",
  warning: "#7a5300",
  warningWash: "#f6ecd6",
  dangerWash: "#f5e1e1",
  info: "#204b57",
  infoWash: "#dce9ec",
};
const SANS =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Iowan Old Style, Palatino Linotype, Palatino, Georgia, ui-serif, serif";
const MONO = "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace";

const MARK_BODY = (color) => `
  <circle cx="9.5" cy="16" r="4.5" fill="${color}"/>
  <circle cx="22.5" cy="16" r="4.5" fill="none" stroke="${color}" stroke-width="2.2"/>
  <line x1="14" y1="16" x2="18" y2="16" stroke="${color}" stroke-width="2.2"/>`;
const SMALL_MARK_BODY = (color) => `
  <circle cx="9.5" cy="16" r="4.8" fill="${color}"/>
  <circle cx="22.5" cy="16" r="4.8" fill="none" stroke="${color}" stroke-width="2.6"/>
  <line x1="14" y1="16" x2="18" y2="16" stroke="${color}" stroke-width="2.6"/>`;

function svg(width, height, body, attrs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${attrs}>${body}\n</svg>\n`;
}
function mark(x, y, size, color = C.ink, small = false) {
  return `<g transform="translate(${x} ${y}) scale(${size / 32})">${small ? SMALL_MARK_BODY(color) : MARK_BODY(color)}</g>`;
}
function textEl(
  x,
  y,
  value,
  {
    size = 32,
    fill = C.text,
    family = SANS,
    weight = 400,
    anchor = "start",
    tracking = 0,
    id,
  } = {},
) {
  const idAttr = id ? ` id="${id}"` : "";
  return `<text${idAttr} x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${tracking}">${value}</text>`;
}
async function output(path, data) {
  const absolute = join(BRAND, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
}
async function raster(source, path, width, height) {
  await output(path, await sharp(Buffer.from(source)).resize(width, height).png().toBuffer());
}
async function pair(pathBase, source, width, height) {
  await output(`${pathBase}.svg`, source);
  await raster(source, `${pathBase}.png`, width, height);
}

function profile(width, mode = "dark", guides = false) {
  const background = mode === "light" ? C.ivory : C.ink;
  const foreground = mode === "light" ? C.ink : C.ivory;
  const markSize = width * 0.54;
  const guide = guides
    ? `<circle cx="${width / 2}" cy="${width / 2}" r="${width * 0.4}" fill="none" stroke="${C.warning}" stroke-width="${Math.max(2, width * 0.005)}" stroke-dasharray="${width * 0.025} ${width * 0.015}" opacity="0.8"/>
  <circle cx="${width / 2}" cy="${width / 2}" r="${width * 0.3}" fill="none" stroke="${C.success}" stroke-width="${Math.max(2, width * 0.005)}" opacity="0.8"/>`
    : "";
  return svg(
    width,
    width,
    `<rect width="${width}" height="${width}" fill="${background}"/>${mark((width - markSize) / 2, (width - markSize) / 2, markSize, foreground, width <= 400)}${guide}`,
    `data-asset="social-profile-${mode}${guides ? "-safe-area" : ""}"`,
  );
}

function xHeader(variant = "product") {
  const w = 1500;
  const h = 500;
  if (variant === "text-light") {
    return svg(
      w,
      h,
      `<rect width="1500" height="500" fill="${C.ink}"/>
      <g id="protected-brand">${mark(220, 180, 140, C.ivory)}</g>
      <g id="editable-content">
        ${textEl(420, 220, "Intra", { size: 64, fill: C.ivory, weight: 600 })}
        ${textEl(420, 286, "Real businesses. Clear quotes. You stay in control.", { size: 31, fill: C.ivory })}
      </g>
      <line x1="420" y1="325" x2="1160" y2="325" stroke="${C.strong}" stroke-width="2" opacity="0.55"/>`,
      `data-variant="text-light"`,
    );
  }
  if (variant === "mark-dominant") {
    return svg(
      w,
      h,
      `<rect width="1500" height="500" fill="${C.ivory}"/>
      <rect x="0" y="0" width="470" height="500" fill="${C.sage}"/>
      <g id="protected-brand">${mark(112, 90, 290, C.ink)}</g>
      <g id="editable-content">
        ${textEl(560, 215, "Intra", { size: 76, family: SERIF, weight: 400, tracking: -1.5 })}
        ${textEl(560, 283, "The trusted business layer for AI-agent commerce", { size: 29, fill: C.muted })}
      </g>
      <line x1="560" y1="330" x2="1240" y2="330" stroke="${C.border}" stroke-width="2"/>`,
      `data-variant="mark-dominant"`,
    );
  }
  return svg(
    w,
    h,
    `<rect width="1500" height="500" fill="${C.ivory}"/>
    <rect x="0" y="0" width="72" height="500" fill="${C.mist}"/>
    <g id="protected-brand">${mark(168, 84, 82, C.ink)}</g>
    <g id="editable-content">
      ${textEl(285, 143, "Intra", { size: 44, weight: 600 })}
      ${textEl(168, 284, "Tell Intra what you need.", { size: 54, family: SERIF, weight: 400, tracking: -1 })}
      ${textEl(168, 347, "Get a real price. Keep the final say.", { size: 54, family: SERIF, weight: 400, tracking: -1 })}
    </g>
    <line x1="168" y1="392" x2="1280" y2="392" stroke="${C.border}" stroke-width="2"/>
    ${textEl(1280, 430, "Real businesses. Clear quotes.", { size: 22, fill: C.muted, anchor: "end" })}`,
    `data-variant="product-message"`,
  );
}

function linkedinCover(variant = "product") {
  const w = 1512;
  const h = 256;
  const left = 285;
  if (variant === "company") {
    return svg(
      w,
      h,
      `<rect width="1512" height="256" fill="${C.ink}"/>
      <rect x="1120" width="392" height="256" fill="${C.info}" opacity="0.45"/>
      <g id="protected-brand">${mark(left, 67, 70, C.ivory)}</g>
      <g id="editable-content">
        ${textEl(left + 94, 112, "Intra", { size: 46, fill: C.ivory, weight: 600 })}
        ${textEl(left, 174, "The trusted business layer for AI-agent commerce", { size: 27, fill: C.ivory })}
      </g>`,
      `data-variant="company-positioning"`,
    );
  }
  return svg(
    w,
    h,
    `<rect width="1512" height="256" fill="${C.ivory}"/>
    <rect x="1120" width="392" height="256" fill="${C.sage}"/>
    <g id="protected-brand">${mark(left, 54, 64, C.ink)}</g>
    <g id="editable-content">
      ${textEl(left + 88, 98, "Intra", { size: 42, weight: 600 })}
      ${textEl(left, 174, "A clear request in. A real business quote out.", { size: 34, family: SERIF, weight: 400, tracking: -0.6 })}
    </g>
    ${textEl(1320, 148, "You keep", { size: 24, fill: C.muted, anchor: "middle" })}
    ${textEl(1320, 181, "the final say", { size: 27, fill: C.text, anchor: "middle", weight: 600 })}`,
    `data-variant="product-positioning"`,
  );
}

function youtubeBanner() {
  const w = 2560;
  const h = 1440;
  const safe = { x: 507, y: 508, w: 1546, h: 423 };
  return svg(
    w,
    h,
    `<rect width="2560" height="1440" fill="${C.ivory}"/>
    <rect y="508" width="2560" height="423" fill="${C.sage}" opacity="0.52"/>
    <g id="protected-brand">${mark(safe.x + 92, safe.y + 86, 116, C.ink)}</g>
    <g id="editable-content">
      ${textEl(safe.x + 244, safe.y + 154, "Intra", { size: 74, weight: 600 })}
      ${textEl(safe.x + 92, safe.y + 268, "Real requests. Real business quotes.", { size: 58, family: SERIF, weight: 400, tracking: -1 })}
      ${textEl(safe.x + 92, safe.y + 332, "You make the final decision.", { size: 34, fill: C.muted })}
    </g>`,
    `data-safe-area="507 508 1546 423"`,
  );
}

function facebookCover() {
  return svg(
    1640,
    624,
    `<rect width="1640" height="624" fill="${C.ivory}"/>
    <rect x="1120" width="520" height="624" fill="${C.mist}" opacity="0.65"/>
    <g id="protected-brand">${mark(300, 130, 100, C.ink)}</g>
    <g id="editable-content">
      ${textEl(430, 200, "Intra", { size: 66, weight: 600 })}
      ${textEl(300, 346, "Tell Intra what you need.", { size: 61, family: SERIF, weight: 400, tracking: -1.1 })}
      ${textEl(300, 418, "Get a real price. Keep the final say.", { size: 42, fill: C.muted })}
    </g>
    <line x1="300" y1="470" x2="1260" y2="470" stroke="${C.border}" stroke-width="3"/>`,
    `data-working-canvas="2x 820x312"`,
  );
}

function masterFormat(width, height, kind) {
  const m = Math.round(Math.min(width, height) * 0.075);
  const markSize = Math.round(Math.min(width, height) * 0.085);
  const titleSize = Math.round(Math.min(width, height) * (kind === "landscape" ? 0.072 : 0.071));
  const eyebrowSize = Math.max(24, Math.round(titleSize * 0.3));
  const bodySize = Math.max(28, Math.round(titleSize * 0.38));
  const vertical = height > width * 1.25;
  const accentWidth = vertical ? Math.round(width * 0.22) : Math.round(width * 0.16);
  const titleY = vertical ? Math.round(height * 0.43) : Math.round(height * 0.48);
  return svg(
    width,
    height,
    `<rect width="${width}" height="${height}" fill="${C.ivory}"/>
    <rect x="0" y="0" width="${accentWidth}" height="${Math.round(height * 0.16)}" fill="${kind === "portrait" || kind === "story" ? C.sage : C.mist}" opacity="0.75"/>
    <line x1="${m}" y1="${Math.round(height * 0.22)}" x2="${m}" y2="${height - m}" stroke="${C.border}" stroke-width="2"/>
    <g id="protected-brand">${mark(m, m, markSize, C.ink)}</g>
    <g id="editable-content">
      ${textEl(m + Math.round(markSize * 1.35), m + Math.round(markSize * 0.65), "[EYEBROW]", { size: eyebrowSize, weight: 600, tracking: Math.max(2, Math.round(eyebrowSize * 0.08)), id: "eyebrow" })}
      ${textEl(m + Math.round(markSize * 0.55), titleY, "[HEADLINE]", { size: titleSize, family: SERIF, weight: 400, tracking: -Math.max(1, Math.round(titleSize * 0.02)), id: "headline" })}
      ${textEl(m + Math.round(markSize * 0.55), titleY + Math.round(titleSize * 1.15), "[SECOND HEADLINE LINE]", { size: titleSize, family: SERIF, weight: 400, tracking: -Math.max(1, Math.round(titleSize * 0.02)), id: "headline-line-2" })}
      ${textEl(m + Math.round(markSize * 0.55), titleY + Math.round(titleSize * 1.9), "[SUPPORTING DETAIL]", { size: bodySize, fill: C.muted, id: "supporting-detail" })}
    </g>
    <line x1="${m + Math.round(markSize * 0.55)}" y1="${height - m - bodySize * 1.5}" x2="${width - m}" y2="${height - m - bodySize * 1.5}" stroke="${C.border}" stroke-width="2"/>
    ${textEl(width - m, height - m, "Intra", { size: bodySize, fill: C.muted, anchor: "end", weight: 500 })}`,
    `data-master-format="${kind}"`,
  );
}

function socialTemplate(type) {
  const w = 1080;
  const h = 1080;
  const m = 82;
  const base = `<rect width="1080" height="1080" fill="${type === "cta" ? C.ink : C.ivory}"/>`;
  const fg = type === "cta" ? C.ivory : C.text;
  const quiet = type === "cta" ? C.strong : C.muted;
  const brand = `<g id="protected-brand">${mark(m, 72, 76, type === "cta" ? C.ivory : C.ink)}</g>`;
  const footer = textEl(998, 998, "Intra", { size: 28, fill: quiet, anchor: "end", weight: 500 });
  const rule = `<line x1="82" y1="938" x2="998" y2="938" stroke="${type === "cta" ? C.strong : C.border}" stroke-width="2"/>`;
  let content = "";
  if (type === "announcement") {
    content = `<rect x="0" y="0" width="34" height="1080" fill="${C.mist}"/>${textEl(82, 245, "[ANNOUNCEMENT]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 465, "[WHAT CHANGED]", { size: 78, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 555, "[SECOND LINE]", { size: 78, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 675, "[WHEN OR WHO CAN USE IT]", { size: 32, fill: quiet })}`;
  } else if (type === "feature") {
    content = `${textEl(82, 260, "[FEATURE RELEASE]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}<rect x="82" y="330" width="916" height="4" fill="${C.sage}"/>${textEl(82, 470, "[FEATURE NAME]", { size: 76, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 580, "[WHAT THE USER CAN NOW DO]", { size: 34, fill: quiet })}${textEl(82, 650, "[WHERE TO FIND IT]", { size: 28, fill: C.subtle })}`;
  } else if (type === "education") {
    content = `${textEl(82, 242, "[EXPLAINER]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 355, "[TOPIC]", { size: 72, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}<g font-family="${SANS}" font-size="30" fill="${quiet}"><text x="82" y="520">01</text><text x="170" y="520">[FIRST CLEAR POINT]</text><text x="82" y="635">02</text><text x="170" y="635">[SECOND CLEAR POINT]</text><text x="82" y="750">03</text><text x="170" y="750">[THIRD CLEAR POINT]</text></g>`;
  } else if (type === "principle") {
    content = `<rect x="82" y="250" width="140" height="16" fill="${C.mist}"/>${textEl(82, 430, "[PRODUCT PRINCIPLE]", { size: 70, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}${textEl(82, 515, "[SECOND LINE]", { size: 70, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}${textEl(82, 655, "[SHORT EXPLANATION]", { size: 30, fill: quiet })}`;
  } else if (type === "founder") {
    content = `${textEl(82, 245, "[BUILDER NOTE / DATE]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 430, "[WHAT WE LEARNED]", { size: 72, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}${textEl(82, 515, "[SECOND LINE]", { size: 72, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}<line x1="82" y1="620" x2="380" y2="620" stroke="${C.sage}" stroke-width="12"/>${textEl(82, 700, "[DIRECT CONTEXT IN FIRST PERSON]", { size: 30, fill: quiet })}`;
  } else if (type === "case-study") {
    content = `${textEl(82, 240, "[CASE STUDY / REAL SOURCE]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 450, "[VERIFIED RESULT]", { size: 86, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 555, "[WHAT WAS MEASURED]", { size: 32, fill: quiet })}<rect x="82" y="650" width="916" height="120" fill="${C.sage}"/>${textEl(112, 720, "[METHOD, TIMEFRAME, AND LIMITATION]", { size: 27, fill: C.text })}`;
  } else if (type === "trust") {
    content = `${textEl(82, 235, "[HOW INTRA WORKS]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 345, "[ONE SPECIFIC CONTROL]", { size: 65, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}<g font-family="${SANS}" font-size="26" fill="${quiet}"><circle cx="150" cy="620" r="34" fill="${C.ink}"/><line x1="184" y1="620" x2="430" y2="620" stroke="${C.ink}" stroke-width="7"/><circle cx="464" cy="620" r="34" fill="${C.ivory}" stroke="${C.ink}" stroke-width="7"/><text x="82" y="710">[REQUEST]</text><text x="365" y="710">[HUMAN DECISION]</text></g>${textEl(82, 800, "[EVIDENCE OR LIMITATION]", { size: 28, fill: C.subtle })}`;
  } else if (type === "event") {
    content = `${textEl(82, 235, "[EVENT]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}<rect x="82" y="310" width="260" height="260" fill="${C.mist}"/>${textEl(212, 420, "[DD]", { size: 96, fill: C.text, family: SERIF, weight: 400, anchor: "middle" })}${textEl(212, 495, "[MONTH]", { size: 28, fill: C.muted, weight: 600, anchor: "middle", tracking: 3 })}${textEl(410, 400, "[EVENT NAME]", { size: 61, fill: fg, family: SERIF, weight: 400, tracking: -1 })}${textEl(410, 485, "[TIME AND LOCATION]", { size: 29, fill: quiet })}${textEl(410, 545, "[HOW TO JOIN]", { size: 29, fill: quiet })}`;
  } else if (type === "cta") {
    content = `${textEl(82, 255, "[FOR BUYERS / FOR BUSINESSES]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 480, "[SPECIFIC INVITATION]", { size: 80, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 575, "[SECOND LINE]", { size: 80, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(82, 720, "[ACTION AND CONSEQUENCE]", { size: 32, fill: quiet })}`;
  } else {
    content = `${textEl(82, 240, "[QUOTE / STATEMENT]", { size: 27, fill: quiet, weight: 600, tracking: 3 })}${textEl(82, 430, "“[APPROVED QUOTE OR", { size: 70, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}${textEl(82, 515, "PRODUCT STATEMENT]”", { size: 70, fill: fg, family: SERIF, weight: 400, tracking: -1.5 })}${textEl(82, 690, "[ATTRIBUTION / SOURCE]", { size: 29, fill: quiet })}`;
  }
  return svg(
    w,
    h,
    `${base}${brand}<g id="editable-content">${content}</g>${rule}${footer}`,
    `data-template="${type}"`,
  );
}

function screenshotFrame(kind) {
  if (kind === "phone") {
    return svg(
      1080,
      1350,
      `<rect width="1080" height="1350" fill="${C.ivory}"/>
      <g id="protected-frame"><rect x="280" y="90" width="520" height="1040" rx="54" fill="${C.surface}" stroke="${C.ink}" stroke-width="6"/><rect x="442" y="112" width="196" height="20" rx="10" fill="${C.ink}"/></g>
      <g id="editable-screenshot"><rect x="310" y="160" width="460" height="900" fill="${C.accent}" stroke="${C.border}" stroke-width="2" stroke-dasharray="16 12"/>${textEl(540, 600, "[PLACE GENUINE", { size: 31, fill: C.muted, anchor: "middle", weight: 600 })}${textEl(540, 646, "PHONE SCREENSHOT HERE]", { size: 31, fill: C.muted, anchor: "middle", weight: 600 })}</g>
      ${textEl(540, 1215, "[OPTIONAL CAPTION]", { size: 31, fill: C.text, anchor: "middle", family: SERIF })}`,
      `data-frame="phone"`,
    );
  }
  if (kind === "deviceless") {
    return svg(
      1600,
      900,
      `<rect width="1600" height="900" fill="${C.ivory}"/>
      <g id="editable-screenshot"><rect x="120" y="90" width="1360" height="650" fill="${C.surface}" stroke="${C.border}" stroke-width="3" stroke-dasharray="18 12"/>${textEl(800, 400, "[PLACE GENUINE PRODUCT CROP HERE]", { size: 38, fill: C.muted, anchor: "middle", weight: 600 })}</g>
      <line x1="120" y1="800" x2="1480" y2="800" stroke="${C.border}" stroke-width="2"/>${mark(120, 818, 48, C.ink)}${textEl(1480, 852, "[CAPTION]", { size: 27, fill: C.muted, anchor: "end" })}`,
      `data-frame="device-less"`,
    );
  }
  if (kind === "caption") {
    return svg(
      1600,
      900,
      `<rect width="1600" height="900" fill="${C.ivory}"/>
      <g id="editable-screenshot"><rect x="670" y="95" width="810" height="650" fill="${C.surface}" stroke="${C.border}" stroke-width="3" stroke-dasharray="18 12"/>${textEl(1075, 405, "[GENUINE SCREENSHOT]", { size: 34, fill: C.muted, anchor: "middle", weight: 600 })}</g>
      <g id="editable-content">${textEl(120, 190, "[FEATURE]", { size: 25, fill: C.subtle, weight: 600, tracking: 3 })}${textEl(120, 330, "[WHAT THIS", { size: 68, family: SERIF, weight: 400, tracking: -1.4 })}${textEl(120, 410, "SCREEN SHOWS]", { size: 68, family: SERIF, weight: 400, tracking: -1.4 })}${textEl(120, 525, "[CONTEXT OR LIMITATION]", { size: 29, fill: C.muted })}</g>${mark(120, 765, 54, C.ink)}`,
      `data-frame="product-caption"`,
    );
  }
  return svg(
    1600,
    900,
    `<rect width="1600" height="900" fill="${C.ivory}"/>
    <g id="protected-frame"><rect x="120" y="95" width="1360" height="680" rx="18" fill="${C.surface}" stroke="${C.ink}" stroke-width="3"/><rect x="120" y="95" width="1360" height="62" rx="18" fill="${C.accent}"/><circle cx="158" cy="126" r="8" fill="${C.strong}"/><circle cx="184" cy="126" r="8" fill="${C.strong}"/><circle cx="210" cy="126" r="8" fill="${C.strong}"/></g>
    <g id="editable-screenshot"><rect x="145" y="181" width="1310" height="568" fill="${C.surface}" stroke="${C.border}" stroke-width="2" stroke-dasharray="18 12"/>${textEl(800, 455, "[PLACE GENUINE BROWSER SCREENSHOT HERE]", { size: 36, fill: C.muted, anchor: "middle", weight: 600 })}</g>
    ${mark(120, 808, 48, C.ink)}${textEl(1480, 842, "[OPTIONAL CAPTION]", { size: 27, fill: C.muted, anchor: "end" })}`,
    `data-frame="browser"`,
  );
}

function diagram(kind) {
  const w = 1600;
  const h = 900;
  if (kind === "vertical") {
    const ys = [165, 295, 425, 555, 685];
    const labels = ["Request", "Businesses", "Quotes", "Decision", "Handoff"];
    const rows = labels
      .map(
        (label, i) =>
          `${i === 0 ? "" : `<line x1="800" y1="${ys[i - 1] + 42}" x2="800" y2="${ys[i] - 42}" stroke="${C.borderStrong}" stroke-width="4"/>`}<circle cx="800" cy="${ys[i]}" r="38" fill="${i === labels.length - 1 ? C.sage : C.ivory}" stroke="${C.ink}" stroke-width="4"/>${textEl(875, ys[i] + 10, label, { size: 34, fill: C.text, weight: i === 3 ? 600 : 400 })}`,
      )
      .join("");
    return svg(
      w,
      h,
      `<rect width="1600" height="900" fill="${C.ivory}"/>${mark(100, 80, 64, C.ink)}<g id="editable-diagram">${rows}</g>`,
      `data-diagram="request-to-handoff-vertical"`,
    );
  }
  const xs = [140, 460, 790, 1110, 1430];
  const labels = ["Buyer", "Intra", "Business", "Quote", "Buyer decides"];
  const nodes = labels
    .map(
      (label, i) =>
        `${i === 0 ? "" : `<line x1="${xs[i - 1] + 52}" y1="450" x2="${xs[i] - 52}" y2="450" stroke="${C.borderStrong}" stroke-width="4"/>`}<circle cx="${xs[i]}" cy="450" r="48" fill="${i === 1 ? C.ink : i === 4 ? C.sage : C.ivory}" stroke="${C.ink}" stroke-width="4"/>${i === 1 ? mark(xs[i] - 28, 422, 56, C.ivory) : ""}${textEl(xs[i], 555, label, { size: 30, fill: C.text, anchor: "middle", weight: i === 4 ? 600 : 400 })}`,
    )
    .join("");
  return svg(
    w,
    h,
    `<rect width="1600" height="900" fill="${C.ivory}"/>${textEl(100, 130, "How a request moves through Intra", { size: 60, family: SERIF, weight: 400, tracking: -1.2 })}<g id="editable-diagram">${nodes}</g>${textEl(100, 810, "The buyer keeps the final decision.", { size: 28, fill: C.muted })}`,
    `data-diagram="buyer-intra-business"`,
  );
}

function presentation(kind) {
  const w = 1920;
  const h = 1080;
  const m = 110;
  const base = `<rect width="1920" height="1080" fill="${kind === "section" || kind === "cta" ? C.ink : C.ivory}"/>`;
  const fg = kind === "section" || kind === "cta" ? C.ivory : C.text;
  const muted = kind === "section" || kind === "cta" ? C.strong : C.muted;
  const logo = `<g id="protected-brand">${mark(m, 76, 72, kind === "section" || kind === "cta" ? C.ivory : C.ink)}</g>`;
  let content = "";
  if (kind === "title") {
    content = `${textEl(m, 400, "[PRESENTATION TITLE]", { size: 92, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(m, 505, "[SECOND TITLE LINE]", { size: 92, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(m, 650, "[PRESENTATION CONTEXT / DATE]", { size: 34, fill: muted })}<rect x="1450" y="0" width="470" height="1080" fill="${C.sage}" opacity="0.75"/>${mark(1545, 420, 280, C.ink)}`;
  } else if (kind === "section") {
    content = `${textEl(m, 375, "[SECTION NUMBER]", { size: 28, fill: muted, family: MONO, tracking: 3 })}${textEl(m, 550, "[SECTION TITLE]", { size: 94, fill: fg, family: SERIF, weight: 400, tracking: -2 })}<line x1="${m}" y1="650" x2="1300" y2="650" stroke="${C.strong}" stroke-width="2"/>`;
  } else if (kind === "content") {
    content = `${textEl(m, 260, "[SLIDE TITLE]", { size: 64, fill: fg, family: SERIF, weight: 400, tracking: -1.2 })}<line x1="${m}" y1="320" x2="1810" y2="320" stroke="${C.border}" stroke-width="2"/><g font-family="${SANS}" font-size="34" fill="${muted}"><text x="${m}" y="445">[PRIMARY POINT]</text><text x="${m}" y="535">[SUPPORTING EVIDENCE OR EXPLANATION]</text><text x="${m}" y="625">[SECONDARY DETAIL]</text></g>`;
  } else if (kind === "screenshot") {
    content = `${textEl(m, 215, "[PRODUCT VIEW]", { size: 58, fill: fg, family: SERIF, weight: 400 })}<rect x="760" y="170" width="1050" height="700" rx="16" fill="${C.surface}" stroke="${C.border}" stroke-width="3" stroke-dasharray="18 12"/>${textEl(1285, 530, "[GENUINE SCREENSHOT]", { size: 34, fill: muted, anchor: "middle", weight: 600 })}${textEl(m, 390, "[WHAT THE", { size: 62, family: SERIF })}${textEl(m, 465, "SCREEN SHOWS]", { size: 62, family: SERIF })}${textEl(m, 590, "[CONTEXT]", { size: 31, fill: muted })}`;
  } else if (kind === "quote") {
    content = `${textEl(m, 300, "[QUOTE OR APPROVED TESTIMONIAL]", { size: 28, fill: muted, weight: 600, tracking: 3 })}${textEl(m, 505, "“[VERBATIM TEXT]”", { size: 82, fill: fg, family: SERIF, weight: 400, tracking: -1.6 })}<line x1="${m}" y1="640" x2="680" y2="640" stroke="${C.sage}" stroke-width="14"/>${textEl(m, 735, "[NAME / ROLE / PERMISSION SOURCE]", { size: 32, fill: muted })}`;
  } else if (kind === "architecture") {
    content = `${textEl(m, 205, "[SYSTEM OR PROCESS]", { size: 60, fill: fg, family: SERIF })}${diagramNodes(240, 540, 340)}${textEl(m, 880, "[BOUNDARY OR LIMITATION]", { size: 29, fill: muted })}`;
  } else if (kind === "cta") {
    content = `<rect x="1380" y="0" width="540" height="1080" fill="${C.info}" opacity="0.4"/>${textEl(m, 430, "[FINAL INVITATION]", { size: 92, fill: fg, family: SERIF, weight: 400, tracking: -2 })}${textEl(m, 555, "[CLEAR NEXT ACTION]", { size: 40, fill: muted })}${textEl(m, 720, "[URL OR CONTACT]", { size: 32, fill: C.ivory, family: MONO })}`;
  }
  return svg(
    w,
    h,
    `${base}${logo}<g id="editable-content">${content}</g>${textEl(1810, 1008, "Intra", { size: 28, fill: muted, anchor: "end", weight: 500 })}`,
    `data-presentation-layout="${kind}"`,
  );
}
function diagramNodes(startX, y, gap) {
  const labels = ["REQUEST", "BUSINESS", "QUOTE", "DECISION", "HANDOFF"];
  return labels
    .map((label, i) => {
      const x = startX + i * gap;
      return `${i ? `<line x1="${x - gap + 50}" y1="${y}" x2="${x - 50}" y2="${y}" stroke="${C.borderStrong}" stroke-width="4"/>` : ""}<circle cx="${x}" cy="${y}" r="48" fill="${i === 3 ? C.sage : C.ivory}" stroke="${C.ink}" stroke-width="4"/>${textEl(x, y + 105, label, { size: 24, fill: C.muted, anchor: "middle", family: MONO })}`;
    })
    .join("");
}

function safeAreaGuide(platform) {
  if (platform === "youtube") {
    const w = 2560,
      h = 1440,
      x = 507,
      y = 508,
      sw = 1546,
      sh = 423;
    return svg(
      w,
      h,
      `<rect width="${w}" height="${h}" fill="${C.dangerWash}"/><rect y="${y}" width="${w}" height="${sh}" fill="${C.warningWash}"/><rect x="${x}" y="${y}" width="${sw}" height="${sh}" fill="${C.successWash}" stroke="${C.success}" stroke-width="4"/><rect x="${x + 90}" y="${y + 55}" width="${sw - 180}" height="${sh - 110}" fill="none" stroke="${C.info}" stroke-width="4" stroke-dasharray="22 14"/><rect x="${x + 90}" y="${y + 70}" width="250" height="180" fill="none" stroke="${C.ink}" stroke-width="4"/>${textEl(w / 2, 150, "YOUTUBE BANNER SAFE AREA", { size: 42, fill: C.text, anchor: "middle", weight: 600 })}${textEl(w / 2, y + 205, "CONTENT SAFE 1546 × 423", { size: 40, fill: C.text, anchor: "middle", weight: 600 })}${textEl(w / 2, y + 268, "BLUE DASH = TEXT  /  INK BOX = LOGO", { size: 27, fill: C.muted, anchor: "middle" })}${textEl(w / 2, 1325, "ROSE = CROP RISK  /  AMBER = PARTIAL-DEVICE REGION", { size: 34, fill: C.muted, anchor: "middle" })}`,
      `data-guide="youtube-banner"`,
    );
  }
  const configs = {
    x: [1500, 500, 170, 70, 1160, 360, "X HEADER"],
    linkedin: [1512, 256, 280, 34, 980, 188, "LINKEDIN COVER"],
    story: [1080, 1920, 86, 270, 908, 1380, "STORY / REEL"],
  };
  const [w, h, x, y, sw, sh, title] = configs[platform];
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${C.warningWash}"/><rect x="${x}" y="${y}" width="${sw}" height="${sh}" fill="${C.successWash}" stroke="${C.success}" stroke-width="3"/><rect x="${x + sw * 0.08}" y="${y + sh * 0.12}" width="${sw * 0.84}" height="${sh * 0.76}" fill="none" stroke="${C.info}" stroke-width="3" stroke-dasharray="16 12"/><rect x="${x + sw * 0.1}" y="${y + sh * 0.18}" width="${sw * 0.16}" height="${sh * 0.48}" fill="none" stroke="${C.ink}" stroke-width="3"/>${textEl(w / 2, y + sh / 2, `${title} CONTENT-SAFE REGION`, { size: Math.max(24, Math.round(h * 0.075)), fill: C.text, anchor: "middle", weight: 600 })}${textEl(w / 2, h - Math.max(18, h * 0.035), "AMBER = CROP RISK  /  BLUE DASH = TEXT  /  INK BOX = LOGO", { size: Math.max(14, Math.round(h * 0.04)), fill: C.muted, anchor: "middle" })}`,
    `data-guide="${platform}"`,
  );
}

async function contactSheet(path, title, items, columns, tileWidth, tileHeight) {
  const gap = 36;
  const top = 110;
  const rows = Math.ceil(items.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = top + rows * (tileHeight + 62) + (rows + 1) * gap;
  const composites = [];
  for (let i = 0; i < items.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = gap + col * (tileWidth + gap);
    const topPos = top + gap + row * (tileHeight + 62 + gap);
    const source = await sharp(join(BRAND, items[i].path))
      .resize(tileWidth, tileHeight, { fit: "contain", background: C.surface })
      .png()
      .toBuffer();
    composites.push({ input: source, left, top: topPos });
    const label = svg(
      tileWidth,
      48,
      textEl(0, 32, items[i].label, { size: 22, fill: C.muted, weight: 600 }),
    );
    composites.push({ input: Buffer.from(label), left, top: topPos + tileHeight + 10 });
  }
  const heading = svg(
    width,
    top,
    `${mark(gap, 26, 52, C.ink)}${textEl(gap + 76, 64, title, { size: 38, fill: C.text, family: SERIF })}`,
  );
  composites.unshift({ input: Buffer.from(heading), left: 0, top: 0 });
  await output(
    path,
    await sharp({ create: { width, height, channels: 4, background: C.ivory } })
      .composite(composites)
      .png()
      .toBuffer(),
  );
}

// Identity refinements and references.
await output("logo/intra-mark-ink.svg", await readFile(join(BRAND, "logo/intra-mark.svg")));
await pair(
  "identity/intra-mark-geometry",
  svg(
    960,
    540,
    `<rect width="960" height="540" fill="${C.ivory}"/>${mark(130, 135, 270, C.ink)}<line x1="130" y1="420" x2="830" y2="420" stroke="${C.border}" stroke-width="2"/>${textEl(130, 475, "THE HANDOFF  /  32 × 32 VIEW BOX  /  ONE FILLED + ONE OPEN NODE", { size: 23, fill: C.muted, family: MONO })}${textEl(560, 175, "Canonical geometry", { size: 44, family: SERIF })}${textEl(560, 235, "Node radius 4.5", { size: 25, fill: C.muted })}${textEl(560, 280, "Stroke 2.2", { size: 25, fill: C.muted })}${textEl(560, 325, "Clear space: one node radius", { size: 25, fill: C.muted })}`,
    `data-reference="identity-geometry"`,
  ),
  960,
  540,
);
await pair(
  "colors/intra-color-reference",
  svg(
    1200,
    720,
    `<rect width="1200" height="720" fill="${C.ivory}"/>${textEl(72, 84, "Intra color system", { size: 50, family: SERIF })}${[
      [C.ivory, "IVORY #FAF9F5"],
      [C.ink, "ACTION INK #1F1E1D"],
      [C.text, "TEXT INK #141413"],
      [C.sage, "SAGE #DFE9DF"],
      [C.mist, "MIST #CCDBE8"],
      [C.accent, "SURFACE ACCENT #F0EEE6"],
      [C.border, "BORDER #DEDCD1"],
      [C.surface, "SURFACE #FFFFFF"],
    ]
      .map(([color, label], i) => {
        const x = 72 + (i % 4) * 276,
          y = 145 + Math.floor(i / 4) * 245;
        return `<rect x="${x}" y="${y}" width="230" height="150" fill="${color}" stroke="${C.borderStrong}"/><text x="${x}" y="${y + 190}" font-family="${MONO}" font-size="18" fill="${C.muted}">${label}</text>`;
      })
      .join("")}`,
    `data-reference="colors"`,
  ),
  1200,
  720,
);
await pair(
  "typography/intra-type-reference",
  svg(
    1200,
    720,
    `<rect width="1200" height="720" fill="${C.ivory}"/>${textEl(72, 88, "Intra typography", { size: 52, family: SERIF })}${textEl(72, 220, "Editorial display", { size: 78, family: SERIF, tracking: -1.5 })}${textEl(72, 290, "Iowan Old Style / Palatino / Georgia / serif", { size: 22, fill: C.subtle, family: MONO })}${textEl(72, 420, "Operational UI and readable body text", { size: 42, family: SANS, weight: 500 })}${textEl(72, 480, "System UI / Segoe UI / Roboto / Helvetica / Arial", { size: 22, fill: C.subtle, family: MONO })}${textEl(72, 610, "RUN-2F61  0x4a…9c10  15 SEP 2026", { size: 26, fill: C.muted, family: MONO })}`,
    `data-reference="typography"`,
  ),
  1200,
  720,
);

// Social profile masters and platform exports.
await pair(
  "social/master-formats/intra-profile-master-dark-1024",
  profile(1024, "dark"),
  1024,
  1024,
);
await pair(
  "social/master-formats/intra-profile-master-light-1024",
  profile(1024, "light"),
  1024,
  1024,
);
await pair(
  "social/master-formats/intra-profile-safe-area-1024",
  profile(1024, "dark", true),
  1024,
  1024,
);
await pair("social/x/intra-x-profile-400", profile(400, "dark"), 400, 400);
await pair("social/instagram/intra-instagram-profile-1080", profile(1080, "dark"), 1080, 1080);
await pair("social/linkedin/intra-linkedin-page-logo-400", profile(400, "dark"), 400, 400);
await pair("social/whatsapp/intra-whatsapp-profile-640", profile(640, "dark"), 640, 640);
await pair("social/facebook/intra-facebook-page-profile-1080", profile(1080, "dark"), 1080, 1080);
await pair("social/youtube/intra-youtube-channel-profile-800", profile(800, "dark"), 800, 800);
await pair(
  "social/youtube/intra-youtube-watermark-150",
  svg(150, 150, `${mark(25, 25, 100, C.ivory, true)}`, `data-background="transparent"`),
  150,
  150,
);
await raster(
  svg(
    300,
    300,
    `<rect width="300" height="300" fill="${C.ink}"/>${mark(50, 50, 200, C.ivory, true)}`,
    `data-preview="watermark-on-ink"`,
  ),
  "previews/intra-youtube-watermark-on-ink-preview.png",
  300,
  300,
);

// Platform banners.
await pair("social/x/intra-x-header-1500x500", xHeader("product"), 1500, 500);
await pair("social/x/intra-x-header-text-light-1500x500", xHeader("text-light"), 1500, 500);
await pair("social/x/intra-x-header-mark-dominant-1500x500", xHeader("mark-dominant"), 1500, 500);
await pair("social/x/intra-x-header-product-message-1500x500", xHeader("product"), 1500, 500);
await pair("social/linkedin/intra-linkedin-cover-1512x256", linkedinCover("product"), 1512, 256);
await pair(
  "social/linkedin/intra-linkedin-cover-product-1512x256",
  linkedinCover("product"),
  1512,
  256,
);
await pair(
  "social/linkedin/intra-linkedin-cover-company-1512x256",
  linkedinCover("company"),
  1512,
  256,
);
await pair("social/youtube/intra-youtube-channel-banner-2560x1440", youtubeBanner(), 2560, 1440);
await pair("social/facebook/intra-facebook-page-cover-1640x624", facebookCover(), 1640, 624);

// Four fundamental format masters. Existing top-level templates become aliases.
const masters = [
  ["square", 1080, 1080],
  ["portrait", 1080, 1350],
  ["landscape", 1600, 900],
  ["story", 1080, 1920],
];
for (const [kind, width, height] of masters) {
  const source = masterFormat(width, height, kind);
  const ratio =
    kind === "square"
      ? "1x1"
      : kind === "portrait"
        ? "4x5"
        : kind === "landscape"
          ? "16x9"
          : "9x16";
  await pair(
    `social/master-formats/intra-master-${ratio}-${width}x${height}`,
    source,
    width,
    height,
  );
  await output(`templates/intra-social-${kind}-${width}x${height}.svg`, source);
  await raster(
    source,
    `templates/intra-social-${kind}-${width}x${height}-preview.png`,
    width,
    height,
  );
}

// Platform adaptations of the master formats.
const aliases = [
  ["social/instagram/intra-instagram-feed-square-1080", "square", 1080, 1080],
  ["social/instagram/intra-instagram-feed-portrait-1080x1350", "portrait", 1080, 1350],
  ["social/instagram/intra-instagram-story-1080x1920", "story", 1080, 1920],
  ["social/instagram/intra-instagram-reel-cover-1080x1920", "story", 1080, 1920],
  ["social/whatsapp/intra-whatsapp-status-1080x1920", "story", 1080, 1920],
  ["social/whatsapp/intra-whatsapp-announcement-1080x1920", "story", 1080, 1920],
  ["social/facebook/intra-facebook-square-post-1080", "square", 1080, 1080],
  ["social/facebook/intra-facebook-portrait-post-1080x1350", "portrait", 1080, 1350],
  ["social/facebook/intra-facebook-story-1080x1920", "story", 1080, 1920],
];
for (const [base, kind, width, height] of aliases)
  await pair(base, masterFormat(width, height, kind), width, height);

// Ten social content compositions.
const socialTypes = [
  "announcement",
  "feature",
  "education",
  "principle",
  "founder",
  "case-study",
  "trust",
  "event",
  "cta",
  "quote",
];
for (const type of socialTypes)
  await pair(`templates/social/intra-template-${type}-1080x1080`, socialTemplate(type), 1080, 1080);

// YouTube thumbnail system.
const thumb = masterFormat(1280, 720, "landscape")
  .replace("[EYEBROW]", "[VIDEO SERIES]")
  .replace("[HEADLINE]", "[VIDEO TITLE]")
  .replace("[SECOND HEADLINE LINE]", "[SECOND LINE]")
  .replace("[SUPPORTING DETAIL]", "[ONE CLEAR DETAIL]");
await pair("social/youtube/intra-youtube-thumbnail-master-1280x720", thumb, 1280, 720);

// Screenshot frames and diagrams.
for (const kind of ["browser", "phone", "deviceless", "caption"]) {
  const source = screenshotFrame(kind);
  const [width, height] = kind === "phone" ? [1080, 1350] : [1600, 900];
  await pair(`templates/screenshot-frames/intra-screenshot-${kind}`, source, width, height);
}
await pair("templates/diagrams/intra-diagram-request-to-handoff", diagram("vertical"), 1600, 900);
await pair(
  "templates/diagrams/intra-diagram-buyer-intra-business",
  diagram("horizontal"),
  1600,
  900,
);

// Presentation layout system.
for (const kind of ["title", "section", "content", "screenshot", "quote", "architecture", "cta"]) {
  await pair(
    `templates/presentation/intra-presentation-${kind}-1920x1080`,
    presentation(kind),
    1920,
    1080,
  );
}
await pair(
  "templates/presentation/intra-presentation-blank-1920x1080",
  svg(
    1920,
    1080,
    `<rect width="1920" height="1080" fill="${C.ivory}"/>${mark(110, 76, 72, C.ink)}${textEl(1810, 1008, "Intra", { size: 28, fill: C.muted, anchor: "end", weight: 500 })}`,
    `data-presentation-layout="blank"`,
  ),
  1920,
  1080,
);

// Safe-area visual guides.
for (const [platform, width, height] of [
  ["x", 1500, 500],
  ["linkedin", 1512, 256],
  ["youtube", 2560, 1440],
  ["story", 1080, 1920],
]) {
  await pair(
    `social/safe-areas/intra-safe-area-${platform}`,
    safeAreaGuide(platform),
    width,
    height,
  );
}

// Contact sheets.
await contactSheet(
  "previews/social-profile-preview.png",
  "Social profiles",
  [
    { path: "social/master-formats/intra-profile-master-dark-1024.png", label: "Dark master" },
    { path: "social/master-formats/intra-profile-master-light-1024.png", label: "Light master" },
    { path: "social/master-formats/intra-profile-safe-area-1024.png", label: "Safe-area check" },
    { path: "previews/intra-youtube-watermark-on-ink-preview.png", label: "Watermark on ink" },
  ],
  4,
  240,
  240,
);
await contactSheet(
  "previews/social-banner-preview.png",
  "Social banners",
  [
    { path: "social/x/intra-x-header-product-message-1500x500.png", label: "X product message" },
    { path: "social/x/intra-x-header-text-light-1500x500.png", label: "X text-light" },
    { path: "social/x/intra-x-header-mark-dominant-1500x500.png", label: "X mark-dominant" },
    {
      path: "social/linkedin/intra-linkedin-cover-product-1512x256.png",
      label: "LinkedIn product",
    },
    {
      path: "social/linkedin/intra-linkedin-cover-company-1512x256.png",
      label: "LinkedIn company",
    },
    { path: "social/facebook/intra-facebook-page-cover-1640x624.png", label: "Facebook page" },
    { path: "social/youtube/intra-youtube-channel-banner-2560x1440.png", label: "YouTube channel" },
  ],
  2,
  600,
  220,
);
await contactSheet(
  "previews/social-template-preview.png",
  "Social templates",
  socialTypes.map((type) => ({
    path: `templates/social/intra-template-${type}-1080x1080.png`,
    label: type.replace("-", " "),
  })),
  5,
  220,
  220,
);
await contactSheet(
  "previews/platform-preview.png",
  "Platform system",
  [
    { path: "social/x/intra-x-profile-400.png", label: "X" },
    { path: "social/instagram/intra-instagram-feed-portrait-1080x1350.png", label: "Instagram" },
    { path: "social/linkedin/intra-linkedin-cover-product-1512x256.png", label: "LinkedIn" },
    { path: "social/whatsapp/intra-whatsapp-status-1080x1920.png", label: "WhatsApp" },
    { path: "social/facebook/intra-facebook-page-cover-1640x624.png", label: "Facebook" },
    { path: "social/youtube/intra-youtube-thumbnail-master-1280x720.png", label: "YouTube" },
  ],
  3,
  360,
  240,
);

await contactSheet(
  "previews/presentation-preview.png",
  "Presentation layouts",
  [
    ...["title", "section", "content", "screenshot", "quote", "architecture", "cta", "blank"].map(
      (kind) => ({
        path: `templates/presentation/intra-presentation-${kind}-1920x1080.png`,
        label: kind,
      }),
    ),
  ],
  2,
  600,
  338,
);

await contactSheet(
  "previews/framework-preview.png",
  "Screenshot and diagram framework",
  [
    { path: "templates/screenshot-frames/intra-screenshot-browser.png", label: "Browser frame" },
    { path: "templates/screenshot-frames/intra-screenshot-phone.png", label: "Phone frame" },
    {
      path: "templates/screenshot-frames/intra-screenshot-deviceless.png",
      label: "Device-less frame",
    },
    {
      path: "templates/screenshot-frames/intra-screenshot-caption.png",
      label: "Product + caption",
    },
    {
      path: "templates/diagrams/intra-diagram-request-to-handoff.png",
      label: "Request to handoff",
    },
    {
      path: "templates/diagrams/intra-diagram-buyer-intra-business.png",
      label: "Buyer / Intra / business",
    },
  ],
  2,
  600,
  338,
);

async function listTree(relative = "") {
  const entries = await readdir(join(BRAND, relative), { withFileTypes: true });
  const lines = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) lines.push(...(await listTree(child)));
    else lines.push(`brand/${child}`);
  }
  return lines;
}

await output(
  "docs/DIRECTORY-TREE.md",
  "# Exact brand package tree\n\nGenerated by `node brand/scripts/build-assets.mjs`.\n\n```text\n(pending build)\n```\n",
);
const tree = await listTree();
await output(
  "docs/DIRECTORY-TREE.md",
  `# Exact brand package tree\n\nGenerated by \`node brand/scripts/build-assets.mjs\`.\n\n\`\`\`text\n${tree.join("\n")}\n\`\`\`\n`,
);

const deliveryPngs = tree.filter((path) => {
  if (!path.startsWith("brand/social/") || !path.endsWith(".png")) return false;
  return (
    /(profile|page-logo|header|cover|channel-banner|watermark|intra-og)/.test(path) &&
    !/(reel-cover|thumbnail|post|story|status|announcement|master-formats|safe-area)/.test(path)
  );
});
const editablePngs = tree.filter((path) => {
  if (!path.startsWith("brand/social/") || !path.endsWith(".png")) return false;
  return !deliveryPngs.includes(path) && !path.includes("safe-areas/");
});
const qaPngs = tree.filter(
  (path) => path.startsWith("brand/social/safe-areas/") && path.endsWith(".png"),
);
await output(
  "exports/EXPORT-INDEX.md",
  `# Delivery export index\n\n## Immediately usable platform PNGs\n\n${deliveryPngs.map((path) => `- \`${path}\``).join("\n")}\n\n## Template PNGs — replace bracketed content first\n\n${editablePngs.map((path) => `- \`${path}\``).join("\n")}\n\n## QA guides — never publish\n\n${qaPngs.map((path) => `- \`${path}\``).join("\n")}\n`,
);

console.log("Built the complete Intra social brand system.");
