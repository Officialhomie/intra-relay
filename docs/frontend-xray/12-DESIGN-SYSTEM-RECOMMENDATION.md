# 12 — Design System Recommendation

> Assessment of the current visual system and a concrete recommendation for the
> redesign. Grounded in the actual tokens (`src/styles/tokens.css`), the actual
> component patterns (`03-COMPONENT-INVENTORY.md`), the actual audience (Nigerian
> students / SMEs on inexpensive Android phones, in daylight), and the actual
> product constraints (`CLAUDE.md` §4, ADR-009, ADR-022).
>
> This document feeds [`13-LOVABLE-REDESIGN-PROMPT.md`](13-LOVABLE-REDESIGN-PROMPT.md).
> It is a **specification**, not a mood board.

---

# 1. Current design system — assessment

## What exists (verified from `src/styles/tokens.css`, `globals.css`, `tailwind.config.ts`)

**Palette (ADR-022 "warm editorial workspace"):**

- Canvas `#faf9f5` ivory · surface `#ffffff` · surface-accent `#f0eee6`
- Tints: sage `#dfe9df`, mist `#ccdbe8`
- Borders: `#dedcd1` hairline, `#b7b7b5` strong
- Text: `#141413` / `#3d3d3a` muted / `#73726c` subtle
- **One action colour: ink `#1f1e1d`** (hover `#141413`, contrast white)
- `--color-primary-wash: #e9f0f5` — a **cold pale blue** (mismatched to the ink primary)
- Status (muted, always icon+label): success `#28563a`/`#e3f0e6` · warning
  `#7a5300`/`#f6ecd6` · danger `#8a1f1f`/`#f5e1e1` · info `#204b57`/`#dce9ec`

**Type**: system sans stack; serif = `"Iowan Old Style", Palatino, Georgia,
ui-serif`; mono = system. **No web font.** Scale xs .75 → 3xl 2.5rem. Weights
300/400/500/600. `<h1–h3>` are serif weight 300, tracking tight.

**Shape**: radii **10 / 16 / 24 / 999px** (geometric, no in-between). **No drop
shadows** — elevation is border + surface tint. 4px spacing base.
`--container-max: 72rem`.

**Motion**: `.page-enter` staggered rise-in (guarded), `.interactive-card` hover
lift, `Button` active-scale, `Loader2` spin, `Skeleton` pulse — all
`prefers-reduced-motion` guarded.

**Components**: 9 hand-rolled primitives. `Callout` (4 tones, `unavailable` =
honesty). `StatusPill` (dot + uppercase label, never colour alone).
`DataList`/`DataRow`. `EmptyState`/`Skeleton`/`LoadingPanel`/`ErrorState`.

**Accessibility baseline**: real `<label>`s, `aria-invalid` + `aria-describedby`,
`:focus-visible` 2px outline, `role="alert"`/`status`, status by icon + word,
reduced-motion guards, 16px inputs (no iOS zoom).

## Verdict per dimension

| Dimension                                                                                                                                                   | State                                                                                                                                                                                                                         | Verdict                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Core principles** (light-first, flat, hairline, tint elevation, one action colour, status = icon+label, no web font, reduced-motion, mobile-first, 360px) | Excellent — exactly right for the audience                                                                                                                                                                                    | **PRESERVE wholesale**                                                           |
| **Palette execution**                                                                                                                                       | Right direction; 4 surfaces carry the **stale green** (`layout.tsx` themeColor, `manifest.ts`, `opengraph-image.tsx`, `global-error.tsx`); `primary-wash` is a mismatched cold blue; `mist`/`sage`/`primary-wash` used ad hoc | **REFINE** — consolidate colour _roles_, fix the stale surfaces                  |
| **Typography**                                                                                                                                              | Sound scale + weights; the "editorial serif" is **Georgia on Android** (the target device)                                                                                                                                    | **DECIDE explicitly** — §3                                                       |
| **Shape / spacing / elevation**                                                                                                                             | Coherent and disciplined                                                                                                                                                                                                      | **PRESERVE**, tighten the radius _roles_                                         |
| **Component vocabulary** (`Callout`, `StatusPill`, `DataList`)                                                                                              | Strong, semantic, reusable                                                                                                                                                                                                    | **PRESERVE + extend** (add sheet, segmented control, stepper)                    |
| **Icon system**                                                                                                                                             | 50 lucide icons, consistent, accessible                                                                                                                                                                                       | **PRESERVE** — lucide only                                                       |
| **Brand assets**                                                                                                                                            | 3 inconsistent marks, no logo file, no favicon                                                                                                                                                                                | **REDESIGN** (see [`11`](11-ASSET-INVENTORY.md))                                 |
| **Illustration / imagery**                                                                                                                                  | None — every state is a lucide icon in a circle                                                                                                                                                                               | **ADD a restrained set** (B1–B8, [`11` §3.2])                                    |
| **Navigation**                                                                                                                                              | In-page pills / back-links; `primaryNav` has 7 entries, `Header` renders 3; no persistent buyer nav                                                                                                                           | **RESTRUCTURE** — §12                                                            |
| **`/tasks/:id` layout**                                                                                                                                     | 7–8 stacked panels; the current action isn't obvious                                                                                                                                                                          | **RESTRUCTURE** — the single biggest layout problem ([`04` S-04], [`10` §16 #4]) |
| **Internal-page rhythm**                                                                                                                                    | inherits the new palette but not the new spacing (ADR-022 admits this)                                                                                                                                                        | **REFINE** — apply the system everywhere                                         |

## Recommendation: **B — preserve and refine.**

Not A (the execution gaps are real and the brand is missing). Not C (the
foundation is genuinely good and a ground-up rebuild would throw away the
hardest-won parts — the accessible-status vocabulary, the honesty-`Callout`
pattern, the reduced-motion discipline, the no-web-font decision).

**The refinement has four workstreams:**

1. **Fix the palette** — one warm system, stale green eliminated, colour _roles_
   defined (not just values), the mismatched `primary-wash` replaced.
2. **Resolve typography** — commit to a display face decision (§3) and apply the
   scale consistently.
3. **Restructure two things** — `/tasks/:id` into a focus layout, and buyer
   navigation into a persistent bottom bar.
4. **Add the missing brand + illustration assets** ([`11`](11-ASSET-INVENTORY.md)).

Everything else is polish on a sound base.

---

# 2. Colour — roles, not just values

Define colour by **role**. A component asks for a role; the role maps to a value.
This kills the ad-hoc `bg-mist/40` / `bg-primary-wash/40` / `bg-sage/40` usage.

## 2.1 Surfaces (light only — no dark mode)

| Role             | Value                                                                                            | Use                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `canvas`         | `#faf9f5`                                                                                        | the page ground (unchanged)                                                         |
| `surface`        | `#ffffff`                                                                                        | cards, sheets, inputs                                                               |
| `surface-sunken` | `#f4f2ec`                                                                                        | inset areas, code/`<pre>`, disabled fields (slightly warmer than today's `#f0eee6`) |
| `surface-raised` | `#ffffff` + a hairline + a **1px warm inner top highlight** `rgba(255,255,255,.6) inset 0 1px 0` | the ONE elevation treatment for a sheet / a focused card. Still no drop shadow.     |

## 2.2 Ink & text

| Role            | Value                                                     | Use                                                  |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `text`          | `#141413`                                                 | body, headings                                       |
| `text-muted`    | `#3d3d3a`                                                 | secondary, labels                                    |
| `text-subtle`   | `#73726c`                                                 | meta, timestamps, hints                              |
| `text-on-ink`   | `#faf9f5`                                                 | text on the ink action colour (warm white, not pure) |
| `border`        | `#e4e1d8` (a touch warmer/lighter than today's `#dedcd1`) | hairlines                                            |
| `border-strong` | `#c8c4b8`                                                 | input borders, focused card edges                    |

## 2.3 Action

| Role           | Value                                                     | Use                                                                                     |
| -------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `action`       | `#1f1e1d` ink                                             | **every primary button, primary link, active nav, the app mark** — one colour, as today |
| `action-hover` | `#000000`                                                 | hover/press                                                                             |
| `action-wash`  | **`#f0ede4`** (a warm sand, replacing the cold `#e9f0f5`) | selected radio/segment background, the approval-card tint, the "you are here" nav pill  |
| `action-ring`  | `#1f1e1d` at 100%                                         | `:focus-visible` outline                                                                |

**Rationale for `action-wash`**: the current `#e9f0f5` is a blue-grey that fights
the warm ivory ground and the ink action colour. A warm sand keeps the palette
coherent and still reads as "gently emphasised".

## 2.4 Status — the trust vocabulary (keep the discipline, warm the washes)

Every status **must** carry an icon + a text label (`NFR-A11Y-001`). The colour
is reinforcement, never the sole signal.

| Role                      | Text/icon                                 | Wash                              | Meaning in this product                                                                                                             |
| ------------------------- | ----------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `positive`                | `#28563a` (unchanged)                     | `#e6efe6` (slightly warmer green) | done, confirmed, verified, available                                                                                                |
| `attention`               | `#7a5300` (unchanged)                     | `#f6ecd6` (unchanged)             | needs your decision / action; time-sensitive                                                                                        |
| `critical`                | `#8a1f1f` (unchanged)                     | `#f6e3df` (warmer)                | failed, error, declined                                                                                                             |
| `info`                    | `#2f4858` (a touch warmer than `#204b57`) | `#e4ebe9`                         | informational; "here's what's happening"                                                                                            |
| `neutral` / `unavailable` | `#73726c` on `#f2efe8`                    | —                                 | **the honesty tone** — "this is what is NOT happening / NOT verified / NOT real". This is the most important status in the product. |

**`neutral`/`unavailable` is load-bearing.** It is the tone of "Intra never
fabricates a payment", "operational evidence, not proof", "no receipt exists",
"Demo — not saved". It must feel _calm and honest_, never like an error. Grey on
warm sand, `CircleSlash` or `Info` icon, quiet.

## 2.5 What to delete

- `--color-primary-wash: #e9f0f5` → replace with `action-wash` `#f0ede4`.
- `--color-mist` / `--color-sage` as standalone tokens → fold into `info` /
  `positive` washes; the landing-page blobs go (§11).
- The stale green `#0f3e17` → **everywhere** (`viewport.themeColor`,
  `manifest.ts` `theme_color`, `opengraph-image.tsx`, `global-error.tsx`). New
  `theme_color` = `#faf9f5` (canvas) or `#1f1e1d` (ink) — pick ink for the OS
  status-bar contrast in `standalone`.

---

# 3. Typography

## The serif question — decide explicitly

**Facts:**

- `<h1>`/`<h2>`/`<h3>` are `font-serif` weight 300, and the stack is `"Iowan Old
Style", Palatino, Georgia, ui-serif`.
- The primary audience is on **Android** → they see **Georgia** (weight 300 of
  Georgia is not a real weight; it renders as regular, sometimes faux-light).
- ADR-009/022 **forbid a web-font fetch** — the rationale is data cost on
  metered connections and build simplicity.

**Options:**

| Option                                                                                                                                                                                                                             | Pros                                                                                                                                                                   | Cons                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A. Embrace the system serif** — design headings _for_ Georgia/Iowan at weight 400 (not 300), tighter sizes                                                                                                                       | zero bytes, zero risk, honest to the constraint                                                                                                                        | Georgia at large display sizes is competent but not distinctive; the "editorial" identity is diluted        |
| **B. Drop the serif entirely** — all headings in the system sans, differentiated by size + weight + tracking                                                                                                                       | maximum simplicity, maximum consistency across devices, the sans stack is solid                                                                                        | loses the one warm/editorial signal; risks reading as "generic SaaS" — exactly what the brief says to avoid |
| **C. Self-host ONE display face, subset + `font-display: optional`** — e.g. a warm humanist serif or a distinctive grotesque, ~15–25KB WOFF2 subset (Latin + the ~200 glyphs the UI uses), `optional` so it never blocks or shifts | a real, owned identity that survives on every device; `optional` = no CLS, no render-block, falls to the system stack on a slow connection; one file, one `@font-face` | breaks the letter of ADR-009/022 (needs a one-line ADR amendment); ~20KB one-time cost                      |

**Recommendation: C, scoped to a single display weight**, with a one-line ADR
amendment: _"A single self-hosted, subset display face is admitted for headings
only, loaded `font-display: optional` so it is never render-blocking and never
causes layout shift; all body, UI, and mono text stays on system stacks; the
system serif remains the fallback."_

The face should be **warm, humanist, slightly editorial** — not a thin fashion
serif, not a techy mono-grotesque. It carries "a real person, a real business,
handled with care". If C is rejected, fall back to **A** (design for Georgia at
weight 400) — **not B** (the sans-only route reads generic).

## Scale (keep, with minor tightening)

| Token     | Size                              | Line height | Tracking                       | Use                                                          |
| --------- | --------------------------------- | ----------- | ------------------------------ | ------------------------------------------------------------ |
| `display` | 2.25rem (mobile) → 2.75rem (≥ sm) | 1.1         | -0.02em                        | one per screen — the page question ("What do you need?")     |
| `title`   | 1.5rem                            | 1.15        | -0.02em                        | screen titles, `SectionHeader`                               |
| `heading` | 1.25rem                           | 1.25        | -0.015em                       | card titles (`CardTitle`), sheet titles                      |
| `subhead` | 1.0625rem                         | 1.3         | -0.01em                        | sub-sections                                                 |
| `body`    | 1rem                              | 1.55        | -0.006em                       | paragraphs, `DataRow` values                                 |
| `body-sm` | 0.875rem                          | 1.5         | -0.003em                       | secondary text, helper text, list rows                       |
| `meta`    | 0.75rem                           | 1.4         | +0.01em                        | timestamps, counts                                           |
| `eyebrow` | 0.72rem                           | 1.3         | +0.08em, uppercase, weight 600 | the kicker over a title (keep `.eyebrow`)                    |
| `mono`    | 0.8125rem                         | 1.5         | 0                              | the handover code, tx hash (operator only), `/docs` manifest |

**Weights**: 400 body · 500 buttons, nav, emphasised labels · 600 eyebrow ·
display face at its single weight. **Retire weight 300 for headings** on the
Android path (it's faux-light).

---

# 4. Spacing

Keep the 4px base. Define **6 spacing steps** that components actually use, and a
rule for each:

| Step  | Value | Rule                                                            |
| ----- | ----- | --------------------------------------------------------------- |
| `xs`  | 4px   | icon-to-label gap, inline chip padding-y                        |
| `sm`  | 8px   | related items in a group, `DataRow` internal                    |
| `md`  | 12px  | between fields in a form, list-row padding                      |
| `lg`  | 16px  | card padding (mobile), between cards in a stack                 |
| `xl`  | 24px  | card padding (≥ sm), between distinct sections                  |
| `2xl` | 40px  | between major page regions, above/below the primary action zone |

**Vertical rhythm on a screen**: `title` region → `24px` → primary content →
`40px` → secondary content → `40px` → tertiary. On `/tasks/:id` specifically the
"focus card" gets `24px` clearance above and below so it reads as the anchor.

---

# 5. Radii

Keep the geometric set; assign **roles** so it's not a free-for-all:

| Radius | Value | Applies to                                                                     |
| ------ | ----- | ------------------------------------------------------------------------------ |
| `sm`   | 10px  | inputs, buttons, small chips, inline code                                      |
| `md`   | 16px  | cards, sheets (top corners), the focus card, list items                        |
| `lg`   | 24px  | full-bleed hero panels, the bottom-sheet handle area, large marketing surfaces |
| `full` | 999px | status pills, the "you are here" nav pill, avatars-that-arent (initials)       |

**No radius between 1–9px, none between 25–998px.** (Same discipline the code
already has.)

---

# 6. Elevation

**Still no drop shadows.** Elevation is expressed as:

1. **Border + surface** — the default card: `1px solid border` on `surface`.
2. **Border-strong + warm inner top highlight** — a _focused_ or _raised_ element
   (an open sheet, the focus card, a selected item): `1px solid border-strong` +
   `inset 0 1px 0 rgba(255,255,255,.6)`.
3. **Scrim** — a bottom sheet dims the page behind it with
   `rgba(20,20,19,.32)` (warm ink, not pure black). This is the ONE overlay.

That's the entire elevation model. No `shadow-sm/md/lg/xl`.

---

# 7. Buttons

| Variant     | Look                                                     | Use                                                                           | Notes                                                                                                                            |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `primary`   | ink fill, warm-white text, radius `sm`, weight 500       | the **one primary action per screen/sheet**                                   | **label names the consequence**: "Approve ₦4,500 with Campus Print", "Send quote", "Pay ₦4,500". Never "Continue"/"Submit"/"OK". |
| `secondary` | `surface` fill, `border-strong`, ink text                | the alternative to the primary ("Decline", "Not now", "Edit brief")           |                                                                                                                                  |
| `ghost`     | no fill, no border, `text-muted`, hover `surface-sunken` | tertiary, in-card actions ("Change this price", "Add detail")                 |                                                                                                                                  |
| `critical`  | `critical` wash fill, `critical` text, `critical` border | destructive confirmation only ("Cancel the order", "Decline — don't proceed") | never the default; always after an intermediate confirm step                                                                     |
| `link`      | ink text, underline offset 2px                           | inline navigation ("View", "See what to do")                                  |                                                                                                                                  |

**Sizes**: `md` = `min-h-11` (44px) — the default, especially the primary.
`sm` = `min-h-9` (36px) — inline/secondary. **On mobile the primary is
full-width** and, on the action screens (`/tasks/:id`, the quote sheet, the pay
sheet), **sticky to the bottom** inside a `surface` bar with a hairline top and
safe-area padding.

`pending` state: the label changes to the present-continuous ("Sending…",
"Recording…", "Checking with the network…") + a `Loader2` — never a bare spinner
replacing the label.

---

# 8. Inputs

- `TextField` / `SelectField` — keep the current structure (label above,
  `text-base` 16px, `border` → `border-strong` on focus, error `<p>` associated
  via `aria-describedby`). Warm the focus border to `#1f1e1d` at 40% rather than
  a hard black.
- **Add: `SegmentedControl`** — for binary/ternary choices that today are radio
  card lists or selects: "Fixed price / Price range" (quote form), "Fixed / From
  / Per job" (pricing model). Pill container, `action-wash` selected segment, ink
  text, `full` radius. Faster than a radio list on a phone.
- **Add: `Stepper`** — for `quantity` where a number keypad is friction: `−`
  `[100]` `+` with common presets as chips (50 · 100 · 250 · 500 · 1000).
- **Add: `ChipGroup`** — for optional constrained choices: quote expiry ("Holds
  for: 1 day · 3 days · No limit"), deadline quick-picks ("Today · Tomorrow ·
  This week").
- `CheckboxField` (consent) — **keep exactly as is**. The consent tick is a
  non-negotiable, explicit, unbundled control (`FR-SUP-005`). Make the tap target
  the full row; keep the `size-4` box but pad the label.
- **Textareas** — `resize-none` on mobile, auto-grow to a max of ~5 rows.

---

# 9. Cards & list views

## The card

`surface`, `border`, radius `md`, padding `lg` (mobile) / `xl` (≥ sm). A card has
at most: a title row (`heading` + an optional `StatusPill` or meta), a body, and
**at most one action row**. If a card needs two actions, one is `primary` and one
is `ghost`/`link`.

## The list row (the merchant inbox, the buyer work list, notifications)

A tappable full-width row, `surface`, hairline between rows (not a card each):

- **leading**: a status dot or a small icon (the group/level indicator)
- **primary line**: what it is ("500 flyers", "Customer request", "A quote is
  ready for your decision")
- **secondary line**: one plain sentence of context / a relative timestamp
- **trailing**: an action pill (`primary` tint if `actionRequired`, else a
  chevron)

`min-h` 64px. The whole row is the tap target → the deep link. **No nested
buttons inside a tappable row.**

## Tables

The product has **no real tables** except the `/evidence` "targets vs actual" and
`/operator` metrics. Keep those as simple 3-column tables inside a card, `meta`
headers, `tabular-nums` values, horizontal scroll inside an `overflow-x-auto`
container. **Do not introduce a data grid anywhere.**

---

# 10. Status indicators

| Component                    | Use                                                              | Spec                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `StatusPill`                 | a task/route/payment state on a card or header                   | dot + **plain-language** label (`taskStatusLabel` etc. — never the enum), `full` radius, the status wash, `meta` size, uppercase |
| `Badge` (new, small)         | a count ("3 need you"), a "New" marker                           | `full`, `attention` or `neutral`, `meta`                                                                                         |
| `InlineStatus` (new)         | a status inside running text ("Verified by operator 3 days ago") | icon + text, inherits the surrounding size, the status text colour                                                               |
| `StageList`                  | the agent progress spine                                         | keep exactly — icon + word per stage, `active` spins (reduced-motion off), never a bare spinner                                  |
| `EvidenceStatus` (Proofline) | the two-event fulfilment state                                   | a 2-step mini-tracker: "Ready for pickup" → "Collected", each with a checkmark when done, the disclaimer below                   |

**Rule**: no status is ever colour-only. Every one has an icon (or a dot) **and**
a word.

---

# 11. Decoration / texture

- **Remove** the two `blur-3xl` gradient blobs on the landing page.
- **Remove** the cold radial-gradient page background in `globals.css` (it's a
  blue wash on a warm ground).
- **Replace** with, at most: a very faint (`2–3%`) warm paper grain on the canvas
  (a single tiling SVG, ≤ 2KB, `background-repeat`), OR nothing. The warmth of
  `#faf9f5` + the hairline borders is already enough texture.
- **The B-series illustrations** ([`11` §3.2]) are the only intentional graphics,
  and they appear only at the 8 named moments.

---

# 12. Navigation

## Buyer — a persistent bottom bar (mobile) / left rail (≥ lg)

Three destinations, always visible:

| Item         | Route                                                                                   | Icon                           | Badge             |
| ------------ | --------------------------------------------------------------------------------------- | ------------------------------ | ----------------- |
| **Home**     | `/agent`                                                                                | `MessageCircle` / the app mark | —                 |
| **Activity** | `/activity`                                                                             | `Bell`                         | unread count      |
| **Requests** | `/agent` scrolled to the work list, OR a dedicated `/requests` view of `BuyerWorkPanel` | `Inbox` / `PackageCheck`       | "needs you" count |

- Bottom bar: `surface`, hairline top, safe-area bottom padding, `min-h-14`,
  active item = ink icon + label + a short top indicator; inactive = `text-subtle`.
- On `/tasks/:id` the bottom bar is **replaced by the sticky primary action** for
  that task (the "what now" button). A small "‹ back" affordance returns to the
  list.
- `≥ lg`: the bar becomes a slim left rail; content stays `max-w` centered.

**Retire** the in-page "Activity" pill on `/agent` and the "‹ Home" back-link on
`/activity` — the bar handles it.

## Merchant — a slim top context bar + a two-tab switch

The merchant lives inside `?t=` links. Give them:

- A **top bar**: the business name + a "menu" affordance (Workspace / Requests /
  Settings / Notifications). No bottom bar (the merchant's primary surface is the
  request inbox; a bottom bar competes with the sticky "Send quote" action).
- The request inbox and workspace are **one screen with a segmented switch**:
  "Needs you (n)" | "In progress" — matching the data (`incoming` / `quoted` /
  `handedOff`).

## Operator — keep the 3-tab console

`/operator` with Review queue / Metrics / Evidence is fine. It's a desktop-ish
internal tool; don't force it into a mobile shell. Just apply the design system.

## Public

`Header` keeps the reduced nav (Home → `/agent`, For businesses →
`/supplier/onboard`, Docs). Add `Evidence` back to the footer (it's the honesty
surface and judges look for it). `/operator` stays unlinked (direct URL).

---

# 13. Dialogs, sheets, and the `/tasks/:id` restructure

## The pattern set

| Pattern                                               | When                                                                                                             | Spec                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bottom sheet** (mobile) / **centered panel** (≥ md) | any focused sub-task: send a quote, revise a price, pay, confirm pickup, decline with a reason, report a problem | `surface`, radius `md` top corners, a drag handle, a title row with an `X`, scrollable body, a **sticky primary action** at the bottom with safe-area padding. Scrim `rgba(20,20,19,.32)`. Dismissible by drag-down, `X`, or scrim tap **unless** a write is in flight. |
| **Inline confirm**                                    | a destructive action inside a card (pause a route, cancel an order)                                              | the card's action area swaps to "Are you sure? [Yes, pause] [Keep it live]" — no sheet, no navigation                                                                                                                                                                   |
| **Full-screen flow**                                  | onboarding (quick-start), the agent conversation                                                                 | its own route; the bottom bar hides                                                                                                                                                                                                                                     |
| **Toast** (new, minimal)                              | a background success the user isn't waiting on ("Price saved", "Marked as read")                                 | `surface`, hairline, a checkmark, bottom, auto-dismiss 3s, one line, no action. **Never** for money/decision events — those are notifications + in-place state.                                                                                                         |

**No modal dialogs** in the classic sense (no "OK/Cancel" boxes). Every
consequential choice is either a bottom sheet with a consequence-named button or
an inline confirm.

## `/tasks/:id` — the focus layout (the single most important restructure)

Today: 7–8 stacked panels; the user scrolls to find the current action.

Redesign: **one screen, four zones, top to bottom:**

```
┌─────────────────────────────────────────────┐
│  ZONE 1 — STATUS                             │
│  [status pill]  "Quote ready — your decision"│
│  500 flyers · Campus Print · created 2h ago  │
├─────────────────────────────────────────────┤
│  ZONE 2 — WHAT NOW  (the focus card)         │
│  The ONE thing to do, rendered in full.      │
│  • RECOMMENDED → the offer + Approve/Decline  │
│  • HANDOFF_READY → "Send your order" + the    │
│    message + [Copy] [Open WhatsApp] + [Pay]   │
│  • handed off → "Confirm you collected it"    │
│  • exception → what happened + [what to do]   │
│  Primary action is sticky at the bottom.      │
├─────────────────────────────────────────────┤
│  ZONE 3 — DETAIL  (quiet, collapsible)        │
│  ▸ Your brief                                 │
│  ▸ The quote (price, turnaround, validity)    │
│  ▸ How Intra reads this quote                 │
│  ▸ Payment  (only if relevant)               │
├─────────────────────────────────────────────┤
│  ZONE 4 — HISTORY  (collapsed by default)     │
│  ▸ Activity  (the timeline, plain labels)     │
│  Feedback prompt appears here once terminal.  │
└─────────────────────────────────────────────┘
```

- **Zone 2 is driven by a `nextAction(view)` function** (the product already has
  the state; `UX_ARCHITECTURE.md` §3.5 proposes exactly this helper). It returns
  `{ actor, title, primaryAction, secondaryAction, context }`. The UI renders
  that — it does not infer from status enums in JSX.
- Secondary panels that used to be top-level (`PayPanel`, `HandoverCodePanel`,
  `PriceChangePanel`, `OrderProblemPanel`, the x402 `PaymentReceipt`) become:
  - **`PayPanel`** → a step _inside_ Zone 2 when `HANDOFF_READY` and payment is
    offered ("Pay ₦4,500" opens the pay sheet). Not a separate stacked card.
  - **`HandoverCodePanel`** → part of Zone 2's "Send your order" content, framed
    as "When you collect: show this code" (see §16 / handover).
  - **`PriceChangePanel`** → _becomes_ Zone 2 when a change is pending (it
    outranks everything).
  - **`OrderProblemPanel`** → a `ghost` "Something wrong?" link at the bottom of
    Zone 2 that opens a sheet.
  - **x402 `PaymentReceipt`** → collapsed inside Zone 3 "Payment", and **only the
    honest one-liner** ("No agent query fee — this came through the web") on the
    happy path; the chain fields never render on a buyer surface.

---

# 14. Motion

**Principles** (motion communicates, never entertains, never delays):

| Purpose                                                              | Motion                                                                                                               | Spec                                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Transition** (screen → screen)                                     | a quick cross-fade + 8px slide in the direction of travel                                                            | 180ms, `ease-out`; the primary action stays put where possible so the thumb doesn't chase it |
| **Reveal** (a sheet opens)                                           | slide up from the bottom edge + scrim fade                                                                           | 220ms, `cubic-bezier(.2,.8,.2,1)`; drag-to-dismiss tracks the finger 1:1                     |
| **Disclosure** (a `<details>` / Zone 3 section expands)              | height auto + content fade                                                                                           | 160ms; no bounce                                                                             |
| **Progress** (agent stage advances, payment moves to "confirming")   | the stage row's icon swaps + a 1px underline sweeps left→right under the active row                                  | 400ms; the `active` spinner respects reduced-motion                                          |
| **Attention** (a notification arrives while the app is open)         | the bottom-bar `Bell` badge scales 1→1.15→1 once + the count updates                                                 | 250ms; no sound, no full-screen takeover                                                     |
| **Confirmation** (a decision is recorded, a quote is sent)           | the primary button's label cross-fades to the done state + a checkmark draws in (stroke length 0→1)                  | 300ms; the screen then transitions to the next zone/state                                    |
| **Completion** (payment verified, handover attested, order complete) | the relevant B-series illustration fades + rises 6px into place; a single, calm checkmark; **no confetti, no burst** | 350ms                                                                                        |
| **Error** (a write fails)                                            | the affected card's border pulses `critical` once (no shake) + the error text fades in above the action              | 200ms                                                                                        |
| **Continuity** (returning from a push deep link)                     | the target zone gets a one-time 12px rise-in so the eye lands on "what changed"                                      | 300ms; `?ref=push` already exists to trigger it                                              |

**Hard rules:**

- Every animation ≤ 400ms. Nothing blocks input.
- `@media (prefers-reduced-motion: reduce)` → all of the above collapse to an
  instant opacity change (the existing `globals.css` guard, extended).
- No parallax, no scroll-jacking, no auto-playing anything, no looping
  animations, no "AI thinking" shimmer beyond the existing stage spinner.
- The `.page-enter` staggered rise-in stays but is **capped at the first 3
  children** and only on marketing/onboarding routes — not on `/tasks/:id` or
  the inbox (where it delays the user seeing "what now").

---

# 15. Mobile-first patterns (primary environment)

Target widths: **360 · 375 · 390 · 430**, then tablet, then desktop. Design at
360 first.

| Pattern                   | Spec                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bottom navigation**     | 3 items, `min-h-14`, safe-area padding, `surface` + hairline top. Hidden on full-screen flows and replaced by the sticky task action on `/tasks/:id`.                                                                                                                            |
| **Sticky primary action** | on every action screen: a `surface` bar pinned to the bottom, hairline top, safe-area padding, the full-width `primary` button. The rest of the screen scrolls under it.                                                                                                         |
| **Bottom sheets**         | the default for any focused sub-task (quote, pay, confirm, decline reason). Max height 90vh, scrollable body, sticky action, drag handle.                                                                                                                                        |
| **Compact forms**         | one field per row on mobile; `SegmentedControl` / `Stepper` / `ChipGroup` instead of selects and number pads where the choice set is small and known.                                                                                                                            |
| **One-handed reach**      | primary actions in the bottom third; destructive actions require a second tap (inline confirm) so a mis-tap in the thumb zone is recoverable.                                                                                                                                    |
| **Touch targets**         | ≥ 44×44 for anything tappable; list rows ≥ 64px; the consent checkbox row is fully tappable.                                                                                                                                                                                     |
| **Keyboard**              | `inputMode` on every input (`decimal` for money, `numeric` for quantity, `tel` for phone); the sticky action stays visible above the keyboard (it's pinned, not in flow).                                                                                                        |
| **Scrolling**             | the page body never scrolls horizontally; wide content (`<pre>`, the OG manifest, tables) scrolls inside its own container.                                                                                                                                                      |
| **Status presentation**   | the current status is always in the first viewport — Zone 1 on `/tasks/:id`, the pill on each list row. The user never scrolls to learn where things stand.                                                                                                                      |
| **Notification return**   | a push deep-links to the exact zone; `?ref=push` triggers a one-time rise-in on "what changed"; the bottom-bar badge reflects the new state immediately.                                                                                                                         |
| **PWA install**           | the contextual prompt (only when there's async work) becomes a slim `surface` bar above the bottom nav — "Add Intra to your home screen so we can tell you when a business replies" + [Add] [Not now]. iOS Safari gets the Share-sheet hint. Never a modal, never on first load. |
| **Offline**               | the `OfflineBanner` becomes a thin `neutral` strip under the top bar; `/offline` gets the B5 illustration + "Your work is safe on the server". `/api/*` failures show the calm network-error state, never a fake success.                                                        |

---

# 16. State-by-state visual spec

## Empty states

`EmptyState` — keep the structure (icon/illustration in a soft container, a
plain title, a one-sentence description, an optional single action). Use a
**B-series illustration** where one is specified (B4, B6, B7); a lucide icon in a
`neutral` circle otherwise. Copy is already good ("No active requests yet — Tell
me what you need above…") — keep it, tone it warm.

## Loading states

- **First load of a screen** → skeletons that match the final layout (`LoadingPanel`
  → skeleton Zone 1 + skeleton focus card). Never a centered spinner.
- **An action in progress** → the button's `pending` label + `Loader2`.
- **Background polling** (agent run, payment confirming) → the `StageList` /
  phase copy updates in place; a subtle "updating on its own" line; **no
  blocking overlay**.

## Error states

Every error follows the **exception card** shape (the product already generates
the content via `describeTaskException` / `outcomeCopy` / `requestErrorCopy`):

```
┌──────────────────────────────────────────┐
│  [icon]  What happened                    │   ← headline, plain, blameless
│  One or two sentences.                     │   ← what actually happened
│                                            │
│  What to do:  [primary action]             │   ← the recovery, as a button
│  What happens next: …                       │   ← quiet
│  Your money: Nothing was charged through   │   ← ALWAYS present, `neutral` tone
│  Intra. …                                   │
└──────────────────────────────────────────┘
```

Tone: `attention` for "you can retry", `neutral` for "this is closed, here's the
state", `critical` only for a genuine system failure. **Never** leak a code
(`looksTechnical()` already filters — keep it).

## Success states

- **A step completed** (decision recorded, quote sent, marked ready) → the
  button's done-state + a checkmark draw-in + the screen advances to the next
  zone. No toast, no illustration — the state change IS the feedback.
- **A milestone completed** (payment verified, handover attested, order complete)
  → the relevant **B-series illustration** (B2, B3), a calm checkmark, one
  sentence, and the "what's next" (or "nothing else is needed"). No confetti.
- **Feedback submitted** → the existing `Callout tone="success"` "Thanks — it
  helps us keep this printer's route accurate." Keep.

## The "unavailable / honest" state — the most important one

Whenever the product is telling the user what is **not** happening — no receipt
exists, payment verification is unavailable, this is demo data, operational
evidence is not proof, the route is stale — it uses the **`neutral` tone**: grey
text on warm sand, a `CircleSlash` or `Info` icon, quiet and matter-of-fact.
**It must never look like an error.** This is the visual embodiment of "Intra
never fabricates" — calm honesty, not a warning.

---

# 17. Accessibility (preserve and strengthen)

- Keep: real `<label>`s, `aria-invalid` + `aria-describedby`, `:focus-visible`
  2px outline, `role="alert"`/`status`, status = icon + word, reduced-motion
  guards, 16px inputs.
- **Add**: focus is moved to Zone 2's heading on `/tasks/:id` when the state
  changes to one that needs the user (the agent console already does this for
  `AWAITING_APPROVAL` — extend the pattern).
- **Add**: the bottom sheet is a focus trap while open; `Esc` / drag-down / scrim
  closes it; focus returns to the trigger.
- **Add**: `aria-live="polite"` on Zone 1's status line so a screen-reader user
  hears "Quote ready — your decision" when it changes after a poll.
- Contrast: verify every status text/wash pair against WCAG AA (the muted status
  colours are close — `warning` `#7a5300` on `#f6ecd6` passes; re-check after any
  wash warming).
- Target: **WCAG 2.2 AA** across the buyer and merchant flows.

---

# 18. Token file shape (for implementation)

The redesign should ship a single `tokens.css` with `:root` custom properties
grouped by **role** (not by raw value), consumed through the Tailwind mapping —
exactly the current architecture, just with the roles above. No CSS-in-JS, no
runtime theming, one light theme.

```
:root {
  /* surfaces */    --canvas --surface --surface-sunken
  /* ink/text */    --text --text-muted --text-subtle --text-on-ink
  /* borders */     --border --border-strong
  /* action */      --action --action-hover --action-wash --action-ring
  /* status */      --positive/-wash --attention/-wash --critical/-wash
                    --info/-wash --neutral/-wash
  /* type */        --font-display --font-sans --font-mono  (+ the scale)
  /* space */       --space-xs … --space-2xl
  /* radius */      --radius-sm --radius-md --radius-lg --radius-full
  /* motion */      --dur-fast(180) --dur-base(220) --dur-slow(350)
                    --ease-out --ease-emphasis
  /* layout */      --container-max(72rem) --bottom-bar-h(56px) --safe-b
}
```
