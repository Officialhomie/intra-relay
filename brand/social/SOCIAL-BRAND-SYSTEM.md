# Intra social brand system

## Visual position

Intra should feel calm, exact, trustworthy, and human-controlled. The Handoff
mark is the anchor: a filled node passes a request to an open node. Editorial
serif headlines add warmth; system sans text carries operational information.
Ivory and ink lead. Sage and mist create quiet emphasis.

## Composition rules

1. Keep one primary message per asset.
2. Use the canonical mark without redrawing, stretching, rotating, or adding effects.
3. Keep at least one node radius of clear space around the mark.
4. Use no more than one accent field in a composition.
5. Use serif for short display headlines and sans for labels, body copy, and calls to action.
6. Align copy to the grid or rule supplied in the SVG master.
7. Keep all claims specific and verifiable. Label demo material.
8. Replace every bracketed placeholder before publishing.

## Profile system

The default profile uses the ivory mark on action ink. This has the strongest
recognition at small sizes and survives circular crops. The ivory-field option
is an approved alternate when a dark surrounding interface needs separation.
The safe-area asset is for review only.

## Banner system

X includes product-message, text-light, and mark-dominant variants. LinkedIn
includes product and company-positioning variants. YouTube keeps all essential
content inside its centered all-device safe area. Facebook uses a high-resolution
working canvas and must be checked in the live Page editor because device crops vary.

## Platform dimensions and safe areas

| Platform  | Profile   | Banner or cover         | Content masters                       |
| --------- | --------- | ----------------------- | ------------------------------------- |
| X         | 400×400   | 1500×500                | 1080×1080, 1080×1350, 1600×900        |
| LinkedIn  | 400×400   | 1512×256                | 1080×1080, 1200×627                   |
| Instagram | 1080×1080 | —                       | 1080×1080, 1080×1350, 1080×1920       |
| WhatsApp  | 640×640   | —                       | 1080×1920                             |
| Facebook  | 1080×1080 | 1640×624 working canvas | 1080×1080, 1080×1350, 1080×1920       |
| YouTube   | 800×800   | 2560×1440               | 1280×720 thumbnail, 150×150 watermark |

Use `safe-areas/` for X, LinkedIn, YouTube, and Story/Reel review. Green marks
the content-safe region, blue dash marks text-safe space, ink marks logo-safe
space, and amber or rose marks crop risk. Guide files are never publishable.

## Logo, typography, and color

Use the regular 32×32 mark geometry above 20 px and the heavier favicon
adaptation at 16–20 px. Never outline live text to imitate a wordmark. Use
system serif for short editorial display text, system sans for operational copy,
and system mono only for identifiers or technical details. Keep ivory and ink
dominant; use one restrained sage or mist accent. Semantic colors must describe
real status and must not become decoration.

## Content families

The ten square masters cover announcement, feature release, education, product
principle, founder note, case study, trust/proof, event, call to action, and
quote content. Use the four ratio masters when the composition needs to travel
between platforms. Preserve hierarchy, margins, mark position, and footer; edit
only the `editable-content` group.

## Screenshots and diagrams

Use browser framing for desktop context, phone framing for mobile flow,
device-less framing when the interface should be the focus, and the caption
layout when a concrete observation needs explanation. Replace `[PRODUCT
SCREENSHOT]` with an approved capture that contains no secrets or fabricated
user data.

Diagrams describe relationships, not implementation detail. Keep labels short,
use the established arrow direction, and avoid decorating the flow with partner
marks or invented protocol symbols.

## Presentation use

The presentation layouts are editable 1920×1080 SVGs with paired preview PNGs.
Use at least 42 px for deck titles, 32 px for slide titles, and 17 px for body
copy. Prefer one diagram, screenshot, or proof point per slide. The PNGs are
reference exports; edit the SVGs or recreate the layout with native slide text
and shapes when ongoing editing is required.

## Export and QC

- Edit SVG masters, then export PNG at the listed pixel dimensions.
- Keep transparent backgrounds only for mark and watermark files.
- Do not publish guide assets or templates containing bracketed text.
- Review the profile, banner, template, and platform contact sheets at 100%.
- Recheck platform crops in the live uploader before publishing.
- Run `node brand/scripts/build-assets.mjs` after source changes.

## Partner marks

Use only rights-holder artwork. Keep each owner's clear space, match optical
height, add a relationship label, and use owner-supplied monochrome files when
needed. See `../docs/PARTNER-LOGO-HANDLING.md`.

## Do and do not

**Do:** use generous ivory space, one clear message, real evidence, thin warm
borders, consistent mark placement, and calm editorial hierarchy.

**Do not:** add gradients, glow, crypto motifs, random UI cards, fake imagery,
unverified claims, unofficial partner marks, or guide overlays to final exports.

## Source-dependent gaps

No canonical illustration set, dedicated vector wordmark, real product
screenshot library, or official partner-logo kit exists in the repository.
These remain explicit gaps; see `../docs/SOCIAL-ASSET-GAPS.md`.
