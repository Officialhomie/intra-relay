# 14 — Asset Generation Prompts

> Ready-to-use prompts and specs for every net-new visual asset the redesign
> needs. Grouped: **brand** (design/iterate by hand — prompts are direction, not
> a "generate this"), **illustrations** (generate, then hand-clean the SVG),
> **third-party marks** (source official, do not generate), **derived assets**
> (PWA/OG/favicon — produce from the brand mark).
>
> Shared visual DNA for everything below: **warm ivory ground `#faf9f5`, ink
> `#1f1e1d` as the only strong colour, flat, no gradients, no shadows, thin
> geometric line, generous whitespace.** Nothing crypto. Nothing corporate.
> Nothing that looks AI-generated (no uncanny detail, no floating 3D blobs, no
> lens flare).

---

# 1. Brand assets (design / hand-iterate — do NOT accept an AI raster)

## A1 — Intra app mark

**Concept (fixed):** two nodes joined by a line — _a request handed from one
party to another_. This concept already exists in the codebase
(`scripts/generate-icons.mjs`); the redesign keeps the idea and rebuilds the
execution in the current palette.

**Direction prompt (for a designer or an SVG-iteration loop):**

> Design a minimal geometric app mark for "Intra", a product that lets a customer
> hand a request to a local business and get a real quote back. The mark is two
> circular nodes connected by a single straight horizontal line. The left node is
> solid (the sender); the right node is an outline with a smaller solid centre
> (the receiver, receiving). Single consistent stroke weight throughout. No
> gradient, no 3D, no shadow, no motion lines. It must read clearly at 16px and
> hold up at 512px. Two colourways: (1) ink `#1f1e1d` mark on transparent/ivory,
> for in-app and favicon use; (2) warm-white `#faf9f5` mark on an ink `#1f1e1d`
> rounded-square tile (24% corner radius), for the home-screen app icon. Provide
> a maskable variant with the mark scaled to sit inside a 60%-diameter safe
> circle. Deliver as clean, minimal SVG (no groups, no filters, path data only).

**Deliverables:** `icon.svg` (mark only, ink), `icon-tile.svg` (reversed on ink
tile), `icon-maskable.svg`. Then rasterise to PNG: 192, 512, maskable-512
(from the tile), apple-touch 180.

**Acceptance:** legible at 16px; the "handoff" reads without explanation; no
element thinner than 1.5px at 512; passes a squint test against a generic
two-circle logo (it should feel _given_, directional, not just decorative).

## A2 — Intra wordmark

**Direction:**

> Set the word "Intra" as a wordmark. Use the redesign's display face (a warm,
> humanist, lightly-editorial serif or a subtly-customised humanist sans) at
> weight 400–500, with tight negative letter-spacing (~ -0.02em). Title-case
> ("Intra"). Create one horizontal lockup: the A1 mark at the left, a gap equal
> to the mark's node diameter, then the wordmark, vertically centre-aligned to
> the line of the mark. Also deliver the wordmark alone and the mark alone. Ink
> `#1f1e1d` on ivory; and a reversed warm-white version. No tagline in the
> lockup.

**Deliverables:** `logo-lockup.svg`, `wordmark.svg`, plus a CSS spec (font,
weight, tracking, size ratios) so the wordmark can be rendered as live text in
the header where an asset is unnecessary.

## A3 — Favicon

Derive from A1. `src/app/icon.svg` = the ink mark, stroke bumped ~15% for
small-size legibility, on transparent. Plus a `favicon.ico` (16 + 32 + 48)
generated from that SVG. No separate design.

---

# 2. Illustrations (generate → hand-clean → ship as SVG)

**Generate all 8 in ONE session with ONE style lock so they're a coherent
family.** Then trace/simplify to flat SVG (remove noise, snap to a 4px grid,
2 colours max per piece).

## Global style prompt (prepend to every B-prompt)

> Flat vector illustration, single continuous thin line weight (2px at display
> size), two colours only: ink `#1f1e1d` for the linework and ONE soft wash fill
> per illustration chosen from {sand `#f0ede4`, sage `#e6efe6`, amber `#f6ecd6`,
> clay `#f6e3df`, slate `#e4ebe9`}. Warm ivory `#faf9f5` background or
> transparent. No gradients, no drop shadows, no texture, no 3D, no
> perspective — flat and frontal. No human faces, no hands with detailed
> fingers, no brand logos, no text, no currency symbols, no phones/screens
> rendered in detail, no chains/coins/nodes-as-crypto. Calm, spare, confident.
> Composed to sit inside a ~160px square container with ~16px internal padding.
> Reads instantly at 120px. Style reference: the quiet line illustrations of a
> premium print magazine or a well-made instruction card — not a SaaS empty-state
> library, not a children's book, not corporate memphis.

## B1 — "Your decision"

> A single open hand, palm up, shown as a minimal line — no detailed fingers,
> just a soft cupped shape — with a small checkmark resting in the palm. Behind
> it, two faint diverging paths (a simple fork). Wash: sand `#f0ede4`. Feeling:
> _this is your choice; nothing has moved yet; it's a calm, deliberate moment._

## B2 — "Payment confirmed"

> A simple rectangular receipt/slip shape, slightly tilted, with a single clean
> checkmark stamped in its lower third and one thin line where an amount would
> be (no numbers). Wash: sage `#e6efe6`. Feeling: _the money reached the
> business and it was verified — quiet certainty, not celebration. No sparkles,
> no burst._

## B3 — "Order handed over"

> The Intra mark's motif resolved: two circular nodes connected by a line, but
> now BOTH nodes are solid-filled and the line between them is complete and
> unbroken, with a small checkmark centred on the line. Wash: sage `#e6efe6`.
> Feeling: _both sides confirmed; the exchange is done; the loop is closed._

## B4 — "Waiting on the business"

> A paper plane mid-flight along a gentle dotted arc, or alternatively a simple
> analog clock face with hands at a relaxed angle — pick the plane. One small
> node at the arc's start (sent) and an open node at the end (not yet arrived).
> Wash: slate `#e4ebe9`. Feeling: _your request reached a real person; they
> reply in their own time; this is normal, not stuck._

## B5 — "You're offline"

> The two-node motif again, but the connecting line is broken in the middle with
> a small gap, and a tiny "no signal" arc sits above the gap. Both nodes are
> outline-only. Wash: amber `#f6ecd6` (used sparingly — just the gap indicator).
> Feeling: _the connection dropped; your work is safe on the other side;
> reconnect and continue. Not an error, just a pause._

## B6 — "Nothing needs you"

> The Intra mark at rest: two nodes, a complete line, both nodes softly filled,
> with three tiny concentric calm ripples emanating from the centre of the line
> (very subtle). Wash: sage `#e6efe6`. Feeling: _you're all caught up; the
> system is quietly working; relax._

## B7 — "Set your business up"

> On the left, a simple shopfront: a rectangle with an awning (three or four
> arcs) and a doorway — spare, iconic, no signage text. From the shop, a single
> line extends right to a small abstract "assistant" — represented as a simple
> ring or a soft diamond, NOT a robot, NOT a face. Wash: sand `#f0ede4`.
> Feeling: _your real, existing shop becomes reachable by an assistant — and you
> stay in the doorway, in control._

## B8 — "This couldn't be completed"

> The two-node motif with the connecting line paused: a short double-bar (like a
> pause symbol) sits in the middle of the line, and the right node is
> outline-only. No red, no warning triangle, no broken glass. Wash: clay
> `#f6e3df`, used only for the pause bars. Feeling: _something stopped here; it's
> explained calmly below; your money is safe. Neutral, not alarming._

## Illustration acceptance checklist

- All 8 read at 120px on a phone.
- All 8 obviously belong to one set (same line weight, same node motif recurring
  in B3/B5/B6/B8).
- None looks like a stock empty-state.
- None contains a face, a phone screen, a coin, a chain, or a robot.
- Each communicates its one feeling without a caption.
- Final files: optimised SVG, ≤ 4KB each, `currentColor` on the linework where
  possible so the wash is the only hard-coded colour.

---

# 3. Third-party marks — SOURCE, do not generate

| Mark         | Source                                                                                                                                              | Where it may appear                                                                                 | Where it must NOT appear                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **MiniPay**  | Opera's official MiniPay brand kit (SVG). If unavailable/unclear licensing: the text "MiniPay" set in the button + a neutral `Wallet` lucide glyph. | the "Pay with MiniPay" primary button; the payment-method chooser                                   | the landing page; any decision screen; anywhere as a "feature" |
| **USDC**     | Circle's official USDC logo (SVG)                                                                                                                   | inside the pay-sheet "How this is calculated" disclosure; on the confirmed receipt, small and muted | the pay-sheet summary; the approval screen; any list row       |
| **Celo**     | Celo Foundation official mark (SVG)                                                                                                                 | `/docs` only; optionally as the favicon of the explorer-link affordance                             | every buyer surface; every merchant surface; the pay sheet     |
| **WhatsApp** | WhatsApp brand glyph — OR reuse the existing lucide `MessageCircle` (the app already uses it for this)                                              | the "Open in WhatsApp" button; the "customers message you here" hints in onboarding                 | as a primary brand element                                     |

**Rule:** a payment or chain logo never appears next to a decision, a price, or
a "confirm" action except the single "Pay with MiniPay" button. Chain identity
lives on `/docs`.

---

# 4. Derived assets (produce from A1)

## D1 — PWA icon set

Regenerate `public/icons/*` from the A1 SVG in the ink palette. Keep the existing
`scripts/generate-icons.mjs` structure (it already handles the maskable
safe-zone), but:

- swap `BG = "#0f3e17"` → `BG = "#1f1e1d"`, `FG = "#fffefc"` → `FG = "#faf9f5"`;
- point it at the finalised A1 mark instead of the inline string;
- add `sharp` to `devDependencies` (it's currently imported but not declared), OR
  pre-render the PNGs and commit them without the script dependency.

Outputs (unchanged names/sizes): `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png` (from the tile, 22% pad, square), `apple-touch-icon.png`
(180).

## D2 — Favicon

`src/app/icon.svg` (Next 15 serves it automatically at `/icon.svg` and links it).
The A1 ink mark with a ~15% heavier stroke. Optional `public/favicon.ico`
(16+32+48) for older browsers.

## D3 — Open Graph / Twitter card

Keep `src/app/opengraph-image.tsx` (it uses `next/og`), rebuild the composition:

> 1200×630. Background: ivory `#faf9f5`. Top-left: the A1 mark (ink, ~48px) + the
> word "Intra" (display face, ~34px, ink `#141413`). Centre-left, large
> (~60px, display face, ink `#141413`, max-width 900px): **"Tell Intra what you
> need. Get a real price. Keep the final say."** Below it (~26px, muted
> `#3d3d3a`): "A real quote from a real local business — and you send the order
> yourself." Bottom row: two small pills (`#f0ede4` background, ink text,
> 999px radius): "No custody" · "Human-approved orders". **Remove** the old
> chip "Celo x402 query fees". No illustration, no photo.

## D4 — iOS splash (optional, P2)

Only if the install experience is a pilot priority. A centred A1 mark on an ink
`#1f1e1d` ground, at the standard iOS splash sizes. iOS auto-generates a passable
one from `background_color` + the icon, so this is low value.

---

# 5. Fonts (if the self-hosted display face is chosen — see [`12` §3](12-DESIGN-SYSTEM-RECOMMENDATION.md#3-typography))

**This requires a one-line ADR amendment** (ADR-009/022 currently forbid a web
font). If accepted:

- **One face, one weight.** A warm humanist serif (think: the feel of a
  well-set book, not a fashion magazine) OR a subtly-editorial humanist sans if
  the serif reads too soft for the operational surfaces.
- **Self-host** in `public/fonts/` (or via `next/font/local`), **subset** to
  Latin + the ~250 glyphs the UI actually uses (generate the subset from the
  built app's text).
- `@font-face` with **`font-display: optional`** — the browser uses it only if
  it's already cached or loads within ~100ms; otherwise it uses the system serif
  fallback and never swaps. Zero CLS, zero render-block.
- Target: **≤ 25KB WOFF2**.
- Fallback stack stays: `"[Chosen Face]", "Iowan Old Style", Palatino, Georgia,
ui-serif, serif`.

No prompt needed — this is a licensing + selection task, not a generation task.
Candidates to evaluate (all have generous licensing options): a humanist serif
in the Source Serif / Newsreader / Literata family; or a warm humanist sans in
the Inter-display / Hanken Grotesk family used _only_ for headings.

---

# 6. Asset production order

| Order | Asset                                        | Blocks                            | Method           |
| ----- | -------------------------------------------- | --------------------------------- | ---------------- |
| 1     | A1 app mark (SVG, both colourways, maskable) | everything                        | design           |
| 2     | A2 wordmark + lockup                         | header, OG, onboarding            | design           |
| 3     | A3 favicon / D1 PWA icons / D3 OG            | metadata, install, sharing        | derive from A1   |
| 4     | B1–B8 illustrations                          | the trust moments in the redesign | generate + clean |
| 5     | C1–C4 third-party marks                      | the pay sheet, `/docs`            | source official  |
| 6     | (optional) display font                      | the type system                   | select + subset  |
| 7     | D4 iOS splash                                | nice-to-have                      | derive           |

---

# 7. Anti-patterns — reject any asset that…

- looks generated (uncanny gradients, impossible geometry, melted detail).
- includes a human face, a rendered phone/screen, a coin, a chain, a robot, or a
  padlock-as-decoration.
- uses more than 2 colours (ink + one wash).
- has a drop shadow, a gradient, or a texture.
- would read as "crypto", "fintech dashboard", or "AI startup".
- is a stock illustration or a stock photo.
- needs a caption to be understood.
- doesn't survive being shrunk to 120px on a cheap Android screen in daylight.
