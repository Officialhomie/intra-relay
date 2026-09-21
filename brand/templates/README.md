# Template system

Four source layouts cover the core ratios:

- `intra-social-square-1080x1080.svg`
- `intra-social-landscape-1600x900.svg`
- `intra-social-portrait-1080x1350.svg`
- `intra-social-story-1080x1920.svg`

Each uses the same structure: Handoff mark at top left, one quiet wash accent,
an inset hairline, editorial headline, sans supporting copy, and live-text
“Intra” in the footer. The SVG group `editable-content` contains all content
placeholders. Preview PNGs are included to make the system easy to inspect.

## Content recipes

The recipes change copy hierarchy, not the visual identity.

| Type            | Eyebrow                   | Headline                 | Supporting detail             | Recommended format      |
| --------------- | ------------------------- | ------------------------ | ----------------------------- | ----------------------- |
| Announcement    | “Announcement” or date    | The news in one sentence | Availability or next step     | Square/landscape        |
| Product update  | “Product update”          | Resulting behavior       | Concrete trigger or scope     | Square/landscape        |
| Educational     | Topic label               | One useful idea          | One supporting fact or action | Portrait/carousel cover |
| Quote           | Source/role               | Short approved quotation | Context and attribution       | Square/portrait         |
| Founder/builder | “Builder note”            | One direct observation   | Context in first person       | Portrait                |
| Feature release | “Now available”           | Feature and user outcome | Who can use it and where      | Square/landscape        |
| Case study      | Real participant/category | Verified result          | Method, timeframe, source     | Portrait/landscape      |
| Trust/proof     | “How Intra works”         | One specific control     | Evidence or limitation        | Square                  |
| Event           | Event/date                | Event name               | Time, location, action        | Story/portrait          |
| Call to action  | Audience label            | Specific invitation      | Consequence-led CTA           | Square/story            |

## Rules

- One primary message per composition.
- Use no more than one accent wash.
- Keep the mark, margins, inset border, and footer placement stable.
- Keep headlines short enough to fit in two lines at the intended size.
- Use genuine data only. Identify demo data visibly.
- Do not place partner marks beside an approval, price, or trust claim.
- Do not use generic startup gradients, random card grids, AI imagery, stock
  merchants, or decorative crypto motifs.
- Replace bracketed placeholders before final export.

The templates intentionally omit photography and illustrations because no
canonical set exists.

## Additional families

- `social/` — ten editable content compositions.
- `presentation/` — title, section, content, screenshot, quote, architecture,
  CTA, and blank 16:9 layouts.
- `screenshot-frames/` — browser, phone, device-less, and caption layouts.
- `diagrams/` — request-to-handoff and buyer–Intra–business flows.

Each folder contains a README with editing and export instructions.
