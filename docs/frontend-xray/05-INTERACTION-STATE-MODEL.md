# 05 — Interaction & State Model

> What happens on every meaningful interaction, and the explicit state machines
> behind them. Reverse-engineered from the lifecycle modules, service functions
> and API handlers. Nothing redesigned.
>
> Interaction notation:
>
> ```
> USER ACTION → UI RESPONSE → CLIENT STATE → API/SERVER ACTION → DB/DOMAIN STATE
>   → NOTIFICATION → NEXT UI STATE
> ```

---

# Part 1 — Interaction catalogue

## 1.1 Conversation turn (`ConversationView`)

```
type a message, press Enter (no Shift) / tap ↑
  → UI: message appended as a "you" bubble; input clears; send button spins
  → CLIENT: messages[], pending=true, turnCount++
  → API: POST /api/conversation { message }  (x-session-id header)
       → handleConversationTurn: classifyMessage (deterministic) → merge into
         accumulated UserIntent → routeReading → recordTurn (in-memory Map)
       → if action.kind === "START_RUN": startAgentRun(...) + returns run (202)
  → DB: none from the conversation itself; a run may write tasks/quotes later
  → NOTIFICATION: none (a started run's quote requests notify the business)
  → UI: an "assistant" bubble with the reply + optional optimizationNote;
        "So far:" chips update; if a run: an embedded AgentConsole mounts
        and begins polling
```

Failure: `ApiError` → inline `role="alert"` `<p>`; the "you" bubble is removed
and the draft is restored. `{reset:true}` clears the thread (cannot touch orders).

## 1.2 Start / poll an agent run (`AgentConsole`)

```
(run started by the conversation, or by IntentInput "Ask the agent")
  → CLIENT: run set, phase="working", pollRef scheduled at +700ms
  → API loop: GET /api/agent/run/:id every POLL_MS (1500), attempt < MAX_POLLS (120)
       → toAgentRunView(storedRun): stages, headline, activity, recommendation,
         alternatives, ruledOut, decision, commitment, trace
  → CLIENT: run replaced each poll; reconnecting=false; emitOnce analytics per
       stage keyed by runId
  → UI: StageList re-renders; run.headline announced (sr-only aria-live);
       when status leaves RUNNING → phase="idle", the poll stops
```

- Transient failure (`NETWORK` / `TypeError`, `misses < 5`): `reconnecting=true`,
  a "Reconnecting…" chip, backoff retry (`POLL_MS * (misses+2)`).
- `MAX_POLLS` exceeded while still `RUNNING`: `problem` = "This is taking longer
  than expected… Reload the page to pick the run back up." + "Start again".
- `404 RUN_NOT_FOUND`: `requestErrorCopy` "This run has expired…".

## 1.3 Correct the brief (`UnderstandingCard`)

```
tap "Not quite right?" → editor opens (or opens automatically on CLARIFICATION_NEEDED)
edit fields, tap "Use these details"
  → CLIENT: onCorrect({ only changed fields, others null })
  → beginRun({ request: run.request /* carried forward */, correction }, "correcting")
  → API: POST /api/agent/run { request, correction }
       → correction validated against FLYER_SIZES / FLYER_COLOURS / a YYYY-MM-DD
         regex — a correction can never widen what the brief may contain
       → a NEW run; the corrected fields outrank the parser and the model
  → UI: a fresh run replaces the old one; polling restarts
```

## 1.4 Buyer decision — accept / decline

### Via `DecisionPanel` on `/tasks/:id`

```
tap "Proceed with this printer"
  → UI: button spins (pending="ACCEPT")
  → API: POST /api/tasks/:id/decision { decision:"ACCEPT" }
         (x-session-id must match; Idempotency-Key auto-generated)
       → decideOnQuote: assertTaskTransition(RECOMMENDED → HANDOFF_READY)
       → task.buyerDecision="ACCEPTED", buyerDecidedAt, closedAt
       → the live quote gets acceptedAt (now IMMUTABLE)
       → if expired: quote status → EXPIRED, audit quote.expired
       → orderMessage regenerated (adds the "reconfirm the price" line if expired)
       → audit task.buyer_accepted + task.handoff_ready
       → createCommitmentForApproval: a commitments row PENDING_ATTESTATION;
         issueHandoverSecret (handoverCode → buyer, handoverSalt withheld)
  → DB: task HANDOFF_READY; quote acceptedAt; commitment created
  → NOTIFICATION: notify("task.handoff_ready") → buyer "Your order is ready to send"
                  notify("task.buyer_accepted") → business "A customer accepted your quote"
  → CLIENT: analytics.track("approval_accepted", { quote_expired })
  → UI: onDecided() reloads GET /api/tasks/:id → the page re-renders as S-04c
        (PayPanel + HandoffCard + HandoverCodePanel + OrderProblemPanel appear)
```

```
tap "Not this one" → textarea "Why not? (optional…)" → "Confirm — don't proceed"
  → API: POST /api/tasks/:id/decision { decision:"DECLINE", reason? }
       → decideOnQuote: task RECOMMENDED → CANCELLED; buyerDecision="DECLINED";
         buyerDeclineReason stored on the task (not in the audit payload)
       → audit task.buyer_declined
  → NOTIFICATION: notify("task.buyer_declined") → business "A customer decided
       not to proceed" (INFORMATIONAL)
  → UI: the page reloads → describeTaskException("BUYER_CANCELLED") →
        an info Callout; the FeedbackForm opens
```

### Via `ApprovalPanel` in the agent console

```
tap "Approve {price} with {business}"
  → API: POST /api/agent/run/:id/approve
         { decision:"ACCEPT", offerFingerprint, reason? }
       → approveAgentRun → submitApproval:
         - offerFingerprint must equal the one on the shown recommendation
           (a stale fingerprint → APPROVAL_STALE)
         - recordBuyerDecision (ACCEPT) — the ONLY path to it; NOT a model tool
         - the underlying task moves RECOMMENDED → HANDOFF_READY, commitment created
  → UI: OutcomePanel `Approved` with a link to /tasks/:id
```

## 1.5 WhatsApp handoff (`HandoffCard`)

```
tap "Copy message"
  → navigator.clipboard.writeText(message); button → "Copied" for 2.5s
tap "Open in WhatsApp"
  → opens https://wa.me/<digits>?text=<encodeURIComponent(message)> in a new tab
  → (no API call; Intra cannot observe WhatsApp)
(after actually sending it) tap "I've sent this to the printer"
  → API: POST /api/tasks/:id/handoff-confirm  (idempotent)
       → confirmHandoff: sets task.handoffConfirmedAt; appends a content-free
         task.handoff_confirmed audit event; NO task status change
  → UI: "You marked this as sent on {date}."; the FeedbackForm + BuyerPickupPanel
        become available; OrderProblemPanel disappears
```

## 1.6 MiniPay order payment (`PayPanel` / `useOrderPayment`)

```
tap "Pay with MiniPay"  (guarded by startedRef so a double-tap is a no-op)
  → CLIENT: phase="creating"
  → API: POST /api/tasks/:id/order-payment  (idempotent within the window)
       → createOrderPaymentIntent: requires task.status === "HANDOFF_READY";
         reads recipient / USDC amount / a LOCKED NGN→USD rate from the commitment
         (rate source down → 503, never guessed)
  → CLIENT: phase="wallet"; the DataList gains "You'll pay {n} USDC" + the rate hint
  → WALLET: wallet-adapter.payOrder — lazy-import viem; ensure Celo (attempt
       wallet_switchEthereumChain); encodeFunctionData(erc20Abi, "transfer");
       sendTransaction → { txHash }   ← the ONLY value the client submits
  → CLIENT: phase="submitting"
  → API: POST /api/tasks/:id/order-payment/submit { txHash }
       → recordSubmittedOrderPayment: status → CONFIRMING; audit
         order_payment.submitted; schedule verifyOrderPayment via after()
  → CLIENT: phase="confirming"; poll GET .../order-payment every 2500ms
  → SERVER: verifyOrderPayment reads the real Celo receipt — chain + success +
       USDC `to` + a single Transfer to the recipient for the exact amount →
       status CONFIRMED; payerAddress recorded from the on-chain `from`
  → DB: order_payments CONFIRMED; tx_hash unique
  → NOTIFICATION: buyer "Payment confirmed" (COMPLETED); business "Payment received"
  → UI: a "Payment confirmed" Card + a <details> → explorer link
```

Branches: wallet rejected → `POST .../cancel` → phase `cancelled`; wrong chain →
`WalletPayError("WRONG_CHAIN")`; server unreachable after the tx → phase
`confirming` + "reopen the order and it will pick up"; a terms change →
`invalidateOrderPaymentsForTask` → the intent `EXPIRED`.

## 1.7 Proofline

```
MERCHANT: tap "Mark ready for pickup"  (/supplier/:slug/requests)
  → API: POST /api/tasks/:id/proofline/ready  (x-manage-token; idempotent)
       → markReadyForPickup: requires task.handoffConfirmedAt
       → a READY_FOR_PICKUP proofline_events row (append-only) + a 6-char pickupCode
  → DB: proofline evidence NOT_STARTED → MERCHANT_MARKED_READY
  → NOTIFICATION: buyer "Your order is ready for pickup" (ACTION_REQUIRED)
  → UI (merchant): the pickup code in a mono box; router.refresh()

BUYER: tap "Confirm I've collected this order"  (/tasks/:id)
  → API: POST /api/tasks/:id/proofline/confirm-pickup  (x-session-id, or { code })
       → confirmPickup: accepted if the session matches (method:"buyer_session")
         OR the code matches (method:"one_time_code", case-insensitive)
       → a PICKUP_CONFIRMED proofline_events row
  → DB: MERCHANT_MARKED_READY → BUYER_CONFIRMED_PICKUP
  → NOTIFICATION: buyer "Your order is complete" (COMPLETED)
  → UI: Callout tone="success" "You confirmed pickup"
```

Replay: a second `ready` / `confirm-pickup` → `409`. Wrong/replayed code → never
records anything.

## 1.8 Handover attestation

```
BUYER: (in person) says the handover code aloud

MERCHANT: enter the code, tap "Confirm handover"  (/supplier/:slug/requests)
  → requires window.ethereum
  → API: POST /api/tasks/:id/handover/sign-request { code }  (x-manage-token)
       → requestHandoverSignature: on a code match, returns EIP-712 typed data
         + a real EAS `deadline` + a frozen signNonce
  → WALLET: eth_requestAccounts — the account MUST equal typedData.message.attester
       (the business's on-file payout address); else an error
       → eth_signTypedData_v4 → a 65-byte signature
  → API: POST /api/tasks/:id/handover/submit { signature }  (idempotent)
       → submitHandoverSignature → EAS attestByDelegation (or a labelled mock)
  → DB: handover_attestations PENDING_CODE → PENDING_SIGNATURE → ATTESTED
  → NOTIFICATION: none
  → UI: Callout tone="success" "Handover confirmed. Recorded on {date}."
        + "(Simulated — not on any real network.)" | "View the record"
```

## 1.9 Notifications

```
open a NotificationRow  (ActionCentre)
  → CLIENT: OPTIMISTIC — unread--, item.read=true, follow item.deeplink immediately
  → API (fire-and-forget): POST /api/notifications/:id/read
       → markNotificationRead scoped to (audience, recipientKey); a mismatch → 404
       → recordPilotEvent("notification_opened")
  → UI: the deeplink page loads; the row shows as read on return

tap "Mark all as read"
  → CLIENT: OPTIMISTIC — clear the badge, mark every row read
  → API: POST /api/notifications/read-all  (on failure → reload)
```

Push subscribe (`usePushSetup.enable`):

```
tap "Enable notifications" / the toggle
  → Notification.requestPermission() → "granted" | "denied" | "default"
  → if granted: navigator.serviceWorker.ready → pushManager.subscribe(
       { userVisibleOnly:true, applicationServerKey: urlBase64ToKey(vapidPublicKey) })
  → API: POST /api/push/subscribe { endpoint, keys, userAgent }
       → savePushSubscription bound to the SERVER-resolved recipient (a client id
         is never trusted); setPreferences({ pushEnabled:true })
  → CLIENT: subscribed=true
```

## 1.10 Supplier quote / revise / decline (`QuoteResponseForm`, `ChangePriceForm`)

```
"Send a quote" toggle, fill fields, tap "Send quote to buyer"
  → validate() locally (amount ≥ 0, max ≥ min, turnaround non-empty)
  → API: POST /api/routes/:id/quotes { taskId, amountMin, amountMax?,
         deliveryCharge?, turnaround, availabilityNote?, assumptions?, confidence?,
         fixed?, expiresAt? }  (x-manage-token; Idempotency-Key)
       → submitQuote: loadAwaitingTask (route ACTIVE, task AWAITING_QUOTE,
         no existing recommendation)
       → insert a RECEIVED quote; build a Recommendation (+ a never-sent
         orderMessage); task AWAITING_QUOTE → RECOMMENDED (stamp quotedAt)
       → audit quote.received + recommendation.created
  → NOTIFICATION: notify("recommendation.created") → buyer "A quote is ready for
       your decision" (ACTION_REQUIRED)
  → UI: Callout tone="success" "Quote sent — The buyer will now review your quote…"
        router.refresh()
```

```
"Decline" toggle, reason, tap "Decline this request"
  → API: POST /api/routes/:id/quotes { decline:true, taskId, reason }
       → declineRequest: insert a DECLINED quote (amount "0.00"); task → FAILED
         (failureReason "SUPPLIER_DECLINED"); audit quote.declined + task.failed
  → NOTIFICATION: notify("task.failed") → buyer semantic exception
```

```
ChangePriceForm, tap "Send the new price" / "Ask the customer to accept"
  → API: POST /api/routes/:id/quotes { revise:true, taskId, amountMin, turnaround, reason }
       → reviseQuote:
         - if the buyer has NOT accepted: REPLACED — old row SUPERSEDED, a new
           RECEIVED row, the recommendation + orderMessage regenerated;
           notify("quote.revised") → buyer "The business sent a different price"
         - if the buyer HAS accepted: CHANGE_PROPOSED — a PROPOSED row pointing at
           the accepted one; the accepted row untouched;
           notify("quote.change_proposed") → buyer "The business proposed a new price"
```

## 1.11 Buyer decides on a price change (`PriceChangePanel`)

```
tap "Accept {new amount}" / "Keep the price I agreed"
  → API: POST /api/tasks/:id/price-change { decision }  (x-session-id)
       → decideOnPriceChange:
         - ACCEPT: the accepted row → SUPERSEDED (never edited); the PROPOSED row
           → RECEIVED + acceptedAt; recommendation + orderMessage regenerated;
           audit quote.change_accepted; invalidateOrderPaymentsForTask
         - DECLINE: the PROPOSED row → WITHDRAWN; the agreed row stands; audit
           quote.change_declined
  → UI: onDecided() reloads the task; the panel disappears
```

## 1.12 Operator verify + activate (`OperatorRouteCard`)

```
tick all 6 checkboxes, tap "Verify and activate"  (disabled until allChecked)
  → API: PATCH /api/routes/:id/status { status:"ACTIVE", checklist }
         (x-operator-key)
       → changeRouteStatus: enforce the lifecycle graph; require all 6 checks true
         + consentAt set; stamp verifiedAt + priceUpdatedAt + the checklist;
         mark the business operator-verified
  → DB: route → ACTIVE; business.verifiedByOperatorAt set
  → CLIENT: forward a business_ready analytics event
  → UI: onChanged() reloads the queue; the route drops out of "needs activation"
```

Errors: `409 CHECKLIST_INCOMPLETE`, `409 CONSENT_MISSING`, `409
INVALID_ROUTE_TRANSITION`, `401 OPERATOR_REQUIRED` → a per-card `Callout
tone="warning"`.

## 1.13 Route pause (`PauseRouteButton` / operator)

```
tap "Pause route" → confirm ("Pause this route now? Buyers cannot send new
  requests until an operator reactivates it.") → "Yes, pause route"
  → API: PATCH /api/routes/:id/status { status:"PAUSED" }
         (x-manage-token OR x-operator-key)
  → DB: route ACTIVE → PAUSED
  → UI: router.refresh()
```

## 1.14 Order exceptions (`OrderProblemPanel`)

```
open "Something wrong with this order?" → "Cancel this order" | "The pickup or
  handover failed" → optional note → the action button
  → API: POST /api/tasks/:id/cancel { reason? }  OR  .../handover-problem { detail? }
       → buyerCancelsAfterAgreement / reportHandoverFailure:
         task HANDOFF_READY → CANCELLED / FAILED; live quotes → WITHDRAWN;
         invalidateOrderPaymentsForTask; audit; notify — NEVER invent a refund
  → UI: the page reloads → the semantic exception Callout; the FeedbackForm opens
```

## 1.15 Feedback (`FeedbackForm`)

```
tap "Yes" / "Not really" → optional comment → "Send feedback"
  → API: POST /api/feedback { taskId, useful, comment? }  (no session required;
         404 TASK_NOT_FOUND if the task is unknown)
  → CLIENT: analytics.track("feedback_submitted", { useful, has_comment })
  → UI: Callout tone="success" "Thanks for the feedback."
```

## 1.16 Back / navigation / retry

- **Back**: standard browser history. The agent-console thread is client state —
  navigating away and back re-mounts `/agent` with a fresh `ConversationView`
  (the thread is gone). `/tasks/:id` is fully resumable from the server.
- **Retry**: every failed fetch surfaces a "Try again" button that re-invokes the
  same `load` callback; writes are idempotent (the key replays the stored
  response) except `OrderProblemPanel` (a fresh key per attempt, deliberately).
- **Refresh**: RSC pages (`/supplier/*`, `/evidence`) re-fetch on the server;
  client pages re-run their `useEffect` load; a `router.refresh()` after a
  merchant mutation re-renders the RSC.

## 1.17 PWA / deep link / async completion

- **Deep link from a push**: `sw.js` `notificationclick` → focus/open a window at
  `deeplink?ref=push` → `ResumeSignal` fires a resume ping.
- **Async completion the user is not watching**: a MiniPay `CONFIRMED` while the
  tab is closed → the server forwards `payment_confirmed` analytics and writes an
  `order_payment.confirmed` notification; the buyer sees it in `ActionCentre` /
  push on their next visit.
- **Workflow resume**: `BuyerWorkPanel` reads persisted state on every load, so a
  person who missed a notification still sees the task in the right bucket with
  the right action pill.

---

# Part 2 — Explicit state machines

## 2.1 Buyer request (task) — `src/features/tasks/{status,lifecycle}.ts`

```
        ┌─────────┐
        │  DRAFT  │  created by POST /api/tasks (or the agent's /v1 quote)
        └────┬────┘
             │ POST /api/tasks/:id/submit  (buyer, valid brief, route ACTIVE)
             ▼
        ┌───────────┐
        │ SUBMITTED │  (transient — immediately advanced)
        └─────┬─────┘
              │ (submitTask, same call)
              ▼
      ┌────────────────┐
      │ AWAITING_QUOTE │  [notify BUSINESS "New customer request"]
      └───────┬────────┘   an UNAVAILABLE service_payments row is written here
              │
      ┌───────┴───────────────────────────┐
      │ POST /api/routes/:id/quotes       │ POST /api/routes/:id/quotes {decline}
      │   (submitQuote)                   │   (declineRequest)  OR withdraw
      ▼                                   ▼
 ┌─────────────┐                     ┌────────┐
 │ RECOMMENDED │                     │ FAILED │  failureReason: SUPPLIER_DECLINED
 └──────┬──────┘  [notify BUYER      └────────┘  / PROVIDER_WITHDREW / NO_VIABLE_OFFER
        │          "A quote is ready"]           / ROUTE_UNAVAILABLE
        │
   ┌────┴───────────────────────────────────┐
   │ POST /api/tasks/:id/decision {ACCEPT}  │ {DECLINE}
   ▼                                        ▼
┌───────────────┐                     ┌───────────┐
│ HANDOFF_READY │                     │ CANCELLED │  buyerDecision: DECLINED
└───────┬───────┘  [notify BOTH]      └───────────┘
        │  commitment created; handover code issued
        │
   ┌────┴──────────────────────────────┐
   │ POST .../cancel                   │ POST .../handover-problem
   │  OR provider withdraw/cannotFulfil│
   ▼                                   ▼
┌───────────┐                     ┌────────┐
│ CANCELLED │                     │ FAILED │  HANDOVER_FAILED /
└───────────┘                     └────────┘  PROVIDER_CANNOT_FULFILL /
 BUYER_CANCELLED_AFTER_AGREEMENT               PROVIDER_WITHDREW_AFTER_AGREEMENT
```

| State            | Meaning                                        | Who transitions                                                        | Allowed next                            | Forbidden             | UI representation                                   | Recovery                         |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- | --------------------- | --------------------------------------------------- | -------------------------------- |
| `DRAFT`          | task exists, brief not validated               | buyer (submit)                                                         | `SUBMITTED`, `CANCELLED`                | any other             | not usually shown (created + submitted in one flow) | resubmit                         |
| `SUBMITTED`      | brief valid, route re-checked                  | system (same call)                                                     | `AWAITING_QUOTE`, `FAILED`, `CANCELLED` | `RECOMMENDED`         | transient                                           | —                                |
| `AWAITING_QUOTE` | with the business                              | business (quote/decline), system                                       | `RECOMMENDED`, `FAILED`, `CANCELLED`    | `HANDOFF_READY`       | "Waiting for a price" `StatusPill` (pending)        | re-open to check; no user action |
| `RECOMMENDED`    | a quote is in front of the buyer               | buyer (decision), business (revise)                                    | `HANDOFF_READY`, `CANCELLED`, `FAILED`  | direct to feedback    | "Quote ready — your decision"; `DecisionPanel`      | accept / decline                 |
| `HANDOFF_READY`  | buyer accepted; **terminal for the lifecycle** | buyer (cancel / handover-problem), provider (withdraw / cannot-fulfil) | `CANCELLED`, `FAILED`                   | back to `RECOMMENDED` | "Ready to send"; `PayPanel` + `HandoffCard` + …     | `OrderProblemPanel`              |
| `FAILED`         | closed unhappily                               | —                                                                      | none                                    | any                   | `describeTaskException` `Callout`                   | "Send a new request"             |
| `CANCELLED`      | buyer chose not to proceed                     | —                                                                      | none                                    | any                   | `describeTaskException` `Callout`                   | "Send a new request"             |

Read-time overlays on top of the status:

- `quote.effectiveStatus` — `EXPIRED` if a `RECEIVED` quote is past `expiresAt`.
- `priceChange` — a `PROPOSED` quote row on a `HANDOFF_READY` task.
- `proofline.evidenceStatus` — only after `handoffConfirmedAt`.
- `orderPayment.status` — only on `HANDOFF_READY`.
- `exception` — non-null only on `FAILED` / `CANCELLED`.

## 2.2 Conversation intent — `src/features/intent/types.ts`, `routing.ts`

```
   CONVERSATION ──┐  (greeting, thanks — a plain reply)
   INFORMATIONAL ─┤  (a question about what Intra/a business can do)
                  │
   DISCOVERY ─────┤
   COMPARISON ────┼──► routeReading:
   QUOTE_REQUEST ─┘      resolveDomain(category)
                           │ null        → ASK "What kind of service…?"
                           │ !serviceable→ EXPLAIN_UNAVAILABLE (no fake marketplace)
                           │ serviceable → missingForQuote(domain, intent)
                           │                 non-empty → ASK for the fields
                           │                 empty     → START_QUOTE (→ an agent run)
   TRANSACTION ──────────► RESUME_TRANSACTION "That decision stays with you on
                           the order itself…"  (never handled in the chat)
   FULFILLMENT ──────────► RESUME_FULFILLMENT "You confirm pickup or handover
                           from the order page…"
```

- **Confidence floor** `INTENT_CONFIDENCE_FLOOR = 0.5` — below it, ask rather
  than guess a workflow.
- **Topic switch** — if this message's category ≠ the stored category, the
  accumulated intent is cleared before merging (`conversation.ts:120`).
- The classification is **deterministic** (`classifyMessage` — regex/keyword);
  only the _run_ it can start is LLM-assisted.

Serviceable today: `printing` only. `food`, `electronics`, `design`, `delivery`,
`repair` are represented and routed but each returns an honest "not available"
note (`domain.ts:48`).

## 2.3 Discovery / agent run — `src/features/agent/run/{store,stages}.ts`

**Internal state** (`AgentRunState`, 13 values) → **buyer stage** mapping:

| Internal state         | Stage      | Internal state      | Stage         |
| ---------------------- | ---------- | ------------------- | ------------- |
| `CREATED`              | understand | `AWAITING_QUOTES`   | quote         |
| `CLARIFICATION_NEEDED` | understand | `COMPARING`         | compare       |
| `DISCOVERING`          | discover   | `AWAITING_APPROVAL` | decide        |
| `READING_CAPABILITIES` | check      | `APPROVED`          | record        |
| `PLANNING`             | check      | `DECLINED`          | decide        |
| `REQUESTING_QUOTES`    | quote      | `NO_VIABLE_OFFER`   | compare       |
|                        |            | `FAILED`            | (by counters) |

**Run status** (client-visible): `RUNNING` → `AWAITING_APPROVAL` /
`CLARIFICATION_NEEDED` → `APPROVED` / `DECLINED`; or `NO_VIABLE_OFFER` / `FAILED`.

**Stage status per stage**: `pending` → `active` → `waiting` (only `quote`, when
`quotesReceived < quotesRequested`) → `done`; or `blocked` (the run stopped here)
/ `needs-you` (`decide` when `AWAITING_APPROVAL`) / `skipped` (never ran and
never will).

Where a failed run "stopped" is read from counters, not the state name
(`terminalStage`): quotes received → `compare`; quotes requested → `quote`;
providers found → `check`; else `discover`.

**Store**: in-memory `Map` on `globalThis`, `TTL_MS = 30 min` (swept on every
get/put), `MAX_RUNS = 200`. Bound to `buyerSessionId` — another device gets
`403 NOT_YOUR_RUN`. A server restart drops all runs; the DB rows survive.

## 2.4 Quote — `src/features/quotes/{status,revision,expiry}.ts`

```
              (a quote request exists)
                       │
      submitQuote      │
                       ▼
                 ┌──────────┐
   reviseQuote   │ RECEIVED │  the live offer; a buyer can accept it
   (before       └────┬─────┘
    acceptance) ──────┤
    → old: SUPERSEDED  │ buyer accepts (decideOnQuote) → acceptedAt set (IMMUTABLE)
                       │
   past expiresAt      │ reviseQuote (after acceptance) → a new PROPOSED row
   at read time        │
        │              │
        ▼              ▼
   ┌─────────┐   ┌──────────┐   buyer decides (decideOnPriceChange):
   │ EXPIRED │   │ PROPOSED │     ACCEPT → this becomes RECEIVED+acceptedAt,
   └─────────┘   └────┬─────┘              the prior accepted row → SUPERSEDED
   (accepting an      │ DECLINE → WITHDRAWN
    expired quote     │
    is still allowed) ▼
             ┌────────────┐
             │ SUPERSEDED │  replaced by a newer offer the buyer saw
             │ WITHDRAWN  │  a refused PROPOSED change, or a pulled offer,
             │            │  or a live quote closed by an order exception
             └────────────┘

  declineRequest → ┌──────────┐
                   │ DECLINED │  the business turned the job down (task → FAILED)
                   └──────────┘
```

| State                 | Meaning                                     | Live?      | Buyer-facing copy (`QUOTE_STATUS_COPY`)                  |
| --------------------- | ------------------------------------------- | ---------- | -------------------------------------------------------- |
| `PENDING`             | request with no answer                      | no         | "Waiting for a price"                                    |
| `RECEIVED`            | a real offer                                | **yes**    | "Current offer"                                          |
| `PROPOSED`            | a change to an ACCEPTED offer, not in force | no         | "Change proposed — needs your decision"                  |
| `SUPERSEDED`          | replaced                                    | no         | "Replaced by a newer price"                              |
| `WITHDRAWN`           | refused change / pulled offer               | no         | "Withdrawn"                                              |
| `EXPIRED` (read-time) | past `expiresAt`                            | acceptable | "Expired — the business no longer guarantees this price" |
| `DECLINED`            | job turned down                             | no         | "The business turned this job down"                      |

**Integrity invariant**: once a buyer has accepted a row, that row is immutable.
A different price is _always_ a new `PROPOSED` row; there is no code path that
edits an accepted row's amount/currency/turnaround/expiry
(`revision.ts` header comment).

## 2.5 Approval / commitment — `src/features/commitments/{status,service}.ts`

```
  quote (RECEIVED)
    │ human approval (decideOnQuote ACCEPT / approveAgentRun ACCEPT)
    ▼
  commitments row: PENDING_ATTESTATION
    │ createCommitmentForApproval — LOCAL + transactional with the approval
    │ (an approved decision can never be lost to a network failure)
    │ issueHandoverSecret: handoverCommit = keccak256(code‖salt) published;
    │                      handoverCode → buyer only; handoverSalt withheld
    │
    │ POST /api/tasks/:id/commitment  (retry, idempotent) — attestCommitment
    ▼
  ┌──────────┐            ┌────────────────────┐
  │ ATTESTED │            │ ATTESTATION_FAILED │  the EAS write failed —
  └──────────┘            └────────────────────┘  retryable; NEVER reports
   (mock in staging,       "the agreed price and terms are safely recorded"
    on-chain in production) stands regardless
```

`validUntil` is always set: `QUOTE_EXPIRY` if the quote had a future expiry, else
`DEFAULT_WINDOW` (24h) — "a commitment with no expiry is not a commitment"
(`status.ts:227`).

## 2.6 Handover attestation — `src/features/attestation/handover-status.ts`

```
  commitment exists (buyer has the code)
    ▼
  ┌──────────────┐
  │ PENDING_CODE │  the merchant has not presented the code yet
  └──────┬───────┘
         │ POST .../handover/sign-request { code }  — code matches
         ▼
  ┌───────────────────┐
  │ PENDING_SIGNATURE │  EIP-712 typed data + a frozen signNonce + a real EAS
  └────────┬──────────┘  deadline (HANDOVER_SIGN_WINDOW_MS = 10 min) issued
           │ POST .../handover/submit { signature }  — merchant's own wallet
           ▼
  ┌──────────┐            ┌────────────────────┐
  │ ATTESTED │            │ ATTESTATION_FAILED │  retryable FROM PENDING_SIGNATURE
  └──────────┘            └────────────────────┘  — never silently re-presents
   attestByDelegation                              the code
   relayed on-chain (or mock)
```

2-of-2: the merchant's key proves their participation; possession of the code
proves the buyer handed it over in person; **the server is a non-signing
referee** and cannot attest alone (ADR-018).

## 2.7 Service payment (x402 query fee) — `src/features/payments/status.ts`

```
  submitTask (buyer web flow) → an UNAVAILABLE row is written immediately
                                (no X402_API_KEY configured)

  /v1/:slug/:route/quote:
    NOT_REQUIRED  ── free route, or the request came through the web
    REQUESTED_402 ── a 402 challenge was issued (paid route, no X-PAYMENT)
       │ X-PAYMENT presented
       ▼
    AUTHORISED ──── verify OK, settle result INDETERMINATE (timeout / no hash)
       │                → 503 PAYMENT_SETTLEMENT_INDETERMINATE; DO NOT re-authorise
       ▼
    SETTLED ─────── facilitator-verified + a real mainnet tx hash  (the ONLY
                    state that renders as "paid")
    FAILED ──────── undecodable header / over-cap / verify.isValid=false /
                    on-chain revert  → 402 PAYMENT_FAILED (retryable by the agent)
    UNAVAILABLE ─── no key / bad X402_* config / facilitator unreachable
                    → 503 PAYMENT_SERVICE_UNAVAILABLE (not the agent's fault)
```

- `service_payments` is **append-only** — a row is written once with its final
  status; a `SETTLED` row is never edited (`BR-005`).
- Buyer-facing labels (`TaskPage.tsx:PAYMENT_LABEL`): Not charged / Payment
  requested / Reconciling / Paid / Did not go through / Unavailable.

## 2.8 Order payment (MiniPay) — `src/features/payments/order/status.ts`

```
  POST .../order-payment (createOrderPaymentIntent) — requires task HANDOFF_READY
    ▼
  ┌─────────┐
  │ CREATED │  intent minted from the accepted commitment; nothing on-chain
  └────┬────┘  frozen: recipientAddress, amountAtomic, ngnUsdRate + source + time
       │ the buyer opens their wallet
       ▼
  ┌────────────────┐
  │ AWAITING_WALLET│
  └───────┬────────┘
          │ POST .../submit { txHash }
          ▼
  ┌───────────┐        ┌────────────┐
  │ SUBMITTED │ ─────► │ CONFIRMING │  server verification in progress / retrying
  └───────────┘        └─────┬──────┘  (verifyOrderPayment, ≤ 8 attempts)
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌───────────┐        ┌────────┐          ┌─────────┐
  │ CONFIRMED │        │ FAILED │          │ EXPIRED │  window passed, or the
  └───────────┘        └────────┘          └─────────┘  commercial terms changed
   receipt: chain +     the tx reverted,               (invalidateOrderPaymentsForTask)
   success + USDC to +   or the receipt does
   a single Transfer     not match the intent
   for the exact amount

  ┌───────────┐
  │ CANCELLED │  the buyer dismissed the wallet — the ORDER is untouched
  └───────────┘
```

- One live non-terminal intent per commitment (a partial unique index +
  `TX_ALREADY_USED` + `matchReceipt`'s recipient+amount binding).
- Window: `ORDER_PAYMENT_WINDOW_MS = 30 min`.
- The client submits **only** the tx hash; the server never trusts a client
  "success" (M10.5 §18).

## 2.9 Route lifecycle — `src/features/routes/schema.ts` + `docs/API.md`

```
  ┌───────┐  createRoute / quickStart
  │ DRAFT │
  └───┬───┘
      │ PATCH status  (operator OR manage token)
      ▼
  ┌───────────────────────┐
  │ PENDING_VERIFICATION  │
  └───────────┬───────────┘
              │ PATCH status ACTIVE  (operator ONLY + all 6 checks + consentAt)
              ▼
        ┌──────────┐  ◄────────────────────┐
        │  ACTIVE  │                       │ PATCH status ACTIVE
        └────┬─────┘                       │  (operator ONLY, re-checks)
             │ PATCH status PAUSED         │
             │  (operator OR manage token) │
             ▼                             │
        ┌────────┐ ────────────────────────┘
        │ PAUSED │
        └────────┘

  any state → ARCHIVED  (terminal; not offered to buyers)
```

**Read-time overlay: "stale".** An `ACTIVE` route whose `priceUpdatedAt` is > 14
days old is treated as `UNAVAILABLE` by `routeIsQuoteReady` and the capability
doc, without a status change. Only an operator's re-activation (which re-stamps
`priceUpdatedAt`) clears it.

`routeIsQuoteReady` gate (used by `/v1/quote`, `RequestForm`'s route list, task
submit): `ACTIVE` **and** `verifiedAt` set **and** the business is
operator-verified **and** not stale → `OK`; else `NOT_ACTIVE` / `NOT_VERIFIED` /
`STALE`.

## 2.10 Proofline evidence — `src/features/proofline/{status,view}.ts`

```
  ┌─────────────┐
  │ NOT_STARTED │  (default; only meaningful after task.handoffConfirmedAt)
  └──────┬──────┘
         │ merchant: POST .../proofline/ready   (READY_FOR_PICKUP event)
         ▼
  ┌──────────────────────┐
  │ MERCHANT_MARKED_READY │  pickupCode issued (merchant view only)
  └──────────┬───────────┘
             │ buyer: POST .../proofline/confirm-pickup
             │   (buyer_session OR one_time_code)   (PICKUP_CONFIRMED event)
             ▼
  ┌───────────────────────┐
  │ BUYER_CONFIRMED_PICKUP │  terminal for the pilot
  └───────────────────────┘
```

- `proofline_events` is append-only; **at most one** `READY_FOR_PICKUP` and one
  `PICKUP_CONFIRMED` per task.
- **Forbidden**: any event before `handoffConfirmedAt` (`409
HANDOFF_NOT_CONFIRMED`); `confirm-pickup` before `ready` (`409
NOT_READY_FOR_PICKUP`); a second of either (`409`).
- The current status is `events[events.length-1].evidenceStatus`, or
  `NOT_STARTED` if empty.
- No public reliability / reputation / on-time score is derived (`FR-PROOF-006`).

## 2.11 Notifications — `src/features/notifications/{attention,catalogue}.ts`

A notification is **a current attention item, not a log line**. `notify(db, {
event, taskId, quoteId? })` → `specsForEvent(ctx)` returns 0..N `NotificationSpec`s.

**Level state** per item: `INFORMATIONAL` | `ACTION_REQUIRED` | `TIME_SENSITIVE`
| `COMPLETED`. `ACTION_REQUIRED` / `TIME_SENSITIVE` → the "Needs your attention"
group; the rest → "Updates".

**Read state**: unread → read (`read_at` set). Reading ≠ acting on the underlying
workflow (`docs/API.md`; `notifications/[id]/read/route.ts` comment).

**Dedupe**: one row per `(audience, recipientKey, dedupeKey)`. `dedupeKey` is
`order:{taskId}` (buyer) or `request:{taskId}` (business) — a repeat event about
the same order **updates the row and re-surfaces it unread**, never piles up.

**Event → notification map** (verified, `specsForEvent`):

| Domain event                         | BUYER notification                                      | BUSINESS notification                                                                                                              |
| ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `task.awaiting_quote`                | —                                                       | "New customer request" (ACTION_REQUIRED)                                                                                           |
| `recommendation.created`             | "A quote is ready for your decision" (ACTION_REQUIRED)  | —                                                                                                                                  |
| `quote.revised`                      | "The business sent a different price" (ACTION_REQUIRED) | —                                                                                                                                  |
| `quote.change_proposed`              | "The business proposed a new price" (ACTION_REQUIRED)   | —                                                                                                                                  |
| `task.handoff_ready`                 | "Your order is ready to send" (ACTION_REQUIRED)         | —                                                                                                                                  |
| `task.buyer_accepted`                | —                                                       | "A customer accepted your quote" (ACTION_REQUIRED)                                                                                 |
| `task.buyer_declined`                | —                                                       | "A customer decided not to proceed" (INFORMATIONAL) or "A customer cancelled an agreed order" (ACTION_REQUIRED) if after agreement |
| `task.failed`                        | the semantic exception (headline + action/next)         | "A handover did not complete" (ACTION_REQUIRED) only for `HANDOVER_FAILED`                                                         |
| `proofline.ready_for_pickup`         | "Your order is ready for pickup" (ACTION_REQUIRED)      | —                                                                                                                                  |
| `proofline.pickup_confirmed`         | "Your order is complete" (COMPLETED)                    | —                                                                                                                                  |
| `order_payment.confirmed`            | "Payment confirmed" (COMPLETED)                         | —                                                                                                                                  |
| `order_payment.received`             | —                                                       | "Payment received" (INFORMATIONAL)                                                                                                 |
| `order_payment.pending_verification` | "We're still confirming your payment" (INFORMATIONAL)   | —                                                                                                                                  |
| `order_payment.failed`               | "Your payment didn't go through" (ACTION_REQUIRED)      | —                                                                                                                                  |

**Push gate**: `ACTION_REQUIRED` / `TIME_SENSITIVE` push whenever push is on;
`INFORMATIONAL` / `COMPLETED` only if `notification_preferences.pushInformational`.
Push is fire-and-forget — a failed push never fails the domain action; invalid
subscriptions (404/410) are deleted, repeated soft failures prune after 3.

## 2.12 Business job lifecycle (the merchant's mental model)

Not a stored enum — the merchant workspace derives it from task/quote/proofline
state (`getSupplierWorkspace`, `getBusinessValueSummary`):

```
  a request arrives                → "incoming" (task AWAITING_QUOTE)
    │ send a quote
    ▼
  waiting on the customer          → "quoted, not agreed" (task RECOMMENDED,
    │                                 no acceptedAt, no pending change)
    │ customer accepts
    ▼
  in progress                      → "quoted, agreed" (acceptedAt set)
    │ buyer confirms the handoff
    ▼
  to hand over                     → "handedOff" (task HANDOFF_READY,
    │                                 handoffConfirmedAt set, proofline NOT_STARTED)
    │ mark ready → buyer confirms pickup → sign the handover
    ▼
  completed                        → proofline BUYER_CONFIRMED_PICKUP (counts
                                      toward "Jobs completed")
```

A `changePending` quote outranks everything — "Price change waiting".
Terminal-unhappy tasks (`FAILED` / `CANCELLED`) drop out of the workspace
counters.

## 2.13 Buyer work grouping — `src/features/tasks/work.ts`

`listBuyerWork` maps every task into exactly one of 5 groups via `derive()`:

| Group         | Condition (priority order)                      | Headline                                                                                | Action pill      |
| ------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `COMPLETED`   | proofline confirmed                             | "Order complete — you confirmed the handover."                                          | —                |
| `ATTENTION`   | `FAILED`/`CANCELLED` **with** an `actionNeeded` | the exception headline                                                                  | "See what to do" |
| `COMPLETED`   | `FAILED`/`CANCELLED` **without** an action      | "This request is closed."                                                               | "View"           |
| `ATTENTION`   | `changePending`                                 | "{business} proposed a new price."                                                      | "Review"         |
| `READY`       | `HANDOFF_READY` **and** proofline ready         | "Your order is ready for pickup{with X}."                                               | "Confirm pickup" |
| `ATTENTION`   | `HANDOFF_READY` **and** `!handoffConfirmedAt`   | "You accepted the quote — send your order to the business."                             | "Open and send"  |
| `IN_PROGRESS` | `HANDOFF_READY` **and** `handoffConfirmedAt`    | "Your order is being prepared{with X}."                                                 | "View"           |
| `ATTENTION`   | `RECOMMENDED`                                   | "A quote is ready for your decision."                                                   | "Review"         |
| `WAITING`     | `AWAITING_QUOTE`                                | "Waiting for {business} to send a price." / "Finding businesses and asking for prices." | "View"           |
| `WAITING`     | `DRAFT`/`SUBMITTED`                             | "Getting your request ready."                                                           | "View"           |

`actionRequired` is set on all the `ATTENTION` + `READY` cases → the pill renders
primary; `view.attention` counts them.

---

# Part 3 — Cross-cutting rules

- **Idempotency** (`runIdempotent`): every write scopes by
  `<operation>:<entity>` + the `Idempotency-Key` + a hash of the body. Same key +
  same body → the stored response is replayed. Same key + different body →
  `409 IDEMPOTENCY_KEY_CONFLICT`. The `/v1` quote folds `sha256(X-PAYMENT)` into
  the _scope_ so an unpaid probe and its paid retry under one key both replay.
- **Ownership** (`taskBelongsToSession`): a buyer decision authorises on a match
  against `task.sessionId` **or** `task.buyerClaimSession` (set once, at
  creation, immutable). This is how a human can act on an agent-created order.
- **Contact revelation**: `getTaskView` withholds `supplier.contactChannelValue`
  until `task.status === "HANDOFF_READY"`. `supplier.name` / `city` appear from
  `RECOMMENDED`.
- **The model never mutates**: `recordBuyerDecision` (ACCEPT), the order-payment
  controller, and every write path are outside `MODEL_TOOLS`. A model failure
  falls the run back to deterministic; it can never produce an invalid row, a
  fabricated price, or a fabricated payment (ADR-019, keystone rule).
- **`after()` for background work**: `startAgentRun` and the order-payment
  verifier schedule work with `next/server`'s `after()`; outside a request scope
  (a test) they fall back to plain fire-and-forget.
- **Optimistic UI is restricted to reads-as-state**: marking a notification read.
  A decision, a payment, a quote, an activation is never optimistic.
- **Every mutation appends an `audit_events` row** — the append-only trail is the
  product's memory and the source for `/evidence` and `/operator` metrics.
