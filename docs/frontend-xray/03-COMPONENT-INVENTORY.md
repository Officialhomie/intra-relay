# 03 — Component Inventory

> Every user-facing frontend component in the repository, grouped by purpose.
> Reverse-engineered — nothing added, nothing redesigned. Fields per component:
> path · purpose · where used · props · state · events · API/server deps · role ·
> workflow dep · visible copy · visible technical info · loading/error/empty ·
> responsive · a11y · component deps.
>
> `"use client"` marked **[client]**; React Server Component marked **[RSC]**;
> pure/presentational marked **[pure]**.

---

## A. Layout / chrome (`src/components/`)

### `Header` — `src/components/Header.tsx` [pure]

- **Purpose**: sticky top bar with logo + reduced public nav + a CTA.
- **Where**: `layout.tsx` (every page).
- **Props**: none.
- **State**: none.
- **Events**: `Link` navigation only.
- **Deps**: `primaryNav`/`site` (`src/lib/site.ts`), `lucide-react` `ArrowUpRight`.
- **Copy**: logo "Intra" (serif "I" badge that rotates 12° on hover); nav labels
  filtered to `/agent` ("Home"), `/supplier/onboard` ("For businesses"), `/docs`
  ("Docs"); CTA "Join as a business".
- **Technical info visible**: none.
- **Responsive**: `flex-wrap`, `gap-x-3 sm:gap-x-5`; CTA `hidden … sm:inline-flex`;
  `min-h-16` bar, `sticky top-0 z-30`, `backdrop-blur-md`.
- **A11y**: `<nav aria-label="Primary">`, `aria-hidden` icons.
- **Note**: `primaryNav` has 7 entries; only 3 are rendered. `/activity`,
  `/operator`, `/evidence`, `/` are not in the chrome ([`00` §20 #10]).

### `Footer` — `src/components/Footer.tsx` [pure]

- Static: "Intra · {year}" + "Real businesses. Clear quotes. You stay in control."
- `flex-col sm:flex-row`. No links.

### `MainContainer` — `src/components/MainContainer.tsx` [pure]

- `<main>` wrapper: `max-w-[var(--container-max)]` (72rem), `px-4 sm:px-6`,
  `py-10 sm:py-14`, `flex-1`.

### `OfflineBanner` — `src/components/OfflineBanner.tsx` [client]

- **Purpose**: global connectivity notice.
- **Where**: `layout.tsx`.
- **State**: `offline` boolean from `navigator.onLine` + `online`/`offline`
  events.
- **Copy**: "You are offline. Intra will keep showing the last loaded page; new
  requests need a connection."
- **A11y**: `role="status"`, `WifiOff` `aria-hidden`.
- **Renders `null`** when online.

---

## B. UI primitives (`src/components/ui/`) — 9 files, all hand-rolled

### `Button` — `Button.tsx` [pure]

- **Props**: `variant` (`primary` | `secondary` | `ghost` | `danger`), `size`
  (`sm` `min-h-9` | `md` `min-h-11`), `pending` (shows `Loader2` spinner,
  `aria-busy`, disables), `block`, + all native button attrs.
- **A11y**: `focus-visible:ring-2 ring-primary`, `disabled:opacity-45`,
  `active:scale-[0.98] motion-reduce:active:scale-100`.
- **Responsive**: `w-full sm:w-auto` by default; `block` → always `w-full`.

### `Callout` — `Callout.tsx` [pure]

- **The workhorse trust device.** `tone`: `info` (blue `Info`), `warning` (amber
  `AlertTriangle`), `success` (green `CheckCircle2`), `unavailable` (grey
  `CircleSlash` — used for honesty statements). Optional `title` (bold) +
  `children`.
- Icon always `aria-hidden`; the tone is also carried by the title/body text.

### `CheckboxField` — `CheckboxField.tsx` [pure, forwardRef]

- Labelled checkbox with `aria-invalid` / `aria-describedby` → an error `<p>`.
  `label` is a `ReactNode` (consent copy is a nested block).

### `DataList` / `DataRow` — `DataList.tsx` [pure]

- `<dl>` with `divide-y`, rounded border. `DataRow`: `label` (left, muted),
  `children` (right, `sm:text-right`), optional `hint` (block, `text-xs subtle`).
- Used for every "record detail" panel (brief, quote, business, payment,
  approval).

### `Section` — `Section.tsx` [pure]

- `SectionHeader`: pill `eyebrow` + light serif `<h1>` (`max-w-prose`) +
  `description` + optional `actions`.
- `Card`: `rounded-md border bg-surface p-5`, `as` = `section` | `article` |
  `div`.
- `CardTitle`: `<h2 text-base font-medium>`.

### `SelectField` — `SelectField.tsx` [pure, forwardRef]

- Labelled `<select>` (`text-base` to avoid iOS zoom), `hint`, `error`,
  `placeholder` (a disabled empty option), `required` (renders " *"),
  `aria-invalid` / `aria-describedby`.

### `States` — `States.tsx` [pure] — 5 exports

- `EmptyState`: dashed border, icon in a wash circle, title, description,
  optional `action`.
- `Skeleton`: `animate-pulse` (`motion-reduce:animate-none`) bar.
- `CardSkeleton`: 3 skeleton bars in a card.
- `LoadingPanel`: `role="status" aria-live="polite"` + `sr-only` label + 2
  `CardSkeleton`s.
- `ErrorState`: `role="alert"`, danger-wash card, title, description, `action`.

### `StatusPill` — `StatusPill.tsx` [pure] + helpers

- Pill with a **leading dot + uppercase label** — never colour alone
  (`NFR-A11Y-001`). `tone`: `neutral` | `active` | `pending` | `warning` |
  `danger` | `info`.
- Helpers: `routeStatusLabel` / `routeStatusTone`, `taskStatusLabel` /
  `taskStatusTone` — the enum → plain-label mapping.

### `TextField` — `TextField.tsx` [pure, forwardRef]

- Labelled `<input>` (`text-base`), `hint`, `error`, `required`, `aria-invalid`
  / `aria-describedby`. Used with `{...register(...)}` (RHF) or controlled.

---

## C. Agent console (`src/features/agent/console/`) — 8 components

### `ConversationView` — `ConversationView.tsx` [client]

- **Purpose**: one continuous chat thread; the primary buyer entry point.
- **Where**: `/agent` (`src/app/agent/page.tsx`).
- **Props**: none.
- **State**: `messages[]` (role `you`/`assistant`, text, note, optional `run`),
  `draft`, `pending`, `error`, `understood` (accumulated `UserIntent` subset),
  refs for `turnCount` / `clarifications` / `commercialSeen`.
- **Events**: submit (Enter without Shift, or ↑ button); "Start a new request".
- **API**: `POST /api/conversation` per turn (+ `{reset:true}`).
- **Analytics**: `conversation_started`, `message_sent`, `intent_detected`,
  `intent_clarification_requested`, `intent_ready`.
- **Copy**: intro message; `Callout tone="info"` "Demo only — nothing here is
  saved."; "So far:" chip strip; placeholder "e.g. I need 500 flyers by Friday
  in Yaba".
- **Technical info**: none (the embedded `AgentConsole` carries the trace).
- **Loading**: `pending` disables the input, spins the send button.
- **Error**: an inline `role="alert"` `<p>`; the failed message is removed and
  the draft restored.
- **Empty**: the intro message is the empty state.
- **Responsive**: bubbles `max-w-[85%]`/`[90%]`; `rounded-2xl` with a squared
  corner per side.
- **A11y**: `aria-live="polite"` on the message list; `sr-only` label on the
  textarea.
- **Deps**: `AgentConsole` (embedded per message with a `run`), `Button`,
  `Callout`, `useAnalytics`, `isCommercialIntent`.

### `AgentConsole` — `AgentConsole.tsx` [client]

- **Purpose**: orchestrates one buyer-agent run — start, poll, correct, decide,
  restart.
- **Where**: embedded in `ConversationView` (`embedded`); also standalone-capable
  (unused route today).
- **Props**: `initialRun?`, `embedded?`.
- **State**: `request`, `run`, `phase` (`idle`/`starting`/`working`/`deciding`/
  `correcting`), `decidePending`, `problem` ({title, body, restart}),
  `reconnecting`; refs `pollRef`, `decisionRef`, `announcedRef`, `emitted` set.
- **Constants**: `POLL_MS = 1500`, `MAX_POLLS = 120`, `MAX_RECONNECTS = 5`.
- **Events**: start run, correct brief, decide (accept/decline), restart.
- **API**: `POST /api/agent/run`, `GET /api/agent/run/:id` (poll loop),
  `POST /api/agent/run/:id/approve`.
- **Analytics**: `discovery_started`, `results_shown`, `approval_viewed`,
  `approval_accepted`, `approval_declined`, `workflow_cancelled`,
  `exception_viewed`.
- **Copy**: `IntentInput` "What do you need?" / "Ask for something else"; the run
  card title `run.headline` while busy, "How it went" after; 3 example chips
  (`EXAMPLES`); "Demo — this conversation is not saved. Nothing is ordered
  without your approval."
- **Technical info**: only via `ActivityFeed` → `EngineeringTrace` (2 nested
  `<details>`).
- **Loading**: `Loader2` spinner; a `sr-only aria-live` line with `run.headline`
  / "Reconnecting to the agent."
- **Error**: `problem` `Callout tone="warning"` with `requestErrorCopy`; "Start
  again" button.
- **Responsive**: single column; buttons `sm:flex-row`.
- **A11y**: focus moves to `decisionRef` (`tabIndex=-1`) once `AWAITING_APPROVAL`;
  the single live-region.
- **Deps**: `StageList`, `UnderstandingCard`, `RecommendationPanel`,
  `ApprovalPanel`, `OutcomePanel`, `ActivityFeed`, `Card`, `Callout`, `Button`.

### `StageList` — `StageList.tsx` [pure]

- **Purpose**: the 7-stage semantic progress spine.
- **Props**: `stages: RunStage[]`.
- **Renders**: `<ol>`; each stage an icon (`Check`/`Loader2`/`PauseCircle`/`X`/
  `MinusCircle`/`CircleDashed`) + a label + a `sr-only` status word ("done", "in
  progress", "waiting", "needs you", "stopped here", "not needed", "not
  started") + an optional detail line.
- **A11y**: status by icon AND word, never colour alone; `active` stage spins
  (`motion-reduce:animate-none`).

### `UnderstandingCard` — `UnderstandingCard.tsx` [client]

- **Purpose**: "What I understood" + a correction editor.
- **Props**: `understanding`, `missing[]`, `editable`, `pending`, `onCorrect`,
  `startOpen`.
- **State**: `editing` (starts open if `startOpen`), per-field local state.
- **Events**: "Not quite right?" → editor; submit → `onCorrect(correction)` (only
  changed fields; the request text is carried forward — the buyer never
  retypes).
- **Copy**: "I'll use these instead of my own reading and pick up where I left
  off — you don't need to retype your request."; missing fields show "I still
  need this".
- **Fields**: How many (number), Paper size (select), Colour (select), Needed by
  (`type="date"`), Delivery/pick-up area (text).
- **Deps**: `TextField`, `SelectField`, `FLYER_SIZES`, `FLYER_COLOURS`.

### `RecommendationPanel` — `RecommendationPanel.tsx` [client]

- **Purpose**: the recommended offer — who / how much / how fast / why.
- **Props**: `run`.
- **Renders**: "Recommended" eyebrow + business name + a `StatusPill`
  ("fixed price"/"estimate"); big price + "Ready within {turnaround}"; a
  price-hold line; "Why this one?" (+ `✨ agent's reasoning` when `modelReasoned`)
  - `tradeoffs[]`; `Alternatives` (price/speed diff in words); `RuledOut`
    (`<details>`); `uncertainties` `Callout tone="unavailable"` "What I cannot
    confirm"; a `<details>` "Details" (quote issued/expires, price basis,
    confidence, delivery, **agent query fee**, "Printer last confirmed prices",
    service).
- **No score, no weights, no formula.**

### `ApprovalPanel` — `ApprovalPanel.tsx` [client]

- **THE HARD GATE.** Nothing abstracted.
- **Props**: `run`, `pending` (`ACCEPT`/`DECLINE`/`null`), `onDecide`.
- **State**: `declining` (shows a reason textarea), `reason`.
- **Renders**: `Card` with a primary-wash tint; "Before we go ahead"; a `dl`:
  Business / Service / **Total price** (+ "Fixed — the printer committed to this
  amount" or "An estimate — the final amount can still move") / Expected
  completion / Price held until / **Who you pay** ("{business}, directly" +
  "Intra never holds, sends or takes this money"); `finalOrderStatement`; the
  action button **names its consequence**: "Approve NGN 4,500 with Campus Print".
- **Binding**: the decision carries `run.recommendation.offerFingerprint`; a
  stale fingerprint is refused server-side.

### `OutcomePanel` — `OutcomePanel.tsx` [client]

- **Purpose**: what happened + what's next.
- **Props**: `run`, `onRestart`.
- **Variants**:
  - `Approved`: "Agreed with {name}", a 4-step `<ol>` (decision recorded / terms
    locked to this order / you send the message / you collect + confirm), a big
    "Open your order and copy the message" link → `/tasks/:id`, `Callout
tone="unavailable"` "Intra does not send that message and never pays the
    printer for you.", a `<details>` "Record details" (status + reference —
    "(simulated — not on a public chain)" when mock).
  - `Declined`: "You didn't go ahead. Nothing was ordered and no money moved…"
    - "Try a different request".
  - `Unsuccessful`: `outcomeCopy` title/body/recovery + "Nothing was ordered and
    no money moved." + "Try again".

### `ActivityFeed` — `ActivityFeed.tsx` [client]

- **Purpose**: "Who did what" narrative, with the engineering trace nested
  inside.
- **Props**: `run`.
- **Renders**: a `<details>` "What happened, step by step" → an `<ol>` of
  actor-badged lines (You / Agent / Printer / Intra); inside, `EngineeringTrace`
  is another `<details>` "Engineering trace ({n} events)" → run id, "Reasoning"
  (`provider/model · N calls` or "deterministic rules only"), quote task ids,
  and mono trace lines (`HH:MM:SS kind label Nms — detail`).
- Nothing in the primary narrative names a tool or an endpoint (`buildActivity`
  drops anything `looksTechnical`).

---

## D. Buyer task (`src/features/tasks/`)

### `TaskPage` — `TaskPage.tsx` [client] — ~1000 lines, the largest component

- **Purpose**: the buyer's whole task workspace.
- **Where**: `/tasks/[id]` (`src/app/tasks/[id]/page.tsx` passes `taskId`).
- **Props**: `taskId`.
- **State**: `sessionId`, `view` (`TaskViewDto`), `state`
  (`loading`/`ready`/`error`/`forbidden`/`missing`), refs for analytics.
- **API**: `GET /api/tasks/:id` (via `load`, re-called by every child's
  `onChanged`/`onDecided`).
- **Analytics**: `approval_viewed`, `workflow_waiting`, `workflow_completed`,
  `exception_viewed`, `approval_accepted`, `approval_declined`,
  `feedback_submitted`.
- **Renders (conditionally, in order)**:
  - `ResumeSignal` (fires `workflow_resumed` if `?ref=push`).
  - `SectionHeader` "Your request" / route name / "Created {relative}" + a
    `StatusPill` (`taskStatusLabel`).
  - **exception `Callout`** (`describeTaskException`) — headline / what happened
    / buyer's note (italic) / "What to do:" / what next / money note / "Send a
    new request".
  - `Card` "Your brief" — a `DataList` of `structuredInput` (`briefLabel` maps
    the keys) + a "Route freshness" row.
  - `Card` "The quote" (if a non-declined quote) — "Fixed price" / "Estimate —
    confirm before paying", "Entered by the printer or an Intra operator. Not
    independently checked by Intra.", Price / Delivery charge / Turnaround /
    Availability / Assumptions / Confidence / **Quote validity** (expired →
    "reconfirm the price before paying").
  - `RecommendationCard` (nested) — "Intra's read of this quote": Total incl.
    delivery / Per flyer / Turnaround; "Why this looks OK" list; "What Intra
    cannot confirm" list; `verificationNote` `Callout tone="unavailable"`.
  - `PriceChangePanel` (if `view.priceChange && supplier`).
  - `DecisionPanel` (nested, if `RECOMMENDED` + recommendation).
  - `PaymentReceipt` (nested, if `payments.length > 0`) — x402 fee card.
  - `PayPanel` (if `HANDOFF_READY` + `!handoffConfirmedAt` + `view.orderPayment`).
  - `HandoffCard` (nested, if `HANDOFF_READY` + recommendation +
    `contactChannelValue`).
  - `HandoverCodePanel` (if `HANDOFF_READY` + recommendation).
  - `BuyerPickupPanel` (if `handoffConfirmedAt` + `view.proofline`).
  - `OrderProblemPanel` (if `HANDOFF_READY` + `!handoffConfirmedAt`).
  - `Card` "Activity" — a `<ol>` of timeline events (`eventLabel` — never the
    dotted name).
  - `FeedbackForm` (nested, if `handoffConfirmedAt` || `FAILED` || `CANCELLED`).
- **Nested components**: `RecommendationCard`, `DecisionPanel`, `PaymentReceipt`,
  `HandoffCard`, `FeedbackForm` (all defined in the same file).
- **Loading**: `SectionHeader` + `LoadingPanel`.
- **Error/forbidden/missing**: `ErrorState` with the copy in [`01` J13] /
  "Request not found" / "Could not load this request." + "Try again".
- **Empty**: no true empty state (a task always has a brief).
- **Technical info visible**: `PaymentReceipt` shows `attributionTag`, atomic
  amounts, network labels, `shortHash`, explorer links, "via agent payment
  protocol" ([`00` §20 #5]). `HandoffCard` shows the raw contact value +
  `contactChannelType`.
- **Responsive**: everything stacks; `DataList` rows `sm:flex-row`.
- **A11y**: `role="alert"` on errors; buttons name their consequence;
  `aria-pressed` on the feedback toggle.

### `BuyerWorkPanel` — `BuyerWorkPanel.tsx` [client]

- **Purpose**: the buyer's active work, grouped into 5 plain buckets.
- **Where**: `/agent` and `/activity`.
- **State**: `view` (`BuyerWorkView`), `state` (`loading`/`ready`/`error`).
- **API**: `GET /api/tasks` → `listBuyerWork`.
- **Renders**: `GROUP_ORDER` = ATTENTION / READY / WAITING / IN_PROGRESS /
  COMPLETED; per group a header (label + count) and `WorkRow`s. Above:
  `PushPrompt` + `InstallPrompt` **only if `hasAsyncWork`** (any group ≠
  COMPLETED). A "{n} need you" counter.
- **`WorkRow`**: a `Link` to `/tasks/:id`; group icon (IN_PROGRESS spins), title,
  relative time, headline, an action pill (primary if `actionRequired`).
- **Loading**: "Loading your requests…". **Error**: "Could not load your
  requests." + "Try again". **Empty**: "No active requests yet — Tell me what
  you need above and I'll help you find a business and get a real price."
- **No internal status name is ever shown.**

### `RequestForm` — `RequestForm.tsx` [client]

- **Purpose**: the structured-brief path (`/request`).
- **State**: `brief`, `routes`, `pickedRouteId`, `phase`
  (`brief`/`loadingRoutes`/`pick`/`submitting`/`error`), `error`. RHF with
  `zodResolver(flyerPrintingInputSchema)`, `mode: "onBlur"`, `DEFAULT_VALUES`
  (A5 / 100 / full-colour).
- **API**: `GET /api/routes/active`, `POST /api/tasks`, `POST /api/tasks/:id/submit`.
- **Renders**: phase `brief` = the 5-field form + `Callout tone="info"` "You stay
  in control" + "Find a printing quote"; phase `pick` = a radio `fieldset` of
  printers (name / city / "replies within N min" / "Prices confirmed X ago") +
  "Send request & get a quote" + "Edit brief" + "Intra never sends an order or
  pays a printer for you."
- **Empty**: `EmptyState` "No printers are live yet" + "Edit my brief".
- **Error**: `Callout tone="warning"` "Could not send" / "That printer just went
  offline. Pick another…".
- **Responsive**: `grid-cols-1 sm:grid-cols-2` for size + copies.

### `OrderProblemPanel` — `OrderProblemPanel.tsx` [client]

- **Purpose**: the buyer's escape hatch on an agreed order.
- **Props**: `taskId`, `onChanged`.
- **State**: `open` (`cancel`/`handover`/`null`), `note`, `pending`, `error`.
- **API**: `POST /api/tasks/:id/cancel` or `.../handover-problem`.
- **Renders**: a `<details>` "Something wrong with this order?"; "Intra never
  held any money for this order, so there is nothing to refund here…"; two
  buttons opening an optional-note textarea.
- **Idempotency key**: `${action}-${taskId}-${Date.now()}` (a fresh key per
  attempt — deliberate, so a retry is a new attempt not a replay).

---

## E. Payments / MiniPay (`src/features/payments/minipay/`)

### `PayPanel` — `PayPanel.tsx` [client]

- **Purpose**: the buyer's order-payment surface.
- **Where**: `/tasks/:id` (before `HandoffCard`), only when `view.orderPayment`.
- **Props**: `taskId`, `businessName`, `orderSummary`, `initial`
  (`PublicOrderPayment | null`), `onChanged?`.
- **State**: via `useOrderPayment(taskId, initial)` — `{ payment, phase,
message, start, cancel }`.
- **Analytics**: `payment_method_viewed`, `minipay_available`,
  `payment_receipt_viewed`.
- **Renders**: see [`01` J8] for every phase. Key surfaces: a `Card` with a
  `Wallet` icon "Pay for your order"; a `DataList` (Business / Order / Amount NGN
  / "You'll pay {n} USDC" with the rate `hint` / "Goes to {short}"); a
  `pay` button whose label tracks the phase; "Your wallet will ask you to confirm
  this payment. The network fee is paid from your wallet balance."; a text
  "Cancel" while busy. Confirmed → a "Payment confirmed" `Card` + a `<details>`
  "Transaction details" → explorer link.
- **Loading**: the button label ("Preparing…" / "Waiting for your wallet…" /
  "Recording…"); `Callout tone="info"` "Payment submitted…".
- **Error**: `Callout tone="warning"` "The payment didn't go through…".
- **Unavailable**: `Callout tone="unavailable"` "Paying in the app isn't
  available for this order — {reason}. You can still send the WhatsApp message…".
- **No wallet**: `Callout tone="info"` "Open this order in MiniPay to pay the
  business directly from your wallet."

### `useOrderPayment` — `useOrderPayment.ts` [client hook]

- **Returns**: `{ payment, phase, message, start, cancel, refresh }`.
- **`PayPhase`**: `idle`/`creating`/`wallet`/`submitting`/`confirming`/
  `confirmed`/`cancelled`/`failed`.
- **Polling**: `POLL_MS = 2500`, `POLL_MAX = 40` (~100s → "Still checking with
  the network. You can close this and come back — the status is saved.").
- **On mount**: `refresh()` from server truth; if `SUBMITTED`/`CONFIRMING` fires
  `payment_resumed`.
- **`start()`**: create intent → `payOrder` (wallet) → `submit { txHash }` →
  poll. Catches `USER_REJECTED` → cancel the intent → phase `cancelled`.
- **Analytics**: `minipay_selected`, `wallet_request_started`, `wallet_approved`,
  `wallet_rejected`, `payment_submitted`.

### `wallet-adapter` — `wallet-adapter.ts` [client]

- **`payOrder(input)`** — the ONE place a wallet transaction is built. Lazy
  imports `viem` + `viem/chains`. Checks `chainId === celo.id`, attempts
  `wallet_switchEthereumChain`, builds an ERC-20 `transfer` via
  `encodeFunctionData(erc20Abi)`, `sendTransaction`, returns `{ txHash }`.
- **`WalletPayError`**: codes `WALLET_UNAVAILABLE` / `USER_REJECTED` /
  `WRONG_CHAIN` / `SEND_FAILED` — each with a plain-language message.

### `detect` — `detect.ts` [client]

- `isMiniPay()` (`window.ethereum?.isMiniPay === true`), `hasInjectedWallet()`,
  `paymentEnvironment()` (`minipay`/`injected`/`none`), `paymentMethod()`
  (`minipay`/`injected`/`whatsapp`). SSR-safe. **Cosmetic only** — decides
  affordance prominence, never whether a payment is allowed.

---

## F. Proofline (`src/features/proofline/`)

### `MerchantFulfilmentPanel` — `MerchantFulfilmentPanel.tsx` [client]

- **Where**: `/supplier/:slug/requests` "Handed-off orders".
- **Props**: `taskId`, `manageToken`, `proofline` (`ProoflineView`).
- **API**: `POST /api/tasks/:id/proofline/ready` (manage token) → `router.refresh()`.
- **Analytics**: `fulfillment_started`, `business_job_completed`.
- **Renders**: NOT_STARTED → "Mark ready for pickup"; MERCHANT_MARKED_READY →
  the 6-char pickup code in a bordered mono box + "Read this to the buyer at
  collection."; BUYER_CONFIRMED_PICKUP → `Callout tone="success"`. Always the
  `PROOFLINE_DISCLAIMER` `Callout tone="unavailable"` + an event list.

### `BuyerPickupPanel` — `BuyerPickupPanel.tsx` [client]

- **Where**: `/tasks/:id`, after `handoffConfirmedAt`.
- **Props**: `taskId`, `proofline`, `onChanged`.
- **API**: `POST /api/tasks/:id/proofline/confirm-pickup` (session or `{code}`).
- **Renders**: "Fulfilment evidence (Proofline pilot)"; ready → "Confirm I've
  collected this order" + a "Have a pickup code instead?" disclosure (a
  `TextField`, `autoCapitalize="characters"`); confirmed → `Callout
tone="success"`. Always the disclaimer.

---

## G. Attestation (`src/features/attestation/`)

### `HandoverCodePanel` — `HandoverCodePanel.tsx` [pure]

- **Where**: `/tasks/:id`, `HANDOFF_READY` + recommendation.
- **Props**: `code: string | null` (renders `null` if absent).
- **Renders**: "Your handover code" (🔑); "Say this to the business when you
  collect your order — it's how the record shows you were really there."; the
  code in a large mono box (`tracking-[0.2em]`).

### `HandoverAttestPanel` — `HandoverAttestPanel.tsx` [client]

- **Where**: `/supplier/:slug/requests` "Handed-off orders".
- **Props**: `taskId`, `manageToken`, `handover` (`HandoverPublicView | null`).
- **State**: `code`, `stage` (`code`/`connecting`/`signing`/`submitting`/`null`),
  `error`.
- **API**: `POST /api/tasks/:id/handover/sign-request {code}`,
  `POST /api/tasks/:id/handover/submit {signature}`. Direct `window.ethereum`
  calls (`eth_requestAccounts`, `eth_signTypedData_v4`).
- **Analytics**: `handover_started`, `handover_completed { mode }`.
- **Renders**: "Confirm handover" (`ShieldCheck`); "Ask the customer for the code
  they were given, then confirm that this job was handed over. This confirmation
  will be recorded as part of the transaction history."; a `TextField` "Code from
  the customer"; a button whose label tracks `stage`. ATTESTED → `Callout
tone="success"` "Handover confirmed. Recorded on {date}." + "(Simulated — not
  on any real network.)" or "View the record". ATTESTATION_FAILED → "That didn't
  go through. You can try again without re-asking for the code."
- **Error**: "This needs a wallet in this browser (like MetaMask or Valora)…" /
  "Connect the wallet for this business's on-file payout address…".

---

## H. Quotes (`src/features/quotes/`)

### `PriceChangePanel` — `PriceChangePanel.tsx` [client]

- **Where**: `/tasks/:id`, when `view.priceChange && supplier`.
- **Props**: `taskId`, `change` (`PriceChangeDto`), `businessName`, `onDecided`.
- **API**: `POST /api/tasks/:id/price-change {decision}`.
- **Renders**: a `warning`-tinted `Card`; "{business} wants to change the price"
  (⚠); a money sentence ("You agreed NGN 4,500. They are asking for NGN 5,200 —
  NGN 700 more."); a `dl` (You agreed / They are asking / New turnaround / Their
  reason / Asked); `Callout tone="unavailable"` "Until you choose, the price you
  originally agreed still stands. Nothing has changed and no money has moved.";
  two buttons ("Accept NGN 5,200" / "Keep the price I agreed").

---

## I. Supplier (`src/features/supplier/`)

### `QuoteResponseForm` — `QuoteResponseForm.tsx` [client]

- **Where**: `/supplier/:slug/requests` per incoming request.
- **Props**: `routeId`, `taskId`, `manageToken`, `currency`.
- **State**: `mode` (`quote`/`decline`), `priceType` (`fixed`/`range`), `values`
  (10 fields), `errors`, `phase` (`idle`/`pending`/`done`/`error`), `formError`.
- **API**: `POST /api/routes/:id/quotes` (manage token) → `router.refresh()`.
- **Analytics**: `request_opened`, `quote_started`, `quote_sent`,
  `request_declined`.
- **Renders**: a "Send a quote" / "Decline" toggle; quote mode = Price type
  select + amount(s) + Turnaround + "Quote valid until" (`datetime-local`) + a
  `<details>` "Add more detail (optional)" (Delivery charge, Availability note,
  Assumptions, Confidence select) + `Callout tone="info"` "How the buyer sees
  this — … Intra does not independently verify them."; decline mode = "Reason
  for declining" (required).
- **Done**: `Callout tone="success"` "Quote sent" / "Request declined".
- **Error**: `Callout tone="warning"` "Could not send".
- **Technical info visible ([`02` P2])**: `fixed`/`range`, `confidence`
  low/med/high, `datetime-local`.

### `ChangePriceForm` — `ChangePriceForm.tsx` [client]

- **Where**: `/supplier/:slug/requests` "Prices you have sent".
- **Props**: `routeId`, `taskId`, `manageToken`, `currency`, `currentAmount`,
  `alreadyAgreed`.
- **API**: `POST /api/routes/:id/quotes {revise:true}` → `router.refresh()`.
- **Analytics**: `price_change_started`, `price_change_submitted`.
- **Renders**: "Change this price" → a form: "You quoted {amount}." + a copy
  block that differs by `alreadyAgreed` ("This customer has already agreed that
  price, so your new one is a request they must accept." vs "They have not agreed
  yet, so your new price replaces the old one."); New amount + Turnaround + a
  **required** "Why is it changing?" ("The customer sees this in your own
  words.").
- **Done**: `Callout tone="success"` "Price change sent" + the outcome sentence.

### `EditPublishedPriceForm` — `EditPublishedPriceForm.tsx` [client]

- **Where**: `/supplier/:slug` per route.
- **Props**: `routeId`, `manageToken`, `currency`, `model`, `amount`, `unit`.
- **API**: `PATCH /api/routes/:id/pricing` → `router.refresh()`.
- **Analytics**: `pricing_configured`.
- **Renders**: "Edit this price" → a form: "How you price it" select (`PRICING_MODELS`),
  Amount + "What it covers"; `Callout tone="info"` "This is the price customers
  see before they ask. Any job someone has already agreed keeps the price you
  agreed — this does not change a quote."
- **Done**: "Saved." inline.

### `PauseRouteButton` — `PauseRouteButton.tsx` [client]

- **Where**: `/supplier/:slug/review` per ACTIVE route.
- **Props**: `routeId`, `manageToken`, `disabled?`.
- **API**: `PATCH /api/routes/:id/status {status:"PAUSED"}` → `router.refresh()`.
- **Renders**: "Pause route" (`PauseCircle`) → a confirm step ("Pause this route
  now? Buyers cannot send new requests until an operator reactivates it.") →
  "Yes, pause route" / "Keep it live".

---

## J. Businesses (`src/features/businesses/`)

### `QuickStartForm` — `QuickStartForm.tsx` [client]

- **Where**: `/supplier/onboard`.
- **State**: `pricingModel`, `pending`, `error`, `fieldErrors`, `created`
  (`Created | null`). Uses raw `FormData` (not RHF).
- **API**: `POST /api/businesses/quick-start`.
- **Analytics**: `business_onboarding_started` (on first `onInput`),
  `identifyBusiness`, `business_onboarding_completed`.
- **Renders**: 3 `Card`s (Your business / Your first service / Where and who); a
  `fieldset` of 3 pricing radio cards; a consent `CheckboxField`; "Set up my
  business"; "No card, no wallet, and no private keys — ever. An operator checks
  your details before customers can reach you."
- **Success (`created`)**: "{business} is set up" `Card` + "Open your workspace"
  → `created.manageUrl` + `Callout tone="info"` "Keep this link…".
- **Error**: `INVALID_BODY` → `fieldErrors` flattened + "Check the highlighted
  fields."; else `Callout tone="warning"` "Not quite".

### `OnboardingForm` — `OnboardingForm.tsx` [client] — 4-step wizard

- **Where**: `/supplier/onboard/full`.
- **State**: `step` (0–3), `draft` (`OnboardingDraft | null`), `submitError`. RHF
  with `zodResolver(businessOnboardingSchema)`, `mode: "onBlur"`; `trigger(STEP_FIELDS[step])`
  gates "Continue"; `watch` for `category`/`contactChannelType`/`wantsPaidQueries`.
- **API**: **NONE** — `onSubmit` only calls `setDraft(buildOnboardingDraft(values))`.
- **Renders**: a 4-dot progress rail; step fieldsets (Business / Area & hours /
  Your service [+ a live template preview] / Consent [+ the `wantsPaidQueries`
  checkbox → conditional payout `TextField`]); "Preview my Capability Card".
- **Result**: `DraftRoutePreview`.
- **Copy**: "This creates a **draft**. It does not publish a route, accept
  payment, or send any message to a customer."

### `DraftRoutePreview` — `DraftRoutePreview.tsx` [pure]

- **Props**: `draft` (`OnboardingDraft`), `onStartOver`.
- **Renders**: "Your Capability Card — This is what an AI agent would see once
  your service is active. Nothing is saved or submitted yet."; `Callout
tone="warning"` "Draft — not live"; the card (`dl`); "An agent must send"
  (template fields); "Public to agents once active" vs "Stays private"; a
  lifecycle explainer; `Callout tone="info"` "This is not an AI agent"; a "Next
  step" block ("Send these answers to your Intra operator…") + a `<details>` "View
  the raw route payload (for your operator)" showing `JSON.stringify(draft.route)`;
  "Start over".
- **The dead end** ([`00` §20 #3]).

---

## K. Operator (`src/features/operator/`)

### `OperatorConsole` — `OperatorConsole.tsx` [client] + `OperatorRouteCard`

- **Where**: `/operator`.
- **State**: `operatorKey`, `keyDraft`, `items` (`QueueItem[]`), `status`
  (`idle`/`loading`/`ready`/`error`), `loadError`, `tab`
  (`queue`/`metrics`/`evidence`). Key in `sessionStorage` (`intra.operatorKey`).
- **API**: `GET /api/operator/routes`.
- **Renders**: sign-in `Card` (`type="password"`, "held only for this browser
  session and never stored on a server or logged"); a "Operating as verified
  operator" line + "Sign out"; a 3-tab `role="tablist"`; then per tab.
- **`OperatorRouteCard`**: business name / route name · city / a `StatusPill`
  (`route.status.replace(/_/g," ")` — near-raw); a `DataList` (Consent / Order
  channel / Query fee · SLA / Last updated); if `canActivate` a `fieldset`
  "Confirm before activation" with the 6 `ACTIVATION_CHECK_LABELS` checkboxes;
  "Verify and activate" (disabled until `allChecked`) / "Reactivate route" /
  "Pause route".
- **Loading**: `LoadingPanel`. **Error**: `ErrorState` "Could not load the queue"
  - "That operator key was not accepted." **Empty**: `EmptyState` "Nothing needs
    review".

### `MetricsPanel` — `MetricsPanel.tsx` [client]

- **API**: `GET /api/operator/metrics`.
- **Renders**: Export CSV / JSON / Refresh + `EvidenceView` (with
  `recentEvents`).

### `EvidencePanel` — `EvidencePanel.tsx` [client] + `TraceView`

- **API**: `GET /api/operator/evidence/:taskId`.
- **Renders**: a task-id `input` (mono) + "Trace" button → `TraceView`:
  `Callout tone="warning"` "Contains simulated records" (if any); `Card`s
  Transaction / Provider / Commitment attestation / Handover attestation /
  Service payments / Consistency cross-check / Timeline; the disclaimer.
- **Technical info visible ([`02` P3])**: raw enums, `attestationMode: "mock"`,
  schema UIDs, "MISMATCH", `Ref` mono strings + explorer links.

---

## L. Metrics (`src/features/metrics/`)

### `EvidenceView` — `EvidenceView.tsx` [pure]

- **Where**: `/evidence` (public) and `/operator` Metrics tab.
- **Props**: `report` (`EvidenceReport`), `recentEvents?`.
- **Renders**: `Zone` sections — "Real results" (a targets-vs-actual `<table>` +
  a `SnapshotBody` detail card, or `Callout tone="info"` "No real activity
  recorded yet"); "Demo data" (dashed border, `SnapshotBody`); "Unavailable &
  external integrations" (`IntegrationList` with `StatusPill` states); "What
  changed from feedback" (`Card`s per entry); "Recent activity" (operator only);
  a "How these numbers are produced" `<details>`.
- **`SnapshotBody`**: a `DataList` — Participating businesses / Quote routes
  (active·paused·fresh·stale) / Independent buyer sessions / Returning buyers /
  Session task spread / Tasks / Quote requests completed / Handoffs confirmed /
  Supplier quotes / Quote-response latency (median·p90·range) / Route pause·
  activation events / Buyer feedback / Verified Celo settlements.

---

## M. Notifications (`src/features/notifications/`)

### `ActionCentre` — `ActionCentre.tsx` [client] + `NotificationRow`

- **Where**: `/activity`; `/supplier/:slug` ("What needs you"); `/supplier/:slug/requests`.
- **Props**: `authQuery?` (business auth as a query string; omit for a buyer),
  `heading?` (default "Activity").
- **State**: `view` (`ActionCentreView` — `needsAttention[]`, `updates[]`,
  `unread`), `state`.
- **API**: `GET /api/notifications`, `POST .../:id/read`, `.../read-all`.
- **Analytics**: `notification_opened`.
- **Renders**: an unread badge + "Mark all as read"; two sections ("Needs your
  attention" / "Updates"); `NotificationRow` = a `Link` to `item.deeplink`
  (marks read optimistically on click) with a level badge (`LEVEL_STYLE`:
  ACTION_REQUIRED / TIME_SENSITIVE / INFORMATIONAL / COMPLETED), an "Unread"
  dot, a relative time, title, body.
- **Empty**: `EmptyState` "Nothing needs you right now".
- **A11y**: reading is optimistic and never blocks following the link.

### `NotificationSettings` — `NotificationSettings.tsx` [client]

- **Where**: `/activity`; `/supplier/:slug`.
- **Props**: `authQuery?`.
- **State**: via `usePushSetup({ authQuery })`.
- **Renders**: "Notifications while you're away" + a `BellRing`/`BellOff` icon;
  one of: "This browser can't send notifications…" / "Off-tab notifications
  aren't set up on this deployment yet…" / "You've blocked notifications for
  Intra…" / two switches ("Notify me when something needs my attention" +
  "Also send the quieter updates").

---

## N. PWA (`src/features/pwa/`)

### `ServiceWorker` — `ServiceWorker.tsx` [client]

- **Where**: `layout.tsx`.
- **Purpose**: registers `/sw.js` on `load`; handles updates + SW navigation
  messages.
- **State**: `waiting` (a waiting `ServiceWorker`).
- **Renders**: `null`, or a banner "A new version of Intra is ready. Update now"
  (`postMessage({type:"SKIP_WAITING"})` → `controllerchange` → reload).
- Handles `message` `{type:"NAVIGATE", href}` → `router.push`.

### `InstallPrompt` — `InstallPrompt.tsx` [client]

- **Where**: `BuyerWorkPanel` (only if `hasAsyncWork`).
- **State**: `deferred` (`BeforeInstallPromptEvent`), `dismissed`
  (`localStorage` `intra.installPromptDismissed`), `standalone`.
- **Renders**: `null` unless `canInstall || iosHint`; a card "Add Intra to your
  home screen so we can let you know when something needs your attention…" +
  "Add to home screen" / "Not now" / a dismiss `X`; iOS Safari → "Tap [Share]
  then 'Add to Home Screen'."
- **Pilot pings**: `pwa_install_prompted`/`accepted`/`dismissed`.

### `PushPrompt` — `PushPrompt.tsx` [client]

- **Where**: `BuyerWorkPanel` (if `hasAsyncWork`); `/supplier/:slug` (if
  `incoming||quoted > 0`).
- **Props**: `reason` (a sentence), `authQuery?`.
- **State**: via `usePushSetup`; `dismissed` (`localStorage`
  `intra.pushPromptDismissed`), `prompted`.
- **Renders**: `null` unless `available && permission==="default" && !subscribed
&& !dismissed`; a blue card "{reason} Want us to notify you when something
  needs you — even if this tab is closed?" + "Enable notifications" / "Not now" /
  a dismiss `X`.

### `ResumeSignal` — `ResumeSignal.tsx` [client]

- **Where**: `/tasks/:id`, `/supplier/:slug/requests`.
- **Purpose**: fires `pilotPing("workflow_resumed")` + `analytics.track` once per
  load when `?ref=push` is present.
- **Renders**: `null`.

### `usePushSetup` — `usePushSetup.ts` [client hook]

- **Returns**: `{ permission (unsupported/default/granted/denied), available,
subscribed, busy, error, preference, enable, disable, setInformational }`.
- **API**: `GET /api/push/config`, `POST /api/push/subscribe`, `.../unsubscribe`,
  `PATCH /api/notifications/preferences`.

---

## O. Analytics (`src/features/analytics/`)

### `AnalyticsProvider` — `AnalyticsProvider.tsx` [client]

- **Where**: `layout.tsx`. Renders `null`.
- Initialises the Amplitude SDK once per load; derives role from the path
  (`/supplier/*` → business, `/operator/*` → operator [not identified], else
  buyer); identifies the buyer session; fires `app_opened`.

### `AnalyticsBusinessIdentity` — `AnalyticsBusinessIdentity.tsx` [client]

- **Where**: `/supplier/:slug` (when `canManage`), `/supplier/:slug/requests`.
- Calls `identifyBusiness(businessId)` once the server resolved the id. Renders
  `null`.

### `useAnalytics(role)` — `useAnalytics.ts` [client hook]

- **Returns**: `{ track, identifyBuyer, identifyBusiness, reset }`. Every method
  is a no-op-safe wrapper; the adapter swallows failures.

---

## P. Responsive / mobile-only / desktop-only

There are **no** components gated purely by viewport. The patterns:

- **Mobile-only visibility**: none (nothing is `hidden sm:block`).
- **Desktop-only visibility**: the `Header` CTA ("Join as a business") is
  `hidden … sm:inline-flex`; `OnboardingForm` step-helper text is
  `hidden … sm:block`.
- **Layout shifts** (`sm:` = 640px):
  - `Header`: nav `gap-x-3 → sm:gap-x-5`; CTA appears.
  - `SectionHeader`: `flex-wrap items-end`.
  - `DataRow`: `flex-col → sm:flex-row sm:justify-between`.
  - Forms: `grid-cols-1 → sm:grid-cols-2` for paired fields.
  - Buttons: `w-full → sm:w-auto`; button groups `flex-col → sm:flex-row`.
  - `page.tsx` hero: `lg:grid-cols-[1.2fr_0.8fr]`.
- **Device-capability gating** (not viewport): `PayPanel` shows the wallet button
  only if `hasInjectedWallet()`; `HandoverAttestPanel` requires `window.ethereum`;
  `InstallPrompt` / `PushPrompt` gate on `beforeinstallprompt` /
  `Notification` support and `hasAsyncWork`.

---

## Q. Component dependency graph (high level)

```
layout.tsx
 ├─ ServiceWorker, AnalyticsProvider, OfflineBanner   (all render null / a banner)
 ├─ Header (site.ts)
 ├─ MainContainer → {page}
 └─ Footer

/agent           → ConversationView ─┬─ AgentConsole (embedded, per run)
                 → BuyerWorkPanel     │    ├─ StageList
                                      │    ├─ UnderstandingCard → TextField, SelectField
                                      │    ├─ RecommendationPanel → StatusPill, Callout
                                      │    ├─ ApprovalPanel → Button
                                      │    ├─ OutcomePanel → Callout, Button
                                      │    └─ ActivityFeed → EngineeringTrace
                                      └─ (PushPrompt, InstallPrompt via BuyerWorkPanel)

/tasks/[id]      → TaskPage
                    ├─ RecommendationCard, DecisionPanel, PaymentReceipt,
                    │  HandoffCard, FeedbackForm            (all in-file)
                    ├─ PayPanel → useOrderPayment → wallet-adapter, detect
                    ├─ PriceChangePanel
                    ├─ HandoverCodePanel
                    ├─ BuyerPickupPanel
                    ├─ OrderProblemPanel
                    └─ ResumeSignal

/supplier/[slug]           [RSC] → getSupplierWorkspace
                    ├─ AnalyticsBusinessIdentity, PushPrompt, ActionCentre,
                    │  NotificationSettings
                    └─ EditPublishedPriceForm

/supplier/[slug]/requests  [RSC]
                    ├─ ResumeSignal, AnalyticsBusinessIdentity
                    ├─ QuoteResponseForm  (incoming)
                    ├─ ChangePriceForm    (quoted)
                    └─ MerchantFulfilmentPanel + HandoverAttestPanel  (handed-off)

/supplier/[slug]/review    [RSC] → PauseRouteButton

/operator        → OperatorConsole
                    ├─ OperatorRouteCard
                    ├─ MetricsPanel  → EvidenceView
                    └─ EvidencePanel → TraceView

/evidence        [RSC] → EvidenceView
/activity        → ActionCentre, NotificationSettings, BuyerWorkPanel
/request         → RequestForm
/supplier/onboard      → QuickStartForm
/supplier/onboard/full → OnboardingForm → DraftRoutePreview
/docs, /, /offline     → static
```

**Shared primitives used by ≥ 5 feature components**: `Button` (all forms),
`Callout` (everywhere), `Card`/`CardTitle`/`SectionHeader`, `DataList`/`DataRow`,
`useAnalytics`, `apiRequest`, `getSessionId`, `formatMoney`/`relativeTime`/
`formatDateTime`.
