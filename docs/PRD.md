# Intra — Product Requirements Document

**Version:** 0.1 (hackathon MVP)  
**Status:** Build-ready, subject to external Celo access  
**Primary track:** Celo Agents at Work — Real World Adoption  
**Secondary tracks:** Best Stablecoin Adoption, AskBots CLI Growth, Judges' Favorite  
**Last updated:** 2026-08-29

## 1. Product overview

**Product framing:** Intra Relay is the managed capability and control layer
for businesses that operate through people, WhatsApp, price lists, and informal
workflows rather than APIs. It gives an agent a fresh, structured business
service while keeping both merchant publication and final buyer order approval
human-controlled. See [`PRODUCT_VISION.md`](PRODUCT_VISION.md) for the
long-term Relay and Proofline framing. This PRD deliberately specifies only the
narrow flyer-printing hackathon MVP.

Intra is a mobile-first procurement assistant for Nigerian campus students and small businesses. A buyer describes one narrow purchasing need—starting with flyer printing. Intra turns it into a structured brief, obtains a quote from a participating independent printer, and presents an understandable recommendation with a human-approved WhatsApp order handoff.

An Intra agent may pay a small stablecoin fee for a useful agent service over Celo x402/`buy` when available. The buyer remains in control: **Intra never holds customer funds and never executes a final supplier payment without explicit human approval.**

Suppliers use a guided form. They do not need to build an API or understand MCP; Intra creates the first structured, agent-readable quote route for them.

## 2. Problem and product opportunity

Students and small businesses find printing, design, catering, and delivery vendors through WhatsApp messages and informal referrals. They often cannot compare prices, availability, turnaround, or delivery terms without repeated, poorly structured conversations.

The first job Intra solves is deliberately narrow: **get a printer quote that meets a stated quantity, budget, deadline, and location, then prepare a buyer-controlled order request.** A narrow job is appropriate for the hackathon and allows real user testing before expanding categories.

## 3. Goals, metrics, and non-goals

### Goals

- **G-001:** A buyer creates a usable printing brief in under three minutes.
- **G-002:** A printer receives an operational, structured quote route without writing code.
- **G-003:** Intra records a real, verifiable Celo agent-service payment when external access allows it.
- **G-004:** Recruit genuine users through the existing Telegram/WhatsApp channel and demonstrate return use.
- **G-005:** Preserve a reusable route format that can later become an SDK/MCP adapter.

### Success metrics

| Metric | Target by submission |
|---|---:|
| Independent buyer tests | 10 |
| Returning buyers on two or more days | 3 |
| Participating printers | 2 |
| Completed quote requests | 15 |
| Real verified x402/`buy` settlements | 3+ if beta access permits |
| AskBots review score | Positive delta across two rounds |

### Non-goals

- General-purpose shopping agent or public marketplace.
- Custody, escrow, remittances, automated swaps, or final auto-payments.
- Bank API/KYC/off-ramp integrations.
- Requiring suppliers to host MCP/API infrastructure.
- Native mobile app or WhatsApp Business bot in the MVP.

## 4. Roles and permissions

| Role | Primary need | Permissions |
|---|---|---|
| Buyer | Get a trustworthy quote fast | create/view task, copy order handoff, submit feedback |
| Supplier | Receive complete structured quote request | onboard business, manage route data, respond/confirm quote, pause route |
| Operator | Keep route data safe and current | verify/publish/pause routes, moderate quotes, view metrics |
| Paid agent service | Deliver paid resource to Intra agent | receive authorised x402 payment, return result |

## 5. MVP scope

### In scope

- A buyer web flow for campus flyer printing.
- Supplier onboarding with business consent and one quote route.
- Structured brief: `size`, `quantity`, `colour`, `deadline`, `deliveryArea`.
- Route lifecycle, operator verification, and operator-assisted quotes.
- Recommendation and a pre-filled WhatsApp order message.
- Agent activity/payment audit timeline.
- x402 402-payment challenge plus real settlement when official facilitator/beta credentials are issued.
- **Proofline pilot:** two optional fulfilment-evidence events after a buyer
  handoff — merchant marks ready, buyer confirms pickup (PRODUCT_VISION §3.2,
  ADR-016). Operational evidence only.
- Public repo, Celo attribution setup, and AskBots review cycle.

### Out of scope

- Supplier marketplace/catalog ingestion, reviews, delivery execution, refunds.
- Card payments, private-key storage, identity-number collection, or bank credentials.
- Multi-supplier automated optimisation beyond a small verified list.
- Fake payment receipts or simulated successful x402 settlement.
- Escrow, dispute resolution, or **any public reliability / reputation score**
  (a Proofline non-goal — PRODUCT_VISION §3.2).

## 6. Feature requirements

### F-TASK — Buyer brief and task

| ID | Requirement |
|---|---|
| FR-TASK-001 | Accept free-text request and the structured flyer fields. |
| FR-TASK-002 | Require quantity, size, colour, deadline, and delivery/pick-up area. |
| FR-TASK-003 | Show field-level plain-language validation. |
| FR-TASK-004 | Let buyer review/edit generated brief before submit. |
| FR-TASK-005 | Persist task lifecycle and agent audit events. |

**Acceptance criteria**

- **AC-TASK-001:** A complete confirmed brief creates a `SUBMITTED` task.
- **AC-TASK-002:** A missing field blocks submission and identifies that field.
- **AC-TASK-003:** A task page displays clear progress and a support-safe failure state.

### F-SUP — Supplier onboarding

| ID | Requirement |
|---|---|
| FR-SUP-001 | Collect business name, authorised contact, contact channel, category, city/country, quote currency, and public Celo payout address. |
| FR-SUP-002 | Validate EVM payout address and collect explicit quote-display consent. |
| FR-SUP-003 | Never ask for seed phrase, private key, password, BVN, NIN, card, or bank-login data. |
| FR-SUP-004 | Generate a readable business slug and draft quote route. |
| FR-SUP-005 | Display route inputs, service fee, SLA, and pause capability before activation. |

**Acceptance criteria**

- **AC-SUP-001:** Invalid address blocks onboarding with an actionable error.
- **AC-SUP-002:** Successful onboarding shows business slug and draft route URL.
- **AC-SUP-003:** Only an operator-verified consenting route can become public.

### F-ROUTE — Agent-readable quote route

| ID | Requirement |
|---|---|
| FR-ROUTE-001 | Each route has name, description, input schema, query fee, payout address, SLA, endpoint, and lifecycle status. |
| FR-ROUTE-002 | Flyer route schema contains size, quantity, colour, deadline, and delivery area. |
| FR-ROUTE-003 | Support `DRAFT`, `PENDING_VERIFICATION`, `ACTIVE`, `PAUSED`, `ARCHIVED`. |
| FR-ROUTE-004 | Inactive routes issue no payment request and accept no buyer task. |

**Acceptance criteria**

- **AC-ROUTE-001:** Incomplete route cannot be activated.
- **AC-ROUTE-002:** Paused route returns `ROUTE_UNAVAILABLE` without asking for payment.
- **AC-ROUTE-003:** Schema errors list missing fields.

### F-PAY — Agent service payment

| ID | Requirement |
|---|---|
| FR-PAY-001 | Log service, purpose, maximum fee, payer, recipient, task ID before each paid call. |
| FR-PAY-002 | Follow x402 flow: receive 402 → authorise `X-PAYMENT` → retry → verify settlement → persist receipt. |
| FR-PAY-003 | Mark `SETTLED` only after real facilitator/beta verification and valid mainnet transaction hash. |
| FR-PAY-004 | If access is unavailable, show `UNAVAILABLE`; never fabricate payment success. |
| FR-PAY-005 | Cap agent spend at $0.05 per task by default; server enforces the cap. |
| FR-PAY-006 | Distinguish a **bad agent authorisation** (`402 PAYMENT_FAILED`, retryable) from **absent verification** — no key, invalid `X402_*` config, or an unreachable facilitator (`503 PAYMENT_SERVICE_UNAVAILABLE`, not the agent's fault). An `X402_*` config mistake must not block free routes or the buyer web flow. |
| FR-PAY-007 | A `settle` timeout / unconfirmable result is **indeterminate** — recorded `AUTHORISED` with no tx hash, returned as `503 PAYMENT_SETTLEMENT_INDETERMINATE`, claimed neither paid nor failed. The same authorisation is never re-verified or re-settled. |

**Acceptance criteria**

- **AC-PAY-001:** No `X402_API_KEY` → a paid `/v1` quote returns `503 PAYMENT_SERVICE_UNAVAILABLE`, no 402, no receipt, no hash; a free route still returns `202`.
- **AC-PAY-002:** An invalid `X402_NETWORK` / `X402_ASSET` never 500s the quote endpoint — it degrades to `503` for paid routes (logged once) and `202` for free routes.
- **AC-PAY-003:** Facilitator unreachable on `verify` → `503` with `retryable: true`, no task, no `FAILED` receipt.
- **AC-PAY-004:** `settle` timeout → `503 PAYMENT_SETTLEMENT_INDETERMINATE`, an immutable `AUTHORISED` receipt with no tx hash; re-presenting the same `X-PAYMENT` returns the same result and never re-calls the facilitator.
- **AC-PAY-005:** The same `Idempotency-Key` used for the 402 probe and the paid retry succeeds; concurrent identical `X-PAYMENT` requests converge on one receipt.
- **AC-PAY-006:** `X402_API_KEY` never appears in a response, audit event, receipt row, or the capability document. A malformed `X402_ATTRIBUTION_TAG` is ignored, never recorded.

### F-REC — Recommendation and handoff

| ID | Requirement |
|---|---|
| FR-REC-001 | Show supplier, price/range, currency, turnaround, assumptions, confidence, source update time. |
| FR-REC-002 | Generate but never auto-send a WhatsApp order message. |
| FR-REC-003 | Show task audit timeline and verified payment receipts/transaction hashes. |
| FR-REC-004 | Final purchase is a buyer-controlled external action. |

### F-PROOF — Proofline fulfilment-evidence pilot

Bounded pilot sanctioned by PRODUCT_VISION §3.2, §6 and ADR-012 / ADR-016.
Additive; it does not change any earlier flow.

| ID | Requirement |
|---|---|
| FR-PROOF-001 | Two optional events only: (1) merchant marks the order **ready for pickup**; (2) buyer **confirms pickup**. No other fulfilment events. |
| FR-PROOF-002 | No Proofline event can be created before the buyer has personally confirmed the WhatsApp handoff (`task.handoffConfirmedAt`). |
| FR-PROOF-003 | Event 1 requires the route's business manage token (the merchant). Event 2 requires the buyer's own task session **or** the one-time pickup code the merchant issues at event 1. |
| FR-PROOF-004 | Every event stores: task/order reference, actor role, timestamp, event type, confirmation method, and the resulting evidence status. The log is append-only. |
| FR-PROOF-005 | The UI and API state explicitly that Proofline records are **operational evidence**, not cryptographic proof and not payment settlement. |
| FR-PROOF-006 | No claim that a step happened unless its required actor recorded it. No public reliability, reputation, or on-time score is derived or shown. |
| FR-PROOF-007 | The pickup code is never exposed to the buyer's task view; it is shown only to the authenticated merchant. |

**Acceptance criteria**

- **AC-PROOF-001:** `mark ready` before a confirmed handoff → `409 HANDOFF_NOT_CONFIRMED`, no event.
- **AC-PROOF-002:** `mark ready` without / with a wrong manage token → `401`, no event.
- **AC-PROOF-003:** `confirm pickup` before `mark ready` → `409 NOT_READY_FOR_PICKUP`.
- **AC-PROOF-004:** `confirm pickup` with neither a matching session nor a valid code → `401`; a wrong or replayed code never records an event.
- **AC-PROOF-005:** A second `mark ready` or a second `confirm pickup` → `409` (replay-safe).
- **AC-PROOF-006:** A completed pilot shows two attributed events with the evidence status `MERCHANT_MARKED_READY` then `BUYER_CONFIRMED_PICKUP`; nothing is labelled "fulfilled" as a bare fact.

## 7. Screens and states

| Screen | Route | Access | Purpose |
|---|---|---|---|
| S-001 | `/` | Public | value proposition and CTA |
| S-002 | `/request` | Public | create/edit flyer brief |
| S-003 | `/tasks/:id` | Session holder | status, activity, quote, recommendation, receipt timeline |
| S-004 | `/supplier/onboard` | Invited supplier | business and route onboarding |
| S-005 | `/supplier/:slug/review` | Supplier/operator | review data and route status |
| S-006 | `/operator` | Operator | verify/pause routes, manage quotes, view adoption |
| S-007 | `/docs` | Public | route/API documentation |

| Domain | States |
|---|---|
| Task | `DRAFT`, `SUBMITTED`, `AWAITING_SERVICE`, `AWAITING_QUOTE`, `RECOMMENDED`, `HANDOFF_READY`, `FAILED`, `CANCELLED` |
| Payment | `NOT_REQUIRED`, `REQUESTED_402`, `AUTHORISED`, `SETTLED`, `FAILED`, `UNAVAILABLE` |
| Quote | `PENDING`, `RECEIVED`, `EXPIRED`, `DECLINED` |
| Proofline evidence | `NOT_STARTED`, `MERCHANT_MARKED_READY`, `BUYER_CONFIRMED_PICKUP` |
| UI | loading, empty, validation error, network error, success, unavailable |

## 8. Core user flows

### Buyer

```text
Landing → print brief → review → submit task → agent selects active route
→ optional paid service call → quote received → recommendation → buyer accepts or declines
→ buyer copies WhatsApp handoff → buyer confirms they sent it → buyer agrees final order directly with supplier
→ optional Proofline: merchant marks ready → buyer confirms pickup
→ feedback
```

### Supplier

```text
Invite → consent/business details → public Celo receiving address → first route
→ review generated schema/endpoint → operator verifies data → route active
```

### Payment failure

```text
Agent receives 402 → payment service unavailable/fails verification
→ record failure without charge or fake receipt → continue only with permitted data or show unavailable state
```

## 9. Business rules

- **BR-001:** Intra does not custody funds or sign final buyer payments.
- **BR-002:** An active route belongs to a verified, consenting business and verified public payout address.
- **BR-003:** A quote is an estimate unless a supplier marks it fixed with expiry.
- **BR-004:** Query fee is distinct from order price.
- **BR-005:** Payment receipts cannot be manually entered; they require verification result and tx hash.
- **BR-006:** Routes can be paused immediately for stale/inaccurate data or revoked consent.
- **BR-007:** Any hackathon-claimed mainnet transaction must include its registered Celo attribution tag.
- **BR-008:** Wallet analytics require user opt-in.
- **BR-009:** A Proofline fulfilment event is recorded only when its required actor confirms it (merchant for "ready", buyer for "pickup"). It is operational evidence — never proof, settlement, or a reliability score.

## 10. Data model

| Entity | Essential fields |
|---|---|
| Business | id, slug, name, contactName, contactChannel, category, location, payoutAddress, consentAt, status |
| QuoteRoute | id, businessId, name, inputSchema, queryFeeUsd, SLA, status, verifiedAt |
| Task | id, sessionId, buyerWalletOptIn, structuredInput, status, timestamps |
| Quote | id, taskId, routeId, amount/range, currency, turnaround, assumptions, expiry, status |
| ServicePayment | id, taskId, service, resource, fee, asset, payer/payee, status, txHash, verification, timestamp |
| Recommendation | id, taskId, quoteId, rationale, confidence, orderMessage |
| Feedback | id, taskId, useful, comment, timestamp |
| ProoflineEvent | id, taskId, eventType, actorRole, confirmationMethod, evidenceStatus, pickupCode?, createdAt |

## 11. Integrations

| Integration | Role | Dependency status |
|---|---|---|
| Celo mainnet RPC | transaction verification | required for claims |
| Celo ERC-8021 tag | hackathon attribution | must receive at registration |
| ERC-8004 Agent ID | hackathon registration | must obtain before registration |
| x402 facilitator | paid service settlement | conditional on official configuration |
| `buy` beta | buyer-side agent-service marketplace | private beta; optional core flow |
| AskBots CLI | external agent reviews | secondary-track target |
| WhatsApp deep link | buyer-controlled order handoff | required |

## 12. Non-functional requirements

- **NFR-SEC-001:** Do not collect, store, display, or log private keys, seed phrases, identity numbers, card data, or bank credentials.
- **NFR-SEC-002:** Validate all input, rate-limit public routes, use CSRF/session protections, and keep secrets server-side.
- **NFR-REL-001:** Preserve task/payment audit records through failures.
- **NFR-PERF-001:** Give submit feedback within 500ms in normal conditions.
- **NFR-UX-001:** Support 360px mobile screens; use non-crypto language for buyers/suppliers.
- **NFR-A11Y-001:** Labels, keyboard navigation, focus indicators, and accessible form errors are mandatory.

## 13. Risks, assumptions, and open questions

| Risk | Mitigation |
|---|---|
| `buy` beta unavailable | Keep x402 behind an adapter; core free request/quote flow remains useful. |
| Few independent Celo users | Use existing community honestly; do not fund or manufacture wallet activity. |
| Stale price data | show update time/SLA/expiry; operator pause control. |
| Supplier technical friction | guided form and operator-assisted response. |
| Scope creep | one category, two suppliers, one end-to-end task. |

**Open questions:** first campus and printer names; agent-wallet funding budget; precise `buy` beta commands/API; whether USA₮ is available for final demonstration; supplier-response method.

## 14. AI implementation rules

1. This PRD is the product source of truth. Flag conflicts; do not silently reinterpret requirements.
2. Implement MVP scope only unless a requirement is explicitly promoted.
3. Cite requirement IDs in code, tests, issues, and commits.
4. Never fabricate merchant data, payment success, transaction hashes, or beta access.
5. Require human approval before a final supplier order/payment.
6. Test both acceptance and failure states before declaring a feature complete.
