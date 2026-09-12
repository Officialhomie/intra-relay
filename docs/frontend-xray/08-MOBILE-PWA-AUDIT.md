# 08 — Mobile / PWA Audit

> The application audited as a mobile-first product. Reverse-engineered from the
> Tailwind classes, the manifest, the service worker, the PWA components and the
> viewport metadata. Nothing redesigned.
>
> **Hard requirement**: works at a **360px viewport**, non-crypto language,
> `<label>`s, keyboard nav, visible focus, programmatically-associated form
> errors (`NFR-UX-001`, `NFR-A11Y-001`, `CLAUDE.md` §5).

---

# 1. What works (mobile-first, verified)

## Layout system

- **One breakpoint.** The entire app uses Tailwind `sm:` (640px) as its only
  responsive prefix; `md:`/`lg:` appear on the landing page (`/`) alone. Base
  classes ARE the mobile layout; `sm:` adds columns and rows.
  (`grep` across `src`: `md:`/`lg:` only in `src/app/page.tsx`.)
- **Container**: `MainContainer` — `mx-auto w-full max-w-[var(--container-max)]`
  (72rem) with `px-4 sm:px-6` gutters and `py-10 sm:py-14`. At 360px the content
  is 360 − 32 = **328px wide**.
- **Page widths**: buyer surfaces cap at `max-w-xl` (`/request`) / `max-w-2xl`
  (`/agent`, `/activity`, `/supplier/onboard`) / `max-w-md`
  (`/supplier/onboard/full`) / `max-w-3xl` (`/docs`) — all comfortably under
  328px's usable width; the supplier/operator/evidence pages use the full
  container.
- **Stacking**: `DataRow` is `flex-col gap-1 sm:flex-row sm:items-baseline
sm:justify-between`; paired form fields are `grid-cols-1 sm:grid-cols-2`;
  button groups are `flex-col sm:flex-row` (or `flex-col-reverse` in
  `OnboardingForm` so the primary action is on top on mobile).
- **`Header`**: `flex-wrap`, `min-h-16`, `sticky top-0 z-30 backdrop-blur-md`.
  The logo + 3-item nav + CTA wrap onto 2 lines below ~420px; the "Join as a
  business" CTA is `hidden … sm:inline-flex` so it disappears on mobile
  (a redundancy — `/supplier/onboard` is still in the nav).

## Touch targets

- `Button` sizes: `sm` = `min-h-9` (36px), `md` = `min-h-11` (44px). Most CTAs
  are `md`; secondary/inline actions are `sm`.
- Tappable links/rows: `WorkRow` and `NotificationRow` are full-card `Link`s with
  `p-3.5` (≥ 44px effective height); the printer radio labels in `RequestForm`
  are `p-4` cards; the pricing-model radio cards are `p-4`.
- The `<input type="checkbox">` in the operator checklist and consent fields is
  `size-4` (16px) — **below the 44px recommendation**, though the `<label>` wraps
  the full row so the tap area is larger.
- The conversation send button is `w-auto shrink-0 px-4` on a `min-h-11` row.

## Forms on mobile

- All text inputs are `text-base` (16px) — **prevents iOS auto-zoom on focus**
  (`TextField.tsx:45`, `SelectField.tsx:51`).
- `inputMode` hints: `numeric` (copies), `decimal` (prices, amounts), `tel`
  (WhatsApp number), `email` (email channel). `autoCapitalize="characters"` on
  the pickup / handover code fields; `autoCapitalize="none" autoCorrect="off"
spellCheck={false}` on the payout address.
- Textareas: `rows={2}`/`{3}`, `maxLength` capped, `resize-none` on the
  conversation input.
- The conversation input submits on **Enter (no Shift)**; `IntentInput` submits
  on **⌘/Ctrl+Enter** (a desktop convention — on mobile the "Ask the agent"
  button is the only path).
- `datetime-local` / `date` inputs in `QuoteResponseForm` (`Quote valid until`)
  and `UnderstandingCard` (`Needed by`) fall back to the OS date picker on
  mobile — functional but fiddly, and `QuoteResponseForm`'s is `datetime-local`
  (date + time) which is a 2-step picker on most phones ([`02` P2]).

## Modals / drawers / dialogs

- **There are no modal dialogs, drawers, or `<dialog>` elements anywhere.**
  Every "modal-like" interaction is either:
  - an inline panel that appears in the page flow (`DecisionPanel`,
    `PriceChangePanel`, `PayPanel`, `ApprovalPanel`), or
  - a native `<details>`/`<summary>` disclosure (`OrderProblemPanel`,
    `QuoteResponseForm` "add more detail", `RecommendationPanel` "Details",
    `ActivityFeed`, `DraftRoutePreview` raw payload, `EvidenceView` methodology,
    `PayPanel` "Transaction details"), or
  - a mode switch within a component (`ChangePriceForm`/`EditPublishedPriceForm`
    `open` state; `QuoteResponseForm` quote/decline toggle; `DecisionPanel`
    idle/declining).
- The confirm step in `PauseRouteButton` and the wallet-approval overlay are the
  closest thing to a dialog — the wallet overlay is the wallet's own UI.
- **Implication for mobile**: no focus-trap concerns, no scroll-lock, no backdrop
  — but also no way to dismiss a mid-flow panel except by completing or
  navigating away. A user mid-`DecisionPanel` on a small screen scrolls past a
  lot of quote detail to reach the buttons.

## Content that must scroll horizontally (and does, correctly)

- The pre-filled WhatsApp message `<pre>` in `HandoffCard`:
  `overflow-x-auto whitespace-pre-wrap` — wraps, doesn't force page scroll.
- The `/docs` manifest `<pre>`: `overflow-x-auto`.
- `DraftRoutePreview` raw route JSON `<pre>`: `overflow-x-auto`.
- `EvidenceView` targets `<table>`: sits in a card; wide but the numbers are
  short.
- `EvidencePanel` `TraceView` `Ref` values: `break-all font-mono` (wrap, don't
  scroll).
- **No component sets a fixed width that would break the 328px body.** The body
  itself never scrolls horizontally.

## Responsive verification in the codebase

- **No visual-regression / viewport tests.** Tests are RTL + jsdom
  (`vitest.config.ts` — `environment: "jsdom"`), which does not compute layout.
  `360px` behaviour is asserted only by the class patterns and by
  `docs/DEVELOPMENT_WORKFLOW.md`'s "check 360px" gate (a manual step in the DoD).
- The `Header.test.tsx` was updated for the reduced nav (ADR-022) but tests
  presence, not layout.

---

# 2. What changes between desktop and mobile

| Element                                                  | Desktop (≥ 640px)                                             | Mobile (< 640px)                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Header` CTA "Join as a business"                        | shown                                                         | **hidden**                                                            |
| `Header` nav                                             | one row, `gap-x-5`                                            | wraps to 2 rows, `gap-x-3`                                            |
| `SectionHeader`                                          | title + `actions` on one baseline-aligned row                 | wraps; actions drop below                                             |
| Paired form fields (size+copies, city+area, amount+unit) | 2 columns                                                     | 1 column stacked                                                      |
| Button groups                                            | horizontal                                                    | vertical (`flex-col`; `OnboardingForm` reverses so primary is on top) |
| `Button` width                                           | `w-auto`                                                      | `w-full`                                                              |
| `DataRow`                                                | label left / value right                                      | label above / value below                                             |
| `page.tsx` hero                                          | `lg:grid-cols-[1.2fr_0.8fr]` (copy + quote card side by side) | stacked                                                               |
| `page.tsx` how-it-works                                  | `md:grid-cols-3`                                              | 1 column                                                              |
| `OnboardingForm` step-helper text                        | `sm:block` visible                                            | hidden (only the step label shows)                                    |
| Stat grids (`/supplier/:slug`)                           | `sm:grid-cols-3`                                              | `grid-cols-2`                                                         |
| `EvidenceView` public/private panels                     | `sm:grid-cols-2`                                              | stacked                                                               |

**Nothing is hidden on desktop and shown on mobile.** No mobile-only navigation
(no bottom tab bar, no hamburger menu — the nav simply wraps).

---

# 3. What is prioritised on mobile

The base (mobile) layout is the design; there is no "mobile view" that strips
features. Priority is expressed by **source order** (everything stacks top to
bottom):

- `/agent`: the "What do you need?" heading and conversation input are first;
  `BuyerWorkPanel` is below a border.
- `/tasks/:id`: the status pill and exception (if any) are at the top; the
  action panel for the current state (`DecisionPanel` / `PayPanel` /
  `HandoffCard`) is in the middle; the activity timeline and feedback are last.
- `/supplier/:slug`: "What needs you" (`ActionCentre`) → the "waiting" banner →
  "What's happening" → the record → services — **action-first** (ADR / M7 §4,
  §21).
- `BuyerWorkPanel`: `GROUP_ORDER` puts ATTENTION first, COMPLETED last.

---

# 4. What would be difficult on a phone

| Task                                                       | Why it's hard on mobile                                                                                                                                                                             | Evidence                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`QuoteResponseForm` on a shop floor, one-handed**        | 10 fields including a `datetime-local` 2-step picker, a fixed/range toggle, and a `<details>` with 4 more fields incl. a confidence select                                                          | `QuoteResponseForm.tsx`; `AGENTIC_ARCHITECTURE.md` §5.3 names this the highest-friction interaction |
| **`OnboardingForm` full wizard**                           | 15 fields over 4 steps, `trigger()` validation gating each "Continue", a `<details>`-free but dense step 4 with a conditional address field — and it **produces nothing** at the end                | `OnboardingForm.tsx`                                                                                |
| **Reading the pre-filled WhatsApp message before sending** | it's in a `<pre>` with `overflow-x-auto`; the raw brief keys (`size:`, `full-colour`) are visible; on a small screen the user copies without fully reading                                          | `buildOrderMessage`, `HandoffCard`                                                                  |
| **The `EvidencePanel` `TraceView`** (operator/judge)       | 7 stacked cards of mono `Ref` strings, schema UIDs, explorer links — a lot of horizontal-feeling content even though it wraps                                                                       | `EvidencePanel.tsx`                                                                                 |
| **Distinguishing the two "code" boxes**                    | the buyer handover code (`HandoverCodePanel`) and the merchant pickup code (`MerchantFulfilmentPanel`) look identical (large mono, `tracking-[0.2em]`, bordered box) and appear on related surfaces | [`00` §20 #8]                                                                                       |
| **The agent-console dual input**                           | when a run settles, `IntentInput` "Ask for something else" plus the conversation input both appear — two textareas on a 328px screen                                                                | [`00` §20 #6]                                                                                       |
| **Operator sign-in on a phone**                            | a `type="password"` field for a `label:secret` operator key, held in `sessionStorage` (lost on tab close) — an operator on a phone re-enters the key often                                          | `OperatorConsole.tsx`                                                                               |
| **Entering a payout address**                              | 42 hex characters into a `TextField` — `autoCapitalize="none"` etc. help, but no paste-assist, no QR, no checksum feedback until the server rejects it (full form)                                  | `OnboardingForm.tsx:341`                                                                            |

---

# 5. PWA behaviour

## Manifest (`src/app/manifest.ts`)

- `name`: "Intra — The trusted business layer for AI-agent commerce"
- `short_name`: "Intra"
- `description`: "Tell Intra what you need in plain words. It finds a real
  business, gets a real price, and leaves the decision and the payment with you."
- **`start_url`: `/agent`** — an installed launch lands on the buyer workspace,
  not `/`.
- `scope`: `/`
- `display`: `standalone`
- `orientation`: `portrait`
- `background_color`: `#fffefc`, `theme_color`: `#0f3e17` — **stale green**
  (ADR-022 moved the action colour to ink `#1f1e1d`; the manifest was not
  updated — [`00` §20 #4]).
- `categories`: `["business", "productivity", "shopping"]`
- `icons`: 192 (`any`), 512 (`any`), 512 (`maskable`) — from
  `public/icons/*.png`, generated from one SVG by `scripts/generate-icons.mjs`
  (committed, so the build needs no image tooling).

## Viewport / metadata (`src/app/layout.tsx`)

- `viewport`: `themeColor: "#0f3e17"` (**stale green**), `width: "device-width"`,
  `initialScale: 1`, `viewportFit: "cover"` (respects the notch / safe area).
- `appleWebApp`: `capable: true`, `title: "Intra"`, `statusBarStyle: "default"`;
  plus the legacy `apple-mobile-web-app-capable: "yes"`.
- `icons`: 192 + `apple-touch-icon` 180.
- `openGraph`: `locale: "en_NG"`.
- `robots`: `index: true`.

## Service worker (`public/sw.js`, hand-written, ADR-020)

Version `v1`. Caches: `intra-shell-v1` (`/offline`, `/icons/icon-192.png`,
`/manifest.webmanifest`), `intra-assets-v1`.

| Request                                     | Strategy                                 | Offline behaviour                                                                                            |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/*`                                    | **network-only, never cached**           | a clean `503 { success:false, error:{ code:"OFFLINE", message:"You're offline." } }` — never a false success |
| `/_next/static/*`, `/icons/*`               | cache-first (content-hashed / immutable) | served from cache                                                                                            |
| navigations (`request.mode === "navigate"`) | network-first                            | the cached `/offline` page                                                                                   |
| other GET, same-origin                      | network-first, fall back to cache        | cache or `Response.error()`                                                                                  |
| cross-origin                                | not intercepted                          | —                                                                                                            |
| non-GET                                     | not intercepted                          | —                                                                                                            |

**Nothing about prices, quotes, approval, payment, fulfilment, cancellation,
handover or permissions is ever served from cache** (the SW header comment, and
enforced by `/api/*` being network-only).

**Update policy**: a new worker `install`s and **waits** (deliberately no
`skipWaiting()`). `ServiceWorker.tsx` detects the waiting worker and shows a
dismissible banner "A new version of Intra is ready. Update now" → the page posts
`{type:"SKIP_WAITING"}` → `controllerchange` → **one** reload. No forced refresh
mid-transaction.

## Install prompt (`InstallPrompt`)

- **Never on first load.** Rendered by `BuyerWorkPanel` only when `hasAsyncWork`
  (any task not COMPLETED) — "installation is about continuity" (ADR-020 §4).
- Captures `beforeinstallprompt`, offers "Add to home screen" + "Not now".
- iOS Safari (no install event): a one-line hint "Tap [Share] then 'Add to Home
  Screen'."
- Dismissal → `localStorage` `intra.installPromptDismissed` = `"1"` — permanent.
- Pilot pings: `pwa_install_prompted` / `pwa_install_accepted` /
  `pwa_install_dismissed`; `appinstalled` → `pwa_install_accepted`.
- `detectPlatform()` reads `matchMedia("(display-mode: standalone)")` (or iOS
  `navigator.standalone`) → `"installed_pwa"` vs `"web"`; every `app_opened`
  analytics event carries it.

## Push permission (`PushPrompt`, `usePushSetup`)

- **Never on first load.** `PushPrompt` needs a `reason` (a workflow just became
  async) and only renders while `permission === "default" && !subscribed &&
!dismissed && available`.
- `available` = the server has VAPID configured (`GET /api/push/config`
  `configured: true` + a `vapidPublicKey`) **and** the browser supports
  `Notification` + `serviceWorker` + `PushManager`.
- 4 states surfaced honestly: `unsupported` ("This browser can't send
  notifications when the app is closed. You'll still see everything in Activity
  when you come back."), `default` (the prompt), `granted` (the toggle is on),
  `denied` ("You've blocked notifications for Intra in your browser. To turn them
  back on, allow notifications for this site in your browser settings.").
- If the deployment has no VAPID: "Off-tab notifications aren't set up on this
  deployment yet. Activity always shows what needs you."
- Dismissal → `localStorage` `intra.pushPromptDismissed` — permanent. A denied
  browser is never re-prompted (ADR-020 §5).
- Subscription is bound to the **server-resolved** recipient (session / manage
  token) — a client-sent id is never trusted (`push/subscribe/route.ts`).
- Preferences: 2 switches — `pushEnabled` (master), `pushInformational` (also
  push the quiet updates). Turning push off is one tap, never blocked.

## Offline / cache behaviour

- `OfflineBanner` (global, `layout.tsx`) shows on `navigator.onLine === false`
  via `online`/`offline` events.
- An `/api/*` call while offline → `apiRequest` catches the `503 OFFLINE` (or the
  raw fetch failure → `ApiError(0, "NETWORK")`) → the calling component shows its
  network-error state ("Could not load…", "Try again", "Connection lost. …the
  agent keeps working in the background").
- A navigation while offline → the cached `/offline` page: "You're offline. Intra
  needs a connection to show your latest requests and prices. Your work is safe
  on the server — reconnect and open the page again." + "Try again" → `/agent`.
- `/offline` is `static` and deliberately dependency-free so it renders from the
  shell cache.

## Return-from-notification behaviour

- `sw.js` `notificationclick`: `event.notification.close()`; take `data.url`
  (default `/activity`); append `?ref=push`; then:
  1. `matchAll({ type: "window", includeUncontrolled: true })` — for a same-origin
     client, `client.focus()` then `client.navigate(href)` (or
     `postMessage({type:"NAVIGATE", href})` if `navigate` is unavailable).
  2. otherwise `clients.openWindow(href)`.
- `ServiceWorker.tsx` listens for the `NAVIGATE` message → `router.push(href)`.
- `ResumeSignal` (on `/tasks/:id` and `/supplier/:slug/requests`) sees `?ref=push`
  → fires `pilotPing("workflow_resumed")` + `analytics.track("workflow_resumed",
{ notification_channel: "push" })` **once per load**.

## Deep links / resumed workflows

- Every notification carries a `deeplink` (a relative in-app path): buyer →
  `/tasks/:id`; business → `/supplier/:slug/requests?t=<manageToken>&task=:id`.
- The business deep link **includes the manage token in the URL** — necessary
  (the token is the auth) but it means a shared/forwarded push URL grants access.
- A stale deep link (the request has moved on) is handled: `/supplier/:slug/requests`
  computes a `staleNote` `Callout` ("That request now has your price on it — see
  'Prices you have sent' below." etc.) and rings the target card (`ring-2
ring-primary`) if it's still in `incoming`.
- `/tasks/:id` is fully resumable from server state — a person who missed every
  notification still finds the task in `BuyerWorkPanel` with the right bucket and
  action pill (`listBuyerWork`).

---

# 6. Interruptions a user can experience

| Interruption                                        | Effect                                                                                                                                | Recoverable?                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Close the `/agent` tab mid-conversation             | the thread (client state) is lost; a started run continues server-side but is only re-fetchable if the client still holds the `runId` | **Partially** — if a quote was requested, the `tasks`/`quotes` rows persist and show in `BuyerWorkPanel`; the run's ranked-offers/trace are gone |
| Agent run store TTL (30 min) or server restart      | `GET /api/agent/run/:id` → `404`                                                                                                      | the request text is preserved client-side; "Start again"                                                                                         |
| Close the tab during a MiniPay `CONFIRMING` payment | the tx is real and on-chain; verification runs server-side                                                                            | **Yes** — "You can close this and come back — the status is saved"; a notification + push on confirm                                             |
| Switch phone → laptop mid-task                      | new `localStorage` → the task is unreachable                                                                                          | **NO** — "This request belongs to another device" dead end ([`00` §20 #1])                                                                       |
| Private / incognito window                          | `localStorage` empty → a new session; existing tasks unreachable                                                                      | **NO** — same dead end; `SESSION_REQUIRED` copy if storage is fully blocked                                                                      |
| Clear site data                                     | same as above                                                                                                                         | **NO**                                                                                                                                           |
| Operator closes the tab                             | `sessionStorage` cleared → re-enter the key                                                                                           | Yes — re-sign-in                                                                                                                                 |
| Business loses the `?t=` link                       | no re-issue flow                                                                                                                      | **NO** — "Ask your Intra operator" ([`00` §21])                                                                                                  |
| Offline mid-action                                  | the action fails with a clear network-error state                                                                                     | Yes — retry when back online; writes are idempotent                                                                                              |
| A new SW version during a transaction               | the update banner appears; the user can ignore it                                                                                     | Yes — no forced reload                                                                                                                           |
| Wallet app switch (MiniPay → back to Intra)         | `useOrderPayment` resumes from server truth on mount; polls anything in flight                                                        | Yes                                                                                                                                              |

---

# 7. What requires restructuring for a better mobile experience

_(Documenting the gaps — not proposing solutions.)_

1. **`QuoteResponseForm`** — the single highest-friction mobile surface: 10
   fields, a `datetime-local`, a fixed/range toggle, a confidence select. The
   target user quotes from a phone, mid-job, in a noisy shop.
2. **`OnboardingForm` (full)** — a 4-step, 15-field wizard on `max-w-md` that
   ends in a dead end.
3. **Mid-flow panels have no dismiss.** `DecisionPanel`, `PayPanel`,
   `PriceChangePanel`, `ApprovalPanel` appear in the page flow with no close
   affordance; on a small screen the user scrolls a lot of context to reach the
   action.
4. **No bottom navigation.** The 3 buyer surfaces (`/agent`, `/activity`,
   `/tasks/:id`) are linked only by in-page pills / back-links; there is no
   persistent way to move between "home", "activity", and "my current task".
5. **The two code boxes** need visual differentiation.
6. **The agent-console dual input** on `/agent`.
7. **Operator sign-in friction** on a phone (`sessionStorage` + a `label:secret`
   key).
8. **Payout-address entry** — no QR scan, no paste helper, no inline checksum.
9. **Stale theme colour** in the manifest / viewport / OG image — a minor visual
   inconsistency the moment you compare the OS chrome to the app.

---

# 8. Accessibility notes (mobile-relevant)

- Every form field is a real `<label htmlFor>` (`TextField`, `SelectField`,
  `CheckboxField`) with `aria-invalid` + `aria-describedby` → the error `<p>`.
- Focus: `:focus-visible { outline: 2px solid var(--color-focus); offset: 2px }`
  globally; `Button` adds a `ring-2 ring-primary ring-offset-2`.
- Live regions: `ConversationView` message list (`aria-live="polite"`);
  `AgentConsole` a single `sr-only role="status"` line; `LoadingPanel`
  (`role="status" aria-live="polite"`); `OfflineBanner` (`role="status"`);
  errors use `role="alert"`.
- `StatusPill` and `StageList` carry a text label + an `sr-only` status word —
  never colour alone (`NFR-A11Y-001`).
- `motion-reduce:` / `@media (prefers-reduced-motion: reduce)` guards
  `.page-enter`, `.interactive-card`, the `Button` active-scale, the `Loader2`
  spin, the `Skeleton` pulse, and the `IN_PROGRESS` `WorkRow` icon spin.
- The tab strip in `OperatorConsole` uses `role="tablist"` / `role="tab"` /
  `aria-selected`.
- **Gap**: the `<input type="checkbox">` elements are `size-4` (16px) — below the
  44px touch target, mitigated only by the wrapping `<label>`.
- **Gap**: `<details>`/`<summary>` disclosures are keyboard/screen-reader
  friendly natively, but there is no `aria-expanded` state announcement beyond
  the browser default, and 8 components rely on them for meaningful content.
