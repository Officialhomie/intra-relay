# 04 — Screen Specification

> Screen-by-screen spec of the application as built. Every route, and every
> modal-driven / conditional major state, is treated as a screen. 27 fields per
> screen. Nothing redesigned.
>
> "Screen" here includes conditional panels inside `/tasks/:id` and `/agent`,
> because `task.status` / `run.status` swap the visible surface without a route
> change.

---

## Field key

1 name · 2 route · 3 role · 4 purpose · 5 user goal · 6 entry conditions ·
7 exit conditions · 8 primary CTA · 9 secondary actions · 10 information
hierarchy · 11 components used · 12 data displayed · 13 data entered · 14 system
state represented · 15 loading state · 16 empty state · 17 error state · 18
success state · 19 notifications · 20 responsive behavior · 21 mobile behavior ·
22 PWA behavior · 23 technical complexity visible · 24 complexity hidden · 25
dependencies on other screens · 26 workflow states that lead here · 27 workflow
states that follow.

---

# S-01 — Landing

1 **Landing** · 2 `/` · 3 public · 4 explain the product + route to a buyer or
business start · 5 "understand what this is; start" · 6 any visit · 7 click a CTA
· 8 **"I need something made"** → `/agent` · 9 "I run a business" → `/supplier/onboard`;
"Set up my business" → `/supplier/onboard`; logo/nav · 10 hero headline → subcopy
→ 2 CTAs → a "request, made simple" quote card → "How it works" (3 steps) →
"Helpful technology. Human decisions." (3 trust cards) → a "For business owners"
panel · 11 `Header`, `Footer`, `lucide-react` icons, local `Trust` component · 12
static marketing copy; `"I need 100 flyers for Friday. What will it cost?"`
example; trust points ("A real person responds", "You send the order when you
are ready") · 13 none · 14 none · 15 none (static) · 16 n/a · 17 `error.tsx` on a
render fault · 18 n/a · 19 none · 20 `sm:` two-column hero, `md:grid-cols-3` steps
· 21 single column; `.page-enter` staggered rise-in (reduced-motion guarded) · 22
normal page · 23 none · 24 everything · 25 → S-02, S-15 · 26 first visit · 27 the
chosen entry.

---

# S-02 — Buyer home / workspace

1 **Buyer home** · 2 `/agent` · 3 buyer (opaque session) · 4 the primary buyer
entry: describe a need, and see existing work · 5 "get a price" / "check my
requests" · 6 any visit; PWA `start_url` · 7 start a conversation, or open a task
· 8 the conversation input (↑ / Enter) · 9 "Activity" pill → `/activity`; "Start
a new request"; open a `WorkRow` · 10 "Your workspace" eyebrow → "What do you
need?" `<h1>` → subcopy → `ConversationView` (demo banner, thread, chip strip,
input) → a border → an "Activity" link → `BuyerWorkPanel` (grouped requests) · 11
`ConversationView` (+ embedded `AgentConsole`), `BuyerWorkPanel` (+ `PushPrompt`,
`InstallPrompt`), `Callout`, `Button` · 12 the intro message; per-turn assistant
replies + optional optimization notes; "So far:" chips; the 5 work buckets with
plain headlines and action pills; a "{n} need you" count · 13 free-text messages;
(inline) brief corrections; accept/decline via `ApprovalPanel` · 14 conversation
intent progression; agent run status; every task's derived bucket · 15
`ConversationView`: send button spins; `BuyerWorkPanel`: "Loading your
requests…" · 16 `BuyerWorkPanel`: "No active requests yet — Tell me what you need
above…" · 17 conversation: inline `role="alert"`; `BuyerWorkPanel`: "Could not
load your requests." + "Try again" · 18 n/a (ongoing surface); a run reaching
`AWAITING_APPROVAL` renders `ApprovalPanel` inline · 19 `PushPrompt`/`InstallPrompt`
appear only when `hasAsyncWork` · 20 `mx-auto max-w-2xl`; single column
throughout · 21 chat bubbles cap at 85–90% width; the textarea is `min-h-11` · 22
installed launch lands here; SW may show the update banner · 23 none in the
happy path; the engineering trace is 2 `<details>` deep inside a settled run ·
24 intent classification, discovery, scoring, the run store, the audit trail · 25
→ S-03 (Activity), S-04 (`/tasks/:id`); the agent run's approve → S-04 · 26 first
visit, PWA launch, "Home" nav, "Start a new request" · 27 a live task (S-04);
`/activity` (S-03).

---

# S-03 — Buyer action centre

1 **Activity** · 2 `/activity` · 3 buyer · 4 "what has happened, and what needs
me" · 5 triage notifications; act on a missed one · 6 tap the "Activity" pill /
`/activity` back-link · 7 open an item's deeplink · 8 open a `NotificationRow`
(→ its deeplink) · 9 "Mark all as read"; adjust `NotificationSettings`; a
`BuyerWorkPanel` `WorkRow` · 10 "Home" back-link → "Activity" `<h1>` → subcopy →
`ActionCentre` ("Notifications", split Needs-your-attention / Updates) →
`NotificationSettings` → a border → `BuyerWorkPanel` · 11 `ActionCentre` (+
`NotificationRow`), `NotificationSettings`, `BuyerWorkPanel`, `EmptyState` · 12
per notification: a level badge, an unread dot, a relative time, a plain title +
body, a deeplink; the grouped work list · 13 none (just taps); push preference
toggles · 14 `notifications` rows (current attention items); push permission
state · 15 "Loading your activity…" · 16 `EmptyState` "Nothing needs you right
now" · 17 "Could not load your activity." + "Try again" · 18 reading an item is
optimistic; "Mark all as read" clears the badge · 19 this **is** the notification
surface; `NotificationSettings` controls push · 20 `mx-auto max-w-2xl`, single
column · 21 tappable rows `min-h`-comfortable · 22 push notifications deep-link
here or to `/tasks/:id`; `?ref=push` fires a resume ping · 23 none (event names
never shown) · 24 `specsForEvent`, dedupe, the recipient resolution · 25 → S-04,
S-16/S-17/S-18 via deeplinks · 26 a notification, or a "Activity" tap · 27 the
target workflow.

---

# S-04 — Buyer task workspace (route shell)

1 **Task workspace** · 2 `/tasks/[id]` · 3 the task's own session (or
`buyerClaimSession`) · 4 the buyer's whole view of one request · 5 "see where
this stands and do the next thing" · 6 a valid `x-session-id` match; usually via
a notification or `WorkRow` · 7 the task reaches a terminal state and feedback is
given; or the user navigates away · 8 varies by `task.status` (see S-04a…S-04g) ·
9 "Send a new request" (`/agent`) from an exception; the Activity list on the
page · 10 `ResumeSignal` → `SectionHeader` (route name + `StatusPill` + "Created
{relative}") → [exception `Callout`] → "Your brief" `Card` → ["The quote" `Card`]
→ [`RecommendationCard`] → [`PriceChangePanel`] → [`DecisionPanel`] →
[`PaymentReceipt`] → [`PayPanel`] → [`HandoffCard`] → [`HandoverCodePanel`] →
[`BuyerPickupPanel`] → [`OrderProblemPanel`] → "Activity" `Card` → [`FeedbackForm`]
· 11 see [`03` D]; `TaskPage` + its nested + `PayPanel` + `PriceChangePanel` +
`HandoverCodePanel` + `BuyerPickupPanel` + `OrderProblemPanel` + `ResumeSignal` ·
12 the full `TaskViewDto` — task fields, route freshness, supplier (name/city;
contact only from `HANDOFF_READY`), quotes (+ `effectiveStatus`), payments
(x402), recommendation (+ `normalized`, `reasoning`, `uncertainties`), timeline
(`eventLabel`), `priceChange`, `handoffConfirmedAt`, `proofline`, `handoverCode`,
`orderPayment`, `exception` · 13 the decision (accept/decline + optional reason);
the handoff self-report; the wallet approval; the pickup confirmation (+ optional
code); the price-change decision; cancel / handover-problem (+ optional note);
feedback (useful + optional comment) · 14 `task.status`, quote `effectiveStatus`,
`order_payments.status`, `proofline.evidenceStatus`, commitment presence,
`exception` reason · 15 `SectionHeader` + `LoadingPanel` · 16 no true empty state
· 17 `forbidden` → "This request belongs to another device" + "Start a new
request"; `missing` → "Request not found"; `error` → "Could not load this
request." + "Try again" · 18 per sub-state (below) · 19 opening this page from a
push carries `?ref=push` → resume ping · 20 `space-y-8`, single column, all
`DataList` rows `sm:flex-row` · 21 the `<pre>` message block scrolls
horizontally (`overflow-x-auto`); the whole page is portrait-first · 22 a push
click focuses/opens here; fully resumable from server state (except the "another
device" dead end) · 23 `PaymentReceipt` (x402) shows `attributionTag`, atomic
amounts, CAIP-2 network, "via agent payment protocol", `shortHash` + explorer
links; `HandoffCard` shows the raw contact value · 24 commitment creation, the
handover secret, the audit events, the FX math (a human USDC number is shown) ·
25 ← S-02/S-03 (agent, work list, notifications); → `/agent` on exception · 26
task `SUBMITTED`…`HANDOFF_READY`, `FAILED`, `CANCELLED` · 27 terminal + feedback.

## S-04a — Task: waiting for a price

14 `task.status ∈ {SUBMITTED, AWAITING_QUOTE}` · 10 header (`StatusPill` "Waiting
for a price"), "Your brief" `Card`, "Activity" (Request submitted / Sent to the
printer) · 8 none — the buyer waits · 15 the page renders instantly; the buyer
re-opens to check · 27 → RECOMMENDED (quote) or FAILED (decline).

## S-04b — Task: quote ready, awaiting decision

14 `task.status === "RECOMMENDED"` · 10 header ("Quote ready — your decision"),
brief, "The quote" `Card`, `RecommendationCard`, `DecisionPanel` · 8 **"Proceed
with this printer"** (or "Proceed anyway — I'll reconfirm" if expired) · 9 "Not
this one" → a reason textarea → "Confirm — don't proceed" · 12 price (or range) /
delivery / turnaround / availability / assumptions / confidence / quote validity;
"Intra's read" — total, per-flyer, "Why this looks OK", "What Intra cannot
confirm", the verification note · 17 "Could not record your choice. Try again." ·
18 accept → the page reloads into S-04c; decline → S-04g (`CANCELLED` exception)
· 19 notify business "A customer accepted your quote"; notify buyer "Your order is
ready to send" · 27 → HANDOFF_READY (accept) or CANCELLED (decline).

## S-04c — Task: ready to send (handoff)

14 `task.status === "HANDOFF_READY"`, `!handoffConfirmedAt` · 10 header ("Ready
to send"), brief, quote, recommendation, **`PayPanel`** (if `orderPayment`),
**`HandoffCard`**, **`HandoverCodePanel`**, **`OrderProblemPanel`**, Activity · 8
`HandoffCard` **"I've sent this to the printer"** (after copying / opening
WhatsApp) · 9 "Copy message"; "Open in WhatsApp" (`wa.me`); `PayPanel` "Pay with
MiniPay"; `OrderProblemPanel` "Cancel this order" / "The pickup or handover
failed" · 12 supplier name/city + **the now-revealed contact channel + value**;
the full pre-filled message in a `<pre>`; the handover code; the MiniPay amount +
locked rate + recipient · 13 the wallet approval (in the wallet UI); the "sent"
self-report · 17 "Could not record that. Try again." · 18 `HandoffCard` → "You
marked this as sent on {date}."; `PayPanel` → "Payment confirmed" · 19 on payment
confirm: buyer "Payment confirmed", business "Payment received" · 27 →
`handoffConfirmedAt` set (feedback unlocks; Proofline available); or `CANCELLED`
/ `FAILED` via `OrderProblemPanel`.

## S-04d — Task: handed off (Proofline available)

14 `handoffConfirmedAt` set · 10 as S-04c but `HandoffCard` shows the confirmed
state, `OrderProblemPanel` is gone, **`BuyerPickupPanel`** and `FeedbackForm`
appear · 8 `BuyerPickupPanel` **"Confirm I've collected this order"** (once the
merchant marks ready) · 9 "Have a pickup code instead?"; leave feedback · 12 "The
printer marked this order ready for pickup on {date}. This is the printer's
statement, not a check by Intra." · 18 `Callout tone="success"` "You confirmed
pickup"; feedback → "Thanks for the feedback." · 19 "Your order is ready for
pickup"; then "Your order is complete" · 27 Proofline `MERCHANT_MARKED_READY →
BUYER_CONFIRMED_PICKUP`.

## S-04e — Task: proposed price change

14 `view.priceChange && supplier` (task still `HANDOFF_READY`) · 10 a
`warning`-tinted `PriceChangePanel` above the decision area · 8 "Accept {new
amount}" · 9 "Keep the price I agreed" · 12 both amounts, the money delta, the
new turnaround, the business's verbatim reason, when they asked · 14
`quotes` has a `PROPOSED` row · 27 accept → the old row `SUPERSEDED`, the
proposal becomes accepted, any MiniPay intent invalidated; decline → the
proposal `WITHDRAWN`.

## S-04f — Task: x402 payment receipt (usually UNAVAILABLE)

14 `payments.length > 0` (an `UNAVAILABLE` row is written at submit) · 10 a
`PaymentReceipt` `Card` "Agent service payment" with a `StatusPill` · 12
`NOT_REQUIRED` "No agent query fee applies — this request came through the web…";
`UNAVAILABLE` "Agent payment verification is not available right now, so no
service fee was charged and no receipt exists. Intra never fabricates a
payment."; `AUTHORISED` "Settlement outcome is being reconciled… It is not shown
as paid…"; `SETTLED` → amount / network / transaction (`shortHash` + explorer) /
attribution tag / settled-at; `FAILED` → "No transaction was made and no receipt
exists." · 23 [`02` P1] · 27 none (append-only).

## S-04g — Task: exception (FAILED / CANCELLED)

14 `task.status ∈ {FAILED, CANCELLED}` · 10 an `info`/`warning` `Callout` from
`describeTaskException` at the top: headline / what happened / [buyer's note in
italics] / "What to do:" / what next / money note / "Send a new request" · 12
one of 9 semantic cases (`SUPPLIER_DECLINED`, `PROVIDER_WITHDREW`,
`PROVIDER_WITHDREW_AFTER_AGREEMENT`, `PROVIDER_CANNOT_FULFILL`, `HANDOVER_FAILED`,
`BUYER_CANCELLED`, `BUYER_CANCELLED_AFTER_AGREEMENT`, `ROUTE_UNAVAILABLE`,
`NO_VIABLE_OFFER`) · 18 the `FeedbackForm` opens · 27 terminal.

---

# S-05 — Agent run (inline states)

The agent run has no route of its own — it renders inside `ConversationView` (or
`AgentConsole`). Its states:

## S-05a — Running

14 `run.status === "RUNNING"` · 10 a `Card` with `run.headline` + a spinner →
`StageList` (7 stages, the current one `active`/`waiting`) → [`UnderstandingCard`
read-only] → `ActivityFeed` · 12 stage labels in the progressive tense ("Finding
printers who can do this", "Waiting for 2 printers to reply — Printers answer as
people, not APIs — this part is genuinely asynchronous") · 15 the whole surface
IS the loading state — semantic, no bare spinner · 17 poll transient failure →
a quiet "Reconnecting…" chip · 27 → AWAITING_APPROVAL / CLARIFICATION_NEEDED /
NO_VIABLE_OFFER / FAILED.

## S-05b — Clarification needed

14 `run.status === "CLARIFICATION_NEEDED"` · 10 a `Callout tone="info"` "One
thing before I ask anyone: {question}" + `UnderstandingCard` opens with the
missing fields highlighted ("I still need this") · 8 "Use these details" · 13 the
corrected fields · 27 → re-runs from the correction.

## S-05c — Awaiting approval

14 `run.status === "AWAITING_APPROVAL"` · 10 `StageList` (decide = "needs-you")
→ [`UnderstandingCard` editable] → `RecommendationPanel` → **`ApprovalPanel`** ·
8 **"Approve {price} with {business}"** · 9 "Decline" → reason → "Decline — don't
proceed"; `UnderstandingCard` "Not quite right?" → correct → re-run · 12 the
full offer `dl` (Business / Service / Total price / Expected completion / Price
held until / Who you pay); `Alternatives`; `RuledOut`; `uncertainties` · 13 the
decision + optional decline reason · 19 on approve: business "accepted", buyer
"ready to send" · 22 focus moves to the decision panel (a11y) · 27 → APPROVED
(→ S-04c) or DECLINED (→ S-05e).

## S-05d — Approved

14 `run.decision.outcome === "APPROVED"` · 10 `OutcomePanel` `Approved`:
"Agreed with {name}" + a 4-step checklist + "Open your order and copy the
message" → `/tasks/:id` + `Callout tone="unavailable"` "Intra does not send that
message…" + a `<details>` "Record details" · 25 → S-04c.

## S-05e — Declined / unsuccessful

14 `DECLINED` → `OutcomePanel` `Declined` "You didn't go ahead. Nothing was
ordered and no money moved." + "Try a different request". `NO_VIABLE_OFFER` /
`FAILED` → `Unsuccessful` with `outcomeCopy` (title/body/recovery) + "Nothing was
ordered and no money moved." + "Try again".

---

# S-06 — Structured request form

1 **Request form** · 2 `/request` (**orphaned — not linked from anywhere in the
app; reachable only by typing the URL**) · 3 buyer · 4 the form path to a quote ·
5 "get a printing quote with a form" · 6 direct URL only · 7 `router.push('/tasks/:id')`
· 8 phase `brief`: **"Find a printing quote"**; phase `pick`: **"Send request &
get a quote"** · 9 "Edit brief" / "Edit my brief" · 10 "Request a quote" eyebrow
→ "Get a printing quote without the back-and-forth." `<h1>` → subcopy →
`RequestForm` (5 fields → printer radio list) · 11 `RequestForm`, `SelectField`,
`TextField`, `Callout`, `Button`, `EmptyState` · 12 phase `pick`: per printer —
name, city/country, "replies within N min", "Prices confirmed X ago" · 13 Paper
size, Number of copies, Colour, Needed by, Delivery/pick-up area; then the picked
printer · 14 task `DRAFT → SUBMITTED → AWAITING_QUOTE` · 15 button "Finding
printers…"; button pending on submit · 16 `EmptyState` "No printers are live yet
— No verified flyer-printing route is active right now. Check back soon." +
"Edit my brief" · 17 `Callout tone="warning"` "Something went wrong" /
"Could not load available printers." / "That printer just went offline. Pick
another, or try again shortly." · 18 redirect to S-04 · 19 notify business "New
customer request" · 20 `mx-auto max-w-xl`; `grid-cols-1 sm:grid-cols-2` for size

- copies · 21 `inputMode="numeric"` for copies; `type="number"` · 22 normal page ·
  23 none · 24 the task lifecycle, the `UNAVAILABLE` service-payment row · 25 → S-04
  · 26 direct link · 27 task `AWAITING_QUOTE`.

---

# S-07 — Business quick-start onboarding

1 **Quick-start** · 2 `/supplier/onboard` · 3 business (unauthenticated) · 4 set
a business + first service up in one screen · 5 "let customers find my service" ·
6 any visit · 7 the success card → "Open your workspace" · 8 **"Set up my
business"** · 9 "Use the detailed form" → `/supplier/onboard/full` · 10 "For
business owners" eyebrow → "Start where your customers already are." `<h1>` →
subcopy → a 3-step overview grid → the 4 `WHY_BUSINESSES_JOIN` cards → `Callout
tone="info"` "What we will never ask for" → `QuickStartForm` (3 `Card`s) → the
"detailed form" link · 11 `QuickStartForm`, `Card`, `SelectField`, `TextField`,
`CheckboxField`, `Callout`, `Button` · 12 the value-prop copy; pricing-model
examples · 13 businessName, category, serviceName, pricingModel (+ priceAmount /
priceUnit), city, serviceArea, contactName, contactChannelValue (WhatsApp),
consent · 14 business → `PENDING_VERIFICATION`; route → `DRAFT` · 15 button
pending · 16 n/a · 17 `INVALID_BODY` → per-field errors + "Check the highlighted
fields."; `Callout tone="warning"` "Not quite" for other errors; `409
BUSINESS_EXISTS` · 18 a `Card` "{business} is set up" + "Open your workspace" →
`manageUrl` + `Callout tone="info"` "Keep this link — … It is not a wallet key
and holds no money — but treat it as private." · 19 none · 20 `mx-auto max-w-2xl`;
overview grid `sm:grid-cols-3`; paired fields `sm:grid-cols-2` · 21 `inputMode`
hints (`tel`, `decimal`) · 22 normal page · 23 none · 24 slugify, template
selection, the `/v1` endpoint, `manageToken` generation, the DRAFT lifecycle · 25
→ S-15 (`/supplier/:slug?t=`) · 26 landing CTA · 27 route `DRAFT`, awaiting
operator activation (S-19).

---

# S-08 — Full onboarding (draft only)

1 **Full onboarding** · 2 `/supplier/onboard/full` · 3 business (with an
operator) · 4 collect the full Capability Card · 5 "prepare my service with an
operator" · 6 the "detailed form" link · 7 `DraftRoutePreview` renders · 8
per step: **"Continue"**; last step: **"Preview my Capability Card"** · 9 "Back";
"one-screen setup" link · 10 a 4-dot progress rail → step fieldsets → nav buttons
→ "This creates a draft…" · 11 `OnboardingForm` (RHF), `DraftRoutePreview`,
`SelectField`, `TextField`, `CheckboxField`, `Callout` · 12 step 3: a live
template preview (name, availability badge, "Agents will send: …") · 13
businessName, contactName, contactChannelType + value, city, country, serviceArea,
operatingHours, turnaround, category, serviceSummary (≤ 280), quoteResponseTime,
quoteCurrency, wantsPaidQueries, [payoutAddress], consent · 14 **NONE — zero rows
written** · 15 button "Preparing…" (an artificial 300 ms) · 16 n/a · 17 per-step
field validation; `Callout tone="warning"` "Please fix the highlighted fields" /
"Could not create the Capability Card" · 18 `DraftRoutePreview` (see S-09) · 19
none · 20 `mx-auto max-w-md`; helper text `hidden sm:block` · 21 `inputMode`
hints; `autoCapitalize="none"` on the address · 22 normal page · 23 the
`<details>` "View the raw route payload (for your operator)" shows
`JSON.stringify` of the route · 24 template internals, the schema shape · 25 → S-09
· 26 the detailed-form link · 27 **an operator must `POST /api/businesses` +
`.../routes` by hand** (no follow-on screen in the app).

---

# S-09 — Draft Capability Card preview

1 **Draft preview** · 2 `/supplier/onboard/full` (post-submit state) · 3 business
· 4 show what an agent would see + tell the merchant to hand it to an operator ·
5 "check this looks right" · 6 `OnboardingForm` submit · 7 "Start over" · 8 none
(there is no submit) · 9 "Start over"; the `<details>` "View the raw route
payload" · 10 "Your Capability Card" `<h2>` → "This is what an AI agent would see
once your service is active. Nothing is saved or submitted yet." → `Callout
tone="warning"` "Draft — not live" → the card `dl` → "An agent must send" →
"Public to agents once active" / "Stays private" → a lifecycle explainer →
`Callout tone="info"` "This is not an AI agent" → a "Next step" block → the raw
payload `<details>` → "Start over" · 11 `DraftRoutePreview`, `Callout` · 12 the
full card + the eventual review URL (`draftRouteUrl`) + the raw route JSON · 13
none · 14 no persisted state · 15 n/a · 16 n/a · 17 n/a · 18 this IS the terminal
state of S-08 · 19 none · 20 `sm:grid-cols-2` for the public/private panels · 21
`overflow-x-auto` on the JSON `<pre>` · 22 normal page · 23 the raw route JSON in
a `<details>` · 24 nothing (it's all shown) · 25 ← S-08; → (out of band) an
operator · 26 form submit · 27 out-of-band operator action.

---

# S-15 — Business workspace

1 **Business workspace** · 2 `/supplier/[slug]` (`?t=<token>`) · 3 business
(manage token) / anyone (read-only shell) · 4 action-first overview: what needs
me, what's happening, my record · 5 "handle whatever needs me" · 6 the manage
link · 7 open a sub-surface · 8 "{n} customers are waiting for your price" banner
→ `/supplier/:slug/requests?t=` · 9 "Open your requests"; "Service settings" →
`/review?t=`; `EditPublishedPriceForm`; `NotificationSettings` · 10 [analytics
identity] → `SectionHeader` "Your business" → [`PushPrompt`] → `ActionCentre`
"What needs you" (or a read-only `Callout`) → [the yellow "waiting" banner] →
"What's happening" (`Stat` tiles or "Nothing is in flight") → "Your record so
far" (or "No customer requests yet") → [a "Why finishing jobs matters" `Callout`]
→ "What you offer" (route cards + `EditPublishedPriceForm`) → `NotificationSettings`
· 11 `SectionHeader`, `Card`, `Callout`, `ActionCentre`, `NotificationSettings`,
`PushPrompt`, `AnalyticsBusinessIdentity`, `EditPublishedPriceForm`, local `Stat`
· 12 counts (Reviewing your quote / Price change waiting / In progress / To hand
over; Requests received / Prices sent / Customers who agreed / Jobs completed /
Typical reply time / Requests you priced); per route: name, "Available to
customers"/"Not yet live", the pricing description, "You aim to reply within N
minutes" · 13 (via `EditPublishedPriceForm`) the published price; push toggles ·
14 `getSupplierWorkspace` — `incoming` / `quoted` / `handedOff` counts;
`getBusinessValueSummary` · 15 server component — no client loading state · 16
"Nothing is in flight right now." / "No customer requests yet" `Card` · 17
`notFound()` if the slug is unknown; otherwise a read-only shell without `?t=` ·
18 n/a (overview) · 19 `ActionCentre` "What needs you"; `PushPrompt` if
`incoming||quoted > 0` · 20 `grid-cols-2 sm:grid-cols-3` stat grids · 21 portrait
· 22 a `business` push deep-links to `/supplier/:slug/requests?...&task=:id` · 23
none (payout address is on `/review`, shortened) · 24 the value summary SQL, the
freshness math · 25 → S-16, S-17 · 26 quick-start success; a manage link; a
notification · 27 quote / pause / mark-ready actions on the sub-surfaces.

## S-15r — Business workspace, read-only (no `?t=`)

14 `!canManage` · 10 the header + `Callout tone="info"` "Read-only view — Open
your manage link to see what needs you, send prices, and mark work ready." · 8
none · every management section is hidden.

---

# S-16 — Business request inbox

1 **Request inbox** · 2 `/supplier/[slug]/requests` (`?t=<token>`) · 3 business
(manage token) — **`notFound()` without it** · 4 quote / decline incoming
requests; handle handed-off orders · 5 "answer this customer" · 6 a valid `?t=` ·
7 send a quote / decline / mark ready / attest a handover · 8 `QuoteResponseForm`
**"Send quote to buyer"** (or **"Decline this request"**) · 9 "Back to
workspace"; `ChangePriceForm` "Change this price"; `MerchantFulfilmentPanel`
"Mark ready for pickup"; `HandoverAttestPanel` "Confirm handover" · 10
[analytics] → `ResumeSignal` → `SectionHeader` "Incoming requests" → [a
`staleNote` `Callout`] → "Incoming requests" (`ol` of request `Card`s each with
`QuoteResponseForm`) → ["Prices you have sent" (`ol` with `ChangePriceForm`)] →
["Handed-off orders" (`ol` with `MerchantFulfilmentPanel` + `HandoverAttestPanel`)]
· 11 `Card`, `DataList`, `EmptyState`, `Callout`, `QuoteResponseForm`,
`ChangePriceForm`, `MerchantFulfilmentPanel`, `HandoverAttestPanel`, `ResumeSignal`,
`AnalyticsBusinessIdentity` · 12 per incoming: route name, "Sent {relative} ·
reply within N min", the brief `DataList` (`BRIEF_LABEL` humanised) + "Budget:
Not specified"; per quoted: "Your price", "Turnaround", "Sent {relative}",
"Customer agreed" / "Customer is reviewing your quote"; per handed-off: the
brief, the Proofline panel (+ the 6-char pickup code), the handover panel · 13
the quote (10 fields), the decline reason, the price change (+ required reason),
the mark-ready action, the handover code + signature · 14 tasks in
`AWAITING_QUOTE` / `RECOMMENDED` / `HANDOFF_READY` bound to this business's
routes · 15 server component; the forms have their own pending states · 16
`EmptyState` "No customer requests yet — When someone needs one of your services,
their request will appear here with everything they have told us about the job."
· 17 `notFound()` without `?t=`; per-form `Callout tone="warning"` "Could not
send" · 18 `Callout tone="success"` "Quote sent" / "Request declined" / "Price
change sent" / "Handover confirmed" · 19 a `task` push from a notification
appends `&task=:id` and rings that card (`ring-2 ring-primary`); a `staleNote`
`Callout` explains if the request has moved on · 20 request cards stack; the
"Add more detail" `<details>` collapses on mobile · 21 the pickup code box is
`text-center` mono; `autoCapitalize="characters"` on the handover code · 22
resume ping if `?ref=push` · 23 the pickup code (mono, `tracking-[0.2em]`); the
handover panel names "wallet" and "signature" but keeps schema/tx-hash detail
off-screen · 24 the quote-integrity rules (revision vs propose), the EIP-712
build, `attestByDelegation` · 25 → S-15; the handover panel needs the buyer's
code from S-04c · 26 task `AWAITING_QUOTE` / `RECOMMENDED` / `HANDOFF_READY` · 27
task `RECOMMENDED` (quote), `FAILED` (decline), or a Proofline / attestation
event.

---

# S-17 — Business route review

1 **Route review** · 2 `/supplier/[slug]/review` (`?t=<token>`) · 3 business
(manage token) — **`notFound()` without it** · 4 see business details + route
status/freshness; pause a route · 5 "check my details; pause if needed" · 6 a
valid `?t=` · 7 pause a route / navigate away · 8 `PauseRouteButton` **"Pause
route"** (only on ACTIVE routes) · 9 "Incoming requests" → `/requests?t=` · 10
`SectionHeader` "Supplier review" → `Callout tone="success"` "You can manage this
business — This link carries your private manage token. Keep it to yourself — it
is not a wallet key and holds no funds…" → "Business details" `Card` (`DataList`)
→ "Capability routes" (a "What each state means" `Card` + per-route `Card`s) · 11
`Card`, `DataList`, `Callout`, `StatusPill`, `PauseRouteButton` · 12 Authorised
contact, Order channel (type · value), Quote currency, **Public payout address**
(shortened, mono, with a hint "Public address only — Intra never stores or asks
for a private key or seed phrase"), Quote-display consent ("Recorded {datetime}"
/ "Not recorded"), Payout-address verification ("Verified by operator {relative}"
/ "Pending operator verification"); per route: name + description + a `StatusPill`

- ["Stale" pill], [a `warning` `Callout` "Price data is stale"], Query fee,
  Response SLA, Price freshness ("Confirmed {relative}" / "· needs reconfirming"),
  "Verified for buyers" ({datetime} / "Not verified"), "What agents can see when
  this route is Active" (name/category/city; the input fields as chips; SLA + fee;
  the order contact "only while the route is Active, verified, and fresh") · 13 the
  pause action · 14 route lifecycle + freshness · 15 server component · 16 "No
  routes yet for this business." `Card` · 17 `notFound()` without `?t=` · 18
  `router.refresh()` after a pause · 19 none · 20 the state explainer `dl` is
  `sm:flex sm:gap-3` · 21 portrait; the address is `font-mono text-xs` · 22 normal
  · 23 the shortened payout address; freshness timestamps · 24 the transition auth,
  `routeIsQuoteReady` · 25 → S-16 · 26 a manage link · 27 route `PAUSED` (only an
  operator can reactivate).

---

# S-19 — Operator console

1 **Operator console** · 2 `/operator` · 3 operator (`x-operator-key`) · 4
verify + activate/pause routes; view metrics/evidence · 5 "keep route data safe
and current" · 6 a valid operator key in `sessionStorage` · 7 activate / pause /
"Sign out" · 8 `OperatorRouteCard` **"Verify and activate"** (disabled until all
6 checks) / **"Reactivate route"** · 9 "Pause route"; tab switch (Review queue /
Metrics / Evidence); "Sign out" · 10 sign-in `Card` (if no key) → a "Operating as
verified operator" line + "Sign out" → a 3-tab `role="tablist"` → the tab body ·
11 `OperatorConsole` (+ `OperatorRouteCard`), `MetricsPanel`, `EvidencePanel`,
`Card`, `DataList`, `EmptyState`, `ErrorState`, `LoadingPanel`, `StatusPill`,
`Button` · 12 Review queue: per route — business name / route · city / a
`StatusPill` (raw-ish status), Consent, Order channel, Query fee · SLA, Last
updated, and the 6-check `fieldset` (`ACTIVATION_CHECK_LABELS`) · 13 the operator
key; the 6 checkbox ticks · 14 `listOperatorQueue` — every non-archived route +
its business · 15 sign-in: none; queue: `LoadingPanel` "Loading route queue" ·
16 `EmptyState` "Nothing needs review — New routes from supplier onboarding will
appear here for verification." · 17 sign-in: "That operator key was not
accepted."; `ErrorState` "Could not load the queue" + "Try again"; per-card
`Callout tone="warning"` "Could not update the route" (`CHECKLIST_INCOMPLETE` /
`CONSENT_MISSING` / `INVALID_ROUTE_TRANSITION`) · 18 `onChanged` reloads the
queue; the route drops out · 19 activating a route forwards a `business_ready`
analytics event · 20 the tab strip is `flex-1` per tab · 21 the key input is
`type="password"`, `autoComplete="off"` · 22 not in the marketing chrome; direct
URL only · 23 the near-raw `StatusPill` (`.replace(/_/g," ")`); the checklist
labels name "public payout address", "off-chain ownership confirmation" · 24 the
transition matrix, the `verifiedAt`/`priceUpdatedAt` stamping · 25 → S-20 (Metrics),
S-21 (Evidence); routes it activates become bookable on S-06/S-02 · 26 a route
`DRAFT` / `PENDING_VERIFICATION` / `PAUSED` · 27 route `ACTIVE` (+ business
operator-verified) or `PAUSED`.

---

# S-20 — Operator metrics

1 **Operator metrics** · 2 `/operator` (Metrics tab) · 3 operator · 4 the
adoption picture · 5 "how is the pilot going" · 6 the Metrics tab · 7 tab switch
· 8 none (read-only) · 9 "Export CSV" / "Export JSON" / "Refresh" · 10 the export
row → `EvidenceView` (real / demo / integrations / feedback changelog / recent
activity / methodology) · 11 `MetricsPanel`, `EvidenceView` · 12 the full
`EvidenceReport` + `recentEvents` (a content-free `type → to` feed of the last
25 audit events) · 13 none · 14 `buildEvidenceReport` + a live audit read · 15
`LoadingPanel` "Loading metrics" · 16 "No real activity recorded yet" `Callout` ·
17 `ErrorState` "Could not load metrics" + "Try again" · 18 n/a · 19 none · 20 a
`<table>` scrolls if needed · 21 portrait · 22 direct URL · 23 the "Recent
activity" feed shows raw dotted event types (`type` + `→ to`) · 24 the
aggregation SQL · 25 shares `EvidenceView` with S-22 · 26 the Metrics tab · 27
n/a.

---

# S-21 — Operator evidence trace

1 **Evidence trace** · 2 `/operator` (Evidence tab) · 3 operator / judge · 4
cross-reference one transaction's DB + on-chain state · 5 "prove this
transaction" · 6 the Evidence tab · 7 tab switch · 8 **"Trace"** (with a task id)
· 9 none · 10 a task-id `input` + "Trace" → [`Callout tone="warning"` "Contains
simulated records"] → `Card`s: Transaction / Provider / Commitment attestation
(signed by Intra) / Handover attestation (signed by the provider) / Service
payments / Consistency cross-check / Timeline → the disclaimer · 11 `EvidencePanel`
(+ `TraceView`), `Card`, `DataList`, `Callout`, local `Ref` · 12 task id/status,
conversation prefix, buyer decision + time, handoff confirmed; business, route,
payout address + explorer, ERC-8004 agent id; commitment status, job ref, buyer
address, amount, schema UID, attestation UID + explorer, tx hash + explorer,
mode, attested-at; handover status, "verified merchant signature, relayed
on-chain" / "simulated (mock)" / "not yet signed", outcome, attester address,
schema UID, refUID, attestation UID + tx; per payment: status, amount, payee, tx;
the 4-line consistency check ("Handover links to commitment: yes / MISMATCH");
the raw `at · type` timeline · 13 a task id · 14 the full `TransactionTrace` · 15
button "Trace" pending · 16 nothing rendered until a lookup · 17 "Lookup failed."
`role="alert"` · 18 the trace renders · 19 none · 20 `Card`s stack; `Ref` values
`break-all font-mono` · 21 portrait · 22 direct URL · 23 **[`02` P3]** — raw
enums (`PENDING_ATTESTATION`), `attestationMode: "mock"`, schema UIDs, "MISMATCH",
mono hashes · 24 the join / cross-reference logic · 25 ← S-19 · 26 any task with
an id · 27 n/a.

---

# S-22 — Public evidence page

1 **Evidence** · 2 `/evidence` · 3 public / judge · 4 real results vs demo data
vs unavailable integrations, and what changed from feedback · 5 "what has Intra
actually done" · 6 any visit · 7 download an export / navigate away · 8 none ·
9 "Download JSON" / "Download CSV" · 10 `SectionHeader` "Evidence" / "What Intra
has actually done" → the download row → `EvidenceView` (Real results with a
targets-vs-actual `<table>` + detail; Demo data with a dashed border; Unavailable
& external integrations; What changed from feedback; a "How these numbers are
produced" `<details>`) · 11 `SectionHeader`, `EvidenceView` · 12 targets vs
actual (Independent buyer tests / Returning buyers / Participating printers /
Completed quote requests / Real verified settlements / AskBots rounds); the full
snapshot; integration statuses (`available` / `unavailable` / `misconfigured`);
the feedback changelog · 13 none · 14 `buildEvidenceReport` (server, `force-dynamic`)
· 15 server component · 16 `Callout tone="info"` "No real activity recorded yet
— No genuine businesses, tasks, or feedback exist in this database. Real numbers
appear here as soon as a non-seed business is onboarded and a buyer sends a
request." · 17 `error.tsx` on a fault · 18 n/a · 19 none · 20 the `<table>` and
`DataList` are responsive · 21 portrait · 22 not in the chrome; direct URL · 23
none — every value is a plain number or a plain status; the methodology is
explicit · 24 the classification predicate, the SQL · 25 shares `EvidenceView`
with S-20 · 26 direct link · 27 n/a.

---

# S-23 — Route contract docs

1 **Docs** · 2 `/docs` · 3 public (agent-builder facing) · 4 explain how a
business capability maps to the agent route contract · 5 "understand the
contract" · 6 any visit · 7 navigate away · 8 none · 9 none · 10 "Agent route
contract" → "Businesses publish a capability. Agents handle the protocol." → 3
cards (Capability / Payment boundary / Control boundary) → a "Generated
capability manifest" `<pre>` (illustrative JSON) → a 5-step "Agent lifecycle"
`<ol>` → a `warning`-tinted "Payment status" note · 11 static; `lucide-react`
icons · 12 the illustrative manifest JSON; the 5 lifecycle steps · 13 none · 14
none · 15 none · 16 n/a · 17 `error.tsx` · 18 n/a · 19 none · 20 `sm:grid-cols-3`
cards · 21 `overflow-x-auto` on the `<pre>` · 22 normal · 23 the whole page IS a
technical explainer — HTTP 402, X-PAYMENT, facilitator, MCP, ERC ids · 24
nothing (it's a spec doc) · 25 none · 26 nav "Docs" · 27 n/a.

---

# S-24 — Offline fallback

1 **Offline** · 2 `/offline` · 3 any · 4 SW navigation fallback with no
connection · 5 "understand why nothing loads" · 6 a navigation fails offline · 7
reconnect + retry · 8 **"Try again"** → `/agent` · 9 none · 10 a `WifiOff` icon
in a wash circle → "You're offline" `<h1>` → "Intra needs a connection to show
your latest requests and prices. Your work is safe on the server — reconnect and
open the page again." → "Try again" · 11 static; `lucide-react` `WifiOff`;
`Link` · 12 the offline message · 13 none · 14 no connection · 15 n/a · 16 n/a ·
17 this IS an error state · 18 n/a · 19 none · 20 `mx-auto max-w-md text-center`
· 21 portrait · 22 **served from the SW `SHELL_CACHE`** — must render without a
network · 23 none · 24 the SW cache policy · 25 → S-02 on "Try again" · 26 an
offline navigation · 27 whatever the user retries.

---

# S-25/26/27 — Error / Not-found / Global-error

- **S-25 Error boundary** (`error.tsx`): "Something went wrong on our side. This
  page hit an unexpected error. Nothing you did caused it, and no request was
  sent to a printer. Try again, or head back home." — "Try again" (`reset`) /
  "Go home". `role="alert"`.
- **S-26 Not found** (`not-found.tsx`): "Not found. That page does not exist. Go
  home." — reached by `notFound()` on the supplier gated pages, and bad URLs.
- **S-27 Global error** (`global-error.tsx`): its own `<html>`/`<body>`,
  inline-styled (uses the **stale** green `#0f3e17` button), "Intra is
  temporarily unavailable. The app failed to load. Please refresh the page in a
  moment." — "Try again".

---

# Hierarchy

```
APP (Intra)
│
├── ROLE: Buyer
│   ├── SECTION: Discover & request
│   │   ├── SCREEN: Landing (S-01)
│   │   │   └── ACTION: "I need something made" → /agent
│   │   ├── SCREEN: Buyer home /agent (S-02)
│   │   │   ├── COMPONENT: ConversationView
│   │   │   │   ├── ACTION: send a message → POST /api/conversation
│   │   │   │   │   └── STATE: intent CONVERSATION…QUOTE_REQUEST
│   │   │   │   └── COMPONENT: AgentConsole (embedded)
│   │   │   │       ├── STATE: RUNNING (S-05a) / CLARIFICATION_NEEDED (S-05b)
│   │   │   │       ├── COMPONENT: StageList (7 stages)
│   │   │   │       ├── COMPONENT: UnderstandingCard
│   │   │   │       │   └── ACTION: correct the brief → re-run
│   │   │   │       ├── COMPONENT: RecommendationPanel (+ Alternatives, RuledOut)
│   │   │   │       ├── COMPONENT: ApprovalPanel (S-05c)
│   │   │   │       │   ├── ACTION: Approve {price} with {business}
│   │   │   │       │   │   └── STATE: run APPROVED → task HANDOFF_READY (S-04c)
│   │   │   │       │   └── ACTION: Decline (+ reason)
│   │   │   │       │       └── STATE: run DECLINED (S-05e)
│   │   │   │       └── COMPONENT: OutcomePanel (S-05d / S-05e)
│   │   │   └── COMPONENT: BuyerWorkPanel (5 buckets)
│   │   │       └── ACTION: open a WorkRow → /tasks/:id
│   │   └── SCREEN: Request form /request (S-06)
│   │       ├── ACTION: submit brief → POST /api/tasks + submit
│   │       └── ACTION: pick a printer → /tasks/:id
│   │
│   ├── SECTION: Track & decide
│   │   ├── SCREEN: Task workspace /tasks/:id (S-04)
│   │   │   ├── STATE: waiting for a price (S-04a)
│   │   │   ├── STATE: quote ready — decision (S-04b)
│   │   │   │   ├── COMPONENT: RecommendationCard
│   │   │   │   └── COMPONENT: DecisionPanel
│   │   │   │       ├── ACTION: Proceed → task HANDOFF_READY
│   │   │   │       └── ACTION: Not this one → task CANCELLED (S-04g)
│   │   │   ├── STATE: ready to send (S-04c)
│   │   │   │   ├── COMPONENT: PayPanel
│   │   │   │   │   └── ACTION: Pay with MiniPay → wallet → CONFIRMED
│   │   │   │   ├── COMPONENT: HandoffCard
│   │   │   │   │   ├── ACTION: Copy / Open in WhatsApp
│   │   │   │   │   └── ACTION: "I've sent this" → handoffConfirmedAt
│   │   │   │   ├── COMPONENT: HandoverCodePanel (shows the code)
│   │   │   │   └── COMPONENT: OrderProblemPanel
│   │   │   │       ├── ACTION: Cancel this order → CANCELLED
│   │   │   │       └── ACTION: Handover failed → FAILED
│   │   │   ├── STATE: handed off (S-04d)
│   │   │   │   └── COMPONENT: BuyerPickupPanel
│   │   │   │       └── ACTION: Confirm pickup → PICKUP_CONFIRMED
│   │   │   ├── STATE: price change proposed (S-04e)
│   │   │   │   └── COMPONENT: PriceChangePanel
│   │   │   ├── STATE: x402 receipt (S-04f, usually UNAVAILABLE)
│   │   │   ├── STATE: exception (S-04g)
│   │   │   └── COMPONENT: FeedbackForm (on terminal)
│   │   └── SCREEN: Activity /activity (S-03)
│   │       ├── COMPONENT: ActionCentre
│   │       ├── COMPONENT: NotificationSettings
│   │       └── COMPONENT: BuyerWorkPanel
│   │
│   └── SECTION: Errors
│       ├── SCREEN: Offline (S-24)
│       └── SCREEN: Error / Not found / Global error (S-25/26/27)
│
├── ROLE: Business
│   ├── SECTION: Get set up
│   │   ├── SCREEN: Quick-start /supplier/onboard (S-07)
│   │   │   └── ACTION: Set up my business → business PENDING_VERIFICATION
│   │   └── SCREEN: Full onboarding /supplier/onboard/full (S-08)
│   │       └── SCREEN: Draft preview (S-09) → (out of band) an operator
│   ├── SECTION: Run the business (all gated on ?t=)
│   │   ├── SCREEN: Workspace /supplier/:slug (S-15 / S-15r read-only)
│   │   │   ├── COMPONENT: ActionCentre "What needs you"
│   │   │   └── COMPONENT: EditPublishedPriceForm
│   │   ├── SCREEN: Request inbox /supplier/:slug/requests (S-16)
│   │   │   ├── COMPONENT: QuoteResponseForm → task RECOMMENDED / FAILED
│   │   │   ├── COMPONENT: ChangePriceForm → REPLACED / CHANGE_PROPOSED
│   │   │   ├── COMPONENT: MerchantFulfilmentPanel → READY_FOR_PICKUP
│   │   │   └── COMPONENT: HandoverAttestPanel → EAS attestation
│   │   └── SCREEN: Route review /supplier/:slug/review (S-17)
│   │       └── COMPONENT: PauseRouteButton → route PAUSED
│   └── SECTION: (implicit) receive notifications
│       └── COMPONENT: ActionCentre + NotificationSettings on S-15/S-16
│
├── ROLE: Operator
│   └── SECTION: Console /operator (S-19)
│       ├── TAB: Review queue
│       │   └── COMPONENT: OperatorRouteCard
│       │       ├── ACTION: 6-check + Verify and activate → route ACTIVE
│       │       └── ACTION: Pause route → route PAUSED
│       ├── TAB: Metrics (S-20) → EvidenceView
│       └── TAB: Evidence (S-21) → EvidencePanel / TraceView
│
├── ROLE: Public
│   ├── SCREEN: Evidence /evidence (S-22)
│   └── SCREEN: Docs /docs (S-23)
│
└── ROLE: Machine agent
    ├── GET /v1/:slug/capabilities  (the Capability Card)
    └── POST /v1/:slug/:route/quote (x402: 402 → verify → settle, or 503)
```
