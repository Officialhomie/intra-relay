# 01 — User Journeys

> Every meaningful journey the codebase represents, reverse-engineered from the
> actual routes, components, services and state machines. **Current behaviour
> only — nothing is redesigned or simplified.** Each journey uses the notation:
>
> ```
> USER INTENT → UI ACTION → SYSTEM ACTION → STATE CHANGE → USER FEEDBACK → NEXT DECISION
> ```
>
> Source anchors are given per journey. Companion: [`00-MASTER-XRAY.md`](00-MASTER-XRAY.md),
> [`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md).

---

## Index

| #   | Journey                                                   | Actor            | Entry                            |
| --- | --------------------------------------------------------- | ---------------- | -------------------------------- |
| J1  | New buyer — conversational path                           | buyer            | `/agent`                         |
| J2  | New buyer — structured-form path                          | buyer            | `/request`                       |
| J3  | Returning buyer — persisted work, no notification         | buyer            | `/agent` or `/activity`          |
| J4  | Returning buyer — via push notification / deep link       | buyer            | push → `/tasks/:id?ref=push`     |
| J5  | Returning buyer — PWA cold launch                         | buyer            | installed icon → `/agent`        |
| J6  | Buyer accepts the quote → handoff → confirm → feedback    | buyer            | `/tasks/:id`                     |
| J7  | Buyer declines the quote                                  | buyer            | `/tasks/:id` or agent console    |
| J8  | Buyer pays the order via MiniPay                          | buyer            | `/tasks/:id` `PayPanel`          |
| J9  | Buyer decides on a proposed price change                  | buyer            | `/tasks/:id` `PriceChangePanel`  |
| J10 | Buyer confirms pickup (Proofline)                         | buyer            | `/tasks/:id` `BuyerPickupPanel`  |
| J11 | Buyer gives the merchant the handover code                | buyer            | in person + `/tasks/:id`         |
| J12 | Buyer cancels an agreed order / reports a failed handover | buyer            | `/tasks/:id` `OrderProblemPanel` |
| J13 | Buyer whose task "belongs to another device"              | buyer            | `/tasks/:id` — dead end          |
| J14 | Interrupted / failed agent run                            | buyer            | `/agent`                         |
| J15 | New business — quick-start (one screen)                   | business         | `/supplier/onboard`              |
| J16 | New business — full form (draft only)                     | business         | `/supplier/onboard/full`         |
| J17 | Returning business — manage link                          | business         | `/supplier/:slug?t=`             |
| J18 | Business sends a quote / declines a request               | business         | `/supplier/:slug/requests?t=`    |
| J19 | Business revises a price (before vs after acceptance)     | business         | `/supplier/:slug/requests?t=`    |
| J20 | Business edits its published price                        | business         | `/supplier/:slug?t=`             |
| J21 | Business pauses a route                                   | business         | `/supplier/:slug/review?t=`      |
| J22 | Business marks an order ready + reads the pickup code     | business         | `/supplier/:slug/requests?t=`    |
| J23 | Business signs a handover attestation                     | business         | `/supplier/:slug/requests?t=`    |
| J24 | Business without a manage link                            | business         | `/supplier/:slug`                |
| J25 | Operator verifies + activates a route                     | operator         | `/operator`                      |
| J26 | Operator pauses a route                                   | operator         | `/operator`                      |
| J27 | Operator responds to a request for a business             | operator         | `POST /api/routes/:id/quotes`    |
| J28 | Operator reviews metrics / evidence / traces a task       | operator         | `/operator`                      |
| J29 | Machine agent — read capabilities, request a quote        | agent            | `GET/POST /v1/...`               |
| J30 | Offline / connectivity loss                               | any              | any                              |
| J31 | Supplier withdraws or cannot fulfil an order              | business + buyer | `POST /api/routes/:id/quotes`    |
| J32 | Completed transaction (full happy path, all layers)       | buyer + business | end-to-end                       |

---

## J1 — New buyer, conversational path

**Entry point.** `/agent` (`src/app/agent/page.tsx`). Also the PWA `start_url`
and the landing-page CTA "I need something made" (`src/app/page.tsx:48`).

**User goal.** "I need 500 flyers by Friday — what will it cost and who can do
it?"

**First action.** Types a free-text message into the `ConversationView` textarea
(`src/features/agent/console/ConversationView.tsx:268`) and presses ↑ / Enter.

**Screens / views.** `/agent` only — the whole flow happens inline in one
thread. `ConversationView` → (on complete intent) an embedded `AgentConsole` →
(after approval) a link to `/tasks/:id`.

**Information presented.**

- Intro message: "Hi — tell me what you need and I'll find a business on Intra
  that can do it, get you a real price, and let you decide. I never send an
  order or pay for you." (`ConversationView.tsx:77`)
- A persistent `Callout tone="info"`: "Demo only — nothing here is saved."
- After each turn: the assistant's reply, an optional `optimizationNote`, and a
  "So far:" chip strip summarising what was understood
  (`summariseUnderstanding`, `ConversationView.tsx:196`).
- `BuyerWorkPanel` below the fold (`src/app/agent/page.tsx:43`) — the person's
  existing requests, grouped.

**Information requested.** Only what the intent layer still needs. `routeReading`
(`src/features/intent/routing.ts`) asks for the missing `UserIntent` fields
(`service`, `quantity`, `size`, `colour`, `deadline`, `location` for printing —
`src/features/intent/domain.ts:44`).

**User decisions.**

1. Keep talking / clarify vs. accept the assistant's reading.
2. When the agent stops: `UnderstandingCard` "Not quite right?" — correct the
   brief or proceed.
3. `ApprovalPanel` — approve the recommended offer, or decline (with an optional
   reason).

**Automated actions.**

- `POST /api/conversation` per turn → `handleConversationTurn`
  (`src/features/intent/conversation.ts:109`): classify (deterministic pattern
  match), merge into accumulated `UserIntent`, route, remember the turn in an
  in-memory `Map`.
- On `START_RUN`: `startAgentRun` (`src/features/agent/run/service.ts:146`)
  creates an in-memory run, generates an `agent:<rand>` session, and (via
  `after()`) executes the run past the HTTP response.

**AI actions.** If `ANTHROPIC_API_KEY` is set: `runBuyerAgentAssisted`
(`src/features/agent/runtime/assisted.ts`) — the model understands intent, plans
which providers to quote, picks an offer + writes the rationale, replans on a
dead end. Bounded (≤ 4 calls, ≤ 700 tokens, 12 s). Any failure → silent fallback
to the deterministic loop. Without the key, the run is fully deterministic.

**Server-side actions.** The agent's tools call the app's own `/v1` and `/api`
surface via `AgentHttpClient` (`src/features/agent/tools/client.ts`). Real DB
rows are written for the task, quotes, decision and commitment by the existing
services; the run's ranked offers / trace stay in the non-persistent store.

**State transitions.** Conversation intent progresses CONVERSATION → … →
QUOTE_REQUEST. Run status `RUNNING` → `AWAITING_APPROVAL` (or
`CLARIFICATION_NEEDED` / `NO_VIABLE_OFFER` / `FAILED`). On approve: `APPROVED`,
and the underlying task moves `RECOMMENDED → HANDOFF_READY`, a `commitments` row
is created `PENDING_ATTESTATION`.

**Notifications.** On the run's underlying quote requests: the business audience
gets "New customer request". On approval: the business gets "A customer accepted
your quote" and the buyer gets "Your order is ready to send".

**Background / async work.** The agent run continues server-side after the
response; the client polls `GET /api/agent/run/:id` every 1.5 s
(`AgentConsole.tsx:45`, `poll`). Quote waiting is genuinely asynchronous —
"Printers answer as people, not APIs" (`stages.ts:193`).

**Exit conditions.** Approve → `OutcomePanel` `Approved` with a big "Open your
order and copy the message" button → `/tasks/:id`. Decline → `Declined` "Nothing
was ordered and no money moved". Dead end → `Unsuccessful` with a benign
`outcomeCopy` + "Try again".

**Success state.** `OutcomePanel` `Approved`: "Agreed with {business}", a 4-step
checklist (decision recorded / terms locked / you send the message / you collect
and confirm), and the link to the task workspace.

**Failure states.** `CLARIFICATION_NEEDED` (model asked a question →
`UnderstandingCard` opens), `NO_VIABLE_OFFER`, `FAILED`, run expired (30 min),
run taking too long (> 120 polls), transient poll failure (quiet reconnect).

**Recovery path.** "Start again" / "Try again" from the `Callout` or
`OutcomePanel`; the request text is preserved (`copy.ts:628` "Your request text
is still here"). "Start a new request" in `ConversationView` clears the thread
via `POST /api/conversation {reset:true}` — this cannot touch existing orders.

**Re-entry point.** `/agent` (thread is gone on reload — not persisted);
`BuyerWorkPanel` and `/activity` show the task that survived.

**What the user must understand.** That they make the final decision; that they
send the WhatsApp message themselves; that the conversation is not saved.

**What the user does NOT need to understand.** Intent classification, provider
discovery, capability reads, x402 query fees, quote scoring, `offerFingerprint`,
the internal 13-state machine (collapsed to a 7-stage spine), the run store TTL
mechanics, whether a model or rules produced the rationale.

---

## J2 — New buyer, structured-form path

**Entry point.** `/request` (`src/app/request/page.tsx`). **Orphaned — not
linked from anywhere in the app** (a `grep` for `/request` across `src` finds
only `/supplier/:slug/requests`, a different route; both landing CTAs point at
`/agent`). Reachable only by typing the URL. Documented here because the route,
the page, `RequestForm`, and its tests are all live code.

**User goal.** Same as J1, but the user wants a form.

**First action.** Fills the `RequestForm` (`src/features/tasks/RequestForm.tsx`):
Paper size (select, default A5), Number of copies (number, default 100), Colour
(select, default full-colour), Needed by (text, "Friday 3pm"), Delivery/pick-up
area (text, "UNILAG main gate").

**Screens.** Two phases in one route: `phase="brief"` (the form) →
`phase="pick"` (radio list of printers).

**Information presented.** Validation is `zodResolver(flyerPrintingInputSchema)`

- `mode: "onBlur"` — inline plain-language errors ("Choose a paper size", "At
  least 1 copy"). A `Callout tone="info"` "You stay in control". After submit: a
  `fieldset` radio list of active printers with name, city/country, "replies
  within N min", "Prices confirmed X ago".

**Information requested.** The 5 brief fields, then which printer.

**User decisions.** (1) The brief values. (2) Which printer.

**Automated actions.**

- `onBriefSubmit` → `apiRequest("/api/routes/active")` (`GET /api/routes/active`,
  filtered to `routeSlug=flyer-printing`, `status=ACTIVE`).
- `submitRequest` → `POST /api/tasks` (`createTask`, task `DRAFT`, route bound)
  then `POST /api/tasks/:id/submit` (`submitTask`).

**AI actions.** None — this path has no agent run.

**Server-side actions.** `submitTask` (`src/features/tasks/service.ts:123`):
validates the brief, re-checks the route is `ACTIVE` (else task → `FAILED`,
`409 ROUTE_UNAVAILABLE`), moves `SUBMITTED → AWAITING_QUOTE`, appends audit
events, `notify("task.awaiting_quote")`, forwards `request_received` analytics,
records an `UNAVAILABLE` `service_payments` row.

**State transitions.** task `DRAFT → SUBMITTED → AWAITING_QUOTE`.

**Notifications.** Business audience: "New customer request".

**Background / async work.** None on this path — the user is redirected to
`/tasks/:id` and polls there.

**Exit conditions.** `router.push('/tasks/:id')` on success.

**Success state.** The task page loads showing the brief and "Waiting for a
price".

**Failure states.** "No printers are live yet" `EmptyState` if
`routes.length === 0` (likely first-run). `ROUTE_UNAVAILABLE` → "That printer
just went offline. Pick another, or try again shortly." Network error → "Could
not load available printers."

**Recovery path.** "Edit my brief" / "Edit brief" buttons return to
`phase="brief"`.

**Re-entry point.** `/tasks/:id`.

**What the user must understand.** That a real printer reviews the brief
asynchronously; that they approve any order themselves.

**What the user does NOT need to understand.** The task lifecycle, the audit
trail, that a `service_payments` row was written, route freshness math.

---

## J3 — Returning buyer, persisted work, no notification

**Entry point.** `/agent` or `/activity` on the same device (localStorage
`intra.sessionId` intact).

**User goal.** "What's happening with my requests?"

**First action.** Opens `/agent`; scrolls to `BuyerWorkPanel`, or taps the
"Activity" pill → `/activity`.

**Screens.** `/agent` (`ConversationView` + `BuyerWorkPanel`) or `/activity`
(`ActionCentre` + `NotificationSettings` + `BuyerWorkPanel`).

**Information presented.** `BuyerWorkPanel` (`src/features/tasks/BuyerWorkPanel.tsx`)
reads `GET /api/tasks` → `listBuyerWork` and groups every task into 5 buckets
(`src/features/tasks/work.ts`): **Needs your attention / Ready / Waiting / In
progress / Completed**. Each row: title ("500 flyers"), a one-sentence headline
("A quote is ready for your decision."), a relative timestamp, and an action
pill ("Review", "Open and send", "Confirm pickup"). A "{n} need you" counter.

**User decisions.** Which task to open; whether to act now.

**Automated actions.** `listBuyerWork` joins tasks → routes → businesses,
computes `changePending` and Proofline status for open tasks, derives the group

- headline + action per task (`derive()`).

**State transitions.** None — read-only.

**Exit conditions.** Tap a row → `/tasks/:id`.

**Success state.** N/A (informational surface). Empty state: "No active requests
yet — Tell me what you need above…"

**Failure states.** "Could not load your requests." + "Try again".

**Re-entry point.** `/tasks/:id`.

**What the user must understand.** The 5 plain buckets; that "Needs your
attention" means an action is required.

**What the user does NOT need to understand.** Any internal status enum (the
panel never shows one), the run store, the audit trail.

---

## J4 — Returning buyer via a push notification / deep link

**Entry point.** A browser/OS push notification. `sw.js` `notificationclick`
(`public/sw.js:135`) focuses/opens a window at the notification's `data.url`
with `?ref=push` appended.

**User goal.** Respond to whatever the notification said ("A quote is ready for
your decision").

**First action.** Taps the notification.

**Screens.** Lands directly on the deeplink — usually `/tasks/:id` (buyer) or
`/supplier/:slug/requests?...&task=:id` (business).

**Information presented.** The push payload carried only `{ title, body, url,
tag }` — no id, amount, address, or code (ADR-020 §18). The landing page fetches
the protected detail after the session/token re-authorises.

**Automated actions.**

- `ServiceWorker.tsx:45` handles `postMessage({type:"NAVIGATE"})` when
  `client.navigate` is unavailable → `router.push(href)`.
- `ResumeSignal` (`src/features/pwa/ResumeSignal.tsx`) sees `?ref=push` and fires
  `pilotPing("workflow_resumed")` + `analytics.track("workflow_resumed", {
notification_channel: "push" })` once per load.
- If it's a stale link (the request has moved on), `/supplier/:slug/requests`
  shows a `staleNote` `Callout` ("That request now has your price on it — see
  'Prices you have sent' below.") (`requests/page.tsx:82`).

**State transitions.** None from the navigation itself; the user then acts.

**Notifications.** The notification row is marked read when the user opens the
`ActionCentre` item; a deep-link landing does not auto-mark it (it's a page, not
a notification row click).

**Exit conditions.** The user completes the action the notification pointed to.

**Success state.** The target surface renders with the relevant panel (decision,
handoff, pickup).

**Failure states.** Session mismatch on a buyer deep link →
"belongs to another device" (J13). Manage-token mismatch on a business deep link
→ `/supplier/:slug/requests` `notFound()`.

**What the user must understand.** Nothing new — the deep link takes them to the
exact workflow.

**What the user does NOT need to understand.** That the notification row and the
page are separate; how `resolveRecipient` re-authorised them.

---

## J5 — Returning buyer, PWA cold launch

**Entry point.** The installed app icon → `start_url: "/agent"`
(`src/app/manifest.ts:19`), `display: standalone`.

**Same as J3** from there, plus:

- `detectPlatform()` → `"installed_pwa"`; `app_opened` analytics carries
  `platform: "installed_pwa"`, `pwa_installed: true`,
  `returning: markAppOpenedAndWasReturning()`.
- The SW may have a waiting worker → `ServiceWorker` shows the "A new version of
  Intra is ready. Update now" banner (never forced).
- Navigations are network-first; offline → the cached `/offline` page.

---

## J6 — Buyer accepts the quote → handoff → confirm → feedback

**Entry point.** `/tasks/:id` (`TaskPage`), task `status === "RECOMMENDED"`.
Usually via a notification ("A quote is ready for your decision") or
`BuyerWorkPanel` "Review".

**User goal.** "Go ahead with this printer."

**First action.** Reads the quote card + `RecommendationCard` ("Intra's read of
this quote" — total incl. delivery, per-flyer, turnaround, "Why this looks OK",
"What Intra cannot confirm"). Then in `DecisionPanel`: taps **"Proceed with this
printer"** (or "Proceed anyway — I'll reconfirm" if expired).

**Screens.** `/tasks/:id` throughout — the panels appear/disappear based on
`task.status`.

**Information presented.**

- Brief (`Your brief` `DataList`), quote (`The quote` — price, delivery,
  turnaround, availability, assumptions, confidence, validity), the
  recommendation, the decision panel.
- `DecisionPanel` copy: "This is your decision. Intra does not place the order or
  pay the printer — if you proceed, you send the message yourself…"
  (`TaskPage.tsx:601`).
- If the quote is expired: a `warning` `Callout` "This quote has expired. You can
  still go ahead, but the price is no longer guaranteed…".

**Information requested.** Just the accept/decline choice (decline has an
optional free-text reason).

**User decisions.** Accept vs decline; (if declining) a reason.

**Automated actions.** `decide("ACCEPT")` → `POST /api/tasks/:id/decision
{decision:"ACCEPT"}` → `decideOnQuote` (`src/features/tasks/service.ts:302`):

- task `RECOMMENDED → HANDOFF_READY`, `buyerDecision = "ACCEPTED"`,
  `buyerDecidedAt` + `closedAt` stamped.
- the accepted quote row gets `acceptedAt` (now immutable).
- `orderMessage` regenerated with the expiry caveat if needed.
- audit `task.buyer_accepted` + `task.handoff_ready`.
- `notify("task.handoff_ready")` (buyer) + `notify("task.buyer_accepted")`
  (business).
- `createCommitmentForApproval` — a `commitments` row `PENDING_ATTESTATION`, a
  handover secret issued (`handoverCode` to the buyer, `handoverSalt` withheld).
- `analytics.track("approval_accepted", { quote_expired })`.

**State transitions.** task `RECOMMENDED → HANDOFF_READY`; quote `RECEIVED` +
`acceptedAt`; commitment created.

**Notifications.** Buyer: "Your order is ready to send". Business: "A customer
accepted your quote".

**Then, on `HANDOFF_READY`, the task page renders in order:**

1. `PayPanel` (MiniPay) — only if `view.orderPayment` present and not yet
   confirmed (J8).
2. `HandoffCard` — "Order handoff — you send this yourself". Shows the supplier
   name/city, the contact channel + value (now revealed), the full pre-filled
   message in a `<pre>`, a "Copy message" button, an "Open in WhatsApp" link
   (`wa.me/<digits>?text=<encoded>`), and a `Callout tone="unavailable"` "Intra
   does not send this message and never pays a supplier for you."
3. `HandoverCodePanel` — "Your handover code" (J11).
4. `BuyerPickupPanel` — only after `handoffConfirmedAt` (J10).
5. `OrderProblemPanel` — "Something wrong with this order?" (J12).

**Second action.** After sending the message on WhatsApp, taps **"I've sent this
to the printer"** → `POST /api/tasks/:id/handoff-confirm` → `confirmHandoff`:
sets `task.handoffConfirmedAt`, appends a content-free `task.handoff_confirmed`
audit event, unlocks the feedback form. **No task status change** (`HANDOFF_READY`
stays terminal).

**Third action.** `FeedbackForm` appears (also on `FAILED` / `CANCELLED`):
"Was this useful?" Yes / Not really + optional comment → `POST /api/feedback` →
`analytics.track("feedback_submitted")`.

**Success state.** `HandoffCard` shows "You marked this as sent on {date}."
`FeedbackForm` → `Callout tone="success"` "Thanks for the feedback."

**Failure states.** Decision on a non-`RECOMMENDED` task →
`409 TASK_NOT_AWAITING_DECISION`. `handoff-confirm` on a non-`HANDOFF_READY` task
→ `409 HANDOFF_NOT_READY`. Network → "Could not record your choice. Try again."

**Recovery path.** The decision and handoff-confirm are idempotent (repeat key
replays). If the buyer declined by mistake there is no undo — a declined task is
`CANCELLED` and terminal.

**Re-entry point.** `/tasks/:id` — the page is fully resumable from server state.

**What the user must understand.** They send the message; they agree and pay the
final order directly with the printer; the quote is an estimate unless marked
fixed.

**What the user does NOT need to understand.** That a commitment row + handover
secret were created, the audit events, that `acceptedAt` makes the quote
immutable, the `keccak256` commit-reveal.

---

## J7 — Buyer declines the quote

**Entry point.** Same as J6, `status === "RECOMMENDED"`.

**Flow.** `DecisionPanel` → "Not this one" → a textarea "Why not? (optional,
helps us improve the route)" → "Confirm — don't proceed" → `POST
/api/tasks/:id/decision {decision:"DECLINE", reason?}` → `decideOnQuote`:

- task `RECOMMENDED → CANCELLED`, `buyerDecision = "DECLINED"`,
  `buyerDeclineReason` stored on the task (not in the audit payload).
- audit `task.buyer_declined`; `notify("task.buyer_declined")` (business:
  "A customer decided not to proceed", `INFORMATIONAL`).
- `analytics.track("approval_declined", { reason_given })`.

**State change.** task → `CANCELLED` (terminal).

**User feedback.** The page re-renders: `describeTaskException` returns
`BUYER_CANCELLED` → an `info` `Callout` "You cancelled this request… You can
start a new one any time." + the buyer's note shown in italics if given. The
`FeedbackForm` opens.

**Agent-console variant.** `ApprovalPanel` → "Decline" → optional reason →
"Decline — don't proceed" → `POST /api/agent/run/:id/approve
{decision:"DECLINE"}` → `OutcomePanel` `Declined` "Nothing was ordered and no
money moved. The printer was told you passed…".

**What the user must understand.** Declining is final for this request; the
printer is told (keeps their availability accurate).

---

## J8 — Buyer pays the order via MiniPay

**Entry point.** `/tasks/:id`, `status === "HANDOFF_READY"`, `!handoffConfirmedAt`,
and `view.orderPayment` present (only when `NETWORK_ENV=production` and a
commitment exists and is not expired). `PayPanel` renders **above** the
`HandoffCard` (`TaskPage.tsx:444`).

**User goal.** "Pay the business now instead of arranging it over WhatsApp."

**First action.** Reads the `PayPanel`: "You've agreed the price with {business}.
Pay them securely from your wallet, or use the WhatsApp handoff below." A
`DataList` shows Business / Order / Amount (NGN). Then taps **"Pay with MiniPay"**
(or "Pay from your wallet") — only shown if `hasInjectedWallet()`. If no wallet:
a `Callout` "Open this order in MiniPay to pay the business directly from your
wallet."

**Screens.** `/tasks/:id` — the `PayPanel` cycles through phases in place; the
wallet UI is the wallet's own overlay.

**Information presented (`useOrderPayment` phases):**

- `creating` → button "Preparing…"
- `wallet` → button "Waiting for your wallet…", plus (once the intent exists) a
  new `DataRow` "You'll pay {n} USDC" with `hint` "≈ reference rate from
  {source}, locked {time}", and "Goes to {0x1234…abcd}".
- `submitting` → "Recording…"
- `confirming` / `SUBMITTED` / `CONFIRMING` → `Callout tone="info"` "Payment
  submitted. We're waiting for the network to confirm it. This page updates on
  its own." After ~100 s: "Still checking with the network. You can close this
  and come back — the status is saved."
- `confirmed` / `paid` → `Card` "Payment confirmed" with Business / Amount (NGN
  · USDC) / Status: Paid, and a `<details>` "Transaction details" → "View
  transaction" explorer link.
- `cancelled` → `Callout tone="unavailable"` "Payment cancelled. Nothing was
  confirmed."
- `failed` → `Callout tone="warning"` "The payment didn't go through… Try again,
  or use the WhatsApp handoff."
- unavailable → `Callout tone="unavailable"` "Paying in the app isn't available
  for this order — {reason}. You can still send the WhatsApp message below…"

**Information requested.** Only the wallet approval (in the wallet's own UI).
The client submits **only the tx hash**.

**User decisions.** Pay via wallet vs use the WhatsApp handoff; approve or reject
in the wallet; cancel while in-flight.

**Automated actions (`useOrderPayment.start`):**

1. `POST /api/tasks/:id/order-payment` → `createOrderPaymentIntent` mints the
   intent from the accepted commitment (recipient, USDC atomic amount, locked
   NGN→USD rate + source + timestamp). Source down → `503`.
2. `wallet-adapter.payOrder` (`src/features/payments/minipay/wallet-adapter.ts`):
   lazy-imports `viem` + `viem/chains`, checks the chain is Celo (attempts
   `wallet_switchEthereumChain` if not), builds an ERC-20 `transfer` via
   `encodeFunctionData(erc20Abi)`, `sendTransaction`, returns the hash.
3. `POST .../submit { txHash }` → `recordSubmittedOrderPayment` → status
   `CONFIRMING`, audit `order_payment.submitted`, schedule `verifyOrderPayment`.
4. `PayPanel` polls `GET .../order-payment` every 2.5 s (which also nudges
   verification).
5. `verifyOrderPayment` reads the real Celo receipt: chain + success + USDC `to`
   - a single `Transfer` to the recipient for the exact amount → `CONFIRMED`;
     `payerAddress` recorded from the on-chain `from`.

**State transitions.** `order_payments`: (none) → `CREATED` → `AWAITING_WALLET` /
`CONFIRMING` → `CONFIRMED` / `FAILED` / `EXPIRED` / `CANCELLED`.

**Notifications.** On `CONFIRMED`: buyer "Payment confirmed" (`COMPLETED`),
business "Payment received" (`INFORMATIONAL`). On pending: "We're still
confirming your payment". On failed: "Your payment didn't go through"
(`ACTION_REQUIRED`).

**Background / async work.** Verification runs via `after()` and on every poll.
The buyer can close the tab — `payment_submitted` / `payment_confirmed` /
`payment_failed` are forwarded server-side because "the buyer often closes the
tab before the network confirms" (`events.ts:203`).

**Exit conditions.** `CONFIRMED` receipt shown; or the buyer uses the WhatsApp
handoff instead (always available); or cancels.

**Success state.** "Payment confirmed" card + explorer link.

**Failure states.** Wallet rejected → intent `CANCELLED`. Wrong chain →
"Switch your wallet to the Celo network." Rate source down → "unavailable".
Terms changed since the intent → the intent is `EXPIRED`
(`invalidateOrderPaymentsForTask`), "The agreed offer has expired. Ask the
business to reconfirm the price."

**Recovery path.** Retry (`start` is guarded by `startedRef`); or fall back to
WhatsApp; or on a reporting hiccup, "reopen the order and it will pick up".

**What the user must understand.** They approve the wallet transaction (separate
from the commercial approval); the network fee comes from their wallet; NGN is
converted at a shown, locked reference rate; Intra never holds the money.

**What the user does NOT need to understand.** USDC atomic units, the ERC-20 ABI,
the contract address, `chainId` hex, `Transfer` event matching, the intent
immutability rule, that verification is a server-side receipt read.

---

## J9 — Buyer decides on a proposed price change

**Entry point.** `/tasks/:id` after the business proposed a new price on an
order the buyer **already accepted** (J19 "after acceptance"). Notification: "The
business proposed a new price".

**User goal.** "Do I accept the new price or keep what I agreed?"

**Screens.** `/tasks/:id` — `PriceChangePanel` renders (only when
`view.priceChange && supplier`, `TaskPage.tsx:424`).

**Information presented (`PriceChangePanel`, `src/features/quotes/PriceChangePanel.tsx`):**

- Header: "{business} wants to change the price" with an ⚠ icon on a
  `warning`-tinted card.
- A sentence stating both amounts and the delta in money: "You agreed NGN 4,500.
  They are asking for NGN 5,200 — NGN 700 more."
- A `dl`: You agreed / They are asking / New turnaround / Their reason (verbatim)
  / Asked (relative time).
- `Callout tone="unavailable"`: "Until you choose, the price you originally
  agreed still stands. Nothing has changed and no money has moved."

**User decisions.** "Accept NGN 5,200" vs "Keep the price I agreed".

**Automated actions.** `POST /api/tasks/:id/price-change {decision}` →
`decideOnPriceChange` (`src/features/quotes/revision.ts:266`):

- **ACCEPT**: the previously accepted quote row → `SUPERSEDED` (never edited);
  the `PROPOSED` row → `RECEIVED` + `acceptedAt = now`; recommendation +
  `orderMessage` regenerated; audit `quote.change_accepted`;
  `invalidateOrderPaymentsForTask` (any MiniPay intent on the old amount is
  killed).
- **DECLINE**: the `PROPOSED` row → `WITHDRAWN`; the originally agreed row
  stands untouched; audit `quote.change_declined`.

**State transitions.** Quote rows only; the task stays `HANDOFF_READY`.

**User feedback.** `onDecided` re-loads the task view; the panel disappears.

**What the user must understand.** An accepted price cannot change without their
say-so; if they accept, any wallet payment they'd started is void and needs
re-approving.

---

## J10 — Buyer confirms pickup (Proofline)

**Entry point.** `/tasks/:id`, `handoffConfirmedAt` set, `view.proofline`
present. `BuyerPickupPanel` renders (`TaskPage.tsx:467`). Often via a
notification "Your order is ready for pickup".

**User goal.** "Record that I collected my flyers."

**Screens.** `/tasks/:id` — `BuyerPickupPanel` ("Fulfilment evidence (Proofline
pilot)").

**Information presented (`src/features/proofline/BuyerPickupPanel.tsx`):**

- Before the merchant marks ready: "Optional. When your order is ready, the
  printer marks it here. You then confirm you collected it — that is all this
  records."
- After `MERCHANT_MARKED_READY`: "The printer marked this order **ready for
  pickup** on {date}. This is the printer's statement, not a check by Intra." +
  a "Confirm I've collected this order" button + a "Have a pickup code instead?"
  disclosure (a `TextField` "Pickup code from the printer", hint "Use this if you
  are collecting from a different phone").
- After `BUYER_CONFIRMED_PICKUP`: `Callout tone="success"` "You confirmed pickup.
  Recorded on {date} — buyer, from their own request link."
- An events list, and the `PROOFLINE_DISCLAIMER` `Callout tone="unavailable"`
  verbatim.

**User decisions.** Confirm via session vs via code; whether to confirm at all
(optional).

**Automated actions.** `POST /api/tasks/:id/proofline/confirm-pickup` (with
`x-session-id`, or `{code}`) → `confirmPickup`: accepted if the session matches
the task's session (`method: "buyer_session"`) OR the code matches
(`method: "one_time_code"`, case-insensitive). Writes a `PICKUP_CONFIRMED`
`proofline_events` row (append-only). Audit `proofline.pickup_confirmed`.

**State transitions.** Proofline evidence `MERCHANT_MARKED_READY →
BUYER_CONFIRMED_PICKUP`.

**Notifications.** Buyer: "Your order is complete" (`COMPLETED`).

**Failure states.** `409 NOT_READY_FOR_PICKUP` (merchant hasn't marked ready),
`409 PICKUP_ALREADY_CONFIRMED` (replay), `401 PICKUP_CONFIRM_REJECTED` (neither
a matching session nor a valid code).

**What the user must understand.** This is operational evidence, not proof, not
payment; it's optional.

---

## J11 — Buyer gives the merchant the handover code

**Entry point.** `/tasks/:id`, `status === "HANDOFF_READY"` with a
recommendation → `HandoverCodePanel` renders (`TaskPage.tsx:465`) whenever
`view.handoverCode` is present (a commitment exists).

**Information presented (`src/features/attestation/HandoverCodePanel.tsx`):**

- "Your handover code" with a 🔑 icon.
- "Say this to the business when you collect your order — it's how the record
  shows you were really there."
- The code in a large mono box (`tracking-[0.2em]`).

**User action.** Reads the code aloud to the merchant at collection (in person,
not in the app). The merchant then runs J23.

**System role.** The code was issued server-side at approval time
(`issueHandoverSecret`); `getTaskView` returns `commitment.handoverCode` on the
buyer's own session-scoped view only; the withheld `handoverSalt` is never
returned.

**What the user must understand.** The code is how the two-party record proves
they were physically present; it is not a password or a wallet key.

**Contradiction (see [`00` §20 #8]):** the merchant's Proofline `pickupCode`
(J22) looks almost identical and is on a related surface.

---

## J12 — Buyer cancels an agreed order / reports a failed handover

**Entry point.** `/tasks/:id`, `status === "HANDOFF_READY"`, `!handoffConfirmedAt`
→ `OrderProblemPanel` renders (`TaskPage.tsx:471`).

**Information presented (`src/features/tasks/OrderProblemPanel.tsx`):**

- A `<details>` "Something wrong with this order?"
- "Intra never held any money for this order, so there is nothing to refund
  here. If you paid the business directly, settle that with them."
- Two buttons: "Cancel this order" / "The pickup or handover failed", each
  opening an optional-note textarea.

**User decisions.** Cancel vs report a handover problem; an optional note.

**Automated actions.**

- Cancel → `POST /api/tasks/:id/cancel` → `buyerCancelsAfterAgreement`: task
  `HANDOFF_READY → CANCELLED`, `failureReason = "BUYER_CANCELLED_AFTER_AGREEMENT"`,
  live quotes → `WITHDRAWN`, `invalidateOrderPaymentsForTask`, audit
  `task.buyer_declined`, `notify` (business: "A customer cancelled an agreed
  order", `ACTION_REQUIRED`).
- Handover failed → `POST /api/tasks/:id/handover-problem` → `reportHandoverFailure`:
  task → `FAILED`, `failureReason = "HANDOVER_FAILED"`, same housekeeping;
  `notify` (buyer: semantic exception; business: "A handover did not complete").

**State transitions.** task `HANDOFF_READY → CANCELLED` or `FAILED` (terminal).

**User feedback.** The page reloads; `describeTaskException` renders the semantic
`Callout` (`BUYER_CANCELLED_AFTER_AGREEMENT` or `HANDOVER_FAILED`) — headline,
what happened, what to do ("contact the business directly"), what next, money
note. The `FeedbackForm` opens.

**What the user must understand.** Intra held no money; any direct arrangement
is between the two parties; the order is not marked complete.

---

## J13 — Buyer whose task "belongs to another device"

**Entry point.** `/tasks/:id` where `getSessionId()` (localStorage) does not
match `task.sessionId` or `task.buyerClaimSession`. Happens on a shared campus
phone, a private window, after a cache clear, or on a phone→laptop switch.

**System action.** `GET /api/tasks/:id` → `assertSession` → `403 FORBIDDEN`.

**User feedback.** `TaskPage` `state === "forbidden"` → `ErrorState`:

- Title: "This request belongs to another device"
- Body: "Requests are tied to the browser that created them. Open the link on
  that device, or start a new request."
- Action: "Start a new request" → `/agent`

**Recovery path.** **None.** There is no resume link, no email, no QR. The
WhatsApp message the buyer was about to send is now unreachable. (Known gap:
`UX_ARCHITECTURE.md` F8; `00` §20 #1.)

**What the user must understand.** That the request is device-bound — but the UI
only tells them this _after_ they've lost access.

---

## J14 — Interrupted / failed agent run

**Entry points & feedback:**

| Situation                                   | Detection                                                  | UI                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run store TTL (30 min) or server restart    | `GET /api/agent/run/:id` → `404 RUN_NOT_FOUND`             | `requestErrorCopy` "This run has expired. Runs are held for 30 minutes and are never saved. Your request text is still here." + restart offer                                                                          |
| Run stuck `RUNNING` past 120 polls (~3 min) | `AgentConsole` poll loop `attempt >= MAX_POLLS`            | `Callout` "This is taking longer than expected. The agent is still working. Reload the page to pick the run back up." + "Start again"                                                                                  |
| Transient network during polling            | `ApiError.code === "NETWORK"` or `TypeError`, `misses < 5` | silent quiet retry with backoff; a "Reconnecting…" `<Wifi>` chip; only surfaces after 5 consecutive misses                                                                                                             |
| Run ended `NO_VIABLE_OFFER`                 | run status                                                 | `OutcomePanel` `Unsuccessful` with a benign `outcomeCopy` (NO_PROVIDERS / NO_QUOTES_RETURNED / NO_USABLE_QUOTE / OFFER_LAPSED_BEFORE_APPROVAL / OUT_OF_SCOPE) + "Nothing was ordered and no money moved" + "Try again" |
| Run ended `FAILED`                          | run status + `failedCode`                                  | `outcomeCopy(code, summary)`; unknown codes → a plain "That did not go through" (never leaks `TOOL_TIMEOUT` / `SCHEMA_MISMATCH` — `looksTechnical` filter)                                                             |
| `CLARIFICATION_NEEDED`                      | run status                                                 | `Callout tone="info"` "One thing before I ask anyone: {question}" + `UnderstandingCard` opens with the missing fields highlighted                                                                                      |
| Approval `offerFingerprint` stale           | `POST .../approve` → `APPROVAL_STALE`                      | `requestErrorCopy` "The quote changed… Review the current one"                                                                                                                                                         |
| `SESSION_REQUIRED` (localStorage blocked)   | `x-session-id` missing                                     | `requestErrorCopy` "We could not identify this browser. Your browser is blocking the local storage this demo uses…"                                                                                                    |

**What survives a run failure.** If the run got as far as requesting quotes, the
real `tasks`/`quotes` rows persist and appear in `BuyerWorkPanel`; the
orchestration metadata (ranked offers, trace) is lost.

---

## J15 — New business, quick-start (one screen)

**Entry point.** `/supplier/onboard` (`src/app/supplier/onboard/page.tsx` →
`QuickStartForm`). Landing-page CTA "I run a business" / "Set up my business".

**User goal.** "Let customers on Intra find my printing service."

**First action.** Reads the value proposition (in-flow, not a separate page):
the 3-step overview (Add one service / Set your pricing / Receive requests), the
4 `WHY_BUSINESSES_JOIN` cards, and a `Callout tone="info"` "What we will never
ask for" (seed phrase, private key, password, BVN, NIN, bank login, card). Then
fills `QuickStartForm` (`src/features/businesses/QuickStartForm.tsx`) — 3 cards:

1. **Your business**: Business name, "What do you do?" (select, default
   printing).
2. **Your first service**: Service name; "How do you price it?" (3 radio cards —
   Set price / Price starts from / Priced per job, with an example each);
   amount + "What does that cover?" if not quote-only.
3. **Where and who**: City, Areas you cover, "Who should customers ask for?",
   "WhatsApp number for orders", and a consent `CheckboxField` "You can show my
   prices to customers".

**Information requested.** 9–11 fields (5 mandatory: businessName, category,
serviceName, city, serviceArea, contactName, contactChannelValue, consent; plus
priceAmount unless QUOTE_REQUIRED). **No payout address** — quick-start sets it
to the zero address and `wantsPaidQueries` off.

**User decisions.** Category; pricing model; consent (explicit tick).

**Automated actions.** `POST /api/businesses/quick-start` → `quickStartBusiness`
(`src/features/businesses/quick-start.ts:91`), one transaction:

- `businesses` row: `status = "PENDING_VERIFICATION"`, `consentAt = now`,
  `manageToken` auto-generated, payout = zero address.
- `quote_routes` row: `status = "DRAFT"`, `queryFeeUsd = "0.0000"`,
  `inputSchema` from the category template, `endpoint = /v1/<slug>/<serviceSlug>/quote`.
- audit `business.quick_started`.
- `analytics.identifyBusiness(id)` + `business_onboarding_completed`.

**State transitions.** business → `PENDING_VERIFICATION`; route → `DRAFT`.

**Success state.** `Card`: "{business} is set up. Your first service, {service},
is ready. An Intra operator checks your details before customers can reach you…"

- a big "Open your workspace" button (`created.manageUrl` = `/supplier/<slug>?t=<token>`)
- `Callout tone="info"` "Keep this link — that link is how you get back in and
  manage your prices. It is not a wallet key and holds no money — but treat it as
  private."

**Failure states.** `INVALID_BODY` → field errors flattened onto the form
("Check the highlighted fields"). `INVALID_NAME` (unslug­gable). `409
BUSINESS_EXISTS` (duplicate slug).

**Recovery path.** Fix the highlighted fields and resubmit.

**Re-entry point.** `/supplier/<slug>?t=<token>` (from the success card, or the
saved link).

**What the user must understand.** An operator still has to verify before
customers can reach them; they send every quote; customers pay them directly;
the manage link is their only way back in.

**What the user does NOT need to understand.** The Capability Card / route
schema, the `/v1` endpoint, x402, MCP, the DRAFT → ACTIVE lifecycle mechanics.

---

## J16 — New business, full form (draft only)

**Entry point.** `/supplier/onboard/full` (`OnboardingForm`) — linked from
`/supplier/onboard` ("Working with an Intra operator? Use the detailed form").

**User goal.** Supply the full Capability Card (with an operator's help).

**Flow.** A 4-step wizard (`src/features/businesses/OnboardingForm.tsx`),
progress rail, `zodResolver(businessOnboardingSchema)` + `mode: "onBlur"`,
`trigger(STEP_FIELDS[step])` gates each "Continue":

1. **Business** — name, authorised contact, order channel + value, city,
   country.
2. **Area & hours** — service area, opening hours, typical turnaround.
3. **Your service** — category, a live template preview
   (`getTemplateForCategory` → name, availability badge, "Agents will send: …"),
   service summary (≤ 280 chars), quote response time (select), quote currency.
4. **Consent** — "This is not an AI agent" copy; a `Callout` "What we never ask
   for"; a `wantsPaidQueries` checkbox ("Let AI agents pay a small fee (about
   $0.02) to request a quote"); a conditional payout-address `TextField` (only
   when `wantsPaidQueries`); the consent checkbox; a 3-step "Before your service
   goes live" list.

**Final action.** "Preview my Capability Card" → `onSubmit` calls
`setDraft(buildOnboardingDraft(values))` — **and nothing else. There is no
`POST`.** (`OnboardingForm.tsx:106`.)

**Result.** `DraftRoutePreview` (`src/features/businesses/DraftRoutePreview.tsx`):

- "Your Capability Card — This is what an AI agent would see once your service
  is active. Nothing is saved or submitted yet."
- `Callout tone="warning"` "Draft — not live. This route cannot receive a quote
  request or any payment. An operator must verify your details and consent…"
- The card: Service, what it does, Business / Service area / Opening hours /
  Turnaround / Quote response time / Currency / Agent query fee / (payout
  address if paid) / Status: Draft.
- "An agent must send" — the template fields.
- Two panels: "Public to agents once active" vs "Stays private".
- A lifecycle explainer (Draft / Pending verification / Active / Paused / Stale).
- `Callout tone="info"` "This is not an AI agent".
- **"Next step"**: "Send these answers to your Intra operator. They create the
  business and route, verify your details, and only then activate it. Your review
  link will be {draftRouteUrl}." — plus a `<details>` "View the raw route payload
  (for your operator)" showing `JSON.stringify(draft.route, null, 2)`.
- "Start over".

**State transitions.** **None.** Zero rows written.

**Exit conditions.** The merchant must email/message an operator; the operator
must `POST /api/businesses` + `.../routes` by hand (`OperatorConsole` has no
create UI).

**Failure states.** Field validation per step; "Could not create the Capability
Card" on the (artificial 300 ms) preview delay failing.

**What the user must understand.** This produces a **draft**, not a live service;
they must hand it to an operator.

**Known contradiction ([`00` §20 #3]).** The product thesis is "the business
doesn't need technical work"; on this path the business's first act is to email a
JSON blob to a human who runs `curl`.

---

## J17 — Returning business, manage link

**Entry point.** `/supplier/:slug?t=<manageToken>` (saved link / operator link /
`business` deep link from a notification).

**User goal.** "What needs me? What's happening?"

**Screens.** `/supplier/:slug` (server component, action-first,
`src/app/supplier/[slug]/page.tsx`).

**Information presented (when `canManage` — a valid `?t=`):**

- `AnalyticsBusinessIdentity` (renders null, identifies the business into
  Amplitude).
- `SectionHeader` "Your business" / name / city, country.
- `PushPrompt` (only if `incoming.length > 0 || quoted.length > 0`) — "Customers
  are waiting on you."
- `ActionCentre` "What needs you" (business audience).
- A yellow banner "{n} customers are waiting for your price" → link to
  `/supplier/:slug/requests?t=`.
- "What's happening" — `Stat` tiles (Reviewing your quote / Price change waiting
  / In progress / To hand over) or "Nothing is in flight right now."
- "Your record so far" (only if `summary.hasActivity`) — Requests received /
  Prices sent / Customers who agreed / Jobs completed / Typical reply time /
  Requests you priced. "Counted from your own requests and orders. Nothing here
  is estimated."
- (if `jobsCompleted > 0`) `Callout tone="success"` "Why finishing jobs here
  matters — Completed jobs can contribute to a verifiable history… it is not a
  rating…"
- "What you offer" — each route: name, "Available to customers" / "Not yet
  live", the pricing description, "You aim to reply within N minutes", and an
  `EditPublishedPriceForm` (J20).
- `NotificationSettings` (business audience).

**Without `?t=`:** a `Callout tone="info"` "Read-only view — Open your manage
link to see what needs you, send prices, and mark work ready." Most sections are
hidden.

**User decisions.** Which sub-surface to open (requests / review / edit price).

**Automated actions.** `getSupplierWorkspace` (server) + `getBusinessValueSummary`.

**State transitions.** None (overview).

**Re-entry point.** `/supplier/:slug/requests?t=` or `/review?t=`.

---

## J18 — Business sends a quote / declines a request

**Entry point.** `/supplier/:slug/requests?t=<token>` — **fails `notFound()`
without a valid token** (`requests/page.tsx:73`).

**User goal.** "Answer this customer with a price, or turn it down."

**Screens.** `/supplier/:slug/requests` — sections: "Incoming requests" (each an
`ol` `<li>` `Card`), "Prices you have sent", "Handed-off orders".

**Information presented per incoming request.**

- "Customer request" / route name / "Sent {relative} · reply within {N} min".
- A `DataList` of the brief (`BRIEF_LABEL` maps `size`→"Paper size" etc.;
  `colour` humanised) + "Budget: Not specified".
- The `QuoteResponseForm`.

**Information requested (`QuoteResponseForm`, `src/features/supplier/QuoteResponseForm.tsx`):**

- A "Send a quote" / "Decline" toggle.
- Quote mode: Price type (Fixed price / Estimated range), amount(s), Turnaround
  ("same day, 2 working days"), "Quote valid until" (`datetime-local`, optional),
  a `<details>` "Add more detail (optional)" — Delivery charge, Availability
  note, Assumptions, Confidence (Low/Medium/High).
- Decline mode: "Reason for declining" (required, "Out of delivery area / at
  capacity this week").
- A `Callout tone="info"` "How the buyer sees this — The buyer is shown these
  figures as the printer's quote, entered through Intra. Intra does not
  independently verify them."

**User decisions.** Quote vs decline; fixed vs range; the numbers; whether to add
an expiry; the confidence level.

**Automated actions.** `POST /api/routes/:id/quotes` (with `x-manage-token`):

- Quote → `submitQuote` (`src/features/quotes/service.ts:77`): inserts a
  `RECEIVED` quote, builds a `Recommendation` with a pre-filled (never-sent)
  `orderMessage`, task `AWAITING_QUOTE → RECOMMENDED` (stamps `quotedAt`), audit
  `quote.received` + `recommendation.created`, `notify("recommendation.created")`
  (buyer: "A quote is ready for your decision", `ACTION_REQUIRED`).
- Decline → `declineRequest`: inserts a `DECLINED` quote (amount "0.00"), task →
  `FAILED` (`failureReason = "SUPPLIER_DECLINED"`), audit `quote.declined` +
  `task.failed`, `notify("task.failed")`.

**State transitions.** task `AWAITING_QUOTE → RECOMMENDED` (quote) or `→ FAILED`
(decline).

**Success state.** `Callout tone="success"`: "Quote sent — The buyer will now
review your quote and decide whether to proceed. If they do, they message you
directly." / "Request declined — The buyer has been told this request cannot be
fulfilled."

**Failure states.** `409 QUOTE_EXISTS` (a second response), `409
ROUTE_UNAVAILABLE` (route not ACTIVE), `409 TASK_NOT_AWAITING_QUOTE`, `401
SUPPLIER_AUTH_REQUIRED`.

**What the user must understand.** The quote is the only commitment; Intra does
not verify their figures; an expiry means the customer must ask again after it.

---

## J19 — Business revises a price (before vs after acceptance)

**Entry point.** `/supplier/:slug/requests?t=` → "Prices you have sent" section.

**Before the customer agreed** — `ChangePriceForm` shows "Change this price"; the
new price **replaces** the old one. `POST /api/routes/:id/quotes {revise:true}` →
`reviseQuote` `REPLACED`: old row → `SUPERSEDED`, new `RECEIVED` row, the
recommendation + `orderMessage` are regenerated, audit `quote.revised`,
`notify("quote.revised")` (buyer: "The business sent a different price"). The task
stays `RECOMMENDED`.

**After the customer agreed** — `ChangePriceForm` copy changes: "This customer
has already agreed that price, so your new one is a request they must accept.
Until they do, the agreed price stands." Button: "Ask the customer to accept."
`reviseQuote` `CHANGE_PROPOSED`: a `PROPOSED` row pointing at the accepted one;
the accepted row is **not touched**; audit `quote.change_proposed`;
`notify("quote.change_proposed")` (buyer: "The business proposed a new price"),
which drives J9. Meanwhile the "Prices you have sent" card shows `Callout
tone="info"` "Waiting on the customer — You asked to change this price. The
amount they agreed still stands until they accept."

**Information requested.** New amount, turnaround (optional), and a **required**
reason ("Card stock went up this morning") shown to the customer verbatim.

**Guard.** `409 CHANGE_ALREADY_PENDING` if a proposal is already outstanding;
`409 ORDER_CLOSED` if the task is FAILED/CANCELLED.

**What the user must understand.** An agreed price can only be _proposed_, never
edited; the customer decides.

---

## J20 — Business edits its published price

**Entry point.** `/supplier/:slug?t=` → "What you offer" → a route card →
`EditPublishedPriceForm` "Edit this price".

**Flow (`src/features/supplier/EditPublishedPriceForm.tsx`).** A select ("How you
price it" — Set price / Price starts from / Priced per job) + amount + "What it
covers" (optional). `Callout tone="info"`: "This is the price customers see
before they ask. Any job someone has already agreed keeps the price you agreed —
this does not change a quote." → `PATCH /api/routes/:id/pricing` →
`updatePublishedPricing` → audit; `analytics.track("pricing_configured")`.

**State transitions.** `quote_routes.pricingModel` / `priceAmount` / `priceUnit`.
**Never touches a quote.**

**Success state.** "Saved." inline.

---

## J21 — Business pauses a route

**Entry point.** `/supplier/:slug/review?t=` — **`notFound()` without a valid
token** (`review/page.tsx:44`) → a route card → `PauseRouteButton` (only shown
when `route.status === "ACTIVE"`).

**Flow (`src/features/supplier/PauseRouteButton.tsx`).** "Pause route" → a
confirm step: "Pause this route now? Buyers cannot send new requests until an
operator reactivates it." → "Yes, pause route" → `PATCH /api/routes/:id/status
{status:"PAUSED"}` (manage token authorises this transition) → `router.refresh()`.

**State transitions.** route `ACTIVE → PAUSED`. **Only an operator can
reactivate** (`docs/API.md`).

**Information also on this page.** Business details (contact, currency, payout
address shortened, consent timestamp, "Payout-address verification: Verified by
operator {relative}" or "Pending operator verification"); a "What each state
means" explainer; per route: freshness ("Confirmed {relative}" / "· needs
reconfirming" if stale), a `warning` `Callout` "Price data is stale" if
`status === ACTIVE && fresh.stale`, "What agents can see when this route is
Active", and the pause control.

**What the user must understand.** Pausing only reduces availability; they can't
un-pause themselves.

---

## J22 — Business marks an order ready + reads the pickup code

**Entry point.** `/supplier/:slug/requests?t=` → "Handed-off orders" section →
`MerchantFulfilmentPanel` per order.

**Flow (`src/features/proofline/MerchantFulfilmentPanel.tsx`).**

- `NOT_STARTED`: "Optional. When this order is printed and ready, mark it here.
  You'll get a short code to read to the buyer; they confirm collection on their
  own phone." → "Mark ready for pickup" → `POST /api/tasks/:id/proofline/ready`
  (manage token) → `READY_FOR_PICKUP` event + a 6-char `pickupCode`
  (`analytics.track("fulfillment_started")`, `router.refresh()`).
- `MERCHANT_MARKED_READY`: "Marked ready on {date}. Waiting for the buyer to
  confirm they collected it." + the pickup code in a bordered mono box: "Read
  this to the buyer at collection. Or they can confirm from their own request
  link."
- `BUYER_CONFIRMED_PICKUP`: `Callout tone="success"` "Buyer confirmed pickup"
  (`analytics.track("business_job_completed")`).
- Always the `PROOFLINE_DISCLAIMER` `Callout tone="unavailable"`.

**Guards.** `409 HANDOFF_NOT_CONFIRMED` (buyer hasn't confirmed the handoff),
`409 ALREADY_MARKED_READY` (replay), `401 PROOFLINE_MERCHANT_AUTH_REQUIRED`.

---

## J23 — Business signs a handover attestation

**Entry point.** `/supplier/:slug/requests?t=` → "Handed-off orders" →
`HandoverAttestPanel` per order (rendered alongside `MerchantFulfilmentPanel`).

**Flow (`src/features/attestation/HandoverAttestPanel.tsx`).**

- "Confirm handover" — "Ask the customer for the code they were given, then
  confirm that this job was handed over. This confirmation will be recorded as
  part of the transaction history."
- A `TextField` "Code from the customer" (from J11).
- "Confirm handover" → requires `window.ethereum`:
  1. `POST /api/tasks/:id/handover/sign-request {code}` → on a code match,
     returns EIP-712 typed data + a deadline.
  2. `eth_requestAccounts` — the connected account **must** equal
     `typedData.message.attester` (the business's on-file payout address), else
     "Connect the wallet for this business's on-file payout address…".
  3. `eth_signTypedData_v4` — the merchant signs.
  4. `POST /api/tasks/:id/handover/submit {signature}` → `submitHandoverSignature`
     relays via EAS `attestByDelegation` (or a labelled mock in staging).
     `analytics.track("handover_completed", { mode })`.
- Stages shown on the button: "Connecting wallet…" / "Waiting for your wallet…"
  / "Recording…".
- On `ATTESTED`: `Callout tone="success"` "Handover confirmed. Recorded on
  {date}." + "(Simulated — not on any real network.)" if mock + "View the
  record" explorer link if real.
- On `ATTESTATION_FAILED`: "That didn't go through. You can try again without
  re-asking for the code."

**State transitions.** `handover_attestations`: `PENDING_CODE → PENDING_SIGNATURE
→ ATTESTED` / `ATTESTATION_FAILED`.

**What the user must understand.** They sign with their own wallet (the one for
their payout address); it records that the handover happened, not the quality of
the work.

---

## J24 — Business without a manage link

**`/supplier/:slug` (no `?t=`)** → the page renders a **read-only shell**: the
header, and `Callout tone="info"` "Read-only view — Open your manage link to see
what needs you…". Every management section is gated on `canManage`.

**`/supplier/:slug/requests` or `/review` (no `?t=`)** → `notFound()` — the
Next.js 404 page (`not-found.tsx`, "That page does not exist. Go home."). These
surfaces "must fail closed… not fall through to a 'read-only' render of someone
else's live customer briefs" (`requests/page.tsx:70`).

**Recovery path.** None in the app — "Ask your Intra operator for your manage
link" (`review/page.tsx:76`). No re-issue flow ([`00` §21]).

---

## J25 — Operator verifies + activates a route

**Entry point.** `/operator` (`OperatorConsole`).

**First action.** Operator sign-in: a `password` input "operator key" →
`saveKey` stores it in `sessionStorage` (`intra.operatorKey`). Copy: "It is held
only for this browser session and never stored on a server or logged."

**Screens.** `/operator` — after sign-in, a "Operating as verified operator"
line + "Sign out", and a 3-tab `role="tablist"` (Review queue / Metrics /
Evidence).

**Information presented (Review queue).** `GET /api/operator/routes` →
`listOperatorQueue` (every non-archived route + its business). Per
`OperatorRouteCard`:

- Business name / route name · city, country / a `StatusPill` (raw status
  `.replace(/_/g," ")` — one of the few places an enum-ish label shows).
- `DataList`: Consent ("Recorded {relative}" / "Not recorded"), Order channel
  (type · value), Query fee / SLA, Last updated.
- If `canActivate` (DRAFT / PENDING_VERIFICATION / PAUSED): a `fieldset` "Confirm
  before activation" with 6 checkboxes (`ACTIVATION_CHECK_LABELS`):
  1. Quote-display consent is recorded
  2. Order channel tested and reachable
  3. Public payout address verified (ownership confirmed off-chain)
  4. Genuine, dated price source seen
  5. Response SLA agreed with the supplier
  6. Sample request run through the route

**User decisions.** Tick each of the 6 boxes (or not); activate / pause.

**Automated actions.** "Verify and activate" (disabled until `allChecked`) →
`PATCH /api/routes/:id/status {status:"ACTIVE", checklist}` → `changeRouteStatus`:
enforces the lifecycle graph, requires all 6 checks `true`, requires
`consentAt` set, stamps `verifiedAt` + `priceUpdatedAt` + the checklist, marks
the business operator-verified.

**State transitions.** route → `ACTIVE`; business `verifiedByOperatorAt` set.

**Success state.** `onChanged` re-loads the queue; the route drops out of "needs
activation".

**Failure states.** `401 OPERATOR_REQUIRED` / "That operator key was not
accepted." `409 CHECKLIST_INCOMPLETE` / `409 CONSENT_MISSING` / `409
INVALID_ROUTE_TRANSITION` → "The change did not go through." `Callout`.

**What the user must understand.** Each check is a manual attestation; activation
cannot be defaulted; the freshness clock starts now.

---

## J26 — Operator pauses a route

`/operator` → Review queue → an `ACTIVE` route card → "Pause route" → `PATCH
/api/routes/:id/status {status:"PAUSED"}`. No checklist. `BR-006` — routes can be
paused immediately for stale/inaccurate data or revoked consent.

---

## J27 — Operator responds to a request for a business

Not a UI journey in the console — `POST /api/routes/:id/quotes` accepts an
`x-operator-key` in place of `x-manage-token` (`routes/[id]/quotes/route.ts`).
The operator would use `curl` or a tool; the `QuoteResponseForm` component is
only wired for the manage-token path. (`AGENTIC_ARCHITECTURE.md` §5.4 proposes an
operator assistant; not built.)

---

## J28 — Operator reviews metrics / evidence / traces a task

**Metrics tab** (`MetricsPanel`): `GET /api/operator/metrics` → `EvidenceView`
(the same renderer as `/evidence`) + `recentEvents` (a content-free feed of the
last 25 audit events — type + timestamp). Export CSV / JSON / Refresh buttons.

**Evidence tab** (`EvidencePanel`): a task-id input → `GET
/api/operator/evidence/:taskId` → `TraceView`:

- `Callout tone="warning"` "Contains simulated records" if any attestation is a
  mock.
- Cards: Transaction (task id, status, conversation prefix, buyer decision,
  handoff confirmed), Provider (business, route, payout address + explorer, agent
  id), Commitment attestation (signed by Intra), Handover attestation (signed by
  the provider), Service payments, Consistency cross-check (commitment attested /
  handover attested / handover links to commitment [yes / MISMATCH] / any
  simulated), Timeline (raw `at · type` lines).
- The trace `disclaimer` `Callout tone="unavailable"`.

**Public equivalent** (`/evidence`): three zones (Real results with a
targets-vs-actual table / Demo data / Unavailable & external integrations) +
"What changed from feedback" + a "How these numbers are produced" `<details>` +
Download JSON / CSV.

---

## J29 — Machine agent: read capabilities, request a quote

**Not a rendered journey.** `GET /v1/:businessSlug/capabilities` →
`buildBusinessCapabilities` — a JSON document with, per route: `availability`
(`AVAILABLE` / `UNAVAILABLE` + `reason` `OK|NOT_ACTIVE|NOT_VERIFIED|STALE` + an
agent-readable `detail`), `freshness` (`priceConfirmedAt`, `maxAgeDays: 14`,
`staleAfter`, `stale`), `quoteSla`, `handoff` (human-approval + WhatsApp
mechanism, no contact value), and `orderContact` **only** on an `AVAILABLE`
route (ADR-014).

`POST /v1/:businessSlug/:routeSlug/quote` — the x402 flow:

- no `X-PAYMENT` on a paid route → `402 PAYMENT_REQUIRED` with `details.accepts`
- `X-PAYMENT` → official verify → settle → `200` + `X-PAYMENT-RESPONSE`
- bad auth → `402 PAYMENT_FAILED` (immutable `FAILED` receipt)
- facilitator unreachable → `503 PAYMENT_SERVICE_UNAVAILABLE` (retryable)
- settle timeout → `503 PAYMENT_SETTLEMENT_INDETERMINATE` (do not re-authorise)
- free route → `202`
- **with no `X402_API_KEY`: paid routes → `503`, free routes → `202`**

It creates a `tasks` row with an `agent:` session and the human's `buyerClaim`,
so the human can act on their agent-created order.

---

## J30 — Offline / connectivity loss

- `OfflineBanner` (`src/components/OfflineBanner.tsx`) — a top `role="status"`
  strip when `navigator.onLine` is false: "You are offline. Intra will keep
  showing the last loaded page; new requests need a connection."
- Any `/api/*` fetch while offline → SW returns
  `503 { success:false, error:{ code:"OFFLINE", message:"You're offline." } }`
  → `apiRequest` throws `ApiError` → the calling component shows its network-error
  state.
- A navigation while offline → SW serves the cached `/offline` page: "You're
  offline. Intra needs a connection to show your latest requests and prices. Your
  work is safe on the server — reconnect and open the page again." + "Try again"
  → `/agent`.
- `navigator.onLine` returning true fires the `online` event → `OfflineBanner`
  hides; the user re-triggers whatever failed.

**What the user must understand.** Nothing about prices, quotes, approval,
payment, fulfilment, or handover is ever served from cache — offline means the
last loaded page, not stale data (`sw.js` header comment).

---

## J31 — Supplier withdraws or cannot fulfil an order

**Trigger (not in the console UI).** `POST /api/routes/:id/quotes` with
`{withdraw:true, taskId, reason}` or `{cannotFulfil:true, taskId, reason}`
(`exception-service.ts`).

- **Withdraw before agreement** (task `AWAITING_QUOTE`/`RECOMMENDED`): →
  `FAILED` `PROVIDER_WITHDREW`.
- **Withdraw after agreement** (task `HANDOFF_READY`): → `FAILED`
  `PROVIDER_WITHDREW_AFTER_AGREEMENT`.
- **Cannot fulfil** (task `HANDOFF_READY`): → `FAILED` `PROVIDER_CANNOT_FULFILL`.

All three: live quotes → `WITHDRAWN`, `invalidateOrderPaymentsForTask`, audit
`task.failed`, `notify("task.failed")`.

**Buyer feedback.** `/tasks/:id` → `describeTaskException` renders the matching
semantic `Callout` (e.g. "The business can no longer honour the price you agreed
— After you agreed the price, the business said it can't proceed… Start a new
request if you still need the job done… Nothing was charged through Intra…").
The `FeedbackForm` opens.

---

## J32 — Completed transaction (full happy path, all layers)

The maximal journey, combining the above:

```
BUSINESS: quick-start (J15) → operator verifies + activates (J25)
BUYER: /agent conversation (J1) OR /request form (J2)
   → task AWAITING_QUOTE   [notify business]
BUSINESS: /supplier/:slug/requests?t= → send a fixed quote with an expiry (J18)
   → task RECOMMENDED   [notify buyer]
BUYER: /tasks/:id → read RecommendationCard → "Proceed with this printer" (J6)
   → task HANDOFF_READY, commitment created, handover code shown [notify both]
BUYER: PayPanel → "Pay with MiniPay" → wallet approve → tx → CONFIRMED (J8)
   [notify buyer "Payment confirmed", business "Payment received"]
BUYER: HandoffCard → "Copy message" / "Open in WhatsApp" → sends it
BUYER: "I've sent this to the printer" → handoffConfirmedAt set, feedback unlocks
BUSINESS: /supplier/:slug/requests?t= → "Handed-off orders" →
   "Mark ready for pickup" (J22) → pickup code shown [notify buyer "ready for pickup"]
BUYER: /tasks/:id → BuyerPickupPanel → "Confirm I've collected this order" (J10)
   → PICKUP_CONFIRMED [notify buyer "Your order is complete"]
BUYER (at collection): says the handover code aloud (J11)
BUSINESS: HandoverAttestPanel → enters the code → signs with wallet (J23)
   → handover attestation ATTESTED
BUYER: FeedbackForm → "Yes" + comment
```

At the end:

- `tasks` row: `HANDOFF_READY`, `handoffConfirmedAt` set, `closedAt` set.
- `order_payments` row: `CONFIRMED` with a real `txHash` + `payerAddress`.
- `proofline_events`: `READY_FOR_PICKUP` + `PICKUP_CONFIRMED`.
- `commitments` row: `ATTESTED`.
- `handover_attestations` row: `ATTESTED`.
- `feedback` row: `useful: true`.
- `audit_events`: the full trail, queryable at `/operator` → Evidence.
- `/evidence` counts this run as a **real** result.
