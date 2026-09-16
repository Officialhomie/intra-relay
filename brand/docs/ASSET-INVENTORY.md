# Complete brand asset inventory

Audit date: 15 September 2026. Repository scope: tracked and untracked files
under `public/`, `src/`, `scripts/`, and `docs/`, excluding build output,
dependencies, and local database data.

Status terms: **production** = currently used by the app; **extracted** = copied
or derived without changing identity; **reference** = design evidence, not a
shippable asset; **missing** = no source asset exists; **deprecated** = retained
only for history.

## 1. Logo / mark

| Asset                      | Type        | Current location                       | Dimensions             | Format  | Purpose                    | Status                          | Canonical?           | Duplicate?                     | Deprecated? | Needs export? | Needs cleanup?                            |
| -------------------------- | ----------- | -------------------------------------- | ---------------------- | ------- | -------------------------- | ------------------------------- | -------------------- | ------------------------------ | ----------- | ------------- | ----------------------------------------- |
| Handoff React mark         | Code vector | `src/components/brand/Mark.tsx`        | 32×32 view box         | TSX/SVG | Header and buyer side rail | Production/source authority     | Yes                  | Geometry repeated in exports   | No          | Complete      | Keep code and asset geometry synchronized |
| Handoff favicon adaptation | Vector      | `src/app/icon.svg`                     | 32×32 view box         | SVG     | Browser favicon            | Production/small-size authority | Yes, at 16–20px      | Related, intentionally heavier | No          | Complete      | Documented                                |
| Canonical Handoff export   | Vector      | `brand/logo/intra-mark.svg`            | 32×32 view box         | SVG     | General identity           | Extracted                       | Yes                  | Derived from TSX               | No          | No            | No                                        |
| Monochrome mark            | Vector      | `brand/logo/intra-mark-monochrome.svg` | 32×32 view box         | SVG     | One-color production       | Extracted                       | Approved derivative  | No                             | No          | No            | No                                        |
| Reversed mark              | Vector      | `brand/logo/intra-mark-reversed.svg`   | 32×32 view box         | SVG     | Existing dark field        | Extracted                       | Approved derivative  | No                             | No          | No            | No                                        |
| Mark on ivory              | Vector      | `brand/logo/intra-mark-on-ivory.svg`   | 512×512                | SVG     | Light square source        | Extracted                       | Approved composition | No                             | No          | No            | No                                        |
| Mark on ink                | Vector      | `brand/logo/intra-mark-on-ink.svg`     | 512×512                | SVG     | Dark square/tile source    | Extracted                       | Approved composition | No                             | No          | No            | No                                        |
| Transparent raster marks   | Raster      | `brand/logo/png/`                      | 512, 1024, 2048 square | PNG     | Non-vector workflows       | Extracted                       | Derived              | Size variants                  | No          | No            | No                                        |

Geometry discrepancy: the regular mark uses radius 4.5 and stroke 2.2; the
favicon uses radius 4.8 and stroke 2.6. This is a legitimate optical-size
adaptation. The PWA generator uses proportional large-canvas geometry and is a
third implementation; visual meaning and colors agree, but exact geometry does
not. Consolidating the generator around one shared geometry module is future
cleanup because it would touch application tooling.

## 2. Wordmark

| Asset             | Type        | Current location            | Dimensions | Format   | Purpose               | Status     | Canonical?        | Duplicate?              | Deprecated? | Needs export?     | Needs cleanup?                                |
| ----------------- | ----------- | --------------------------- | ---------- | -------- | --------------------- | ---------- | ----------------- | ----------------------- | ----------- | ----------------- | --------------------------------------------- |
| “Intra” live text | Text lockup | `src/components/Header.tsx` | Responsive | HTML/CSS | Product/header lockup | Production | Yes, as live text | Text also appears in OG | No          | No vector export  | A dedicated wordmark requires design approval |
| Vector wordmark   | —           | `brand/wordmark/README.md`  | —          | —        | Fixed identity lockup | Missing    | No                | No                      | No          | Yes, after design | Yes                                           |

## 3. Favicon / app icon

| Asset            | Type          | Current location                    | Dimensions       | Format   | Purpose                | Status     | Canonical?      | Duplicate?           | Deprecated? | Needs export? | Needs cleanup?                           |
| ---------------- | ------------- | ----------------------------------- | ---------------- | -------- | ---------------------- | ---------- | --------------- | -------------------- | ----------- | ------------- | ---------------------------------------- |
| Next favicon     | Vector        | `src/app/icon.svg`                  | 32 view box      | SVG      | Browser tabs/bookmarks | Production | Yes, small-size | Extracted into brand | No          | Complete      | No                                       |
| Favicon package  | Raster/vector | `brand/logo/favicon/`               | 16, 32, 48 + SVG | PNG/SVG  | Browser-ready sources  | Extracted  | Derived         | Size variants        | No          | No            | `.ico` fallback remains optional/missing |
| Apple touch icon | Raster        | `public/icons/apple-touch-icon.png` | 180×180          | PNG RGBA | iOS home screen        | Production | Derived         | Copied into package  | No          | Complete      | No                                       |

## 4. PWA icons

| Asset              | Type   | Current location                     | Dimensions    | Format       | Purpose                    | Status                  | Canonical?       | Duplicate?             | Deprecated? | Needs export? | Needs cleanup?                            |
| ------------------ | ------ | ------------------------------------ | ------------- | ------------ | -------------------------- | ----------------------- | ---------------- | ---------------------- | ----------- | ------------- | ----------------------------------------- |
| Standard icon      | Raster | `public/icons/icon-192.png`          | 192×192       | PNG RGBA     | Manifest `any`             | Production              | Derived          | Packaged copy          | No          | Complete      | No                                        |
| Large icon         | Raster | `public/icons/icon-512.png`          | 512×512       | PNG RGBA     | Manifest `any`             | Production              | Derived          | Packaged copy          | No          | Complete      | No                                        |
| Maskable icon      | Raster | `public/icons/icon-maskable-512.png` | 512×512       | PNG RGBA     | Manifest `maskable`        | Production              | Derived          | Packaged copy          | No          | Complete      | No                                        |
| Generator          | Code   | `scripts/generate-icons.mjs`         | 512 master    | JS/SVG/Sharp | Rebuild committed PWA PNGs | Production tooling      | Source for tiles | Geometry overlaps mark | No          | No            | Could share mark geometry with `Mark.tsx` |
| Packaged app icons | Raster | `brand/logo/app-icons/`              | 180, 192, 512 | PNG          | Distribution copies        | Extracted byte-for-byte | Derived          | Yes, intentional       | No          | No            | No                                        |

## 5. Open Graph / social share graphics

| Asset                   | Type                 | Current location                           | Dimensions | Format    | Purpose                    | Status                                  | Canonical? | Duplicate?                    | Deprecated? | Needs export? | Needs cleanup?                          |
| ----------------------- | -------------------- | ------------------------------------------ | ---------- | --------- | -------------------------- | --------------------------------------- | ---------- | ----------------------------- | ----------- | ------------- | --------------------------------------- |
| Runtime OG card         | Code-generated image | `src/app/opengraph-image.tsx`              | 1200×630   | TSX → PNG | Open Graph and X card      | Production                              | Yes        | Mark geometry repeated inline | No          | Exported      | Could import/share an identity constant |
| Static OG source/export | Vector/raster        | `brand/social/intra-og-1200x630.{svg,png}` | 1200×630   | SVG/PNG   | Social upload, decks, docs | Extracted from current composition/copy | Derived    | Yes, intentional              | No          | No            | Keep aligned with runtime OG copy       |

## 6. Illustrations

| Asset                           | Type                | Current location                                             | Dimensions      | Format   | Purpose                                                                        | Status         | Canonical? | Duplicate?               | Deprecated? | Needs export?                    | Needs cleanup?                                    |
| ------------------------------- | ------------------- | ------------------------------------------------------------ | --------------- | -------- | ------------------------------------------------------------------------------ | -------------- | ---------- | ------------------------ | ----------- | -------------------------------- | ------------------------------------------------- |
| Eight trust illustration briefs | Text proposal       | `docs/frontend-xray/14-LOVABLE-ASSET-PROMPTS.md`             | Proposed ~160px | Markdown | Trust, approval, payment, handover, waiting, offline, empty, error, onboarding | Reference only | No         | Listed in xray 11 and 14 | No          | Cannot export; no drawings exist | Requires one coherent design session and approval |
| Current state visuals           | Library icons + CSS | `src/components/ui/States.tsx`, `Callout.tsx`, feature views | 14–20px icons   | TSX      | Empty/error/success/loading/status                                             | Production     | Yes        | Repeated patterns        | No          | No                               | No                                                |

No hidden, unused, or unreferenced illustration files were found.

## 7. Typography

| Asset                 | Type                 | Current location        | Dimensions | Format        | Purpose                  | Status              | Canonical? | Duplicate?               | Deprecated? | Needs export? | Needs cleanup?                               |
| --------------------- | -------------------- | ----------------------- | ---------- | ------------- | ------------------------ | ------------------- | ---------- | ------------------------ | ----------- | ------------- | -------------------------------------------- |
| Sans stack            | CSS token            | `src/styles/tokens.css` | —          | CSS           | UI/body                  | Production          | Yes        | Mapped in Tailwind       | No          | Documented    | No                                           |
| Serif stack           | CSS token            | `src/styles/tokens.css` | —          | CSS           | h1–h3/display            | Production          | Yes        | Mapped in Tailwind       | No          | Documented    | Weight 300 varies by platform                |
| Mono stack            | CSS token            | `src/styles/tokens.css` | —          | CSS           | Technical values         | Production          | Yes        | Mapped in Tailwind       | No          | Documented    | No                                           |
| Fraunces/Faire Octave | Historical reference | `docs/DECISIONS.md`     | —          | Text only     | Former display direction | Never implemented   | No         | Mentioned in design docs | Superseded  | No            | Do not treat as a current font               |
| Font files            | —                    | —                       | —          | WOFF/TTF/etc. | Self-hosted typography   | Missing by decision | No         | No                       | No          | No            | New font needs decision and licensing review |

## 8. Colors

The authoritative token inventory is in `brand.json` and
`BRAND-GUIDELINES.md`. All 20 hexadecimal values found in runtime source are
accounted for by current tokens or deliberate token mirrors in global-error,
manifest, mark, favicon, and OG code.

Historical `docs/design/DESIGN (4–8).md` files contain unrelated reference-site
palettes. They are research evidence, not Intra tokens. ADR-009’s forest green
`#0f3e17` and linen `#fffefc` are explicitly superseded by ADR-022.

## 9. Iconography

| Asset          | Type         | Current location                     | Dimensions               | Format    | Purpose       | Status     | Canonical? | Duplicate?          | Deprecated? | Needs export?        | Needs cleanup?                              |
| -------------- | ------------ | ------------------------------------ | ------------------------ | --------- | ------------- | ---------- | ---------- | ------------------- | ----------- | -------------------- | ------------------------------------------- |
| Lucide React   | Icon library | `package.json`, imports under `src/` | Usually 12, 14, 16, 20px | React SVG | Product icons | Production | Yes        | Tree-shaken library | No          | Do not extract files | Keep adjacent text and `aria-hidden` policy |
| Handoff symbol | Brand mark   | `src/components/brand/Mark.tsx`      | 22–26px in product       | React SVG | Identity only | Production | Yes        | See logo section    | No          | Complete             | Do not use as a generic status icon         |

## 10. UI tokens

| Asset                            | Type                | Current location         | Dimensions | Format     | Purpose                                  | Status     | Canonical? | Duplicate?         | Deprecated? | Needs export? | Needs cleanup?                                    |
| -------------------------------- | ------------------- | ------------------------ | ---------- | ---------- | ---------------------------------------- | ---------- | ---------- | ------------------ | ----------- | ------------- | ------------------------------------------------- |
| Color/type/spacing/radius tokens | Design tokens       | `src/styles/tokens.css`  | —          | CSS        | UI source of truth                       | Production | Yes        | Tailwind maps them | No          | Manifested    | No                                                |
| Tailwind mapping                 | Build configuration | `tailwind.config.ts`     | —          | TypeScript | Utility access to tokens                 | Production | Yes        | Token aliases      | No          | Documented    | No                                                |
| Global visual language           | CSS rules           | `src/styles/globals.css` | —          | CSS        | Base typography, gradient, motion, focus | Production | Yes        | —                  | No          | Documented    | Responsive display sizes exceed named token scale |

## 11. Brand copy

| Asset                     | Type           | Current location                                            | Dimensions | Format     | Purpose                                      | Status     | Canonical?          | Duplicate?                      | Deprecated? | Needs export? | Needs cleanup?                                        |
| ------------------------- | -------------- | ----------------------------------------------------------- | ---------- | ---------- | -------------------------------------------- | ---------- | ------------------- | ------------------------------- | ----------- | ------------- | ----------------------------------------------------- |
| Name/tagline/descriptions | Copy constants | `src/lib/site.ts`                                           | —          | TypeScript | Metadata and product description             | Production | Yes                 | Used in layout/manifest/OG      | No          | Manifested    | “AI-agent” vs “AI commerce” varies in landing eyebrow |
| Landing trust language    | UI copy        | `src/app/page.tsx`                                          | —          | TSX        | Public explanation                           | Production | Canonical recurring | Related lines across app        | No          | Manifested    | No rewrite made                                       |
| Conversation promise      | UI/API copy    | `ConversationView.tsx`, conversation API, `intent/reply.ts` | —          | TSX/TS     | Agent boundary                               | Production | Canonical meaning   | Several variants                | No          | Manifested    | Could centralize later                                |
| Handoff language          | UI copy        | `src/features/tasks/TaskPage.tsx`                           | —          | TSX        | Human approval and WhatsApp action           | Production | Canonical           | —                               | No          | Manifested    | No                                                    |
| Payment trust language    | UI copy        | payment/task modules                                        | —          | TSX/TS     | Non-custodial and verified-state explanation | Production | Canonical meaning   | Multiple context-specific lines | No          | Manifested    | Keep context-specific distinctions                    |

## 12. Social assets

Every source/export below is new packaging derived from the current mark and
tokens. It does not alter the application.

| Platform asset         | Location                                                       | Dimensions | Formats | Purpose                     | Status                             |
| ---------------------- | -------------------------------------------------------------- | ---------- | ------- | --------------------------- | ---------------------------------- |
| X profile              | `brand/social/x/intra-x-profile-400`                           | 400×400    | SVG/PNG | Account profile             | Ready                              |
| X header               | `brand/social/x/intra-x-header-1500x500`                       | 1500×500   | SVG/PNG | Account cover               | Ready                              |
| X square post          | `brand/social/x/intra-x-square-post-1080x1080`                 | 1080×1080  | SVG/PNG | Editable post template      | Source-ready; replace placeholders |
| X landscape post       | `brand/social/x/intra-x-landscape-post-1600x900`               | 1600×900   | SVG/PNG | Editable 16:9 template      | Source-ready; replace placeholders |
| X portrait post        | `brand/social/x/intra-x-portrait-post-1080x1350`               | 1080×1350  | SVG/PNG | Editable 4:5 template       | Source-ready; replace placeholders |
| Instagram profile      | `brand/social/instagram/intra-instagram-profile-320`           | 320×320    | SVG/PNG | Account profile             | Ready                              |
| Instagram square       | `brand/social/instagram/intra-instagram-square-1080x1080`      | 1080×1080  | SVG/PNG | Editable feed template      | Source-ready; replace placeholders |
| Instagram portrait     | `brand/social/instagram/intra-instagram-portrait-1080x1350`    | 1080×1350  | SVG/PNG | Editable feed template      | Source-ready; replace placeholders |
| Instagram story        | `brand/social/instagram/intra-instagram-story-1080x1920`       | 1080×1920  | SVG/PNG | Editable story/reel cover   | Source-ready; replace placeholders |
| LinkedIn profile       | `brand/social/linkedin/intra-linkedin-profile-400`             | 400×400    | SVG/PNG | Company logo                | Ready                              |
| LinkedIn company cover | `brand/social/linkedin/intra-linkedin-company-cover-1512x256`  | 1512×256   | SVG/PNG | Company cover               | Ready                              |
| LinkedIn square        | `brand/social/linkedin/intra-linkedin-square-post-1080x1080`   | 1080×1080  | SVG/PNG | Editable post template      | Source-ready; replace placeholders |
| LinkedIn landscape     | `brand/social/linkedin/intra-linkedin-landscape-post-1200x627` | 1200×627   | SVG/PNG | Editable link/post template | Source-ready; replace placeholders |
| WhatsApp profile       | `brand/social/whatsapp/intra-whatsapp-profile-640`             | 640×640    | SVG/PNG | Business profile            | Ready                              |
| WhatsApp status        | `brand/social/whatsapp/intra-whatsapp-status-1080x1920`        | 1080×1920  | SVG/PNG | Editable status             | Source-ready; replace placeholders |

## 13. Presentation assets

No pitch deck, presentation master, or presentation-specific identity assets
exist. The canonical SVG mark, static OG card, four social templates, token
tables, and live-text lockup are immediately reusable in decks. A deck template
would be new design work and was not invented here.

## 14. Backgrounds / patterns

| Asset                        | Type         | Current location         | Dimensions | Format | Purpose               | Status                  | Canonical?                          | Duplicate?                 | Deprecated? | Needs export? | Needs cleanup?                        |
| ---------------------------- | ------------ | ------------------------ | ---------- | ------ | --------------------- | ----------------------- | ----------------------------------- | -------------------------- | ----------- | ------------- | ------------------------------------- |
| Page radial tint             | CSS gradient | `src/styles/globals.css` | Responsive | CSS    | Quiet page atmosphere | Production              | Yes                                 | Landing adds two CSS blobs | No          | No            | Do not convert to bitmap              |
| Landing mist/sage blobs      | CSS elements | `src/app/page.tsx`       | Responsive | CSS    | Hero decoration       | Production              | Current, not standalone brand asset | Similar visual role        | No          | No            | Could be simplified in future UI work |
| Standalone patterns/textures | —            | —                        | —          | —      | Marketing decoration  | Missing and unnecessary | No                                  | No                         | No          | No            | Do not create without a real need     |

## 15. Social production system

The extracted package now includes six platform profile sets; X, LinkedIn,
Facebook, and YouTube banners; four ratio masters; ten content templates; four
screenshot frames; two diagrams; eight presentation layouts; safe-area guides;
and visual contact sheets. SVG is the editable source and PNG is the paired
review or delivery export. Exact paths are listed in `DIRECTORY-TREE.md`.

## 16. Future / unused assets

- Eight trust illustrations: specified, never produced.
- Dedicated wordmark and fixed lockup: absent.
- Official MiniPay, USDC, Celo, and WhatsApp marks: absent; source only from
  rights-holder brand kits if future UI work requires them.
- Product screenshots: absent.
- Native PPTX or Google Slides master: optional; editable SVG slide layouts exist.
- `favicon.ico`: absent; SVG plus 16/32/48 PNGs are packaged.
- No unused raster/vector/font asset was found in the repository.

## Missing asset references found in code

`scripts/register-erc8004-agent.mjs` publishes `${APP_URL}/icon-512.png` as its
metadata image, but the actual committed file is `public/icons/icon-512.png`,
served at `/icons/icon-512.png`. The referenced root-level `/icon-512.png` is
missing. This audit records the mismatch but does not modify the registration
script or application routes.
