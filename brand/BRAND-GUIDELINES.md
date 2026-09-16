# Intra brand guidelines

Version 1.0 · audited 15 September 2026

This directory is the reusable asset package for Intra’s current identity. It
extracts decisions already present in the application and ADR-022. It does not
introduce a new identity. When this guide and implementation diverge, resolve
the divergence against the authority map in [`brand.json`](brand.json).

## 1. Brand essence

Intra helps a person hand a clear request to a real local business, receive a
genuine quote, and keep control of the final order and payment. The identity is
calm, direct, warm, and operational. Trust comes from explicit states and plain
language rather than decorative claims.

The visual system is a warm editorial workspace: ivory canvas, ink actions,
restrained serif display type, system sans for operational text, generous
space, warm hairline borders, and flat surfaces. There is no dark product
theme, drop-shadow system, crypto decoration, mascot, or stock merchant image.

## 2. Logo and mark

The canonical mark is **The Handoff**: one filled node and one outlined node
joined by a horizontal line. It represents a request moving from one party to
another while the open node still has a decision to make.

- Canonical source: [`logo/intra-mark.svg`](logo/intra-mark.svg)
- Code authority: `src/components/brand/Mark.tsx`
- View box: `0 0 32 32`
- Primary color: action ink `#1f1e1d`
- Normal minimum size: 24px
- At 16–20px: use the heavier small-size favicon adaptation in
  [`logo/favicon/intra-favicon.svg`](logo/favicon/intra-favicon.svg)
- Clear space: at least one node radius, 4.5 view-box units, on each side. This
  measurement is derived from the mark’s own geometry.

The in-app source and favicon adaptation deliberately differ: the favicon uses
4.8-unit nodes and a 2.6-unit stroke for small-size legibility; the regular mark
uses 4.5-unit nodes and a 2.2-unit stroke. Do not merge those geometries.

### Variants

| Asset                                | Use                                               |
| ------------------------------------ | ------------------------------------------------- |
| `intra-mark.svg`                     | Default ink mark on transparent or light surfaces |
| `intra-mark-monochrome.svg`          | Single-color black production constraints         |
| `intra-mark-reversed.svg`            | Mark over an existing ink field                   |
| `intra-mark-on-ivory.svg`            | Ready-made light square                           |
| `intra-mark-on-ink.svg`              | Ready-made dark tile                              |
| `png/intra-mark-{512,1024,2048}.png` | Raster workflows that cannot use SVG              |

Do not rotate the mark, swap which node is filled, disconnect the line, add a
center dot to the outlined node, add gradients, shadows, or put it inside a new
shape. The two-node motif used in old design prompts is not a separate mark.

## 3. Wordmark and lockup

No drawn vector wordmark exists. The canonical product spelling is **Intra**,
title case. The current lockup is live text: mark at left, `0.5rem` gap, text in
the system sans at weight 600 with tight tracking, vertically centered.

Keep the symbol and text separate. Do not outline a platform-dependent system
font and call it a canonical wordmark. A dedicated wordmark remains future
design work.

## 4. Color system

### Core brand and interface colors

| Token                 | Hex       | RGB           | HSL           | Purpose                      | Do not use for                         |
| --------------------- | --------- | ------------- | ------------- | ---------------------------- | -------------------------------------- |
| Background            | `#faf9f5` | 250, 249, 245 | 48, 33%, 97%  | Warm ivory canvas            | Status meaning                         |
| Surface               | `#ffffff` | 255, 255, 255 | 0, 0%, 100%   | Cards and raised content     | Full-page brand field by default       |
| Surface accent        | `#f0eee6` | 240, 238, 230 | 48, 25%, 92%  | Quiet grouping               | Primary actions                        |
| Sage                  | `#dfe9df` | 223, 233, 223 | 120, 19%, 89% | Soft trust accent            | Success on its own                     |
| Mist                  | `#ccdbe8` | 204, 219, 232 | 208, 38%, 85% | Informational accent         | Links or action text                   |
| Border                | `#dedcd1` | 222, 220, 209 | 51, 16%, 85%  | Hairlines                    | Text                                   |
| Strong border         | `#b7b7b5` | 183, 183, 181 | 60, 1%, 71%   | Emphasized boundaries        | Body text                              |
| Ink                   | `#141413` | 20, 20, 19    | 60, 3%, 8%    | Primary text                 | Status meaning                         |
| Secondary ink / muted | `#3d3d3a` | 61, 61, 58    | 60, 3%, 23%   | Secondary and muted text     | Disabled text without testing          |
| Subtle                | `#73726c` | 115, 114, 108 | 51, 3%, 44%   | Metadata                     | Small critical copy                    |
| Action ink            | `#1f1e1d` | 31, 30, 29    | 30, 3%, 12%   | Mark, primary actions, focus | Large decorative fills without purpose |
| Action contrast       | `#ffffff` | 255, 255, 255 | 0, 0%, 100%   | Text on action ink           | Canvas                                 |
| Primary wash          | `#e9f0f5` | 233, 240, 245 | 205, 38%, 94% | Low-emphasis selection       | Semantic info without label            |

### Semantic UI colors

These communicate product state and are not brand colors. Pair each with an
icon or label.

| State       | Foreground | Wash      |
| ----------- | ---------- | --------- |
| Success     | `#28563a`  | `#e3f0e6` |
| Warning     | `#7a5300`  | `#f6ecd6` |
| Danger      | `#8a1f1f`  | `#f5e1e1` |
| Information | `#204b57`  | `#dce9ec` |

Forest green `#0f3e17` and linen `#fffefc` belong to the superseded ADR-009
palette. Historical reference documents may retain them as evidence; new
assets must not use them.

There is no separate secondary-ink token and muted token in the implementation;
`--color-text-muted` (`#3d3d3a`) serves both descriptions. The manifest records
`muted` as an alias rather than inventing another color.

## 5. Typography

Intra currently ships no font files and makes no web-font request.

- Primary UI: `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`,
  `Roboto`, `Helvetica`, `Arial`, `sans-serif`.
- Display: `Iowan Old Style`, `Palatino Linotype`, `Palatino`, `Georgia`,
  `ui-serif`, `serif`.
- Mono: `ui-monospace`, `SFMono-Regular`, `SF Mono`, `Menlo`, `Consolas`,
  `monospace`.

Fraunces is not implemented. It appears only in the historical decision note
that explains why a system serif replaced proposed display fonts. On Apple,
Iowan Old Style normally leads the display stack; Android and Windows commonly
fall through to Georgia. The CSS requests weight 300 for headings even though
Georgia has no true 300 cut, so appearance varies by platform.

| Role       | Current treatment                                                       |
| ---------- | ----------------------------------------------------------------------- |
| Display    | Serif, responsive 4xl–7xl when used on the landing hero, tight tracking |
| Title      | Serif, 2xl–3xl, light/normal                                            |
| Heading    | Serif, xl–2xl, light/medium                                             |
| Subheading | Sans, base–lg, medium                                                   |
| Body       | Sans, base, weight 400, line-height 1.5                                 |
| Meta       | Sans, xs–sm, muted/subtle                                               |
| Eyebrow    | Sans, 0.72rem, 600, uppercase, 0.08em tracking                          |
| Mono       | Mono, xs–sm for hashes, codes, addresses, and identifiers               |

The implementation frequently uses responsive `text-4xl`, `text-6xl`, and
`text-7xl` values beyond the named token scale. A few operational codes use
hardcoded sizes and tracking (`10px`, `11px`, `0.2em`). These are audit findings,
not changes made by this package.

## 6. Illustration system

There is no canonical illustration set in the repository. Earlier audit files
describe eight proposed trust illustrations, but no SVG, PNG, source drawing,
or approved export exists. They must not be presented as current brand assets.

The proposed subjects are: Your decision, Payment confirmed, Order handed
over, Waiting on the business, You’re offline, Nothing needs you, Set your
business up, and This couldn’t be completed. Their source brief remains
`docs/frontend-xray/14-LOVABLE-ASSET-PROMPTS.md` for future design work.

Current UI states use Lucide icons inside restrained wash surfaces. Continue
that behavior until an illustration set is designed and approved.

## 7. Iconography

Lucide React is the canonical icon family. Use 16px for ordinary UI, 14px for
compact controls, 20px for state anchors and navigation, and 12px for small
external-link indicators. Strokes inherit `currentColor`; default stroke width
is 2, with 2.5 reserved for active buyer navigation. Decorative icons use
`aria-hidden`; visible meaning must remain in adjacent text.

Use the Intra mark only for identity. Do not turn it into a general UI icon.
Continue using Lucide for empty, error, loading, payment, contact, and status
surfaces until an approved illustration explicitly replaces that role.

## 8. UI visual language

Use flat surfaces, one-pixel warm borders, 10/16/24px radii, generous spacing,
and restrained sage or mist washes. Elevation comes from surface and border
changes. Primary actions use action ink. Status color always has text or an
icon. Motion is short and functional, and respects reduced-motion settings.

Avoid stock photography, fabricated merchant imagery, avatars, crypto imagery,
AI mascots, decorative 3D shapes, loud gradients, and shadow-heavy cards.

## 9. Tone of voice

Write plainly and name what happens next. Emphasize real businesses, current
prices, human decisions, and direct control. Explain unavailable or delayed
states without blaming the buyer or pretending work completed.

Prefer consequence-led actions such as “Open in WhatsApp,” “Copy message,” “Send
quote,” and “I’ve sent this to the printer.” Avoid vague actions such as “OK” or
“Submit” when the specific consequence can be named.

## 10. Trust language

Canonical recurring lines:

- “Tell Intra what you need. Get a real price. Keep the final say.”
- “Real businesses. Clear quotes. You stay in control.”
- “I never send an order or pay for you.”
- “Order handoff — you send this yourself.”
- “No wallets, no private keys, and no final order without your approval.”

Never claim that Intra guarantees supplier performance, holds customer funds,
sends the final order, or proves physical quality through an attestation. Never
present demo data or unavailable integrations as live.

## 11. Social usage

Profile images use the reversed mark centered on an ink field. Covers use a
solid ivory field and centered mark because X and LinkedIn crop covers across
devices. Keep critical cover content centered and away from edges.

The source templates provide four format families: square, landscape, portrait,
and story. Edit text inside the `editable-content` SVG group. Replace all
bracketed placeholders before export. Keep the mark position, outer margin,
border, and restrained single accent.

Platform sizes and file mappings are in [`social/README.md`](social/README.md).

## 12. Do and don’t

| Do                                          | Don’t                                               |
| ------------------------------------------- | --------------------------------------------------- |
| Use the exact Handoff SVG                   | Redraw it from memory                               |
| Use ink on ivory or ivory on ink            | Restore the old forest-green palette                |
| Keep “Intra” as live text                   | Create outlined system-font wordmark art            |
| Use one accent wash per composition         | Add several competing accents                       |
| Pair status color with a label or icon      | Use color as the only state cue                     |
| Use genuine product screenshots             | Invent merchants, prices, receipts, or testimonials |
| Keep social layouts spacious and editable   | Fill every region with decoration                   |
| Source official partner marks when required | Recreate MiniPay, USDC, Celo, or WhatsApp logos     |
