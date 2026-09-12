# 00 — Master X-Ray

> Reverse-engineered from the repository as it exists on branch
> `feat/m10.5-minipay-payment` (HEAD `51c194e`). This document describes the
> application **as built**, not as it should be. Every claim cites a source
> file. Nothing here is a redesign.
>
> Companion source-of-truth docs: [`PRD.md`](../PRD.md),
> [`PRODUCT_VISION.md`](../PRODUCT_VISION.md),
> [`TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md),
> [`DECISIONS.md`](../DECISIONS.md) (ADR-001…ADR-023),
> [`UX_ARCHITECTURE.md`](../UX_ARCHITECTURE.md),
> [`AGENTIC_ARCHITECTURE.md`](../AGENTIC_ARCHITECTURE.md).

---

# 1. Product Overview

**Intra Relay** is the merchant-side capability and control layer for
WhatsApp-native, non-API businesses. It turns one real business service into a
structured, agent-readable "Capability Card" and quote route, so any buyer agent
can request a genuine quote without the business building an API or MCP server.
The hackathon MVP proves exactly one workflow: **campus flyer printing** for
Nigerian students and small businesses. (`CLAUDE.md` §1; `docs/PRODUCT_VISION.md`
§1, §6; `docs/PRD.md` §1.)

Public-facing framing (`src/lib/site.ts`):

- Name: **Intra**
- Tagline: **"The trusted business layer for AI-agent commerce"**
- One-liner: "Intra turns your request into a brief a real business can act on.
  You get a fresh quote, keep the final say, and never have to decode technical
  tools to begin." (`src/app/page.tsx:42`)

Non-negotiable product properties (`docs/PRODUCT_VISION.md` §3.1; `CLAUDE.md`
§4):

1. **Merchant-controlled** — a route is verified by an operator before it is
   public, and can be paused in one tap.
2. **Fresh** — price/availability data has a confirmation timestamp and becomes
   unavailable at 14 days (`src/features/routes/freshness.ts:9`).
3. **Channel-neutral** — an agent can come from anywhere; Intra does not own the
   buyer's chat interface.
4. **Human-approved** — a buyer always approves and sends the final order; Intra
   never places it or custodies funds (`BR-001`).
5. **Honest about payment** — a settlement is only shown after real verification
   and a real transaction hash; otherwise an explicit unavailable state.

What is proven end-to-end today (`README.md` "What works today"):

```
supplier onboarding → operator verification & activation → buyer request
→ printer selection → structured brief → genuine supplier quote OR safe decline
→ recommendation → buyer accepts or declines
→ buyer's human-controlled WhatsApp handoff
→ optional on-chain order payment via MiniPay (M10.5, code-complete)
→ optional Proofline fulfilment evidence (merchant marks ready → buyer confirms pickup)
→ optional two-party handover attestation on EAS (merchant signs)
→ feedback
```

The MVP deliberately does **not** include: a general shopping agent, a public
marketplace, custody/escrow/remittances/swaps, automatic final payments,
bank/KYC/off-ramp integrations, a native mobile app or WhatsApp bot, or any
fabricated payment receipt (`CLAUDE.md` MVP boundary; `docs/PRD.md` §5).

---

# 2. Users and Roles

| Role                                                      | Identity mechanism                                                                                                                                                      | Where it lives                                                                                                                               | Can do                                                                                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Buyer** (student / SME)                                 | opaque per-device session id `intra.sessionId` (random, ≥ 8 chars)                                                                                                      | `localStorage`, sent as `x-session-id` header (`src/lib/session.ts`, `src/lib/api.ts:39`)                                                    | create/view own task, run the agent, decide on a quote, confirm handoff, pay via wallet, confirm pickup, cancel, report problems, leave feedback                                     |
| **Buyer's wallet** (MiniPay / injected EIP-1193)          | wallet address, detected via `window.ethereum` (`src/features/payments/minipay/detect.ts`)                                                                              | browser extension / MiniPay in-app browser                                                                                                   | sign one ERC-20 `transfer` to the business for the order price (M10.5)                                                                                                               |
| **Buyer's AI agent** (built-in `/agent` run, or external) | `agent:<rand>` session generated server-side (`src/features/agent/run/service.ts:57`); the human keeps a `buyerClaim` on the task (`src/lib/db/schema.ts:170`)          | in-memory run store (30-min TTL, `src/features/agent/run/store.ts:53`)                                                                       | discover providers, request quotes, compare, recommend — then **stop**. Cannot accept/pay (`MODEL_TOOLS` excludes `recordBuyerDecision`, ADR-019)                                    |
| **Supplier / Business**                                   | opaque `manageToken` (32 hex chars, random, not a wallet secret) delivered as `?t=<token>` link (`src/lib/db/schema.ts:106`; `src/lib/http/operator.ts:getManageToken`) | the URL the operator/quick-start hands them                                                                                                  | pause a route, submit for review, send/revise/decline a quote, edit published price, mark order ready (pickup code), sign a handover attestation, view own workspace + notifications |
| **Operator**                                              | `x-operator-key` matching an `OPERATOR_API_KEYS` env entry (`label:secret`), constant-time compared (`src/lib/http/operator.ts`)                                        | `sessionStorage` key `intra.operatorKey` (`src/features/operator/OperatorConsole.tsx:19`) — never sent to a server for storage, never logged | verify + activate/reactivate a route (6-point checklist), pause any route, respond to a request on a business's behalf, view metrics + evidence + a task trace                       |
| **Paid agent service** (x402 counterparty)                | n/a                                                                                                                                                                     | external                                                                                                                                     | receive an authorised x402 query-fee payment, return a result — **currently `UNAVAILABLE`**, no key configured (`docs/PAYMENTS.md`; ADR-004/011/017)                                 |

There is **no login, no password, no account, no email collection** anywhere in
the product (`CLAUDE.md` §4.2; `docs/API.md` Conventions). All three human roles
are identified by an opaque bearer value in a header or a URL.

---

# 3. Core Product Model

```
        BUYER (human or agent)
            │  natural-language need  → structured brief
            ▼
    ┌──────────────────────────────────────────────┐
    │  INTRA RELAY                                  │
    │  • conversational intent layer               │  ← model proposes, never writes
    │  • deterministic buyer-agent orchestration   │  ← discovers, quotes, compares
    │  • capability card + /v1 REST contract       │  ← what agents read
    │  • route lifecycle + operator verification   │  ← merchant control + freshness
    │  • quote integrity (accepted = immutable)    │
    │  • human-approval gate (decision is its own step)
    │  • WhatsApp order handoff (pre-filled, never sent)
    │  • MiniPay order payment (wallet → business, non-custodial)
    │  • Proofline pilot (2 fulfilment events)     │
    │  • EAS handover attestation (2-of-2 signing) │
    │  • append-only audit trail + privacy-safe evidence
    └──────────────────────────────────────────────┘
            │  structured quote request
            ▼
        LOCAL BUSINESS (responds through its existing human WhatsApp workflow)
```

Central domain entities (`src/lib/db/schema.ts` — 16 `pgTable` definitions: the
15 domain entities below, plus `idempotency_keys` for the write-idempotency
infrastructure):

| Entity                  | Table                      | Role                                                                                                                                                                                              |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business                | `businesses`               | the merchant; `manageToken`, `payoutAddress`, `consentAt`, `verifiedByOperatorAt`, `status`                                                                                                       |
| Quote route             | `quote_routes`             | one agent-readable service; `inputSchema` (JSON), `queryFeeUsd`, `responseSlaMinutes`, `pricingModel`, `priceAmount`/`priceUnit`, `status`, `priceUpdatedAt`, `verifiedAt`, `activationChecklist` |
| Task                    | `tasks`                    | one buyer request; `sessionId` + `buyerClaimSession`, `structuredInput`, `status`, `buyerDecision`, `handoffConfirmedAt`, `closedAt`                                                              |
| Quote                   | `quotes`                   | a business's answer; append-only revisions (`supersedesQuoteId`, `revision`, `acceptedAt`, `changeReason`); `fixed`, `expiresAt`                                                                  |
| Recommendation          | `recommendations`          | 1-per-task; `rationale`, `orderMessage` (the never-sent WhatsApp text)                                                                                                                            |
| Feedback                | `feedback`                 | `useful` boolean + optional comment                                                                                                                                                               |
| Service payment         | `service_payments`         | append-only x402 query-fee record; `status` `NOT_REQUIRED`…`SETTLED`; `txHash` unique                                                                                                             |
| Audit event             | `audit_events`             | append-only trail (`type`, entity ids, `data`) — the product's memory                                                                                                                             |
| Proofline event         | `proofline_events`         | append-only; `READY_FOR_PICKUP` / `PICKUP_CONFIRMED`; `pickupCode` (merchant-only)                                                                                                                |
| Commitment              | `commitments`              | a quote after human approval; `handoverCommit` (public), `handoverSalt`/`handoverCode` (server-only); EAS attestation fields                                                                      |
| Handover attestation    | `handover_attestations`    | the merchant's own signed record of physical handover; `signNonce`/`signDeadline`, `refUid`                                                                                                       |
| Order payment           | `order_payments`           | buyer→business MiniPay settlement; frozen `recipientAddress`/`amountAtomic`/`ngnUsdRate`; `status` `CREATED`…`CONFIRMED`; `txHash` unique                                                         |
| Notification            | `notifications`            | current attention item per (audience, recipient, dedupeKey); `level`, `title`, `body`, `deeplink`                                                                                                 |
| Push subscription       | `push_subscriptions`       | web-push endpoint bound to a server-resolved recipient                                                                                                                                            |
| Notification preference | `notification_preferences` | two switches: `pushEnabled`, `pushInformational`                                                                                                                                                  |

---

# 4. Major Features

| #   | Feature                                                     | Entry surface(s)                                                                                                                       | Backend                                                                                                                 |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F1  | **Conversational buyer intake**                             | `/agent` → `ConversationView`                                                                                                          | `POST /api/conversation` → `handleConversationTurn` (intent classify → route → optionally start a run)                  |
| F2  | **Deterministic buyer-agent run** (optionally LLM-assisted) | inline in the conversation, or `AgentConsole` on `/agent`                                                                              | `POST /api/agent/run`, `GET /api/agent/run/:id` (poll), `POST /api/agent/run/:id/approve`                               |
| F3  | **Structured brief form** (legacy simple path)              | `/request` → `RequestForm`                                                                                                             | `POST /api/tasks` + `POST /api/tasks/:id/submit`                                                                        |
| F4  | **Task workspace / lifecycle**                              | `/tasks/:id` → `TaskPage`                                                                                                              | `GET /api/tasks/:id` returns one composed view (`getTaskView`)                                                          |
| F5  | **Buyer decision** (accept / decline the quote)             | `DecisionPanel` on `/tasks/:id`, `ApprovalPanel` in the agent console                                                                  | `POST /api/tasks/:id/decision` / `POST /api/agent/run/:id/approve`                                                      |
| F6  | **WhatsApp order handoff**                                  | `HandoffCard` on `/tasks/:id`                                                                                                          | copies text / opens `wa.me`; `POST /api/tasks/:id/handoff-confirm`                                                      |
| F7  | **MiniPay order payment** (M10.5, ADR-023)                  | `PayPanel` on `/tasks/:id` (before the handoff card)                                                                                   | `POST /api/tasks/:id/order-payment` (create), `.../submit` (tx hash), `.../cancel`; server verifies a real Celo receipt |
| F8  | **Buyer session recovery / work list**                      | `BuyerWorkPanel` on `/agent` and `/activity`                                                                                           | `GET /api/tasks` → `listBuyerWork` (5 plain buckets)                                                                    |
| F9  | **Notifications / action centre**                           | `ActionCentre` on `/activity`, `/supplier/:slug`, `/supplier/:slug/requests`; web push                                                 | `GET /api/notifications`, `POST .../:id/read`, `.../read-all`; `notify()` writes rows + fires push                      |
| F10 | **PWA install + web push**                                  | `InstallPrompt`, `PushPrompt`, `NotificationSettings`, `ServiceWorker`                                                                 | `public/sw.js`, `app/manifest.ts`, `/api/push/{config,subscribe,unsubscribe}`                                           |
| F11 | **Business quick-start onboarding**                         | `/supplier/onboard` → `QuickStartForm` (one screen)                                                                                    | `POST /api/businesses/quick-start` (creates business + DRAFT route in one txn)                                          |
| F12 | **Full onboarding (draft only)**                            | `/supplier/onboard/full` → `OnboardingForm` (4 steps)                                                                                  | **no POST** — produces a reviewable `DraftRoutePreview` for an operator                                                 |
| F13 | **Supplier workspace**                                      | `/supplier/:slug` (`?t=`) — action-first overview                                                                                      | `getSupplierWorkspace` (server component)                                                                               |
| F14 | **Supplier request inbox**                                  | `/supplier/:slug/requests` (`?t=`)                                                                                                     | quote/revise/decline forms → `POST /api/routes/:id/quotes`                                                              |
| F15 | **Supplier route review + pause**                           | `/supplier/:slug/review` (`?t=`)                                                                                                       | `PATCH /api/routes/:id/status` (PAUSED)                                                                                 |
| F16 | **Published-price editing**                                 | `EditPublishedPriceForm` on `/supplier/:slug`                                                                                          | `PATCH /api/routes/:id/pricing`                                                                                         |
| F17 | **Price change on an agreed order**                         | `ChangePriceForm` (supplier) → `PriceChangePanel` (buyer)                                                                              | `POST /api/routes/:id/quotes` `{revise:true}` → `POST /api/tasks/:id/price-change`                                      |
| F18 | **Operator review queue + verification**                    | `/operator` → `OperatorConsole` "Review queue" tab                                                                                     | `GET /api/operator/routes`, `PATCH /api/routes/:id/status` (ACTIVE + 6-check checklist)                                 |
| F19 | **Operator metrics**                                        | `/operator` "Metrics" tab → `MetricsPanel`                                                                                             | `GET /api/operator/metrics`                                                                                             |
| F20 | **Operator evidence trace**                                 | `/operator` "Evidence" tab → `EvidencePanel`                                                                                           | `GET /api/operator/evidence/:taskId` (full cross-referenced trace)                                                      |
| F21 | **Public evidence page**                                    | `/evidence` → `EvidenceView`                                                                                                           | `buildEvidenceReport` (server); `GET /api/evidence?format=csv\|json`                                                    |
| F22 | **Proofline fulfilment pilot**                              | `MerchantFulfilmentPanel` (`/supplier/:slug/requests`), `BuyerPickupPanel` (`/tasks/:id`)                                              | `POST /api/tasks/:id/proofline/{ready,confirm-pickup}`                                                                  |
| F23 | **EAS handover attestation**                                | `HandoverCodePanel` (buyer, shows code), `HandoverAttestPanel` (merchant, signs)                                                       | `POST /api/tasks/:id/handover/{sign-request,submit}`; `POST /api/tasks/:id/commitment` (retry)                          |
| F24 | **Order exception handling**                                | `OrderProblemPanel` on `/tasks/:id` (cancel / handover failed); provider-side withdraw/cannot-fulfil via `POST /api/routes/:id/quotes` | `exception-service.ts`; `describeTaskException` → semantic `Callout`                                                    |
| F25 | **Public capability API**                                   | none (machine)                                                                                                                         | `GET /v1/:slug/capabilities`, `POST /v1/:slug/:route/quote` (x402)                                                      |
| F26 | **Agent route docs**                                        | `/docs` (static explainer)                                                                                                             | none                                                                                                                    |
| F27 | **Product analytics**                                       | client-wide via `useAnalytics` / `AnalyticsProvider`                                                                                   | Amplitude Browser SDK + narrow server forward (`src/features/analytics/`)                                               |

---

# 5. Complete Route Map

See [`04-SCREEN-SPEC.md`](04-SCREEN-SPEC.md) for the per-screen detail. Summary:

## App Router pages (`src/app/**/page.tsx`)

| Path                        | File                                                        | Role                              | Rendering                          | Auth gate                                                      |
| --------------------------- | ----------------------------------------------------------- | --------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `/`                         | `src/app/page.tsx`                                          | public marketing                  | static                             | none                                                           |
| `/agent`                    | `src/app/agent/page.tsx`                                    | buyer home / workspace            | client islands                     | session (client)                                               |
| `/activity`                 | `src/app/activity/page.tsx`                                 | buyer action centre               | client islands                     | session (client)                                               |
| `/request`                  | `src/app/request/page.tsx`                                  | structured brief (simple path)    | client island                      | session (client)                                               |
| `/tasks/[id]`               | `src/app/tasks/[id]/page.tsx` → `TaskPage`                  | buyer task detail                 | client, polls `GET /api/tasks/:id` | `x-session-id` must match; `403` → "belongs to another device" |
| `/supplier/onboard`         | `src/app/supplier/onboard/page.tsx` → `QuickStartForm`      | business one-screen setup         | client form                        | none (creates PENDING_VERIFICATION)                            |
| `/supplier/onboard/full`    | `src/app/supplier/onboard/full/page.tsx` → `OnboardingForm` | operator-assisted long form       | client, **no persistence**         | none                                                           |
| `/supplier/[slug]`          | `src/app/supplier/[slug]/page.tsx`                          | business workspace                | server component, `force-dynamic`  | `?t=` manage token → `canManage`; without it a read-only shell |
| `/supplier/[slug]/requests` | `src/app/supplier/[slug]/requests/page.tsx`                 | request inbox + handed-off orders | server component                   | **`notFound()` without a valid `?t=`**                         |
| `/supplier/[slug]/review`   | `src/app/supplier/[slug]/review/page.tsx`                   | route review + pause              | server component                   | **`notFound()` without a valid `?t=`**                         |
| `/operator`                 | `src/app/operator/page.tsx` → `OperatorConsole`             | operator console (3 tabs)         | client, key in `sessionStorage`    | `x-operator-key`; `401` → "not accepted"                       |
| `/docs`                     | `src/app/docs/page.tsx`                                     | static route-contract explainer   | static                             | none                                                           |
| `/evidence`                 | `src/app/evidence/page.tsx` → `EvidenceView`                | public results page               | server component, `force-dynamic`  | none                                                           |
| `/offline`                  | `src/app/offline/page.tsx`                                  | SW offline fallback               | static (must render from cache)    | none                                                           |

## Special files

| File                          | Purpose                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`          | root: `<ServiceWorker>`, `<AnalyticsProvider>`, `<OfflineBanner>`, `<Header>`, `<MainContainer>`, `<Footer>`; viewport `themeColor: "#0f3e17"` (stale green — see §20), full PWA metadata |
| `src/app/error.tsx`           | route-segment error boundary — "Something went wrong on our side" + Try again / Go home                                                                                                   |
| `src/app/global-error.tsx`    | root-layout error boundary — inline-styled, own `<html>`                                                                                                                                  |
| `src/app/not-found.tsx`       | "Not found" + Go home                                                                                                                                                                     |
| `src/app/manifest.ts`         | `/manifest.webmanifest`; `start_url: "/agent"`, `display: "standalone"`, `theme_color: "#0f3e17"` (stale)                                                                                 |
| `src/app/opengraph-image.tsx` | generated OG card, uses **stale** green palette                                                                                                                                           |

## API route handlers (`src/app/api/**`, `src/app/v1/**`)

See [`00` §4](#4-major-features) and [`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md).
41 handler files. All internal API responses use the envelope
`{ success: true, data }` / `{ success: false, error: { code, message, details? } }`
(`src/lib/api.ts`, `src/lib/http/response.ts`). All writes require an
`Idempotency-Key` header (8–200 chars); repeat + same body replays, repeat +
different body → `409 IDEMPOTENCY_KEY_CONFLICT` (`docs/API.md`).

---

# 6. Complete Component Map

Full inventory in [`03-COMPONENT-INVENTORY.md`](03-COMPONENT-INVENTORY.md).
Structure:

- **Layout / chrome** (`src/components/`): `Header`, `Footer`, `MainContainer`,
  `OfflineBanner`.
- **UI primitives** (`src/components/ui/`): `Button`, `Callout` (4 tones),
  `CheckboxField`, `DataList`/`DataRow`, `Section` (`SectionHeader`, `Card`,
  `CardTitle`), `SelectField`, `TextField`, `StatusPill` (+ label/tone helpers),
  `States` (`EmptyState`, `Skeleton`, `CardSkeleton`, `LoadingPanel`,
  `ErrorState`).
- **Agent console** (`src/features/agent/console/`): `ConversationView`
  (thread + input), `AgentConsole` (run orchestration + polling), `StageList`
  (7-stage spine), `UnderstandingCard` (+ correction editor), `RecommendationPanel`
  (+ `Alternatives`, `RuledOut`), `ApprovalPanel` (the hard gate), `OutcomePanel`
  (`Approved`/`Declined`/`Unsuccessful`), `ActivityFeed` (+ `EngineeringTrace`).
- **Buyer task** (`src/features/tasks/`): `TaskPage` (the largest component,
  ~1000 lines, contains `RecommendationCard`, `DecisionPanel`, `PaymentReceipt`,
  `HandoffCard`, `FeedbackForm`), `BuyerWorkPanel` (+ `WorkRow`),
  `OrderProblemPanel`, `RequestForm`.
- **Payments / MiniPay** (`src/features/payments/minipay/`): `PayPanel`,
  `useOrderPayment` (phase machine + polling), `wallet-adapter` (viem transfer),
  `detect` (capability detection).
- **Proofline** (`src/features/proofline/`): `MerchantFulfilmentPanel`,
  `BuyerPickupPanel`.
- **Attestation** (`src/features/attestation/`): `HandoverCodePanel` (buyer),
  `HandoverAttestPanel` (merchant, EIP-712 signing).
- **Quotes** (`src/features/quotes/`): `PriceChangePanel` (buyer decides on a
  proposed change).
- **Supplier** (`src/features/supplier/`): `QuoteResponseForm` (quote / decline
  toggle), `ChangePriceForm`, `EditPublishedPriceForm`, `PauseRouteButton`.
- **Businesses** (`src/features/businesses/`): `QuickStartForm`, `OnboardingForm`
  (4-step wizard), `DraftRoutePreview`.
- **Operator** (`src/features/operator/`): `OperatorConsole` (+ `OperatorRouteCard`),
  `MetricsPanel`, `EvidencePanel` (+ `TraceView`).
- **Metrics** (`src/features/metrics/`): `EvidenceView` (public + operator).
- **Notifications** (`src/features/notifications/`): `ActionCentre`
  (+ `NotificationRow`), `NotificationSettings`.
- **PWA** (`src/features/pwa/`): `ServiceWorker`, `InstallPrompt`, `PushPrompt`,
  `ResumeSignal`.
- **Analytics** (`src/features/analytics/`): `AnalyticsProvider`,
  `AnalyticsBusinessIdentity` (both render `null`).

**36 `.tsx` components carry `"use client"`, plus 5 `.ts` client modules
(`useOrderPayment`, `usePushSetup`, `wallet-adapter`, `detect`, and the analytics
client).** The three `/supplier/[slug]*` pages and
`/evidence` are React Server Components; everything else buyer-facing is a client
island fetching JSON.

---

# 7. Complete Workflow Map

Detailed state machines in
[`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md). The
end-to-end journey:

```
BUSINESS SIDE
  quick-start (5 fields)  ──► business PENDING_VERIFICATION + route DRAFT
        │                                        │
        │  (or full form → draft only → operator keys it in by curl)
        ▼                                        ▼
  operator opens /operator ──► ticks 6 checks ──► PATCH status ACTIVE
        │                     (consent, contact, address, price source, SLA, sample)
        ▼
  route ACTIVE + verifiedAt + priceUpdatedAt stamped; business operator-verified
  route silently becomes "stale" (unavailable) 14 days after priceUpdatedAt


BUYER SIDE
  /agent conversation ──► intent classified ──► brief complete?
        │                                          │ no → assistant asks
        │                                          ▼ yes
        │                              START_RUN (deterministic agent, LLM-assisted)
        │                                          │
  /request form (alt path) ─► pick route ─► POST /api/tasks + submit
        │                                          │
        ▼                                          ▼
  task SUBMITTED → AWAITING_QUOTE      agent: discover → check → quote(s) → compare
        │  (notify BUSINESS "new request")         │
        ▼                                          ▼
  BUSINESS sends quote  ──────────────────►  task RECOMMENDED  (quote RECEIVED)
    OR declines         ──────────────────►  task FAILED (SUPPLIER_DECLINED)
        │                                          │  (notify BUYER "quote ready")
        ▼                                          ▼
  BUYER decides:  ACCEPT ──► task HANDOFF_READY ──► commitment created (PENDING_ATTESTATION)
                                │                    handover code issued to buyer
                  DECLINE ──► task CANCELLED (nothing ordered)
        │
        ▼   (notify BUSINESS "customer accepted"; notify BUYER "ready to send")
  HANDOFF_READY page shows, in order:
     1. PayPanel (MiniPay) — optional, additive
     2. HandoffCard — copy the pre-filled WhatsApp message / open wa.me
     3. HandoverCodePanel — the buyer's spoken handover code
     4. OrderProblemPanel — cancel / report handover failed
        │
        ▼
  BUYER taps "I've sent this" ──► task.handoffConfirmedAt set; feedback unlocks
        │
        ▼   (Proofline now available)
  MERCHANT "mark ready for pickup" ──► READY_FOR_PICKUP event + 6-char pickup code
        │
        ▼
  BUYER "confirm I collected this" (own session OR pickup code) ──► PICKUP_CONFIRMED
        │
        ▼   (independently)
  MERCHANT asks buyer for the handover code ──► sign-request (EIP-712) ──► wallet signs
        │                                        ──► submit ──► EAS attestByDelegation
        ▼
  handover attestation ATTESTED (mock in staging, on-chain in production)
        │
        ▼
  BUYER leaves feedback (useful? + optional comment)
```

Payment failure path (x402 query fee, agent side only): challenge → verify/settle
→ `UNAVAILABLE` (no key) / `FAILED` (bad auth) / `INDETERMINATE` (settle timeout)
— never a fabricated receipt (ADR-017).

---

# 8. State Model

Enumerated fully in
[`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md). The states a
redesign must render:

| Domain                             | States                                                                                                                                               | Source                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Task**                           | `DRAFT` → `SUBMITTED` → `AWAITING_QUOTE` → `RECOMMENDED` → `HANDOFF_READY`; any active → `FAILED` / `CANCELLED`                                      | `src/features/tasks/status.ts`, `lifecycle.ts`            |
| **Task (buyer labels)**            | Draft / Sent / Waiting for a price / Quote ready — your decision / Ready to send / Closed / Cancelled                                                | `src/components/ui/StatusPill.ts:taskStatusLabel`         |
| **Quote**                          | `PENDING`, `RECEIVED`, `PROPOSED`, `SUPERSEDED`, `WITHDRAWN`, `EXPIRED`, `DECLINED`                                                                  | `src/features/quotes/status.ts`                           |
| **Quote (read-time)**              | `effectiveStatus` = stored status, or `EXPIRED` if a `RECEIVED` quote is past `expiresAt`                                                            | `src/features/quotes/expiry.ts`                           |
| **Route**                          | `DRAFT`, `PENDING_VERIFICATION`, `ACTIVE`, `PAUSED`, `ARCHIVED` (+ read-time "stale")                                                                | `src/features/routes/schema.ts`, `freshness.ts`           |
| **Route (buyer/merchant labels)**  | Draft / Awaiting operator check / Available to customers / Paused / Archived / Stale                                                                 | `StatusPill.ts:routeStatusLabel`, `DraftRoutePreview.tsx` |
| **Service payment (x402)**         | `NOT_REQUIRED`, `REQUESTED_402`, `AUTHORISED`, `SETTLED`, `FAILED`, `UNAVAILABLE`                                                                    | `src/features/payments/status.ts`                         |
| **Service payment (buyer labels)** | Not charged / Payment requested / Reconciling / Paid / Did not go through / Unavailable                                                              | `TaskPage.tsx:PAYMENT_LABEL`                              |
| **Order payment (MiniPay)**        | `CREATED`, `AWAITING_WALLET`, `SUBMITTED`, `CONFIRMING`, `CONFIRMED`, `FAILED`, `EXPIRED`, `CANCELLED`                                               | `src/features/payments/order/status.ts`                   |
| **Order payment (UI phase)**       | idle / creating / wallet / submitting / confirming / confirmed / cancelled / failed                                                                  | `src/features/payments/minipay/useOrderPayment.ts`        |
| **Commitment**                     | `PENDING_ATTESTATION`, `ATTESTED`, `ATTESTATION_FAILED`                                                                                              | `src/features/commitments/status.ts`                      |
| **Handover attestation**           | `PENDING_CODE`, `PENDING_SIGNATURE`, `ATTESTED`, `ATTESTATION_FAILED`                                                                                | `src/features/attestation/handover-status.ts`             |
| **Proofline evidence**             | `NOT_STARTED`, `MERCHANT_MARKED_READY`, `BUYER_CONFIRMED_PICKUP`                                                                                     | `src/features/proofline/status.ts`                        |
| **Agent run**                      | `RUNNING`, `AWAITING_APPROVAL`, `APPROVED`, `DECLINED`, `NO_VIABLE_OFFER`, `CLARIFICATION_NEEDED`, `FAILED`                                          | `src/features/agent/run/store.ts`                         |
| **Agent stages (buyer spine)**     | `understand`, `discover`, `check`, `quote`, `compare`, `decide`, `record` — each `pending`/`active`/`waiting`/`done`/`blocked`/`needs-you`/`skipped` | `src/features/agent/run/stages.ts`                        |
| **Conversation intent**            | `CONVERSATION`, `INFORMATIONAL`, `DISCOVERY`, `COMPARISON`, `QUOTE_REQUEST`, `TRANSACTION`, `FULFILLMENT`                                            | `src/features/intent/types.ts`                            |
| **Buyer work group**               | `ATTENTION`, `READY`, `WAITING`, `IN_PROGRESS`, `COMPLETED`                                                                                          | `src/features/tasks/work.ts`                              |
| **Notification level**             | `INFORMATIONAL`, `ACTION_REQUIRED`, `TIME_SENSITIVE`, `COMPLETED`                                                                                    | `src/features/notifications/attention.ts`                 |
| **Push permission**                | `unsupported`, `default`, `granted`, `denied`                                                                                                        | `src/features/pwa/usePushSetup.ts`                        |
| **Generic async UI**               | loading, empty, validation-error, network-error, success, unavailable (mandated by `NFR-UX-001`)                                                     | `src/components/ui/States.tsx`, `Callout.tsx`             |

---

# 9. User Journey Map

Full journeys in [`01-USER-JOURNEYS.md`](01-USER-JOURNEYS.md). The distinct
journeys the codebase represents:

- New buyer, conversational path (`/agent`)
- New buyer, form path (`/request`)
- Returning buyer via `BuyerWorkPanel` (persisted work, no notification)
- Returning buyer via a push notification / deep link (`?ref=push`)
- Returning buyer, PWA cold-launch (`start_url: /agent`)
- Buyer whose task "belongs to another device" (localStorage lost) — **dead end**
- Buyer decision: accept → handoff → confirm → feedback
- Buyer decision: decline (with optional reason)
- Buyer: pay the order via MiniPay
- Buyer: cancel an agreed order / report a failed handover
- Buyer: decide on a proposed price change
- Buyer: confirm pickup (Proofline)
- Buyer: give a merchant the handover code
- New business, quick-start (one screen)
- New business, full form (produces a draft only — operator must `curl`)
- Returning business via manage link (`/supplier/:slug?t=`)
- Business: send a quote / decline a request
- Business: revise a price (before vs after acceptance)
- Business: edit its published price
- Business: pause a route
- Business: mark an order ready + read the pickup code
- Business: sign a handover attestation
- Business without a manage link — read-only shell / `notFound()`
- Operator: sign in, verify + activate a route (6-check)
- Operator: pause a route
- Operator: respond to a request on a business's behalf
- Operator: view metrics / evidence / trace a task
- Agent (machine): read `/v1/:slug/capabilities`, `POST .../quote`
- Interrupted workflow: run store expires (30 min), or a server restart
- Failed workflow: supplier declines / withdraws / cannot fulfil / no viable offer
- Offline: `OfflineBanner` + SW `/offline` fallback + `503 OFFLINE` for `/api/*`

---

# 10. Complexity Abstraction Map

Full table in
[`02-COMPLEXITY-ABSTRACTION.md`](02-COMPLEXITY-ABSTRACTION.md). Headline:

**Abstracted well (system absorbs it):**

- Internal enum names → plain-language labels everywhere
  (`taskStatusLabel`, `routeStatusLabel`, `PROOFLINE_*_LABEL`, `eventLabel`,
  stage labels, `outcomeCopy`, `requestErrorCopy`, exception `describeTaskException`)
- Intent classification, provider discovery, quote comparison, scoring — all
  behind a 7-stage spine and a "who did what" narrative
- x402 failure taxonomy → 3 buyer-facing `Callout`s (Not charged / Reconciling /
  Unavailable) never the codes
- MiniPay wallet mechanics (ABI, chain switch, gas) → "network fee" language,
  no contract address on the default view (M10.5 §6, §47)
- EAS schema UID / `attestByDelegation` / `refUID` → "Confirm handover" +
  "recorded as part of the transaction history"
- Idempotency keys, session headers, envelope shape → the `apiRequest` helper

**Intentionally exposed (trust / money / consent — must stay visible):**

- The buyer sends the WhatsApp message themselves; the pre-filled text is shown
  in full (`HandoffCard`)
- The buyer decision is its own step with the price, business, terms and expiry
  on the surface (`ApprovalPanel`, `DecisionPanel`) — never behind a disclosure
- `SETTLED`/`CONFIRMED` only after real verification + a real tx hash; explorer
  link shown; "Intra never fabricates a payment"
- Freshness: "Prices confirmed 3 days ago", "stale — needs reconfirming"
- Merchant consent tick — explicit, unbundled (`CheckboxField`, both onboarding forms)
- Operator's 6-point checklist — every box a manual tick, server-enforced
- "Demo only — nothing here is saved" on the conversation; "not saved and
  dropped after 30 minutes" on the agent run
- Proofline disclaimer verbatim on every Proofline surface: "operational
  evidence, not a cryptographic proof, not a payment settlement, not a guarantee"
- "Public address only — Intra never stores or asks for a private key or seed
  phrase" wherever a `0x` value appears

**Leaked / half-abstracted (see [`09`](09-TASK-COMPLEXITY-AUDIT.md), [`20`](#20-current-ux-problemscontradictions)):**

- `/tasks/:id` `PaymentReceipt` still shows `attributionTag`, atomic amounts,
  network CAIP-2 ids, "via agent payment protocol"
- The engineering trace (tool names, timings, run id, model call counts) is
  present in the DOM behind 2 nested `<details>` — deliberate, but it is there
- `EvidencePanel` `TraceView` shows raw enum statuses (`PENDING_ATTESTATION`),
  schema UIDs, "MISMATCH" — operator-only, but unpolished
- Supplier `QuoteResponseForm` asks for `confidence` (low/med/high), `fixed`
  vs `range`, `expiresAt` as `datetime-local` — merchant-facing crypto-adjacent
  precision

---

# 11. Human Decision Points

Every point where the product **requires** a human to choose (see
[`02`](02-COMPLEXITY-ABSTRACTION.md) "USER-DECISION"):

| Actor    | Decision                                            | Surface                                 | Why it cannot be automated                                                      |
| -------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Buyer    | accept or decline a quote                           | `ApprovalPanel` / `DecisionPanel`       | `BR-001`, `FR-REC-004`; the model tool set excludes it (ADR-019)                |
| Buyer    | correct the agent's reading of the brief            | `UnderstandingCard` editor              | a wrong brief produces a wrong price                                            |
| Buyer    | actually send the WhatsApp message                  | `HandoffCard` (copy / `wa.me`)          | Intra never sends an order or contacts a supplier                               |
| Buyer    | approve the wallet transaction                      | wallet UI, triggered from `PayPanel`    | non-custodial; commercial approval and wallet approval are separate (M10.5 §34) |
| Buyer    | confirm they collected the order                    | `BuyerPickupPanel`                      | Proofline records only what its required actor confirms (`FR-PROOF-006`)        |
| Buyer    | decide on a proposed price change                   | `PriceChangePanel`                      | an accepted price cannot change underneath the buyer                            |
| Buyer    | cancel an agreed order / report a handover failure  | `OrderProblemPanel`                     | consequential; no refund is claimed                                             |
| Buyer    | say the handover code aloud                         | in person; `HandoverCodePanel` shows it | proves the buyer was physically present (ADR-018 commit-reveal)                 |
| Merchant | tick the quote-display consent box                  | both onboarding forms                   | consent is never inferred (`FR-SUP-005`)                                        |
| Merchant | send / revise / decline a quote                     | `QuoteResponseForm` / `ChangePriceForm` | the quote is the only commitment (`BR-003`)                                     |
| Merchant | mark an order ready for pickup                      | `MerchantFulfilmentPanel`               | only the merchant can attest event 1 (`FR-PROOF-003`)                           |
| Merchant | sign the handover attestation with their own wallet | `HandoverAttestPanel`                   | 2-of-2; the server is a non-signing referee (ADR-018)                           |
| Merchant | pause a route                                       | `PauseRouteButton`                      | fail-safe merchant control (`BR-006`)                                           |
| Operator | tick all 6 activation checks + activate             | `OperatorRouteCard`                     | cannot be defaulted or auto-approved (`AC-SUP-*`)                               |
| Operator | pause a route for stale/inaccurate data             | `OperatorConsole`                       | `BR-006`                                                                        |

---

# 12. AI / System Responsibilities

**Where AI (LLM) is involved** (ADR-019; `src/features/agent/`,
`src/features/intent/`):

- **Conversational intent layer** — reads plain language, decides
  CONVERSATION / INFORMATIONAL / DISCOVERY / COMPARISON / QUOTE_REQUEST /
  TRANSACTION / FULFILLMENT, extracts a `UserIntent`, produces a reply. NOTE:
  `classifyMessage` in `src/features/intent/classify.ts` is **deterministic
  pattern-matching**, not a model call — the "conversational" feel is
  rule-based (`src/features/intent/conversation.ts`, `routing.ts`).
- **Buyer-agent model layer** (`src/features/agent/model/`, `runtime/assisted.ts`)
  — the LLM (Claude Haiku 4.5, `@anthropic-ai/sdk`, **server-only**) sits
  ABOVE the deterministic orchestration: understand intent, plan which providers
  to quote, choose an offer + write the rationale, replan when nothing is usable.
  Bounded: ≤ 4 calls/run, ≤ 700 output tokens, 12 s timeout. **The model never
  holds a tool** and never touches the database — it proposes Zod-validated JSON;
  `runBuyerAgent` executes and vetoes. On any model failure the run silently
  continues on the deterministic path. With **no `ANTHROPIC_API_KEY` the
  assisted loop is byte-for-byte the deterministic loop.**
- The UI signals model involvement with a small "agent's reasoning" ✨ label on
  the recommendation (`RecommendationPanel.tsx:54`) and
  `modelReasoned`/`model.configured` in the engineering trace.

**Where the system is deterministic:**

- Every mutating operation, every lifecycle transition, budget cap ($0.05/task,
  server-enforced), quote-expiry checks, eligibility, the human-approval gate,
  `offerFingerprint` binding, all money math, all date parsing (the model
  returns a deadline _phrase_, the parser turns it into a date).
- Provider discovery, capability reads, quote requests, scoring, ranking.
- Notification specs (`specsForEvent` is a `switch`), attention levels,
  Proofline, attestation orchestration, evidence aggregation.

---

# 13. Notifications and Async Work

Full detail in [`08-MOBILE-PWA-AUDIT.md`](08-MOBILE-PWA-AUDIT.md) §"Async" and
[`05`](05-INTERACTION-STATE-MODEL.md) "notifications". Summary
(`src/features/notifications/`, `src/features/pwa/`, `public/sw.js`; ADR-020):

- **`notify(db, { event, taskId, quoteId? })`** is called from service functions
  after a domain change. `specsForEvent` maps the event → zero or more
  `NotificationSpec`s (audience, level, plain title/body, deeplink, dedupeKey).
  Rows are **current attention items**, not a log — a repeat event about the same
  thing updates the row and re-surfaces it unread.
- **In-app**: `ActionCentre` (`GET /api/notifications`) splits into "Needs your
  attention" (`ACTION_REQUIRED` / `TIME_SENSITIVE`) and "Updates". Opening a row
  marks it read (optimistically) and follows its deeplink. Reading ≠ acting
  (§18).
- **Web push**: `web-push` + self-generated VAPID (separate per environment).
  With any of `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` unset,
  push is `UNAVAILABLE` and the app falls back to in-app only. Payloads carry
  only `{ title, body, url, tag }` — no id, amount, address, code, or secret.
  Fire-and-forget from `notify()` — a failed push can never fail the domain
  action. `INFORMATIONAL`/`COMPLETED` only push if the person opted in.
- **Contextual prompts**: `PushPrompt` and `InstallPrompt` never fire on first
  load — only once a person has real async work (`hasAsyncWork` in
  `BuyerWorkPanel`, or `incoming/quoted > 0` on the supplier workspace).
  Dismissal is remembered in `localStorage`; a denied browser is never re-asked.
- **Service worker** (`public/sw.js`): `/api/*` is network-only, never cached
  (offline → a clean `503 OFFLINE` JSON). `/_next/static` + `/icons` cache-first.
  Navigations network-first → cached `/offline`. A new worker installs and
  **waits** — activates only on the user's "Update now" tap (`ServiceWorker.tsx`).
- **Deep links**: a push click opens/focuses a window at the deeplink with
  `?ref=push` appended; `ResumeSignal` records "workflow resumed from a push".
- **Background agent work**: `after()` keeps the serverless function alive past
  the HTTP response so `executeRun` finishes (Phase D fix,
  `src/features/agent/run/service.ts:186`). The client polls `GET /api/agent/run/:id`
  every 1.5 s, reconnecting quietly on transient failures.

---

# 14. Payment and Settlement

Full audit in [`07-TRUST-MONEY-BLOCKCHAIN-UX.md`](07-TRUST-MONEY-BLOCKCHAIN-UX.md).
There are **two distinct money flows**:

## (a) x402 agent query fee — `service_payments` (ADR-004/011/017)

The buyer's _agent_ paying a _small fee_ (cap $0.05/task, default $0.02) to a
paid service for current information. **Distinct from the order price** (`BR-004`).
Currently **always `UNAVAILABLE`** on the buyer web flow: `submitTask` records an
`UNAVAILABLE` `service_payments` row (`src/features/tasks/service.ts:193`). The
`/v1` quote endpoint runs the real x402 flow (402 → verify → settle) only when
`X402_API_KEY` is set — otherwise `503 PAYMENT_SERVICE_UNAVAILABLE`. `SETTLED`
requires a real facilitator verification + a real mainnet tx hash. `TaskPage`
`PaymentReceipt` renders `NOT_REQUIRED` / `UNAVAILABLE` / `AUTHORISED`
("Reconciling") / `SETTLED` / `FAILED` with explicit "Intra never fabricates a
payment" copy.

## (b) MiniPay order payment — `order_payments` (M10.5, ADR-023)

The _buyer_ paying the _business_ for the order, on-chain, **non-custodially** —
Intra never touches the funds. Only available when `task.status === "HANDOFF_READY"`
(commercial terms already approved) and `NETWORK_ENV=production`. Flow
(`PayPanel` + `useOrderPayment` + `wallet-adapter` + `order/controller` +
`order/verify`):

1. `POST /api/tasks/:id/order-payment` — server mints an intent from the accepted
   `commitments` row: `recipientAddress`, USDC `amountAtomic`, and a **locked
   NGN→USD reference rate** (`NGN_USD_RATE_URL`, default keyless
   `open.er-api.com`) frozen with its source + timestamp. Rate source down →
   `503`, never a guessed rate.
2. `wallet-adapter.payOrder` — the buyer's wallet (MiniPay or injected)
   builds an ERC-20 `transfer` via `viem`, checks/switches to Celo, and returns
   a **tx hash — the only value the client submits**.
3. `POST .../submit { txHash }` — status → `CONFIRMING`; server-side verification
   is scheduled.
4. `verifyOrderPayment` reads the real Celo receipt: chain, success, USDC `to`,
   and a single `Transfer` to the intent's recipient for the exact amount must
   all match → `CONFIRMED`. Replay blocked by a `UNIQUE` `tx_hash`,
   `TX_ALREADY_USED`, and recipient+amount binding.
5. `PayPanel` polls `GET .../order-payment` every 2.5 s; after ~100 s it says
   "Still checking with the network. You can close this and come back."
6. A terms change (`quotes/revision.ts`, `exception-service.ts`) calls
   `invalidateOrderPaymentsForTask` — the intent expires and a fresh approval is
   required (M10.5 §11).

**The MiniPay path is additive.** The WhatsApp handoff sits right beside it and
always works; nothing gates on payment.

---

# 15. Handover and Evidence

Full audit in [`07`](07-TRUST-MONEY-BLOCKCHAIN-UX.md) §"Evidence". Three
independent, layered mechanisms — none of them a rating, a score, or a proof of
work quality:

## (a) Proofline pilot — `proofline_events` (ADR-016, `FR-PROOF-*`)

Exactly two optional events, both gated on `task.handoffConfirmedAt`:

1. **`READY_FOR_PICKUP`** — the merchant (manage token). Issues a 6-char pickup
   code returned **once to the merchant, never on any buyer surface**
   (`MerchantFulfilmentPanel`, `src/features/proofline/view.ts:47`).
2. **`PICKUP_CONFIRMED`** — the buyer, from their own task session OR by entering
   the pickup code (`BuyerPickupPanel`).

Both UIs and every API response carry `PROOFLINE_DISCLAIMER` verbatim:
"operational evidence, not a cryptographic proof, not a payment settlement, not a
guarantee." Replay-safe (a second event → `409`).

## (b) Commitment attestation — `commitments` (ADR-018, milestone 2)

Created **at the moment of human approval** (`createCommitmentForApproval` inside
`decideOnQuote`). Local + transactional so an approved decision can never be lost.
Publishes `handoverCommit = keccak256(code ‖ salt)`; the **buyer alone** gets
`code` (`HandoverCodePanel`), the server withholds `salt`. Attested by **Intra's
own signer** to EAS (or a labelled mock in staging) as a separate, retryable step
(`POST /api/tasks/:id/commitment`).

## (c) Handover attestation — `handover_attestations` (ADR-018, milestone 9)

The genuine second signature. The merchant presents the buyer's `code`
(`sign-request` → EIP-712 typed data with a nonce + a real EAS `deadline`), signs
it with **their own wallet** (`eth_signTypedData_v4`), and Intra relays it via
EAS `attestByDelegation` (`submit`). 2-of-2, server as non-signing referee.
`HandoverAttestPanel` keeps the wording plain ("Confirm that this job was handed
over" / "recorded as part of the transaction history"); the schema UID / tx hash
appear only in the operator `EvidencePanel` `TraceView`.

The attestation proves only that the named parties completed the handover
protocol at a time — **not** quantity, quality, timeliness, or satisfaction
(ADR-018 "Honesty bound").

## Evidence surfaces

- **`/evidence`** (`EvidenceView`) — public, privacy-minimised: three zones
  (Real results / Demo data / Unavailable & external integrations) + "What
  changed from feedback" + CSV/JSON export. Every number is a `COUNT` from
  existing tables — no analytics store, no session ids, no task content, no
  addresses. Demo data (a single `[DEMO SEED]` business) is always excluded from
  real numbers (`src/features/metrics/classification.ts`).
- **`/operator` → Metrics** — the same report plus a content-free 25-event feed.
- **`/operator` → Evidence** — enter a task id, get the full cross-referenced
  trace (DB state, on-chain refs, a consistency cross-check). Not a buyer/business
  surface.

---

# 16. Error and Recovery Model

Full detail in [`05`](05-INTERACTION-STATE-MODEL.md) and
[`08`](08-MOBILE-PWA-AUDIT.md). Every async surface has explicit loading, empty,
validation-error, network-error, and success states (`NFR-UX-001`,
`src/components/ui/States.tsx`). Patterns:

| Situation                                                      | How the UI responds                                                                                                                                    | Source                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Network unreachable                                            | `ApiError(0, "NETWORK", …)`; `OfflineBanner` shows when `navigator.onLine` is false; SW returns `503 OFFLINE` JSON                                     | `src/lib/api.ts:51`, `OfflineBanner.tsx`, `sw.js:75`   |
| Task belongs to another device                                 | `ErrorState` "This request belongs to another device" + "Start a new request" link — **no recovery path** (localStorage is the only identity)          | `TaskPage.tsx:252`; known gap `UX_ARCHITECTURE.md` F8  |
| Task not found                                                 | `ErrorState` "Request not found"                                                                                                                       | `TaskPage.tsx:266`                                     |
| Agent run expired (30 min) / server restart                    | `requestErrorCopy("RUN_NOT_FOUND")` "This run has expired… Your request text is still here" + offer to restart                                         | `src/features/agent/run/copy.ts:628`                   |
| Agent run taking too long (> 120 polls)                        | "This is taking longer than expected… Reload the page to pick the run back up"                                                                         | `AgentConsole.tsx:157`                                 |
| Agent poll transient failure                                   | silent quiet retry (`MAX_RECONNECTS = 5`) with a "Reconnecting…" chip; only surfaces after repeated misses                                             | `AgentConsole.tsx:165`                                 |
| Run ended without a usable quote                               | `OutcomePanel` `Unsuccessful` with `outcomeCopy` (NO_PROVIDERS / NO_QUOTES_RETURNED / OUT_OF_SCOPE …) + "Nothing was ordered and no money moved"       | `src/features/agent/run/copy.ts`, `OutcomePanel.tsx`   |
| Supplier declines / withdraws / cannot fulfil                  | task → `FAILED`; `TaskPage` renders a semantic `Callout` from `describeTaskException` (headline / what happened / what to do / what next / money note) | `src/features/tasks/exceptions.ts`, `TaskPage.tsx:317` |
| Quote expired at decision time                                 | accepting is still allowed; a warning `Callout`, and the WhatsApp message gains a "reconfirm the price" line                                           | `DecisionPanel`, `buildOrderMessage`                   |
| Approval stale (`offerFingerprint` mismatch)                   | `requestErrorCopy("APPROVAL_STALE")` "The quote changed… Review the current one"                                                                       | `copy.ts:648`                                          |
| Wallet rejected                                                | `useOrderPayment` catches `USER_REJECTED` → cancels the intent → "Payment cancelled. Nothing was confirmed."                                           | `useOrderPayment.ts:179`                               |
| Wallet wrong chain                                             | `wallet-adapter` attempts `wallet_switchEthereumChain`; on failure "Switch your wallet to the Celo network"                                            | `wallet-adapter.ts:72`                                 |
| Order-payment verify hiccup (server unreachable after tx sent) | "The tx is real and on-chain — this is a reporting hiccup… reopen the order and it will pick up"                                                       | `useOrderPayment.ts:228`                               |
| x402 unavailable / failed / indeterminate                      | 3 distinct `Callout`s; never a receipt; explorer link only on real `SETTLED`                                                                           | `TaskPage.tsx:PaymentReceipt`                          |
| Form validation                                                | inline field errors via `zodResolver` + `mode: "onBlur"`, or server `INVALID_BODY` `fieldErrors` flattened onto fields (`QuickStartForm`)              | RHF forms; `QuickStartForm.tsx:92`                     |
| Route paused between task creation and submit                  | `submitTask` moves the task to `FAILED` and returns `409 ROUTE_UNAVAILABLE`; `RequestForm` says "That printer just went offline. Pick another."        | `tasks/service.ts:157`, `RequestForm.tsx:101`          |
| Any unhandled render error                                     | `app/error.tsx` "Something went wrong on our side. Nothing you did caused it, and no request was sent to a printer."                                   | `src/app/error.tsx`                                    |

---

# 17. Responsive / Mobile / PWA Behavior

Full audit in [`08-MOBILE-PWA-AUDIT.md`](08-MOBILE-PWA-AUDIT.md). Summary:

- **Mobile-first is a hard requirement** — must work at a **360px viewport**
  (`NFR-UX-001`, `CLAUDE.md` §5). Verified in tests and via component patterns:
  Tailwind `sm:` (640px) is the only breakpoint used; base styles are the mobile
  layout, `sm:` adds columns/rows.
- **Layout**: `MainContainer` is `max-w-[var(--container-max)]` (72rem) with
  `px-4 sm:px-6` gutters. Cards, `DataList`, forms stack vertically on mobile
  (`flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-2`).
- **Touch targets**: `Button` sizes are `min-h-9` (36px) / `min-h-11` (44px);
  most tappable rows/links use `min-h-9` or larger.
- **`Header`**: sticky, `flex-wrap`, reduced public nav (Home → `/agent`, For
  businesses → `/supplier/onboard`, Docs). The "Join as a business" CTA is
  `hidden … sm:inline-flex`. Operator/Activity/Evidence are deliberately **not**
  in the marketing chrome (ADR-022).
- **PWA**: installable (`manifest.ts`, `start_url: /agent`, `display: standalone`,
  4 committed icons). `InstallPrompt` handles `beforeinstallprompt` and gives
  iOS Safari a Share-sheet hint. `detectPlatform()` → `installed_pwa` vs `web`.
- **Service worker**: see §13. No forced refresh mid-transaction.
- **Return-from-notification**: SW `notificationclick` focuses/opens a window at
  the deeplink + `?ref=push`; falls back to `postMessage({type:"NAVIGATE"})` →
  `router.push` (`ServiceWorker.tsx:45`).
- **Interruptions the user can experience**: run store TTL (30 min) or server
  restart drops orchestration metadata (the task/quote/decision survive in the
  DB); a shared campus phone / private window / cache clear / phone→laptop switch
  makes a buyer's task permanently unreachable (localStorage identity, no resume
  key — `UX_ARCHITECTURE.md` F8).
- **Reduced motion**: `.page-enter` and `.interactive-card` animations, the
  `Button` active-scale, `Loader2` spins, and `Skeleton` pulse are all guarded by
  `@media (prefers-reduced-motion: reduce)` / `motion-reduce:` (`globals.css:112`).
- **No dark mode** — light-first, committed (ADR-009 kept by ADR-022).

---

# 18. Existing UX Patterns

Catalogued in [`03`](03-COMPONENT-INVENTORY.md) and
[`06-COPY-INFORMATION-ARCHITECTURE.md`](06-COPY-INFORMATION-ARCHITECTURE.md).
The house patterns a redesign should recognise:

- **The `Callout` is the workhorse trust device.** 4 tones: `info` (blue),
  `warning` (amber), `success` (green), `unavailable` (grey). The `unavailable`
  tone is used specifically for honesty statements ("Intra does not send this
  message…", "no receipt exists", the Proofline disclaimer).
- **`StatusPill`** — always a coloured dot + an uppercase label, never colour
  alone (`NFR-A11Y-001`). Route + task statuses have dedicated `*Label` / `*Tone`
  helpers so the enum never reaches a screen.
- **`DataList` / `DataRow`** — the standard "record detail" layout (label left,
  value right, optional `hint` below). Used for briefs, quotes, business details,
  payment receipts, the approval card.
- **Progressive disclosure via native `<details>`** — 8 components use it for
  "more detail", "engineering trace", "ruled-out printers", "raw route payload",
  "transaction details", "add more detail (optional)".
- **The semantic progress spine** (`StageList`) — every async state carries a
  word AND an icon; there is no bare spinner in the agent flow.
- **"Who did what" narrative** (`ActivityFeed`) — actor-attributed lines
  (You / Agent / Printer / Intra), never a tool name.
- **One read model per surface** — `getTaskView`, `getSupplierWorkspace`,
  `toAgentRunView`, `listBuyerWork` each return exactly the shape their page
  renders; pages don't assemble state from multiple client fetches (except the
  agent poll loop).
- **Optimistic UI for low-stakes actions only** — marking a notification read is
  optimistic; a decision / payment / quote is never optimistic.
- **The eyebrow + serif heading** (`SectionHeader`, `.eyebrow`) — an uppercase
  kicker over a light serif `<h1>` on every internal page.
- **Explicit "this is a demo / not saved" labels** on the conversation and the
  agent run.
- **Buttons name their consequence** — "Approve NGN 4,500 with Campus Print",
  "Confirm — don't proceed", "Send quote to buyer", not "Continue"/"Submit".

---

# 19. Frontend Technical Dependencies

Full list in
[`10-REDESIGN-INPUT-PACK.md`](10-REDESIGN-INPUT-PACK.md) §"Technical Constraints".
Key (`package.json`):

| Dependency                                    | Version           | Used for                                                                                       | Redesign constraint                                                            |
| --------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `next`                                        | 15.5 (App Router) | routing, RSC, `after()`, route handlers                                                        | keep App Router; server components on the 3 supplier pages + `/evidence`       |
| `react` / `react-dom`                         | 19.0              | —                                                                                              | —                                                                              |
| `tailwindcss`                                 | 3.4               | styling; maps `src/styles/tokens.css` CSS variables                                            | tokens are **load-bearing** (`CLAUDE.md` §6.1); ADR-022 is the current palette |
| `lucide-react`                                | 1.37              | every icon in the app                                                                          | —                                                                              |
| `clsx` + `tailwind-merge`                     | —                 | `cn()` helper (`src/lib/utils.ts`)                                                             | —                                                                              |
| `zod`                                         | 4.5               | every request/input schema, shared client/server                                               | schemas are the contract; the model must produce Zod-valid JSON (ADR-019)      |
| `react-hook-form` + `@hookform/resolvers`     | 7.86 / 5.9        | `RequestForm`, `OnboardingForm` (the other forms use raw `FormData` or `useState`)             | —                                                                              |
| `viem`                                        | 2.56              | MiniPay ERC-20 transfer, EAS calls, `keccak256` — **client-lazy-imported** in `wallet-adapter` | only chain library admitted (ADR-018/023); no ethers, no wagmi                 |
| `@x402/core`                                  | 2.24              | the payment adapter interface only                                                             | not `@x402/evm`/`viem` in the adapter (`CLAUDE.md` §6.2)                       |
| `@anthropic-ai/sdk`                           | 0.123             | buyer-agent model layer — **server-only**                                                      | never `NEXT_PUBLIC_`, never a browser import (ADR-019)                         |
| `web-push` + `@types/web-push`                | 3.6               | server-side push delivery                                                                      | VAPID env, degrades to in-app only                                             |
| `@amplitude/analytics-browser`                | 2.45              | product analytics, client-side                                                                 | ESLint bans `@amplitude/*` outside `src/features/analytics/` (ADR-021)         |
| `drizzle-orm` + `@electric-sql/pglite` + `pg` | 0.45 / 0.5 / 8.23 | persistence                                                                                    | fixed stack (ADR-006); no ORM swap without an ADR                              |

No component library (no shadcn, no Radix, no Headless UI). All 9 UI primitives
are hand-rolled in `src/components/ui/`. No CSS-in-JS. No web-font fetch (system
stacks only, ADR-009/022).

Environment flags that change what the UI shows (all optional, all degrade to a
safe state — see `.env.example`):

| Env                                                               | Effect when unset                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `OPERATOR_API_KEYS`                                               | no request can act as an operator; `/operator` cannot load                                            |
| `X402_API_KEY`                                                    | `/v1` paid routes → `503`; buyer flow shows `UNAVAILABLE`                                             |
| `ANTHROPIC_API_KEY` (+ `AGENT_MODEL_PROVIDER`, `AGENT_MODEL`)     | agent runs fully deterministically                                                                    |
| `VAPID_*` (3)                                                     | web push `UNAVAILABLE`, in-app notifications only                                                     |
| `NETWORK_ENV` (`staging`/`production`) + `ATTESTATION_SIGNER_KEY` | attestations are a labelled local "mock"; **MiniPay order payment path is only live in `production`** |
| `NGN_USD_RATE_URL`                                                | defaults to keyless `open.er-api.com`; source down → MiniPay path shows "unavailable"                 |
| `NEXT_PUBLIC_AMPLITUDE_API_KEY` / `AMPLITUDE_API_KEY`             | analytics is a silent no-op                                                                           |
| `DATABASE_URL`                                                    | embedded PGlite in `./.pglite` (local dev)                                                            |

---

# 20. Current UX Problems / Contradictions

Only problems supported by evidence in the repository. Expanded in
[`09-TASK-COMPLEXITY-AUDIT.md`](09-TASK-COMPLEXITY-AUDIT.md) and
[`10`](10-REDESIGN-INPUT-PACK.md) §16.

1. **Buyer identity is device-bound with no recovery.** `getSessionId()` reads
   `localStorage` only; `TaskPage` renders "This request belongs to another
   device" with no resume link. A shared campus phone, private window, cache
   clear, or phone→laptop switch makes the task — including the WhatsApp message
   about to be sent — permanently unreachable. (`src/lib/session.ts`,
   `TaskPage.tsx:252`; `UX_ARCHITECTURE.md` F8.)
2. **Two parallel buyer entry points with different capabilities — and one is
   orphaned.** `/agent` (conversational, LLM-assisted, in-memory run,
   multi-provider comparison, agent-created task) and `/request` (form,
   single-route pick, DB task immediately). They produce tasks that look
   different (`buyerClaimSession` set vs not) and the `/request` path cannot
   compare providers. **`/request` is not linked from anywhere in the app** — a
   `grep` for `/request` across `src` finds only `/supplier/:slug/requests`
   (a different route); the landing CTAs both point at `/agent`. `/request` +
   `RequestForm` are reachable only by typing the URL. (`src/lib/site.ts`,
   `Header.tsx:26`, `src/app/page.tsx`, `grep '/request' src`.)
3. **The full onboarding form is a dead end for self-serve.** `OnboardingForm`
   `onSubmit` calls `setDraft(...)` and nothing else — no POST. `DraftRoutePreview`
   tells the merchant to "Send these answers to your Intra operator" and shows
   raw route JSON. The operator console has no create UI, so the operator needs
   `curl`. `/supplier/onboard` (quick-start) _does_ persist, but the full form is
   still linked from it ("Working with an Intra operator? Use the detailed
   form"). (`OnboardingForm.tsx:106`, `DraftRoutePreview.tsx:152`;
   `UX_ARCHITECTURE.md` F1–F4.)
4. **Stale theme colour in three places.** `layout.tsx` `viewport.themeColor`,
   `manifest.ts` `theme_color`, and `opengraph-image.tsx` all still use the
   ADR-009 forest green `#0f3e17`; ADR-022 moved the action colour to ink
   `#1f1e1d`. `global-error.tsx` also hard-codes the old green button.
5. **`/tasks/:id` still leaks payment implementation.** `PaymentReceipt` shows
   `attributionTag` (a raw `celo_…` string), atomic amounts divided by `1e6`
   inline, CAIP-2 network ids via `networkLabel`, and "via agent payment
   protocol". This is the x402 fee card — mostly `UNAVAILABLE` today — but the
   detail is crypto-facing. (`TaskPage.tsx:680`.)
6. **The agent console has two input boxes in some states.** `AgentConsole` shows
   its own `IntentInput` when `!embedded && (!run || (!busy && !awaitingDecision))`,
   but when embedded in `ConversationView` the thread input is the only one. A
   user who lands on `/agent` and starts via the console, then the run settles,
   sees "Ask for something else" _and_ the conversation input. (`AgentConsole.tsx:261`.)
7. **Supplier quote form exposes precision a phone user in a shop won't want.**
   `QuoteResponseForm` asks for `fixed` vs `range`, `confidence` (low/med/high),
   and `expiresAt` as a `datetime-local` input — the `AGENTIC_ARCHITECTURE.md`
   §5.3 analysis flags this as the highest-frequency friction point.
8. **Two different "handover code" concepts on adjacent screens.** The buyer's
   `HandoverCodePanel` code (buyer→merchant, attestation-grade, ADR-018) and the
   merchant's Proofline `pickupCode` (merchant→buyer, ADR-016) both render as a
   large mono code in a bordered box, on related surfaces, with similar copy.
   A user could confuse them. (`HandoverCodePanel.tsx`, `MerchantFulfilmentPanel.tsx:90`.)
9. **`/operator` `EvidencePanel` `TraceView` shows raw enums and "MISMATCH".**
   Operator-only, but `PENDING_ATTESTATION`, `attestationMode: "mock"`, schema
   UIDs, and a bare "MISMATCH" string are unpolished for a judge-facing surface.
10. **`primaryNav` in `site.ts` lists 7 entries but the `Header` renders 3.**
    The other 4 (`/`, `/activity`, `/operator`, `/evidence`) are reachable only
    by direct URL, a footer-less design, or an in-page link. `/activity` in
    particular is only linked from the `/agent` "Activity" pill and the
    `/activity` back-link. (`src/lib/site.ts:15`, `Header.tsx:26`.)
11. **Internal pages inherit the new palette but not the new spacing.** ADR-022
    explicitly notes `TaskPage`, the supplier workspace, operator, activity,
    evidence, and docs "keep their old spacing/heading rhythm until re-touched" —
    so `/` and `/agent` feel like one product and `/tasks/:id` feels like an
    older one.
12. **`RequestForm` "No printers are live yet"** is the likely first-run state
    for any visitor (no verified route active), and there is no seeded demo path
    that shows a working loop to an evaluator. (`RequestForm.tsx:113`;
    `UX_ARCHITECTURE.md` F9.)

---

# 21. Missing or Weak UX Surfaces

Things the product model implies but the frontend does not (fully) provide.
None are "bugs" — they are gaps. Cross-referenced in
[`10`](10-REDESIGN-INPUT-PACK.md) §21.

- **A buyer resume link / cross-device recovery.** No task-scoped key, no "email
  me this link", no QR. The `TaskPage` "another device" state has no action but
  "start a new request".
- **A merchant self-serve create path from the full form.** Quick-start covers
  it for the common case, but the detailed Capability Card the full form collects
  (`serviceSummary`, `serviceArea`, `operatingHours`, `turnaround`) has no UI
  path into the database (`UX_ARCHITECTURE.md` F2).
- **A manage-link re-issue path.** If a business loses its `?t=` link there is no
  "resend my link" — the operator queue read model strips the token
  (`toPublicBusiness`), so an operator can't surface it either
  (`UX_ARCHITECTURE.md` F4).
- **A supplier notification that a request arrived, outside an open tab.** Push
  exists for the business audience, but it depends on the merchant having opened
  their manage link on a device and enabled push. The `responseSlaMinutes`
  countdown is shown to the buyer as a promise and to the merchant as a deadline,
  against a page nobody has a reason to poll (`UX_ARCHITECTURE.md` F5 — partially
  addressed by M7 push, still fragile).
- **Multi-provider fan-out in the `/request` path.** `tasks.routeId` is a single
  FK; only the `/agent` run compares providers. The recommendation on `/tasks/:id`
  therefore always evaluates one quote (`UX_ARCHITECTURE.md` F7).
- **A capability discovery index for agents.** `/v1/:slug/capabilities` requires
  knowing the slug; no `.well-known`, no listing endpoint (`UX_ARCHITECTURE.md`
  F6; explicitly `NEEDS-ID`).
- **An operator "create business" UI.** The console only lists / activates /
  pauses (`OperatorConsole.tsx`).
- **A shared "what happens next" sentence across surfaces.** Buyer page, supplier
  workspace, and operator queue each infer the next action independently from
  status enums; there is no `nextAction()` helper (`UX_ARCHITECTURE.md` §3.5).
- **Agent-run persistence.** A refresh mid-run relies on the client re-polling a
  runId it still holds in React state; there is no server-side "your runs" list.
  A closed tab loses the run entirely (though the task survives if a quote was
  requested).
- **A visible price-comparison view on `/tasks/:id`.** The `RecommendationCard`
  shows one quote's normalisation; the agent-run `RecommendationPanel` shows
  `Alternatives` and `RuledOut`, but that view is not reachable from `/tasks/:id`.
- **A businesses/services directory for buyers.** Deliberately out of scope
  (`PRODUCT_VISION.md` §2), so `RequestForm` picks from `GET /api/routes/active`
  filtered to one `routeSlug` — a radio list, not a browse experience.
- **Feedback visibility.** `feedback` is write-only from the buyer's side; the
  merchant sees no customer feedback, only aggregate counts on `/evidence`.

---

# 22. Evidence / Source Files

Primary code paths this X-ray was reconstructed from:

**Config & shell**: `package.json`, `next.config.ts`, `tailwind.config.ts`,
`src/styles/tokens.css`, `src/styles/globals.css`, `src/app/layout.tsx`,
`src/lib/site.ts`, `.env.example`.

**Routing**: every `src/app/**/page.tsx`, `src/app/error.tsx`,
`src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/offline/page.tsx`,
`src/app/manifest.ts`, `src/app/opengraph-image.tsx`.

**API**: every `src/app/api/**/route.ts` (41 files), `src/app/v1/**/route.ts`,
`src/lib/http/{handler,request,response,operator,idempotency}.ts`,
`src/lib/api.ts`, `src/lib/session.ts`.

**Schema & lifecycle**: `src/lib/db/schema.ts`, `drizzle/*.sql`,
`src/features/tasks/{status,lifecycle,service,work,exceptions,exception-service}.ts`,
`src/features/quotes/{status,service,revision,expiry,order-message}.ts`,
`src/features/routes/{schema,freshness,activation,reads,service,templates,flyer-printing}.ts`,
`src/features/businesses/{schema,quick-start,service,draft}.ts`,
`src/features/payments/{status,service}.ts`,
`src/features/payments/order/{status,service,controller,intent,verify}.ts`,
`src/features/commitments/{status,service}.ts`,
`src/features/attestation/{handover-status,handover-service,schema}.ts`,
`src/features/proofline/{status,view,labels,service}.ts`,
`src/features/notifications/{attention,catalogue,access,service}.ts`.

**Components**: every file under `src/components/`, `src/features/*/*.tsx`,
`src/features/agent/console/*`, `src/features/agent/run/{stages,view,copy,activity,service,store}.ts`,
`src/features/intent/{types,conversation,routing,domain}.ts`,
`src/features/pwa/*`, `src/features/analytics/{events,AnalyticsProvider,useAnalytics}.ts`,
`src/features/metrics/EvidenceView.tsx`, `public/sw.js`.

**Docs cross-referenced**: `CLAUDE.md`, `README.md`, `docs/PRD.md`,
`docs/PRODUCT_VISION.md`, `docs/TECHNICAL_SPEC.md`, `docs/API.md`,
`docs/DECISIONS.md` (ADR-001 … ADR-023), `docs/UX_ARCHITECTURE.md`,
`docs/AGENTIC_ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`,
`docs/BUSINESS_ONBOARDING.md`, `docs/PAYMENTS.md`, `docs/ANALYTICS.md`.

---

## Verified

Directly confirmed by reading the cited code:

- 13 App Router pages + 6 special files; 41 internal API `route.ts` files + 2
  `/v1` handlers (`capabilities`, `quote`). Route table in §5.
- The task lifecycle graph `DRAFT → SUBMITTED → AWAITING_QUOTE → RECOMMENDED →
HANDOFF_READY` (+ `FAILED`/`CANCELLED`), enforced by `assertTaskTransition`.
- The buyer decision is a separate, separately-timestamped step (ADR-015):
  `submitQuote` stops at `RECOMMENDED`; only `decideOnQuote` /
  `approveAgentRun` moves to `HANDOFF_READY`.
- `recordBuyerDecision` (ACCEPT) is not in `MODEL_TOOLS`; the LLM cannot accept,
  pay, or commit (ADR-019, `src/features/agent/`).
- With no `ANTHROPIC_API_KEY` the assisted run == the deterministic run
  (`run/service.ts:104`).
- x402 buyer-flow payment is recorded `UNAVAILABLE` at submit time
  (`tasks/service.ts:193`); the `/v1` quote endpoint returns
  `503 PAYMENT_SERVICE_UNAVAILABLE` without a key.
- MiniPay order payment: `order_payments` table, `HANDOFF_READY`-gated, frozen
  recipient/amount/rate, server-verified receipt, `NETWORK_ENV=production`-gated
  (ADR-023, migration `0011`).
- Proofline: exactly 2 events, both gated on `handoffConfirmedAt`, pickup code
  merchant-only (`view.ts:47`), disclaimer verbatim on every surface.
- Handover attestation: merchant signs with their own wallet
  (`eth_signTypedData_v4`), Intra relays via `attestByDelegation`
  (`HandoverAttestPanel.tsx`, `handover/submit/route.ts`).
- 37 `"use client"` files; 3 supplier pages + `/evidence` are RSC.
- Design tokens in `src/styles/tokens.css` are the ADR-022 warm-editorial
  palette; `layout.tsx`/`manifest.ts`/`opengraph-image.tsx` still carry the
  old green.
- No component library; 9 hand-rolled UI primitives.
- All writes require `Idempotency-Key`; buyer = `x-session-id`, supplier =
  `x-manage-token` / `?t=`, operator = `x-operator-key`.
- `manageToken` for `/supplier/:slug/requests` and `/review` fails **closed**
  (`notFound()`); `/supplier/:slug` degrades to a read-only shell.

## Ambiguous

Unclear from the implementation alone:

- **Which buyer entry point is canonical.** Both `/agent` and `/request` exist
  and are wired; the landing page CTA "I need something made" → `/agent`, the
  `/request` page has its own hero. The PWA `start_url` and nav "Home" both point
  at `/agent`, suggesting `/agent` is primary, but `/request` is not deprecated
  in code.
- **Whether the conversation layer is meant to feel like AI.** `classifyMessage`
  is deterministic regex/keyword matching; the _run_ it can start is LLM-assisted.
  The copy ("I'll find a business…", "I never send an order") reads as an
  assistant, but the intent reading itself is rules.
- **The intended relationship between the agent-run `RecommendationPanel` view
  and the `/tasks/:id` `RecommendationCard` view.** They render different shapes
  of the same underlying quote; a run's `taskId` links to `/tasks/:id`, but the
  alternatives/ruled-out are lost in that hop.
- **Whether `/supplier/onboard/full` is still supported or vestigial.** It is
  linked, rendered, and tested, but persists nothing.
- **How a real merchant is expected to receive their `?t=` link in production.**
  `quickStartBusiness` returns a `manageUrl`; `QuickStartForm` shows it once with
  "Keep this link". There is no email/SMS delivery in code.
- **Whether `themeColor` mismatch is intentional** (e.g. brand green retained for
  the OS chrome) or an oversight from ADR-022.

## Missing

The product appears to need these but they are not implemented (see §21):

- Cross-device buyer task recovery (resume key / link).
- A self-serve persistence path for the full Capability Card onboarding.
- Manage-link re-issue.
- An operator "create business/route" UI (currently `curl`).
- A shared "what happens next" sentence across buyer / supplier / operator views.
- Server-side agent-run listing / persistence beyond 30 minutes.
- A price-comparison view on the buyer's task page.
- A seeded, clearly-labelled demo path for evaluators.
- Merchant visibility of customer feedback.
- A capability discovery index for agents (`NEEDS-ID`).
