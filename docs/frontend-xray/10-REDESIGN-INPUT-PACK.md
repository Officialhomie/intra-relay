# 10 — Redesign Input Pack

> The authoritative synthesis of the frontend X-ray, for a future design AI.
> **This is not a redesign.** It is the complete, evidence-grounded model of what
> the product does today, what must be preserved, what is genuinely broken, and
> where the product model leaves room to improve.
>
> Built from: [`00-MASTER-XRAY`](00-MASTER-XRAY.md), [`01-USER-JOURNEYS`](01-USER-JOURNEYS.md),
> [`02-COMPLEXITY-ABSTRACTION`](02-COMPLEXITY-ABSTRACTION.md),
> [`03-COMPONENT-INVENTORY`](03-COMPONENT-INVENTORY.md), [`04-SCREEN-SPEC`](04-SCREEN-SPEC.md),
> [`05-INTERACTION-STATE-MODEL`](05-INTERACTION-STATE-MODEL.md),
> [`06-COPY-INFORMATION-ARCHITECTURE`](06-COPY-INFORMATION-ARCHITECTURE.md),
> [`07-TRUST-MONEY-BLOCKCHAIN-UX`](07-TRUST-MONEY-BLOCKCHAIN-UX.md),
> [`08-MOBILE-PWA-AUDIT`](08-MOBILE-PWA-AUDIT.md), [`09-TASK-COMPLEXITY-AUDIT`](09-TASK-COMPLEXITY-AUDIT.md),
> and the repository itself. Source-of-truth docs the redesign must not
> contradict: `docs/PRD.md`, `docs/PRODUCT_VISION.md`, `CLAUDE.md` §4,
> `docs/UX_ARCHITECTURE.md` §2, `docs/DECISIONS.md`.

---

# 1. Product Thesis

**Intra Relay makes a real, WhatsApp-run, non-API business safely callable by any
AI agent — without the business building anything, and without either side losing
human control of the money or the final order.**

It does this by turning one business service into a structured "Capability Card"

- REST quote route, verified by a human operator, kept fresh (auto-expiring at 14
  days), and answered by a real person. A buyer (or their agent) sends a structured
  brief; the business sends a genuine quote; the buyer explicitly decides; and the
  buyer sends and pays for the final order themselves (over WhatsApp, or on-chain
  via MiniPay). Optional layers record that the handover happened (Proofline
  events, EAS attestations) — as evidence, never as a quality rating or a payment.

The hackathon MVP proves exactly one vertical: **campus flyer printing for
Nigerian students and small businesses.**

**What it is not** (`PRODUCT_VISION.md` §2, 4): a shopping agent, a marketplace,
a merchant chatbot, an escrow/custody service, a reputation platform, or a
generic website-to-tools wrapper.

---

# 2. Users

| User                                                  | Identity                                                 | Goal                                     | Reaches value in… (`UX_ARCHITECTURE.md` §0) |
| ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| **Buyer** (student / small business)                  | opaque device session (`localStorage`), no account       | "I have a real price and a way to order" | one form, one page, no account              |
| **Buyer's AI agent** (built-in run, or a third party) | server-generated `agent:` session + a human `buyerClaim` | "a fresh, structured quote"              | one HTTP call                               |
| **Buyer's wallet** (MiniPay / injected)               | wallet address                                           | "pay the business now, non-custodially"  | one tap + one wallet approval               |
| **Business / merchant** (printer)                     | opaque `manageToken` in a `?t=` link, no account         | "my business can take agent orders"      | one session, one link saved                 |
| **Operator**                                          | `x-operator-key` (`label:secret`), `sessionStorage`      | "keep route data safe and current"       | sign in → verify → activate                 |
| **Judge / evaluator**                                 | none (public)                                            | "is any of this real?"                   | `/evidence` + `/operator` trace             |

Every human role is a bearer token in a header or URL. **No passwords, no
accounts, no email collection.**

---

# 3. Core User Journeys (end to end)

_(Full detail: [`01-USER-JOURNEYS.md`](01-USER-JOURNEYS.md). The canonical
sequences:)_

## 3.1 Business gets callable

```
/supplier/onboard (9 fields, 1 screen) → business PENDING_VERIFICATION + route DRAFT
  → operator opens /operator → verifies 6 checks → route ACTIVE
  → (route silently becomes "stale/unavailable" 14 days after priceUpdatedAt)
```

## 3.2 Buyer gets a quote and decides

```
/agent (say what you need) → intent understood → agent run:
  discover → check availability → request quotes → compare
  → RECOMMENDATION (who, how much, how fast, why; alternatives; ruled-out)
  → APPROVAL GATE (full offer on the surface) → buyer accepts / declines
  → on accept: task HANDOFF_READY, commitment created, handover code shown
```

## 3.3 Buyer completes the order

```
HANDOFF_READY page:
  [optional] PayPanel → "Pay with MiniPay" → wallet approve → tx → server verifies
             a real Celo receipt → CONFIRMED
  HandoffCard → copy the pre-filled WhatsApp message / open wa.me → send it
  → "I've sent this to the printer" → handoffConfirmedAt set, feedback unlocks
```

## 3.4 Fulfilment evidence (all optional)

```
merchant "Mark ready for pickup" → 6-char pickup code
  → buyer "Confirm I've collected this order" (session or code) → PICKUP_CONFIRMED
  → buyer says the handover code aloud at collection
  → merchant enters it, signs with their own wallet → EAS handover attestation
  → buyer leaves feedback
```

## 3.5 The unhappy paths (all handled)

- Supplier declines / withdraws / cannot fulfil → task `FAILED` with a **semantic
  exception** (`describeTaskException`): what happened / do you act / what next /
  the money position ("Nothing was charged through Intra").
- Buyer declines a quote → `CANCELLED`, nothing ordered.
- Buyer cancels an agreed order / reports a failed handover → `CANCELLED` /
  `FAILED`, no refund claimed, "contact the business directly".
- Business proposes a new price on an agreed order → the buyer decides
  (`PriceChangePanel`); the agreed price stands until they do.
- Agent run: no viable offer / expired / timeout → benign `outcomeCopy`, "Nothing
  was ordered and no money moved", "Try again".

---

# 4. Core Jobs To Be Done

| Actor    | Job                                                         | Current surface                                                                                                | Evidence it's the real job                             |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Buyer    | "Turn my vague need into something a business can price"    | `/agent` conversation → agent run                                                                              | the whole intent + run layer exists for this           |
| Buyer    | "Know if a price from a stranger is fair"                   | `RecommendationCard` "Why this looks OK" / "What Intra cannot confirm"; `Alternatives` with plain-money deltas | the recommendation is explanatory, not a score         |
| Buyer    | "Stay in control of the money and the order"                | the approval gate; the WhatsApp handoff; MiniPay as a _choice_; every "Intra never holds this money" line      | `BR-001`, the entire trust-copy inventory ([`07` §13]) |
| Buyer    | "Not have to learn crypto to use this"                      | "network fee" language, no ABI/contract on the default view, plain intent labels                               | ADR-023 §6, ADR-019 keystone                           |
| Buyer    | "Pick up where I left off"                                  | `BuyerWorkPanel` (5 buckets), notifications, `/tasks/:id` resumable                                            | M7 phases A–C                                          |
| Business | "Take structured orders without building anything"          | quick-start (9 fields), the manage link, `QuoteResponseForm`                                                   | the whole thesis                                       |
| Business | "Set my price my way, and have an agreed price stay agreed" | `pricingModel` (fixed / from / per-job); the quote-integrity rules                                             | ADR-015, `pricing/model.ts`                            |
| Business | "Know a request arrived without watching a page"            | `ActionCentre` + web push on the business audience                                                             | M7                                                     |
| Business | "Have completed jobs count for something, without a rating" | the `WHY` card + "Why finishing jobs matters" `Callout` + EAS attestations                                     | ADR-018, `PRODUCT_VISION.md` §3.2                      |
| Operator | "Verify a business is safe before it goes live"             | the 6-check activation `fieldset`                                                                              | `AC-SUP-*`                                             |
| Operator | "Prove a transaction is real"                               | `EvidencePanel` `TraceView` + `/evidence`                                                                      | M9 §14                                                 |
| Judge    | "See what's real vs demo vs unavailable"                    | `/evidence` three zones                                                                                        | ADR-013, MET-001                                       |

---

# 5. Information Architecture (conceptual model)

The application should be understood as **three role-scoped areas** plus a
**public/evidence area**, not as a flat route list.

```
┌─ BUYER (device session) ──────────────────────────────────────┐
│  "Get a price. Decide. Order."                                 │
│  • one entry: describe a need (conversational or a form)       │
│  • one workspace per request (/tasks/:id) — status, quote,     │
│    decision, pay, handoff, evidence, feedback                  │
│  • one home that shows all requests in 5 plain buckets         │
│  • one activity feed (notifications + the same work list)      │
└───────────────────────────────────────────────────────────────┘

┌─ BUSINESS (manage token) ─────────────────────────────────────┐
│  "Get set up. Answer requests. Mark work done."                │
│  • one setup screen                                            │
│  • one action-first workspace (what needs me / what's happening)│
│  • one request inbox (quote / decline / revise / mark ready /  │
│    attest)                                                     │
│  • one settings/review page (pause, freshness, what agents see)│
└───────────────────────────────────────────────────────────────┘

┌─ OPERATOR (operator key) ─────────────────────────────────────┐
│  "Verify. Activate. Monitor."                                  │
│  • one console, 3 tabs: review queue / metrics / evidence trace│
└───────────────────────────────────────────────────────────────┘

┌─ PUBLIC ──────────────────────────────────────────────────────┐
│  • landing (/)                                                 │
│  • evidence (/evidence) — real vs demo vs unavailable          │
│  • docs (/docs) — the agent route contract                     │
│  • /v1/:slug/capabilities + /v1/:slug/:route/quote (machines)  │
└───────────────────────────────────────────────────────────────┘
```

**The organising concepts a redesign should keep:**

- **The request/task is the buyer's unit of work** — everything about one job
  lives on one page (`/tasks/:id`), which is fully resumable from server state.
- **The route is the business's unit of capability** — a business has one or more
  routes; each has a lifecycle and a freshness clock.
- **The quote is the only commitment** — published prices are _guidance_; an
  accepted quote is immutable.
- **The decision is its own step** — separate from "a quote exists" and "the
  order was sent".
- **Evidence is layered and never conflated** — a payment ≠ a fulfilment record ≠
  a quality rating.

---

# 6. Screen Architecture (every screen and why it exists)

_(Full spec: [`04-SCREEN-SPEC.md`](04-SCREEN-SPEC.md).)_

| Screen                     | Route                      | Exists because…                                                                                                   |
| -------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Landing                    | `/`                        | someone needs to understand the product before starting                                                           |
| Buyer home                 | `/agent`                   | the buyer's single entry + a view of all their work; the PWA `start_url`                                          |
| Buyer activity             | `/activity`                | notifications + a fallback for a missed one (M7 §20)                                                              |
| Request form               | `/request`                 | a form alternative to the conversation (single-route, no agent) — **currently orphaned, not linked from any nav** |
| Task workspace             | `/tasks/:id`               | one resumable place for everything about one request                                                              |
| Quick-start onboarding     | `/supplier/onboard`        | a business must be set up in one screen                                                                           |
| Full onboarding            | `/supplier/onboard/full`   | the operator-assisted path (produces a draft only)                                                                |
| Business workspace         | `/supplier/:slug`          | action-first: what needs me, what's happening, my record                                                          |
| Request inbox              | `/supplier/:slug/requests` | the merchant's daily surface: quote / decline / mark ready / attest                                               |
| Route review               | `/supplier/:slug/review`   | business details + route status/freshness + pause                                                                 |
| Operator console           | `/operator`                | verify + activate; metrics; a transaction trace                                                                   |
| Evidence                   | `/evidence`                | the honest public record (real / demo / unavailable)                                                              |
| Docs                       | `/docs`                    | the agent-builder-facing contract explainer                                                                       |
| Offline                    | `/offline`                 | the SW navigation fallback                                                                                        |
| Error / 404 / global-error | —                          | blameless failure surfaces                                                                                        |

**Conditional "screens" inside `/tasks/:id`** (state-driven, no route change):
waiting-for-price · quote-ready-decision · ready-to-send (pay + handoff + code) ·
handed-off (Proofline) · price-change · x402-receipt · exception.

**Conditional "screens" inside the agent run**: running · clarification-needed ·
awaiting-approval · approved · declined/unsuccessful.

---

# 7. Component Architecture (the reusable primitives)

_(Full inventory: [`03-COMPONENT-INVENTORY.md`](03-COMPONENT-INVENTORY.md).)_

**9 hand-rolled UI primitives** (`src/components/ui/`): `Button` (4 variants, 2
sizes, `pending`), `Callout` (4 tones — `info`/`warning`/`success`/`unavailable`,
the last for honesty statements), `CheckboxField`, `DataList`/`DataRow`,
`SectionHeader`/`Card`/`CardTitle`, `SelectField`, `TextField`, `StatusPill` (+
label/tone helpers), `States` (`EmptyState`/`Skeleton`/`LoadingPanel`/`ErrorState`).
**No component library.**

**The recurring composite patterns a redesign should formalise:**

- **The trust `Callout`** — the single most important device; `unavailable` tone
  = "here is what is NOT happening / NOT verified / NOT real".
- **The `DataList` record** — label/value/hint; used for briefs, quotes, business
  details, payment receipts, the approval card.
- **The `StatusPill` + plain-label helper** — the enum never reaches a screen.
- **The semantic progress spine** (`StageList`) — icon + word, never a bare
  spinner.
- **The "who did what" narrative** (`ActivityFeed`) — actor-attributed, no tool
  names, with the raw trace nested underneath.
- **Native `<details>` for progressive disclosure** (8 components) — "more
  detail", "engineering trace", "ruled-out printers", "raw payload".
- **The one-read-model-per-surface rule** — `getTaskView`, `getSupplierWorkspace`,
  `toAgentRunView`, `listBuyerWork` each return exactly what their page renders.
- **Consequence-named buttons** — "Approve NGN 4,500 with Campus Print", not
  "Continue".
- **Contextual PWA prompts** — never on first load; only when there's async work.

---

# 8. Interaction Architecture

_(Full model: [`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md).)_

- **Every write is idempotent** (`Idempotency-Key`; the `/v1` quote folds
  `sha256(X-PAYMENT)` into the scope). The client generates keys automatically.
- **Every mutation appends an `audit_events` row** — the trail is the product's
  memory and the source for `/evidence`.
- **Optimistic UI is restricted to "read" state** (marking a notification read).
  Decisions, payments, quotes, activations are never optimistic.
- **The client polls** for async state: agent run every 1.5 s (`AgentConsole`,
  reconnecting quietly), order payment every 2.5 s (`useOrderPayment`).
  Background work is kept alive past the HTTP response with `after()`.
- **Ownership** is a match against `sessionId` OR `buyerClaimSession` — this is
  how a human acts on an agent-created order.
- **Contact revelation** is gated: `supplier.contactChannelValue` is withheld
  until `task.status === "HANDOFF_READY"`.
- **The model never mutates** — `recordBuyerDecision` (ACCEPT), the order-payment
  controller, and every write path are outside `MODEL_TOOLS`. A model failure
  falls the run back to deterministic (ADR-019 keystone rule).
- **`router.refresh()`** re-renders the RSC supplier pages after a merchant
  mutation; client pages re-run their `load` callback.

---

# 9. State Architecture

_(All machines with diagrams: [`05` Part 2](05-INTERACTION-STATE-MODEL.md#part-2--explicit-state-machines).)_

The states a redesign must render (with their plain-language labels):

| Domain                      | Machine                                                                                               | Buyer/merchant labels                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Task**                    | `DRAFT → SUBMITTED → AWAITING_QUOTE → RECOMMENDED → HANDOFF_READY`; → `FAILED`/`CANCELLED`            | Draft / Sent / Waiting for a price / Quote ready — your decision / Ready to send / Closed / Cancelled       |
| **Quote**                   | `RECEIVED ⇄ SUPERSEDED`; `RECEIVED → PROPOSED → RECEIVED/WITHDRAWN`; read-time `EXPIRED`; `DECLINED`  | Current offer / Change proposed / Replaced / Withdrawn / Expired / Turned down                              |
| **Route**                   | `DRAFT → PENDING_VERIFICATION → ACTIVE ⇄ PAUSED`; any → `ARCHIVED`; read-time "stale"                 | Draft / Awaiting operator check / Available to customers / Paused / Stale                                   |
| **Order payment (MiniPay)** | `CREATED → AWAITING_WALLET → SUBMITTED → CONFIRMING → CONFIRMED`; → `FAILED`/`EXPIRED`/`CANCELLED`    | Preparing / Waiting for your wallet / Payment submitted / Payment confirmed / didn't go through / cancelled |
| **Service payment (x402)**  | `NOT_REQUIRED`/`UNAVAILABLE`/`REQUESTED_402`/`AUTHORISED`/`SETTLED`/`FAILED`                          | Not charged / Unavailable / Payment requested / Reconciling / Paid / Did not go through                     |
| **Commitment**              | `PENDING_ATTESTATION → ATTESTED`/`ATTESTATION_FAILED`                                                 | (hidden; "your decision is recorded")                                                                       |
| **Handover attestation**    | `PENDING_CODE → PENDING_SIGNATURE → ATTESTED`/`ATTESTATION_FAILED`                                    | "Confirm handover" / "Handover confirmed"                                                                   |
| **Proofline evidence**      | `NOT_STARTED → MERCHANT_MARKED_READY → BUYER_CONFIRMED_PICKUP`                                        | "ready for pickup" / "you confirmed pickup"                                                                 |
| **Agent run**               | `RUNNING → AWAITING_APPROVAL/CLARIFICATION_NEEDED → APPROVED/DECLINED`; or `NO_VIABLE_OFFER`/`FAILED` | a 7-stage spine: understand / discover / check / quote / compare / decide / record                          |
| **Conversation intent**     | `CONVERSATION → INFORMATIONAL → DISCOVERY → COMPARISON → QUOTE_REQUEST → TRANSACTION → FULFILLMENT`   | (never shown; "So far:" chips)                                                                              |
| **Buyer work group**        | `ATTENTION / READY / WAITING / IN_PROGRESS / COMPLETED`                                               | Needs your attention / Ready / Waiting / In progress / Completed                                            |
| **Notification level**      | `INFORMATIONAL / ACTION_REQUIRED / TIME_SENSITIVE / COMPLETED`                                        | Update / Needs action / Time-sensitive / Completed                                                          |

Every async surface additionally has: loading, empty, validation-error,
network-error, success, unavailable (`NFR-UX-001`).

---

# 10. Complexity Abstraction

_(Full audit: [`02-COMPLEXITY-ABSTRACTION.md`](02-COMPLEXITY-ABSTRACTION.md).)_

## What the user SHOULD understand (keep visible)

| Concept                                                           | Why                                       |
| ----------------------------------------------------------------- | ----------------------------------------- |
| The quote is the business's figure, not verified by Intra         | it's their money decision                 |
| My decision is separate from sending the order                    | the human-approval boundary               |
| I send and pay the final order myself                             | `BR-001` — Intra is not the buyer's agent |
| If I pay via MiniPay, that's a _separate_ wallet approval         | commercial ≠ wallet consent (M10.5 §34)   |
| The NGN→USD rate, its source, and when it was locked              | money + timing                            |
| Who the money goes to                                             | it's a direct transfer                    |
| A price/availability has a confirmation time and expires          | freshness is information                  |
| Proofline is operational evidence, not proof / payment / a rating | honesty bound                             |
| An attestation proves the handover happened, not the quality      | ADR-018                                   |
| The operator's 6-point verification happened                      | trust in the business                     |
| The manage link is my only way back in                            | there is no recovery flow                 |
| The conversation / agent run is not persisted (but my task is)    | set expectations — **currently muddled**  |

## What the user should NEVER have to understand (keep hidden)

| Implementation                                                          | Where it currently leaks                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Internal enum names                                                     | operator `StatusPill`, `EvidencePanel` `TraceView`             |
| The 13-state agent machine, tool names, HTTP, latencies                 | nested `<details>` (acceptable)                                |
| Idempotency keys, session headers, the response envelope                | fully hidden ✓                                                 |
| `keccak256` commit-reveal, salt, `handoverCommit`                       | fully hidden ✓                                                 |
| USDC atomic units, ERC-20 ABI, contract address, chain-id hex           | x402 `PaymentReceipt` leaks atomic amounts; MiniPay is clean ✓ |
| CAIP-2 network ids, ERC-8021 attribution tags                           | x402 `PaymentReceipt`                                          |
| EAS schema UIDs, `refUID`, `attestByDelegation`, EIP-712 struct         | `EvidencePanel` `TraceView`                                    |
| The `/v1` endpoint string, route JSON, "Capability Card" / "MCP server" | `OnboardingForm` + `DraftRoutePreview` (the full-form path)    |
| FX endpoint URL, the receipt-read logic                                 | fully hidden ✓                                                 |

---

# 11. Trust Architecture

_(Full trace: [`07-TRUST-MONEY-BLOCKCHAIN-UX.md`](07-TRUST-MONEY-BLOCKCHAIN-UX.md).)_

**How confidence is built, step by step:**

1. **Before the buyer commits** — the recommendation says _why_ ("Why this looks
   OK") AND _what it can't confirm_ ("What Intra cannot confirm"), and shows the
   alternatives it was chosen over with plain-money deltas.
2. **At the decision** — the full offer (price / business / terms / expiry / who
   you pay) is on the surface, never behind a disclosure; the button names the
   consequence; "Intra never holds, sends or takes this money" is right there.
3. **At payment** — the FX rate + source + lock time are shown; the recipient is
   shown (shortened); "network fee" not "gas"; `CONFIRMED` only after a real
   server-side receipt read; an explorer link to verify.
4. **At handoff** — the full pre-filled message is shown; "Intra does not send
   this message and never pays a supplier for you"; the buyer self-reports
   "sent".
5. **At fulfilment** — every Proofline surface carries the verbatim disclaimer;
   "This is the printer's statement, not a check by Intra"; the attestation
   wording stays plain and the "(Simulated)" label is honest.
6. **On failure** — every exception states the money position ("Nothing was
   charged through Intra") without inventing a refund.
7. **Publicly** — `/evidence` separates real / demo / unavailable, counts only
   real rows, and shows its methodology.

**The 20+ verbatim trust phrases are catalogued in [`07` §13]. Every one is
non-negotiable at its current surface.**

---

# 12. AI Abstraction

_(ADR-019; [`02` §2](02-COMPLEXITY-ABSTRACTION.md#2--ai--agent-behaviour--dedicated-pass).)_

- **The model sits ABOVE the deterministic orchestration, never inside it.** It
  understands intent, plans which providers to quote, chooses an offer + writes
  the rationale, replans on a dead end. It never holds a tool, never touches the
  DB, and `recordBuyerDecision` is not in its tool set.
- **Deterministic is the floor and the fallback.** Bounded (≤ 4 calls, ≤ 700
  tokens, 12 s). Any model failure → the run silently continues deterministically.
  **No `ANTHROPIC_API_KEY` ⇒ the assisted run == the deterministic run.**
- **Dates and money stay deterministic.** The model returns a deadline _phrase_;
  the parser makes the date. The model cannot override a parsed value.
- **How the AI should appear to the user**: a 7-stage progress spine ("Finding
  printers who can do this", "Waiting for 2 printers to reply"), a "who did what"
  narrative (You / Agent / Printer / Intra), and — the only explicit "AI" signal
  — a small "✨ agent's reasoning" label on the recommendation _when a model
  authored the rationale_. The raw trace (model, call count, tool calls) is 2
  `<details>` deep. **The user is never asked to think about the model.**
- **The "conversational" intent layer is deterministic** (`classifyMessage` =
  regex/keyword). It reads as an assistant ("I'll find a business…") but the
  reading itself is rules; only the run it starts is model-assisted. A redesign
  should not over-promise "AI understanding" in the chat copy.

---

# 13. Async / Notification Architecture

_(ADR-020; [`08` §5](08-MOBILE-PWA-AUDIT.md#5--pwa-behaviour), [`05` §2.11](05-INTERACTION-STATE-MODEL.md).)_

- **A notification is a current attention item, not a log line.** One row per
  `(audience, recipient, dedupeKey)`; a repeat event updates and re-surfaces it
  unread.
- **Two levels of "needs you"**: `ACTION_REQUIRED` / `TIME_SENSITIVE` → the
  "Needs your attention" group; `INFORMATIONAL` / `COMPLETED` → "Updates".
- **In-app is always authoritative** — `ActionCentre` on `/activity` (buyer) and
  `/supplier/:slug` (business). Reading ≠ acting.
- **Web push is an enhancement, never a dependency.** No VAPID ⇒ push
  `UNAVAILABLE`, in-app only, nothing breaks. Payloads carry no id/amount/
  address/code. Fire-and-forget from `notify()`.
- **Contextual prompts** — `PushPrompt` / `InstallPrompt` only appear once there
  is real async work to come back to; dismissal is permanent.
- **Returning users** — `BuyerWorkPanel` reads persisted state on every load, so
  a missed notification is never a lost task. A push deep-links with `?ref=push`
  → a resume analytics event.
- **The service worker never serves prices/quotes/approval/payment/fulfilment
  from cache** — `/api/*` is network-only; offline → a clean `503 OFFLINE`.
- **Background completion** (a MiniPay payment confirming while the tab is closed)
  → the server forwards the analytics + writes the notification; the buyer sees
  it next visit.

---

# 14. Mobile / PWA Architecture

_(Full audit: [`08-MOBILE-PWA-AUDIT.md`](08-MOBILE-PWA-AUDIT.md).)_

- **Mobile-first, 360px hard floor.** One breakpoint (`sm:` = 640px); base = the
  mobile layout. Content is ~328px wide at 360px.
- **No modals, drawers, or dialogs.** Every "modal" interaction is an inline
  panel, a native `<details>`, or a component mode switch. (Consequence: no
  focus-trap issues; but a mid-flow panel has no dismiss and can be long on a
  small screen.)
- **No bottom navigation.** The 3 buyer surfaces are linked only by in-page pills
  / back-links.
- **Touch targets**: buttons `min-h-9`/`min-h-11`; full-card tappable rows;
  `<input type=checkbox>` is `size-4` (mitigated by the wrapping `<label>`).
- **Inputs**: `text-base` (no iOS zoom); `inputMode` hints; `autoCapitalize` off
  on codes/addresses. `datetime-local` in `QuoteResponseForm` is a fiddly mobile
  picker.
- **PWA**: `start_url: /agent`, `display: standalone`, `portrait`, 3 committed
  icons. `theme_color` / `viewport.themeColor` are **stale** (`#0f3e17` green;
  ADR-022 is ink `#1f1e1d`).
- **SW update**: install-and-wait; a dismissible "Update now" banner; one reload;
  never mid-transaction.
- **Interruptions** ([`08` §6]): a closed `/agent` tab loses the thread (the task
  survives); a run store TTL (30 min) or restart drops orchestration metadata; a
  device switch / private window / cache clear makes the buyer's task
  **permanently unreachable** (no resume key).

---

# 15. Error / Recovery Architecture

_(Full model: [`00` §16](00-MASTER-XRAY.md#16-error-and-recovery-model),
[`05` §1.16](05-INTERACTION-STATE-MODEL.md).)_

**Principles the current build follows (keep these):**

- **Blameless copy** — "Nothing you did caused it, and no request was sent to a
  printer."
- **State the side effect** — every failure says whether anything happened
  ("Nothing was ordered and no money moved", "The tx is real and on-chain").
- **Never leak a code** — `looksTechnical()` filters codes/shapes out of buyer
  copy; unmapped codes → a plain fallback.
- **Semantic exceptions** — `describeTaskException` turns 9 `failureReason`s into
  headline / what happened / do you act / what next / the money.
- **Quiet reconnect** — the agent poll loop retries transient failures silently
  (`MAX_RECONNECTS = 5`) before surfacing anything.
- **Idempotent retries** — "Try again" replays the stored response.

**The one place this breaks**: `/tasks/:id` "This request belongs to another
device" — a real dead end with no recovery action, and the constraint is only
stated _after_ access is lost.

---

# 16. Current UX Problems (evidence-backed only)

_(Full list with file anchors: [`00` §20](00-MASTER-XRAY.md#20-current-ux-problemscontradictions),
[`02` §6](02-COMPLEXITY-ABSTRACTION.md#6--potential-ux-problems--where-users-face-implementation-unnecessarily),
[`09` summary](09-TASK-COMPLEXITY-AUDIT.md#the-places-the-interface-makes-the-user-think-about-the-implementation).)_

| #   | Problem                                                                                                                                                                                                                                                            | Severity   | Anchor                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------- |
| 1   | Buyer identity is device-bound with **no recovery** — a device switch loses the task + the WhatsApp message about to be sent                                                                                                                                       | **High**   | `TaskPage.tsx:252`, `src/lib/session.ts`; `UX_ARCHITECTURE.md` F8 |
| 2   | The **full onboarding form** collects 15 fields then dead-ends ("email this JSON to an operator"); the operator has no create UI                                                                                                                                   | **High**   | `OnboardingForm.tsx:106`, `DraftRoutePreview.tsx:152`             |
| 3   | Two parallel buyer entry points (`/agent`, `/request`) with different capabilities; `/request` can't compare providers **and is orphaned** (not linked from anywhere — `grep '/request' src` finds only `/supplier/:slug/requests`); nav "Home" = `/agent` not `/` | **Medium** | `site.ts`, `Header.tsx:26`, `src/app/page.tsx`, `RequestForm.tsx` |
| 4   | `/tasks/:id` shows **7–8 stacked panels** on a `HANDOFF_READY` task with MiniPay; the current action isn't obvious                                                                                                                                                 | **Medium** | `TaskPage.tsx` render order                                       |
| 5   | x402 `PaymentReceipt` leaks `attributionTag`, atomic amounts, CAIP-2 ids, "via agent payment protocol" on a buyer surface                                                                                                                                          | **Medium** | `TaskPage.tsx:680`                                                |
| 6   | `QuoteResponseForm` (highest-frequency merchant task) asks for `fixed/range`, `confidence`, `datetime-local` — precision for a phone user mid-job                                                                                                                  | **Medium** | `QuoteResponseForm.tsx`; `AGENTIC_ARCHITECTURE.md` §5.3           |
| 7   | Two visually identical "code" boxes (buyer handover code, merchant pickup code) on related surfaces                                                                                                                                                                | **Medium** | `HandoverCodePanel.tsx`, `MerchantFulfilmentPanel.tsx:90`         |
| 8   | "Demo only — nothing here is saved" over-prominent and partly false (the task/quote/decision are saved)                                                                                                                                                            | **Medium** | `ConversationView.tsx:203`                                        |
| 9   | Stale theme colour (`#0f3e17` green) in `layout.tsx` viewport, `manifest.ts`, `opengraph-image.tsx`, `global-error.tsx`                                                                                                                                            | **Low**    | ADR-022 not fully applied                                         |
| 10  | Internal pages (`TaskPage`, supplier, operator, activity, evidence, docs) inherit the new palette but not the new spacing/heading rhythm                                                                                                                           | **Low**    | ADR-022 "a follow-up, not a regression"                           |
| 11  | `EvidencePanel` `TraceView` shows raw enums, `attestationMode: "mock"`, bare "MISMATCH", schema UIDs — judge-facing                                                                                                                                                | **Low**    | `EvidencePanel.tsx:105`                                           |
| 12  | `primaryNav` lists 7, `Header` renders 3; `/activity`, `/operator`, `/evidence` reachable only by direct URL / in-page links                                                                                                                                       | **Low**    | `site.ts:15`, `Header.tsx:26`                                     |
| 13  | The agent console can show two input boxes after a run settles                                                                                                                                                                                                     | **Low**    | `AgentConsole.tsx:261`                                            |
| 14  | The pre-filled WhatsApp message shows raw brief keys (`size:`, `full-colour`) — the one place the buyer sees un-humanised data                                                                                                                                     | **Low**    | `buildOrderMessage`                                               |
| 15  | `OperatorRouteCard` `StatusPill` shows `route.status.replace(/_/g," ")` (near-raw) where every other surface has a plain label                                                                                                                                     | **Low**    | `OperatorConsole.tsx:262`                                         |
| 16  | No seeded, clearly-labelled demo path — `RequestForm` shows "No printers are live yet" as the likely first-run state                                                                                                                                               | **Medium** | `RequestForm.tsx:113`; `UX_ARCHITECTURE.md` F9                    |
| 17  | Handover attestation requires `window.ethereum` — a non-crypto merchant cannot use the feature at all                                                                                                                                                              | **Medium** | `HandoverAttestPanel.tsx:57`                                      |

---

# 17. Current UX Strengths (do NOT destroy in a redesign)

1. **The trust-copy discipline.** ~20 verbatim phrases ([`07` §13]) that
   front-load every money/consent/verification fear at exactly the right moment.
   This is the product.
2. **The semantic progress spine + "who did what" narrative.** The best copy in
   the app — "Waiting for 2 printers to reply — Printers answer as people, not
   APIs — this part is genuinely asynchronous."
3. **The approval gate.** The full offer on the surface, never behind a
   disclosure; a consequence-named button.
4. **`describeTaskException`.** Every failure answers the same 3 questions in
   plain language, and never invents a financial outcome.
5. **MiniPay abstraction.** "Network fee", a locked+sourced FX rate, a shortened
   recipient, `CONFIRMED` only on a real receipt — no ABI, no contract, no
   chain-id on the default view.
6. **The 5-bucket work list** (`BuyerWorkPanel`) — no internal status name ever
   shown; a plain headline + a verb-first action pill per task.
7. **The one-read-model-per-surface architecture** — pages render a
   view-shaped object, not raw rows.
8. **The honest empty/unavailable states** — `/evidence` "No real activity
   recorded yet… that is the honest state, not a bug"; the x402 `UNAVAILABLE`
   callout; "Off-tab notifications aren't set up on this deployment yet."
9. **Contextual PWA prompts** — never nag; only appear with async work; permanent
   dismissal.
10. **Quick-start onboarding** — 9 plain fields, the value prop in-flow, category
    → template hidden, the manage link surfaced with "Keep this link".
11. **The quote-integrity model** — an accepted price is immutable; a change is
    always a new `PROPOSED` row the buyer decides on.
12. **Accessibility baseline** — real `<label>`s, `aria-invalid`/`aria-describedby`,
    `focus-visible` rings, `role="alert"`/`status`, status-by-word-and-icon,
    `prefers-reduced-motion` guards throughout.

---

# 18. Non-Negotiable Product Constraints

_(From `CLAUDE.md` §4, `docs/UX_ARCHITECTURE.md` §2, `docs/PRD.md`, the ADRs.
A redesign that violates any of these breaks the product.)_

1. **The buyer sends the final WhatsApp order themselves.** The pre-filled
   message is shown in full and never auto-sent. (`BR-001`, `FR-REC-002/004`.)
2. **The buyer decision is its own explicit step**, with the full offer on the
   surface, before the contact channel is revealed. (ADR-015.)
3. **The buyer approves the wallet transaction separately** from the commercial
   approval. (M10.5 §34.)
4. **`SETTLED` / `CONFIRMED` only after real verification + a real transaction
   hash.** No fabricated receipt, ever — an explicit `UNAVAILABLE` / `503` state
   instead. (`FR-PAY-003/004`, `BR-005`, ADR-004/017.)
5. **A settle timeout renders indeterminate, never "paid".** (ADR-017.)
6. **Price/availability data carries a confirmation timestamp and auto-expires**
   at 14 days → "stale" → unavailable. (`PRODUCT_VISION.md` §3.1.)
7. **Merchant quote-display consent is an explicit, unbundled tick** — never
   inferred. (`FR-SUP-005`.)
8. **Operator verification (all 6 checks) before a route goes ACTIVE** — never
   defaulted or auto-approved. (`AC-SUP-*`.)
9. **Public wallet address only — never a seed phrase, private key, password,
   BVN, NIN, card, or bank credential.** Shown shortened; ownership verified
   out-of-band. (`CLAUDE.md` §4.2, `NFR-SEC-001`.)
10. **Demo / non-persistent state is clearly labelled.** (`CLAUDE.md` §4.4.)
11. **The Proofline disclaimer, verbatim, on every Proofline surface** —
    operational evidence, not proof, not settlement, not a guarantee. No public
    reliability / reputation / on-time score. (ADR-016, `FR-PROOF-005/006`.)
12. **An attestation proves the handover protocol completed at a time — not
    quantity, quality, timeliness, or satisfaction.** (ADR-018 honesty bound.)
13. **The LLM proposes; a human commits the write.** The model never holds a
    tool, never touches the DB; `recordBuyerDecision` is not model-facing; any
    model failure falls back to deterministic. (ADR-019 keystone.)
14. **Intra never custodies funds.** MiniPay is wallet → business direct; the
    x402 fee is the agent's, capped at $0.05, distinct from the order price.
    (`BR-001`, `BR-004`.)
15. **Every async surface has explicit loading / empty / validation-error /
    network-error / success / unavailable states.** (`NFR-UX-001`.)
16. **Mobile-first, 360px, real `<label>`s, keyboard nav, visible focus,
    associated form errors.** (`NFR-UX-001`, `NFR-A11Y-001`.)
17. **MVP scope: flyer printing only.** No new vertical, no marketplace, no
    directory, no escrow, no dispute flow, no reputation score. (`CLAUDE.md` MVP
    boundary.)

---

# 19. Technical Constraints (the redesign must stay compatible with)

- **Next.js 15 App Router + React 19.** The 3 `/supplier/*` pages and `/evidence`
  are React Server Components (`force-dynamic`); everything else buyer-facing is
  a `"use client"` island fetching JSON.
- **Tailwind 3 + CSS-variable tokens** (`src/styles/tokens.css` — the ADR-022
  warm-editorial palette; **load-bearing**, `CLAUDE.md` §6.1). No CSS-in-JS. No
  web-font fetch (system stacks). No dark mode.
- **No component library** — 9 hand-rolled primitives. A redesign may add
  components but the token contract + the `Callout`/`StatusPill`/`DataList`
  vocabulary is deeply wired.
- **`lucide-react`** for every icon.
- **Zod** schemas are the client/server contract; the model must produce
  Zod-valid JSON.
- **`viem`** is the only chain library (ADR-018/023) — client-lazy-imported in
  `wallet-adapter`. No ethers, no wagmi.
- **`@anthropic-ai/sdk`** is server-only — never a browser import.
- **`@amplitude/analytics-browser`** — ESLint bans `@amplitude/*` outside
  `src/features/analytics/`. Every client surface calls `useAnalytics(role)`;
  the taxonomy is a hand-written `events.ts` (58 events).
- **The API envelope** `{ success, data }` / `{ success, error: { code, message,
details? } }` and the `apiRequest` helper.
- **Auth**: buyer = `x-session-id` (localStorage); business = `x-manage-token` /
  `?t=`; operator = `x-operator-key` (sessionStorage). No accounts.
- **Idempotency-Key** on every write.
- **Env flags** that change what's shown (all degrade safely): `OPERATOR_API_KEYS`,
  `X402_API_KEY`, `ANTHROPIC_API_KEY`, `VAPID_*`, `NETWORK_ENV` +
  `ATTESTATION_SIGNER_KEY` (gates the MiniPay path to `production`),
  `NGN_USD_RATE_URL`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`.
- **The 16 DB tables** (15 domain + `idempotency_keys`) and their lifecycle invariants (`src/lib/db/schema.ts`) —
  schema changes go through a committed Drizzle migration (ADR-006).
- **`after()`** keeps background work (agent run, payment verify) alive past the
  HTTP response — a Vercel Phase D fix; do not remove.

---

# 20. Design Opportunities (only those the product model supports)

_(These are latent in the model — not new features. Each respects the boundary
and the MVP scope.)_

1. **Unify the two "code" panels** into one clearly-labelled "your collection
   code" concept with a role indicator, so buyer and merchant never confuse them.
2. **Collapse `/tasks/:id`'s 7–8 panels into a single "next action" focus** — the
   `nextAction()` helper `UX_ARCHITECTURE.md` §3.5 proposes; the state model
   already knows which panel is the current one.
3. **A buyer resume link** — a task-scoped opaque key issued at submit (compared
   with `timingSafeEqual`, exactly as manage tokens are), surfaced as "Save this
   link to check your quote from any device". No account, consistent with the
   design. (`UX_ARCHITECTURE.md` §3.4.)
4. **Persist the full-onboarding path** — the form is the same shape as
   quick-start plus 4 fields; there's no technical reason it produces a draft
   instead of a business. Wire it to `submitServiceForReview`
   (`UX_ARCHITECTURE.md` §3.1).
5. **A simplified quote form** — lead with amount + turnaround; fold
   fixed/range, confidence, expiry, delivery, assumptions behind "more detail"
   (some already are). The state model doesn't require any of the extras.
6. **Move the x402 chain fields off the buyer surface** — the `UNAVAILABLE` /
   `NOT_REQUIRED` callout is enough; the `SETTLED` detail belongs in the operator
   trace.
7. **A single buyer navigation** — a persistent way between home / activity /
   current task (a bottom bar or a header on the internal pages), instead of
   in-page pills.
8. **A manage-link re-issue** on the operator queue (add `manageUrl` to the
   operator-key-authenticated read model only; keep `PublicBusiness` stripping
   it). (`UX_ARCHITECTURE.md` §3.2.)
9. **A seeded demo path** — a landing route that shows the working loop to an
   evaluator, clearly labelled demo data per `CLAUDE.md` §4.4. (`NEEDS-ID`.)
10. **Fix the "demo" label** — say what's ephemeral (the conversation) vs what's
    saved (the request), so a first-time user trusts the outcome.
11. **A non-wallet handover-confirm fallback** — the Proofline pickup-code path
    already exists for the buyer side; the merchant handover-attestation could
    degrade to a labelled "recorded, not on-chain" mode when `window.ethereum` is
    absent (the mock mode already exists server-side).
12. **Share the lifecycle explainer** — `DraftRoutePreview` and
    `/supplier/:slug/review` render the same "Draft / Pending / Active / Paused /
    Stale" `dl` verbatim; one component.
13. **Apply ADR-022 spacing to the internal pages** — the palette is inherited;
    the heading/spacing rhythm is not.
14. **A "who has paid me" view for the merchant** — the model has
    `order_payments` per business; today the merchant only gets a notification.

---

# 21. Unknowns

Things that cannot be established from the repository:

- **Whether `/request` is intentionally retired or accidentally orphaned.**
  `/agent` and `/request` both exist and both work, but `/request` is **not
  linked from anywhere in the app** (both landing CTAs and the PWA `start_url`
  point at `/agent`). Yet `/request`, `RequestForm`, and its RTL tests are all
  live, maintained code — not marked deprecated. It reads as a superseded path
  that was never removed, but the repo doesn't say so.
- **Whether the conversation is meant to feel like AI.** `classifyMessage` is
  deterministic; the copy reads as an assistant. Intent unclear.
- **Whether `/supplier/onboard/full` is supported or vestigial.** Linked,
  rendered, tested — persists nothing.
- **How a merchant receives their `?t=` link in production.** `quickStartBusiness`
  returns a `manageUrl`; the UI shows it once with "Keep this link". No
  email/SMS delivery in code.
- **Whether the `themeColor` mismatch is intentional** (brand green retained for
  OS chrome) or an ADR-022 oversight.
- **The intended relationship between the agent-run `RecommendationPanel` view
  (with alternatives/ruled-out) and the `/tasks/:id` `RecommendationCard` view
  (one quote's normalisation).** A run links to `/tasks/:id` but the comparison
  is lost in that hop.
- **How many providers a real deployment expects.** The model supports
  multi-provider fan-out only in the agent run; `/request` is single-route;
  `RequestForm` renders a radio group of 1–2. `UX_ARCHITECTURE.md` F7 flags
  fan-out as `NEEDS-ID`.
- **Whether the operator surfaces are meant to be judge-facing polished or
  purely internal.** They leak enums and raw hashes; `/evidence` (also
  judge-facing) is polished.
- **The target device split.** Everything is mobile-first, but the operator
  console (`sessionStorage` key, dense tables) reads desktop-oriented.
- **Whether `/activity` is meant to be a primary destination or a fallback.**
  It's only linked from the `/agent` "Activity" pill and its own back-link.

---

# 22. Source Map

| Conclusion in this pack           | Primary source                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Product thesis                    | `CLAUDE.md` §1, `docs/PRODUCT_VISION.md` §1/§6, `docs/PRD.md` §1                                                           |
| Users + identity                  | `src/lib/session.ts`, `src/lib/http/operator.ts`, `src/lib/db/schema.ts` (`manageToken`, `sessionId`, `buyerClaimSession`) |
| Route map                         | every `src/app/**/page.tsx`; `src/lib/site.ts`; `src/components/Header.tsx`                                                |
| Task lifecycle                    | `src/features/tasks/{status,lifecycle,service}.ts`                                                                         |
| Quote integrity                   | `src/features/quotes/{status,revision}.ts`; ADR-015                                                                        |
| Route lifecycle + freshness       | `src/features/routes/{schema,freshness,activation}.ts`; `docs/API.md`; ADR-014                                             |
| Buyer decision is its own step    | `src/features/tasks/service.ts:decideOnQuote`; `docs/DECISIONS.md` ADR-015                                                 |
| Agent run + model layer           | `src/features/agent/**`; `docs/DECISIONS.md` ADR-019; `docs/AGENTIC_ARCHITECTURE.md`                                       |
| Conversation intent               | `src/features/intent/{types,conversation,routing,domain,classify}.ts`                                                      |
| x402 payment                      | `src/features/payments/**`; `docs/PAYMENTS.md`; ADR-004/011/017                                                            |
| MiniPay order payment             | `src/features/payments/{minipay,order}/**`; `docs/DECISIONS.md` ADR-023                                                    |
| Commitment + handover attestation | `src/features/commitments/**`, `src/features/attestation/**`; ADR-018                                                      |
| Proofline                         | `src/features/proofline/**`; ADR-016; `docs/PRD.md` F-PROOF                                                                |
| Notifications + PWA               | `src/features/notifications/**`, `src/features/pwa/**`, `public/sw.js`, `src/app/manifest.ts`; ADR-020                     |
| Analytics                         | `src/features/analytics/**`; ADR-021; `docs/ANALYTICS.md`                                                                  |
| Design tokens                     | `src/styles/tokens.css`, `tailwind.config.ts`; ADR-009/022                                                                 |
| Trust copy                        | inline in every feature component (catalogued in [`07` §13])                                                               |
| The abstraction boundary          | `docs/UX_ARCHITECTURE.md` §2; `CLAUDE.md` §4; `~/.claude/rules/ux-simplification.md`                                       |
| Known UX gaps                     | `docs/UX_ARCHITECTURE.md` F1–F10; `docs/AGENTIC_ARCHITECTURE.md` §5                                                        |
| Component inventory               | every `src/features/*/*.tsx`, `src/components/**`                                                                          |

---

# THE FRONTEND MUST HELP THE USER UNDERSTAND

_(What the interface exists to make legible. A redesign that loses any of these
has failed.)_

1. **What they are trying to accomplish, in their own words** — the conversation
   accepts "I need 500 flyers by Friday in Yaba" and reflects it back as a brief
   the user can correct.
2. **That the price came from a real person, and what Intra can and cannot vouch
   for** — "Entered by the printer… Not independently checked by Intra";
   "Why this looks OK" / "What Intra cannot confirm".
3. **That the decision is theirs, and its full shape** — the approval card puts
   price, business, terms, expiry, and "who you pay, directly" on the surface.
4. **That they, not Intra, send and pay for the order** — the pre-filled message
   shown in full; "Intra does not send this message and never pays a supplier for
   you".
5. **What a payment actually means** — the NGN→USD rate and its source and lock
   time; "network fee is paid from your wallet balance"; `CONFIRMED` only after a
   real receipt; an explorer link to check.
6. **Whether a price is still current** — "Prices confirmed 3 days ago", "stale —
   needs reconfirming", auto-unavailable at 14 days.
7. **What every fulfilment record does and doesn't prove** — "operational
   evidence, not a cryptographic proof, not a payment settlement, not a
   guarantee"; "it is not a rating".
8. **What happens next, and what to do if something goes wrong** — the outcome
   4-step list; `describeTaskException`'s "what next" + "the money position"; the
   5-bucket work list with verb-first action pills.
9. **Whether their action worked** — a phase label (never a bare spinner) on
   every async surface; "You marked this as sent on {date}"; "Payment confirmed".
10. **What the system will never do** — "no wallets, no private keys, and no final
    order without your approval"; "Intra never holds your money"; "we will never
    ask for a seed phrase, private key, password, BVN, NIN, bank login, or card".
11. **That the operator verified the business** — "Verified by operator 3 days
    ago"; the 6-check activation record.
12. **For the merchant: that onboarding does not make them an agent** — "This is
    not an AI agent… you send every quote and the customer approves and pays for
    every order directly".

---

# THE FRONTEND MUST NEVER MAKE THE USER UNDERSTAND

_(Implementation the interface must absorb. Every item currently leaks somewhere —
the anchors say where.)_

1. **Internal state-machine enum names** — `PENDING_ATTESTATION`, `AWAITING_QUOTE`,
   `HANDOFF_READY`, `PROPOSED`. _(Leaks: operator `StatusPill`, `TraceView`.)_
2. **The 13-state agent machine, tool names, HTTP verbs, latencies, run ids,
   model call counts.** _(Contained: 2 nested `<details>` — acceptable.)_
3. **Idempotency keys, session headers, the `{ success, data }` envelope, the
   `Idempotency-Key` conflict semantics.** _(Fully hidden — keep it that way.)_
4. **`keccak256` commit-reveal, the salt, `handoverCommit`, `offerFingerprint`.**
   _(Fully hidden — only the *effect* of a stale fingerprint is shown.)_
5. **USDC atomic units, the ERC-20 ABI, `encodeFunctionData`, the USDC contract
   address, `chainId` in hex, `value: 0n`.** _(MiniPay: clean. x402
   `PaymentReceipt`: leaks `amountAtomic / 1e6`.)_
6. **CAIP-2 network ids (`eip155:42220`), ERC-8021 attribution tags
   (`celo_…`).** _(Leaks: x402 `PaymentReceipt`.)_
7. **EAS schema UIDs, `refUID` chaining, `attestByDelegation`, the EIP-712
   struct, `signNonce`.** _(Leaks: `EvidencePanel` `TraceView`.)_
8. **"Capability Card", "MCP server", "quote route", "input schema", the `/v1`
   endpoint string, the raw route JSON.** _(Leaks: `OnboardingForm` +
   `DraftRoutePreview` — the full-form path.)_
9. **The FX endpoint URL and JSON shape; the server-side receipt-read and
   `Transfer`-event matching logic.** _(Fully hidden — keep it.)_
10. **The `notify()` / `specsForEvent` mechanism, dedupe keys, recipient
    resolution, the push VAPID handshake.** _(Fully hidden — the user sees plain
    titles and 2 switches.)_
11. **The audit-event dotted names** (`task.buyer_accepted`,
    `proofline.ready_for_pickup`). _(Hidden via `eventLabel` on `/tasks/:id`;
    leaks raw in `/operator` Metrics "Recent activity" and `TraceView` timeline.)_
12. **The `after()` background-execution trick, the run-store TTL mechanics, the
    poll intervals.** _(Fully hidden — the user just sees "updating on its own".)_
13. **That the "conversation" is deterministic pattern-matching, not a model.**
    _(Correctly hidden — but the copy should not over-promise AI understanding.)_
14. **The raw brief keys** (`size:`, `full-colour`, `deliveryArea:`) — the user
    sees these humanised everywhere except the one place they read the actual
    WhatsApp message. _(Leaks: `buildOrderMessage`.)_
