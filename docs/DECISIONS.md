# Intra — Architecture Decision Log

Lightweight ADRs. One entry per decision. Keep them short: context, decision,
consequences, and the requirement IDs involved. Newest at the bottom.

Status values: `Accepted`, `Superseded by ADR-NNN`, `Deprecated`.

---

## ADR-001 — One narrow flyer-printing use case before expansion

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The hackathon rewards a narrow, concrete job with real users
  (`docs/PRD.md` §2, §3). Broad "procurement agent" scope would dilute testing
  and adoption evidence.
- **Decision:** The MVP implements exactly one category — **campus flyer
  printing** — with the fixed structured brief `size`, `quantity`, `colour`,
  `deadline`, `deliveryArea`. No other categories, no general-purpose agent.
- **Consequences:** Schemas, UI copy, and the route template are printing-specific
  for now but are shaped so a second category is an additive change, not a
  rewrite. Any new category needs an explicit requirement + a new ADR.
- **Requirements:** `G-001`, `FR-TASK-002`, `FR-ROUTE-002`; non-goals in PRD §3.

---

## ADR-002 — REST quote routes before supplier MCP support

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Suppliers are local businesses that cannot host APIs or MCP
  servers (`docs/BUSINESS_ONBOARDING.md`, PRD non-goals). We still need an
  agent-readable route representation.
- **Decision:** Model each quote route as a structured schema + REST endpoints
  (`docs/TECHNICAL_SPEC.md` §4). A future MCP adapter (`MCP-001`) will expose the
  same active-route data without changing supplier onboarding.
- **Consequences:** The route payload (input schema, fee, SLA, status, endpoint)
  is the stable contract. MCP is deferred to a P2 backlog item.
- **Requirements:** `FR-ROUTE-001`, `FR-ROUTE-002`, `G-005`; `MCP-001` (deferred).

---

## ADR-003 — Human-approved final order and payment

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Intra must never custody funds or execute a buyer's final
  supplier payment (`BR-001`, `FR-REC-004`). Safety and trust depend on this.
- **Decision:** The final purchase is always a buyer-controlled external action:
  Intra generates a pre-filled WhatsApp order message that the buyer chooses to
  send and then agrees the order directly with the supplier. Any agent payment
  is limited to a small service/query fee, distinct from the order price.
- **Consequences:** No "buy now" / auto-checkout anywhere. Recommendation UI ends
  at a copyable handoff, not a transaction. Agent spend is capped server-side.
- **Requirements:** `BR-001`, `BR-004`, `FR-REC-002`, `FR-REC-004`, `FR-PAY-005`.

---

## ADR-004 — No fake x402 settlement; explicit unavailable state until verified

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** x402 facilitator / `buy` access is a known external blocker
  (`docs/DEVELOPMENT_WORKFLOW.md` §9). Last hackathon, entrants manufactured
  facilitator traffic; Intra will not.
- **Decision:** Payment state may be `SETTLED` only after a real facilitator/beta
  verification returns a valid mainnet tx hash (`FR-PAY-003`, `BR-005`). With no
  configured access, the system shows `UNAVAILABLE` / returns
  `503 PAYMENT_SERVICE_UNAVAILABLE` (`FR-PAY-004`). No simulated `X-PAYMENT`
  verification, no manually entered receipts, no placeholder tx hashes.
- **Consequences:** x402/`buy` sits behind an adapter interface; the free
  request → quote → handoff flow works without it. Payment tests assert the
  unavailable path, not a stubbed success.
- **Requirements:** `FR-PAY-002`, `FR-PAY-003`, `FR-PAY-004`, `BR-005`; `PAY-001`
  (deferred to Phase 3).

---

## ADR-005 — Suppliers use guided onboarding, not code/API setup

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Target suppliers are campus printers and small businesses. Asking
  them to build an API, run MCP, or manage keys would eliminate the supply side
  (`docs/BUSINESS_ONBOARDING.md`, PRD §1).
- **Decision:** Onboarding is a guided form completed by the supplier and/or an
  operator. The only wallet-related value collected is a **public** Celo/EVM
  receiving address. Intra generates the business slug and the draft quote route.
  Ownership of the address is verified out-of-band by an operator; no secret is
  ever requested. A route only becomes public after operator verification and
  recorded consent.
- **Consequences:** Onboarding form is plain-language, mobile-first, and never
  asks for a seed phrase, private key, password, BVN, NIN, card, or bank login.
  Address handling is format-validation now; cryptographic checksum/ownership
  checks come with the Celo phase (viem).
- **Requirements:** `FR-SUP-001`..`FR-SUP-005`, `AC-SUP-001`..`AC-SUP-003`,
  `FR-SUP-003`, `NFR-SEC-001`, `BR-002`.

---

## ADR-006 — Drizzle ORM + PGlite for the first persistent backend

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** `docs/TECHNICAL_SPEC.md` §2 calls for "Postgres with Prisma or
  Drizzle". The dev environment has no PostgreSQL server and no running Docker
  daemon, and CI should not need external infrastructure.
- **Decision:** Use **Drizzle ORM** with **`@electric-sql/pglite`** (a real
  PostgreSQL compiled to WASM, in-process) for local development and tests, and
  the **`pg`** driver against a real PostgreSQL server in production. `getDb()`
  selects the driver from `DATABASE_URL`. The query surface is identical, so
  repositories are written once. Migrations are generated with `drizzle-kit`
  into `drizzle/` and applied with `npm run db:migrate`.
- **Consequences:** `npm run test` and `npm run build` need no database server;
  each integration test gets a fresh in-memory Postgres. Production still uses a
  managed PostgreSQL (Neon/RDS/etc.). No Prisma codegen step. Swapping ORM or
  adding another datastore requires a new ADR.
- **Requirements:** `TECHNICAL_SPEC` §2, §5; `INF-001`; `NFR-REL-001`.

---

## ADR-007 — Synthetic, dev-only seed data

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** A seed dataset speeds local work, but Intra must never present
  fabricated merchant data as real (CLAUDE §4.1).
- **Decision:** `npm run db:seed` inserts one business named
  `"[DEMO SEED] Campus Prints"` with a burn payout address
  (`0x000…0001`), plus one ACTIVE flyer route. It refuses to run when
  `NODE_ENV=production` or when `DATABASE_URL` points at a real Postgres, and it
  is idempotent.
- **Consequences:** Seed rows are unmistakably synthetic. No test, API response,
  or UI copy may treat them as a real supplier. Real suppliers only enter
  through onboarding + operator verification.
- **Requirements:** CLAUDE §4.1; `IMPLEMENTATION_PLAN` Phase 1.

---

## ADR-008 — MVP access model for supplier and operator surfaces

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** The end-to-end workflow needs suppliers to pause their own routes
  and respond to quote requests, and operators to verify and activate routes —
  but there are no user accounts yet (ADR-005 keeps suppliers off code/keys).
- **Decision:** Two lightweight capabilities, neither a wallet secret:
  - **Operator key** — `x-operator-key` matched against `OPERATOR_API_KEYS`
    (`label:secret` pairs, server env only). Required to verify/activate a
    route, reactivate a paused route, and read the operator queue. `/operator`
    holds the key in `sessionStorage` for the tab only; it is never logged.
  - **Business manage token** — a random opaque string generated per business
    (`businesses.manage_token`), returned once from `POST /api/businesses` and
    carried in the supplier's review link as `?t=`. Presented as
    `x-manage-token`. It authorises **fail-safe** actions only: pausing the
    business's own route (which can only _reduce_ availability, BR-006),
    submitting a route for verification, and responding to / declining that
    business's incoming requests.
  - Every state change that could _increase_ exposure — activation,
    reactivation — is operator-only.
- **Consequences:** No harmful action is unauthenticated. Token comparison is
  constant-time. Real supplier sessions are a later phase; this model is
  forward-compatible (swap the token check for a session check).
- **Requirements:** PRD §4 (roles), `AC-SUP-003`, `BR-002`, `BR-006`,
  `NFR-SEC-002`, `FR-REC-001`.

---

## ADR-009 — "Calm clinic" visual system (Ease Health reference)

- **Date:** 2026-08-30
- **Status:** Palette superseded by [ADR-022](#adr-022--visual-system-moves-to-a-warm-editorial-palette-supersedes-adr-009s-direction) (2026-09-07); its light-first / flat / accessible-status principles still hold
- **Context:** Five style references were supplied (`docs/design/`). Three are
  dark "gallery/observatory" aesthetics built for marketing pages; Intra is a
  utility used by students and small-business owners on inexpensive phones in
  daylight, with accessibility mandated (NFR-A11Y-001, NFR-UX-001).
- **Decision:** Adopt the **Ease Health** reference (`docs/design/DESIGN (5).md`):
  warm off-white canvas, one deep forest green (`#0f3e17`) for every action and
  trust signal, flat surfaces with hairline borders and tint-based elevation
  (no drop shadows), light serif for headings + grotesque for operational text,
  geometric radii (7px / 14px / 999px), muted "medical-label" status pills that
  always pair an icon/dot with text. Tokens live in `src/styles/tokens.css`;
  dark mode is dropped to match the light-first intent.
- **Consequences:** Faire Octave / Fraunces are substituted with a system serif
  stack (no web-font fetch at build). Status colours are muted but still
  present, because unavailable/error/warning states are required by the PRD.
- **Requirements:** `NFR-UX-001`, `NFR-A11Y-001`, PRD §7 (UI states).

---

## ADR-010 — Public capability API: REST now, structured unavailability, no MCP

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** Agents need to discover a business's routes and request a quote
  (`TECHNICAL_SPEC` §4). MCP is deferred (ADR-002). x402 / cPay is unavailable
  (ADR-004).
- **Decision:**
  - Two public, unauthenticated endpoints under `/v1`: a capability document and
    a quote request. Documented in `docs/CAPABILITY_API.md`.
  - The quote route is **asynchronous**: a valid request creates a `Task`
    (`AWAITING_QUOTE`) + audit events; a supplier responds out of band. There is
    no synchronous quote and no agent-side result read yet.
  - A route is "quote-ready" only when `ACTIVE`, operator-verified, **and**
    fresh — its `priceUpdatedAt` within **14 days** (`PRICE_FRESHNESS_MAX_AGE_MS`).
    Otherwise the endpoint returns a structured `409 ROUTE_UNAVAILABLE` and
    creates nothing (AC-ROUTE-002).
  - For a **paid** route with no facilitator configured, the endpoint returns
    `503 PAYMENT_SERVICE_UNAVAILABLE` (the `Task` is still created) and never a
    402, `X-PAYMENT` verification, receipt, or tx hash (ADR-004).
  - `Idempotency-Key` is required; the outcome (including the created task id)
    replays exactly on retry, even for the `503` path (`runIdempotent`'s
    `cacheErrors`).
  - The order contact channel appears in the capability document only for
    `ACTIVE` routes. (Tightened by ADR-014: only for routes whose
    `availability.state` is `AVAILABLE`.)
- **Consequences:** The same route data will back a future MCP adapter and the
  real x402 flow without breaking this contract. Contract tests live in
  `src/app/v1/v1.contract.test.ts`.
- **Requirements:** `FR-ROUTE-001`, `FR-ROUTE-004`, `AC-ROUTE-002`,
  `FR-PAY-004`, `BR-001`, `BR-003`; `TECHNICAL_SPEC` §4.

---

## ADR-012 — Intra Relay is the product; Proofline is a bounded future module

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** The project must be distinguishable from consumer agents,
  website-to-tool platforms, generic agent-payment controls, and merchant
  chatbots. The real gap for local, non-API businesses is not merely accepting
  an agent payment; it is supplying fresh, authorised business state and later
  proving real-world fulfilment.
- **Decision:** Position Intra as **Intra Relay**, a managed merchant-side
  capability and control layer. Define **Proofline** as a future Relay module
  that records honest fulfilment events (for example, merchant marks ready and
  buyer confirms pickup). The current hackathon MVP remains one flyer-printing
  quote → human-approved WhatsApp handoff flow. A Proofline event is additive
  only after the existing flow works; it is not escrow, a reputation score, or
  an autonomous payment system.
- **Consequences:** Do not build a general consumer agent, merchant directory,
  generic MCP generator, generic wallet-policy system, escrow, or broad
  reputation marketplace. Features must improve merchant capability, freshness,
  authority, buyer approval, or fulfilment evidence. See
  [`PRODUCT_VISION.md`](PRODUCT_VISION.md).
- **Requirements:** `G-001`..`G-005`, `BR-001`..`BR-006`, `NFR-UX-001`,
  `NFR-SEC-001`; MVP scope in `PRD.md` §5.

---

## ADR-011 — Celo x402 payment adapter (official config)

- **Date:** 2026-08-30
- **Status:** Accepted (supersedes the "not configured" posture of ADR-004 once
  `X402_API_KEY` is set)
- **Context:** Official Celo x402 facilitator docs + a metering key are now
  available. The quote route needs a real 402 → pay → verify → settle flow
  without coupling the rest of Intra to a payment SDK.
- **Decision:**
  - A provider-neutral `PaymentAdapter` interface
    (`src/features/payments/adapter/types.ts`). `NoopPaymentAdapter` (no key →
    everything `UNAVAILABLE`, unchanged) and `X402PaymentAdapter` (uses
    `@x402/core`'s `HTTPFacilitatorClient` + header codecs — **not** `@x402/evm`,
    so no `viem`). `getPaymentAdapter()` picks one from the environment.
  - Verified official config is a constant in `adapter/networks.ts`: hosts
    `api.x402.celo.org` / `api.x402.sepolia.celo.org`, networks `eip155:42220` /
    `eip155:11142220`, USDC/USDT addresses + EIP-712 domains, `celoscan.io` /
    `celo-sepolia.blockscout.com` explorers. Scheme `exact`, EIP-3009.
  - Server-side cap: the 402 only ever advertises `min(routeFee, $0.05)`
    (`PAYMENT_MAX_FEE_USD`); a presented authorisation that doesn't match is
    `FAILED` before any facilitator call.
  - `service_payments` is **insert-only**. SETTLED requires `settle.success` +
    a `0x…64hex` tx hash (`assertSettlement`). FAILED attempts are recorded for
    audit. `authorizationKey` (SHA-256 of the signed authorisation, never the
    signature) is unique and dedupes duplicate `X-PAYMENT` retries.
  - The EIP-3009 authorisation/signature is never persisted or logged;
    `verification` stores only the facilitator's result summary.
  - `X402_ATTRIBUTION_TAG` (ERC-8021) is recorded on receipts + audit and passed
    as `extra.reference`; x402 settlement tx is facilitator-submitted so the tag
    is not injected into calldata.
- **Consequences:** `X402_FACILITATOR_URL` / `X402_FACILITATOR_KEY` are replaced
  by `X402_API_KEY` / `X402_NETWORK` / `X402_ASSET` / `X402_FACILITATOR_URL` /
  `X402_ATTRIBUTION_TAG`. Migration `0001` adds the receipt columns and makes
  `service_payments.task_id` nullable; `0002` adds `idempotency_keys.response_headers`.
- **Requirements:** `FR-PAY-001..005`, `BR-005`, `BR-007`, `NFR-SEC-001/002`,
  `TECHNICAL_SPEC` §4/§6; `docs/PAYMENTS.md`.

---

## ADR-012 — Demo & deployment hardening

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** Preparing the flyer-printing MVP for the hackathon demo and a
  hosted deployment. No new product scope — polish, resilience, and docs only.
- **Decision:**
  - **Error surfaces.** Added App Router `error.tsx` (segment boundary) and
    `global-error.tsx` (root-layout boundary) so an unhandled render/data error
    shows a calm, non-technical recovery screen instead of a blank page. Copy
    reassures the buyer that no request was sent.
  - **Offline awareness.** A global `OfflineBanner` (client) watches
    `navigator.onLine` and warns that new requests need a connection. The
    typed `apiRequest` helper already maps a failed `fetch` to a friendly
    `NETWORK` error; the banner makes the state visible before the user acts.
  - **Metadata.** `layout.tsx` now sets full Open Graph + Twitter card metadata
    from `src/lib/site.ts`, plus a generated `opengraph-image` (Next `ImageResponse`)
    in the "calm clinic" palette. `site.description` replaces the scaffold string.
  - **Palette consolidation.** The landing, `/docs`, and `/request` headers used
    raw Tailwind `blue-*` / `amber-*` / `zinc-*` / `dark:` classes left over from
    the scaffold. All replaced with design tokens (ADR-009). The app has no dark
    mode, so stray `dark:` variants are removed rather than themed.
  - **Test stability.** `vitest.config.ts` caps `maxWorkers: 4` and raises
    `hookTimeout` to 30s. Each integration suite spins up a fresh embedded PGlite
    (WASM Postgres) with migrations in `beforeEach`; under full fork parallelism
    on an 8-core machine that cold start intermittently exceeded the default 10s
    hook timeout. Files pass individually — this only removes the parallel-load
    flake.
  - **Docs.** Added `docs/DEMO_SCRIPT.md` (full walkthrough), `docs/CLAIMS.md`
    (proven vs. conditional — the on-stage honesty line), and `docs/DEPLOYMENT.md`
    (consolidated env / database / x402-enable guidance). Removed the unused
    `PlaceholderPage` component and stale "scaffold / placeholder" wording.
- **Consequences:** No schema, API, or lifecycle change. `X402_API_KEY` stays the
  single switch between the honest unavailable state and live settlement.
- **Requirements:** `NFR-UX-001` (loading / empty / error / unavailable states),
  `NFR-A11Y-001`; `CLAUDE.md` §4.1 (no fabricated payment evidence) reinforced in
  `docs/CLAIMS.md`.

---

## ADR-013 — Privacy-minimised experiment tracking + public evidence page

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** The hackathon needs credible adoption evidence (PRD §3 success
  metrics, backlog MET-001) without adding surveillance, and without any risk of
  presenting demo data or unavailable integrations as real results.
- **Decision:**
  - **No analytics store, no new event capture.** `buildEvidenceReport(db)`
    (`src/features/metrics/report.ts`) aggregates on read from tables the product
    already keeps: tasks, quotes, feedback, audit events, service payments.
  - **Privacy stance.** Buyer sessions are opaque random ids with no account
    behind them. The report and every export expose only counts and a bucketed
    distribution — never a raw id, task content, address, or contact detail.
  - **Real vs demo are separate scopes, never summed.** Any row tracing to a
    `[DEMO SEED]` business (`classification.ts`) is `demo`; everything else is
    `real`. `/evidence` renders three zones: real results, demo data, unavailable
    integrations — plus the "what changed from feedback" log.
  - **Settlements counted only when verified.** A payment counts only if the row
    is `SETTLED` with a non-empty `txHash`. Zero is reported honestly.
  - **Exports.** `GET /api/evidence?format=json|csv` is public and privacy-safe.
    `GET /api/operator/metrics` is operator-gated and adds a content-free
    recent-events feed (type + timestamp only).
  - **Feedback changelog.** `src/features/metrics/feedback-changelog.ts` (mirrored
    by `docs/FEEDBACK_CHANGELOG.md`) holds only genuine shipped changes with a
    traceable artefact. AskBots rounds append there when the CLI is connected.
  - **Post-handoff feedback.** The buyer explicitly confirms "I've sent this to
    the printer" (a `task.handoff_confirmed` audit event, idempotent, no status
    change); that unlocks the feedback form and gives a genuine
    handoff-completed signal. Intra cannot observe WhatsApp, so this is a user
    action, not an inference.
- **Consequences:** One new audit event type, one new route
  (`POST /api/tasks/:id/handoff-confirm`), `TaskView` gains `handoffConfirmedAt`.
  No schema migration. `/evidence` reads live and is only as populated as the
  database — an empty real scope on a fresh clone is the correct state.
- **Requirements:** `MET-001`, `G-001..G-005`, PRD §3 success metrics, PRD §4
  (operator "view metrics"); `CLAUDE.md` §4.1.

---

## ADR-014 — Capability Card: explicit availability, freshness, and minimal handoff data

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** The public capability document (`GET /v1/:businessSlug/capabilities`)
  is the agent-readable contract for a route (ADR-010, ADR-002). It exposed the
  route lifecycle `status` and a `stale` boolean, but an agent reading
  `status: "ACTIVE"` on a route with stale price data could treat it as usable —
  the quote endpoint rejected it, but the card did not say so. It also attached
  the merchant's WhatsApp number to every `ACTIVE` route regardless of whether
  the route could actually take a request.
- **Decision:**
  - Each route card carries an explicit **`availability`** verdict
    (`AVAILABLE` / `UNAVAILABLE` + `reason` of `OK | NOT_ACTIVE | NOT_VERIFIED |
STALE` + an agent-readable `detail`), derived from the same
    `routeIsQuoteReady` gate the quote endpoint uses. An `ACTIVE` route with
    stale critical data reports `status: "ACTIVE"` **and**
    `availability.state: "UNAVAILABLE"` — never silently current (AC-ROUTE-002,
    BR-006).
  - A **`freshness`** object states `priceConfirmedAt`, `maxAgeDays` (14),
    `staleAfter`, `stale`, and the expiry behaviour in words (BR-003).
  - A **`quoteSla`** object states the response expectation; a **`handoff`**
    object always states the human-approval + WhatsApp mechanism without a
    contact value (BR-001, FR-REC-004).
  - **`orderContact`** (the concrete channel value) is attached **only** to a
    route whose `availability.state` is `AVAILABLE` — a paused, draft, pending,
    unverified, or stale route does not expose the merchant's contact value
    (NFR-SEC-002, "least data necessary"). This tightens ADR-010's
    "only for `ACTIVE` routes".
  - The document carries a `version` (`CAPABILITY_CONTRACT_VERSION`).
  - Backward compatible: `status`, `stale`, `priceUpdatedAt`, `lastUpdatedAt`,
    `responseSlaMinutes`, `finalOrderPolicy`, and `payment` are unchanged; the
    new fields are additive.
- **Consequences:** No schema migration. `src/features/routes/freshness.ts` gains
  `staleAfter`, `ROUTE_READY_DETAIL`, `PRICE_FRESHNESS_MAX_AGE_DAYS`. Contract
  tests in `src/app/v1/v1.contract.test.ts` and unit tests in
  `src/features/routes/freshness.test.ts` cover active, paused, pending, stale,
  malformed, and unavailable cases. `docs/CAPABILITY_API.md` updated.
- **Requirements:** `FR-ROUTE-001`, `FR-ROUTE-003`, `FR-ROUTE-004`,
  `AC-ROUTE-002`, `BR-003`, `BR-006`, `BR-001`, `FR-REC-004`, `NFR-SEC-002`;
  `PRODUCT_VISION.md` §3.1.

---

## ADR-015 — Buyer decision is its own step; quote / choice / send are distinct

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** `submitQuote` advanced a task `AWAITING_QUOTE → RECOMMENDED →
HANDOFF_READY` in one call and revealed the printer's phone number the moment
  a quote landed. The PRD keeps `RECOMMENDED` and `HANDOFF_READY` as separate
  states (§7) and the flow as "recommendation → buyer copies handoff → buyer
  agrees directly" (§8). There was no point where the buyer actually chose, and
  "a quote exists", "the buyer chose", and "the buyer sent the order" were not
  separable.
- **Decision:**
  - A supplier quote now stops the task at **`RECOMMENDED`** (stamps
    `tasks.quoted_at`). The WhatsApp message is generated but not surfaced, and
    the supplier **contact value** is withheld — only `name` / `city` show.
  - The buyer calls **`POST /api/tasks/:id/decision`**:
    - `ACCEPT` → `HANDOFF_READY`, `buyer_decision = ACCEPTED`, audits
      `task.buyer_accepted` + `task.handoff_ready`; contact + message revealed.
    - `DECLINE` (+ optional `reason`) → `CANCELLED`, `buyer_decision = DECLINED`,
      audit `task.buyer_declined`; nothing ordered; feedback still opens.
  - `POST /api/tasks/:id/handoff-confirm` is unchanged — the buyer's own report
    that they sent the message (Intra cannot observe WhatsApp). It now also sets
    `tasks.handoff_confirmed_at`.
  - New nullable `tasks` columns (migration `0003`): `quoted_at`,
    `buyer_decision` (enum), `buyer_decided_at`, `buyer_decline_reason`,
    `handoff_confirmed_at`, `closed_at` (set on first terminal state).
  - **Quote validity** is enforced at read time: `quoteEffectiveStatus` reports
    `EXPIRED` for a `RECEIVED` quote past `expiresAt`. Accepting an expired quote
    is allowed (the buyer stays in control) but marks the quote `EXPIRED`
    (audit `quote.expired`) and adds a "reconfirm the price" line to the message.
  - **Normalisation** (`normalizeQuote`) and the **explained recommendation**
    (`buildRecommendationDetail`: `reasoning[]`, `uncertainties[]`,
    `verificationNote`) are pure read-time functions — nothing stored, no
    multi-vertical abstraction. The `verificationNote` states plainly that the
    figures were operator/printer-entered and are **not** independently verified;
    the quote card and `QuoteResponseForm` carry the same label.
- **Consequences:** Intra still never sends the message, places the order, or
  custodies funds. `submitQuote` return shape unchanged (`task` is now
  `RECOMMENDED`). Integration tests (`flow`, `supplier/workflow`, `api`,
  `report`) gained the accept step; `decision.integration.test.ts`,
  `quotes/expiry.test.ts`, `quotes/normalize.test.ts`,
  `quotes/recommendation.test.ts` are new. `docs/API.md` and
  `docs/DEMO_SCRIPT.md` updated.
- **Requirements:** PRD §7 (`RECOMMENDED`, `HANDOFF_READY`, `CANCELLED`), §8;
  `FR-REC-001`, `FR-REC-002`, `FR-REC-004`, `BR-001`, `BR-003`; `CLAUDE.md`
  §4.1, §4.3.

---

## ADR-016 — Proofline pilot: two fulfilment-evidence events, nothing more

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** PRODUCT_VISION §3.2 / §6 and ADR-012 sanction a **bounded**
  Proofline pilot once the flyer-printing quote → handoff flow works with real
  users (it now does — ADR-015). A payment receipt proves money moved; it does
  not prove the flyer was collected. Victor explicitly asked for exactly two
  optional post-handoff events.
- **Decision:**
  - New append-only table `proofline_events` (migration `0004`). Each row stores
    the six required fields: `task_id`, `actor_role`, `created_at`, `event_type`,
    `confirmation_method`, `evidence_status` (+ an optional `pickup_code` on the
    ready row).
  - **Exactly two event types**, both optional, both gated on
    `tasks.handoff_confirmed_at`:
    1. `READY_FOR_PICKUP` — the **merchant** (route manage token). Issues a
       6-char pickup code, returned once to the merchant, never to the buyer.
    2. `PICKUP_CONFIRMED` — the **buyer**, either from their own task session
       (`buyer_session`) or by entering the pickup code (`one_time_code`).
  - Endpoints `POST /api/tasks/:id/proofline/ready` and
    `.../confirm-pickup`. `getTaskView` gains a `proofline` field (no code);
    the supplier requests page gains a "Handed-off orders" section with the code
    for the authenticated merchant only.
  - Every API response and both UIs carry `PROOFLINE_DISCLAIMER`: **operational
    evidence, not a cryptographic proof, not a payment settlement, not a
    guarantee.** No status is labelled "fulfilled" as a bare fact — each event
    is attributed to the actor who recorded it.
  - **Explicitly not built:** escrow, dispute handling, any public reliability /
    reputation / on-time score, notifications, expiry of the code, a second
    category, or a merchant-facing directory. Not wired into `/api/evidence` or
    the operator metrics report.
  - Replay-safe: a second `ready` or `confirm-pickup` → `409`; a wrong or
    replayed code never records anything.
- **Consequences:** One migration, one feature module (`src/features/proofline`),
  two routes, one new access helper (`manageTokenMatchesTask`). Tests:
  `proofline/service.integration.test.ts`, `proofline/code.test.ts`,
  `app/api/tasks/[id]/proofline/proofline.contract.test.ts`, plus a Proofline
  leg in `supplier/workflow.integration.test.ts` and a `TaskPage` case.
  `docs/PRD.md` (F-PROOF), `API.md`, `TECHNICAL_SPEC.md`, `DEMO_SCRIPT.md`,
  `PRODUCT_VISION.md` updated.
- **Requirements:** `FR-PROOF-001`..`007`, `AC-PROOF-001`..`006`, `BR-009`;
  PRODUCT_VISION §3.2, §6; ADR-012.

---

## ADR-017 — x402 payment hardening: failure taxonomy, indeterminate settlement, config tolerance

- **Date:** 2026-08-31
- **Status:** Accepted (extends ADR-004, ADR-011)
- **Context:** An audit of the x402 integration against `@x402/core@2.24.0` (no
  live key present) found: a malformed `X402_*` env threw from
  `readPaymentConfig()` and 500'd the whole quote workflow; every infra failure
  (facilitator unreachable, verify/settle transport error) was reported to the
  agent as `402 PAYMENT_FAILED`; a `settle` timeout — which the SDK documents as
  _indeterminate_ — was recorded `FAILED`, inviting a re-authorisation and a
  double-pay; the natural x402 retry (same `Idempotency-Key`, now with
  `X-PAYMENT`) returned `409 IDEMPOTENCY_KEY_CONFLICT`; a concurrent duplicate
  `X-PAYMENT` could hit the `authorization_key` unique constraint and 500; and
  `X402_ATTRIBUTION_TAG` was unvalidated.
- **Decision:**
  - **Failure taxonomy.** `SettleResult` gains `INDETERMINATE`; `UnavailableResult`
    gains `code` / `authorizationKey`. The adapter maps: undecodable header /
    over-cap / `verify.isValid = false` / on-chain revert → `FAILED` (`402`,
    retryable by the agent); `verify` transport error → `UNAVAILABLE` (`503`,
    not the agent's fault); `settle` timeout or a success-without-hash →
    `INDETERMINATE` (`503 PAYMENT_SETTLEMENT_INDETERMINATE`). `SETTLEMENT_FAILED`
    (facilitator-reported on-chain failure) stays `FAILED`.
  - **Indeterminate receipts.** Recorded immutably as `AUTHORISED` /
    `errorCode = SETTLE_INDETERMINATE`, no tx hash, audit `payment.indeterminate`.
    The agent is told **not** to re-authorise and to check the explorer.
    Re-presenting the authorisation returns the same `503` — never re-settled.
  - **Config tolerance.** `readPaymentConfig()` still throws (deploy check), but
    `getPaymentAdapter()` catches it → `NoopPaymentAdapter` with
    `code: "CONFIG_ERROR"` (logged once); `facilitatorConfigured()` returns
    `false`. Free routes, the capability doc, and the buyer web flow keep
    working; paid routes get an explicit `503`. `X402_ATTRIBUTION_TAG` is
    validated (`/^celo_[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/`); a mismatch is dropped
    with a `configWarning`, never recorded (BR-007).
  - **Idempotency scope.** The quote endpoint folds `sha256(X-PAYMENT)` into the
    idempotency **scope** (`…:probe` / `…:pay:<hash>`), not the request payload,
    so the same key replays cleanly across the probe and the paid retry.
  - **Concurrency.** `insertOrGetByAuthorizationKey` (`onConflictDoNothing` +
    re-read) makes the recorders converge on one immutable row; a request whose
    settle lost the nonce race serves the winner's `SETTLED` receipt.
  - **Receipt language.** The task page adds `NOT_REQUIRED` ("no agent query fee
    — came through the web") and `AUTHORISED` ("being reconciled — not shown as
    paid") copy; the `/evidence` payments block adds an `indeterminate` count.
- **Consequences:** No schema migration (`AUTHORISED` / `UNAVAILABLE` already in
  the `payment_status` enum). New public status code
  `PAYMENT_SETTLEMENT_INDETERMINATE`. Tests: `adapter/config.test.ts`,
  `adapter/index.test.ts` (new), expanded `adapter/x402.test.ts`,
  `payments/lifecycle.test.ts`, `v1.payment.contract.test.ts`. `PAYMENTS.md`,
  `CLAIMS.md`, `CAPABILITY_API.md`, `DEPLOYMENT.md`, `.env.example`,
  `DEVELOPMENT_WORKFLOW.md`, `PRD.md` (F-PAY) updated.
- **Requirements:** `FR-PAY-002`..`007`, `AC-PAY-001`..`006`, `BR-005`, `BR-007`,
  `NFR-SEC-001/002`, `NFR-REL-001`; `docs/PAYMENTS.md`.

## ADR-018 — Physical fulfilment attestation on EAS; evaluator, never custodian

- **Date:** 2026-09-01
- **Status:** Accepted (extends ADR-016; narrows CLAUDE.md §4.1 and §6.2)
- **Context:** The Celo "Agents at Work" submission (2026-09-14 09:00 GMT) is
  Celo **mainnet only** and requires a real **ERC-8004 Agent ID** plus agent
  wallets; users/buyers/volume count only from wallets that are not ours. Three
  external facts were verified before this decision:
  1. **EAS is deployed on Celo mainnet** (`EAS 0x72E1…Af92`,
     `SchemaRegistry 0x5ece…AF34`, from the canonical `eas-contracts`
     deployment artifacts). It already provides a schema registry, on-chain and
     off-chain attestations, `refUID` chaining, expiry and revocation.
  2. **ERC-8004** ships `giveFeedback(agentId, value, valueDecimals, tag1,
tag2, endpoint, feedbackURI, feedbackHash)`; the submitter MUST NOT be the
     agent owner. The spec states plainly that unfiltered results "are subject
     to Sybil/spam attacks" and directs consumers to filter by trusted
     `clientAddresses`. An empirical study of the deployed ecosystem
     (arXiv 2606.26028) found 3–15% of registrations expose a valid endpoint,
     59–91% of reviewers are Sybil, and feedback is "rarely grounded in
     verifiable interactions".
  3. **ERC-8183** (agentic commerce jobs + escrow) is **Draft**, has no Celo
     deployment, and explicitly delegates real-world enforcement to "the
     evaluator and external tools" — it ships that socket empty.
     The existing CLAUDE.md §4.1 prohibition on ERC-8004 Agent IDs was written when
     no registry access existed. It now blocks compliant work.
- **Decision:**
  - **ERC-8004 prohibition narrowed, not lifted.** Fabricating, mocking or
    displaying an unverified Agent ID stays forbidden. Registering a real
    identity against the Celo mainnet Identity Registry, and reading back the
    minted `agentId`, is now required. A human-operated business is registered
    with its Relay capability endpoint in `services[]` — honest, because that
    genuinely is its agent-facing interface.
  - **Use EAS as the attestation rail. Do not deploy our own contract.** No
    custom attestation, reputation or escrow Solidity. We register two schemas
    and issue attestations against the canonical deployment.
  - **Evaluator, never custodian.** `BR-001` stands unchanged: Intra does not
    hold funds. ERC-8183 escrow is **not** adopted; we emit an attestation an
    8183 evaluator could later consume. Escrow is a commodity; the credible
    determination is the product.
  - **Two-party anti-fabrication by commit–reveal.** At commitment time the
    system publishes `handoverCommit = keccak256(code ‖ salt)`. The **buyer**
    alone receives `code`; the server withholds `salt` until a correct `code` is
    presented. The handover attestation is signed by the **merchant** and
    carries `code` + `salt`, so the merchant's key proves their participation
    and possession of `code` proves the buyer handed it over in person.
    2-of-2, with the server as a non-signing referee that cannot attest alone.
  - **Honesty bound (extends PROOFLINE_DISCLAIMER).** The attestation proves
    that the named parties completed the handover protocol at a time. It does
    **not** prove quantity, quality, timeliness or satisfaction. Those are a
    separate rating signal and must never be described as proven.
  - **`viem` admitted** as a narrow exception to §6.2 — required for
    `keccak256`, ABI encoding, EAS schema-UID derivation, and Celo mainnet
    calls. No other chain library is added.
- **Consequences:** New `src/features/attestation/` module. `viem` added to
  `dependencies`. New public status codes to follow with the write path. The
  Proofline pilot (ADR-016) keeps its two events and its merchant→buyer pickup
  code unchanged; the buyer→merchant handover secret introduced here is a
  distinct, attestation-grade mechanism and does not alter Proofline semantics.
  PRD gains `FR-ATT-*` / `AC-ATT-*`; `CLAUDE.md` §4.1 and §6.2 amended in the
  same commit.
- **Requirements:** `FR-ATT-001`..`005`, `AC-ATT-001`..`004`, `BR-001` (upheld),
  `BR-005`, `NFR-SEC-001`.

---

## ADR-019 — Buyer-agent model layer: LLM above deterministic policy, never inside it

- **Date:** 2026-09-02
- **Status:** Accepted (starts the "AI SDK" phase gated by CLAUDE.md §6.2; extends the
  agent work behind ADR-001 / ADR-003)
- **Context:** Milestones 1–2 built a deterministic buyer-agent orchestration
  library (`src/features/agent/`) and a commitment→attestation lifecycle. A full
  read-only audit confirmed it was well-engineered but (a) **not reachable** from
  the running app — no route, no UI, never executed against a real server — and
  (b) **not an AI agent** — no model, no model-driven reasoning. The Celo "Agents
  at Work" submission needs a credible agent. CLAUDE.md §6.2 phase-gates AI SDKs;
  Victor started this phase explicitly (milestone 3 brief).
- **Decision:**
  - **The model sits ABOVE the deterministic orchestration, never inside it.**
    ```
    USER → LLM (understand intent · plan which providers to quote · choose an
                offer + rationale · replan when nothing is usable)
         → DETERMINISTIC POLICY (budget cap · quote expiry · eligibility ·
                the human-approval gate · every mutating tool)
         → EXTERNAL TOOLS
    ```
  - **The model never holds a tool.** It proposes; `runBuyerAgent` disposes. It
    proposes JSON validated against a Zod schema; the loop executes the tools and
    vetoes anything policy already excluded. `recordBuyerDecision` (ACCEPT) is
    **not** in the model-facing tool set (`MODEL_TOOLS`) — a human approval,
    validated by `offerFingerprint`, remains the only path to it (BR-001).
  - **Deterministic is the floor and the fallback.** Every model call is bounded
    (`DEFAULT_MODEL_LIMITS`: ≤4 calls/run, ≤700 output tokens, 12s timeout) and,
    on any failure — timeout, rate limit, bad JSON, schema mismatch, unknown
    provider, call-budget exhausted — the run silently continues on the
    deterministic decision. With **no** `ANTHROPIC_API_KEY` the assisted loop is
    byte-for-byte `runBuyerAgent`.
  - **Dates and money stay deterministic.** The model returns a deadline
    _phrase_, not a date; the deterministic parser turns it into a date. Where
    the deterministic parser already found a value, the model cannot override it.
  - **Provider:** `@anthropic-ai/sdk` (Claude Haiku 4.5,
    `claude-haiku-4-5-20251001`). A `MockModelProvider` gives tests and
    credit-free local dev the full pipeline. No agent framework — no Google ADK,
    no LangGraph, no LangChain: the repo already has clean implementations of
    tools, state, retries, the async human-wait and the approval gate; a
    framework would be a rewrite that buys nothing.
  - **Reachable:** new `POST /api/agent/run`, `GET /api/agent/run/:id`,
    `POST /api/agent/run/:id/approve`, and a minimal `/agent` page. Run
    orchestration metadata (trace, ranked offers) lives in a **non-persistent**
    in-memory store (CLAUDE.md §4.4); the task, quote, decision and commitment
    are still written by the existing DB-backed services.
- **Consequences:** `@anthropic-ai/sdk` added to `dependencies`. New env vars
  `ANTHROPIC_API_KEY`, `AGENT_MODEL_PROVIDER`, `AGENT_MODEL` (all server-only,
  all optional). New agent run state `CLARIFICATION_NEEDED`. `.env.example` and
  CLAUDE.md §6.2 updated. No change to BR-001, the payment rules, or the
  attestation layer.
- **Requirements:** `BR-001` (upheld), `ADR-003` (upheld), `NFR-SEC-002`.

## ADR-020 — PWA + web push: an attention layer, never a workflow dependency

- **Date:** 2026-09-04
- **Status:** Accepted (milestone 7 phase C)
- **Context:** Phases A–B made the product resumable _inside a tab_: a person
  returns to `/agent` or `/activity` and sees their work and notifications. But
  the defining requirement of M7 is that Intra can reach a human who is **not
  looking at it**, and take them straight back to the live workflow. That needs
  a PWA (installable, service worker) and real web push.
- **Decision:**
  - **Installable PWA.** `app/manifest.ts` (`/manifest.webmanifest`),
    `public/icons/*` (generated from one SVG by `scripts/generate-icons.mjs` —
    committed, so the build has no image tooling), `viewport`/`appleWebApp`
    metadata, and a hand-written `public/sw.js`. `start_url` is `/agent`. The
    app stays a **normal website**; nothing forces or blocks installation.
  - **Service-worker cache policy — server state is always authoritative.**
    `/api/*` is **network-only, never cached** (offline → a clean 503 JSON so
    the UI shows "you're offline", never a false success). `/_next/static` and
    `/icons` are cache-first (content-hashed). Navigations are network-first
    with a cached `/offline` fallback. Nothing about prices, quotes, approval,
    payment, fulfilment, cancellation, handover or permissions is ever served
    from cache.
  - **Update policy.** A new worker installs and _waits_; it only activates on
    a `SKIP_WAITING` message the page sends via a dismissible "Update now"
    banner. No forced refresh mid-transaction.
  - **Web push via `web-push` + self-generated VAPID.** New deps: `web-push`,
    `@types/web-push`. VAPID keys are generated locally
    (`npx web-push generate-vapid-keys`), a **separate pair per environment**,
    the private key set only in the deployment's env — never committed. New env
    vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. With any of the three server vars unset,
    push is `UNAVAILABLE` and the app falls back to in-app notifications only —
    exactly like x402 and attestation, nothing breaks (CLAUDE.md §4.1 spirit).
  - **A subscription is a delivery endpoint, not an authorization.** Every
    `push_subscriptions` row is bound to the recipient the **server** resolves
    from the session / manage token (`resolveRecipient`); a client-sent id is
    never trusted. Delete is recipient-scoped. Payloads carry only
    `{ title, body, url, tag }` — no id, amount, address, code or secret (§11,
    §18); protected detail is fetched after re-authorisation on the deep-linked
    page.
  - **Push is fire-and-forget from `notify()`.** `deliverPush` swallows every
    error; a failed or slow push service can never fail — or roll back — the
    domain action. Invalid subscriptions (404/410) are deleted; repeated soft
    failures prune after three (§17, §35). The in-app notification row always
    stands.
  - **Level gate (§15).** `ACTION_REQUIRED` / `TIME_SENSITIVE` push whenever
    push is on; `INFORMATIONAL` / `COMPLETED` only if the person opted in
    (`notification_preferences.push_informational`). Preferences are two
    switches, not a settings system (§16).
  - **Contextual prompts (§4, §5).** Neither the notification-permission ask
    nor the install nudge fires on first load. They appear only once a person
    has real asynchronous work — something to come back to — and are dismissed
    permanently once declined.
  - **Deployment.** `vercel.json` runs `npm run db:migrate` before `next build`
    so the `pg` schema is current (migrations still never run at request time).
- **Consequences:** migrations `0009` (`notification_preferences`). New routes
  `/api/push/{config,subscribe,unsubscribe}`, `/api/notifications/preferences`,
  `/api/pilot/event`. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is the only new
  `NEXT_PUBLIC_*`. Pilot events extended with the attention funnel
  (`notification_created/opened`, `workflow_resumed`, push/install events) —
  never recording payload contents or personal data (§32).
- **Requirements:** M7 phase C §2–§18, §25, §27, §30–§37; CLAUDE.md §4.1, §4.3,
  §6.1 (`vercel.json` added, justified), NFR-SEC-001/002.

---

## ADR-021 — Product analytics via the Amplitude Browser SDK: a measurement layer, never a dependency

- **Date:** 2026-09-06
- **Status:** Accepted (milestone 9.5)
- **Context:** Before real pilot users arrive we need to answer _how humans
  behave around the product_ — where they get confused, whether they understand
  it, whether they install and return, whether notifications bring them back,
  whether buyers reach outcomes and businesses respond. The existing
  `src/features/analytics/pilot.ts` (audit-table events + `/api/pilot/funnel`)
  is **operational truth** ("what the system did") and answers none of the
  behavioural questions (funnels, drop-off, activation, retention, cohorts).
- **Decision:**
  - **Amplitude sits ALONGSIDE the audit trail, never replaces it, and is never
    a dependency of a commerce action.** If Amplitude fails, requests, quotes,
    approvals, notifications, fulfilment and handover all still work. Every
    adapter export is wrapped so a thrown SDK / offline network / missing key /
    malformed event is swallowed; two integration tests prove a buyer request
    and a business quote each still succeed when the analytics forward throws.
  - **One SDK: `@amplitude/analytics-browser` (v2), client-side only.** Both the
    buyer flow and the business workspace are browser-driven, so almost every
    event has a browser moment and goes straight through the Browser SDK. No
    `@amplitude/analytics-node`, no Ampli codegen — a hand-written typed
    taxonomy (`events.ts`) instead. This is an analytics phase explicitly
    started by Victor, so it clears CLAUDE.md §6.2.
  - **Server forwarding, the narrow exception.** Four events have no browser
    actor — `request_received` (a request reaching a business), `business_ready`
    (operator-driven activation), `attention_required` / `notification_created`,
    `push_sent`. A thin server-side `fetch` to Amplitude's HTTP V2 endpoint
    (`forward.ts`), fire-and-forget via `after()`, gated on a SERVER-ONLY
    `AMPLITUDE_API_KEY`. Unset ⇒ silent no-op; the audit trail records them
    regardless.
  - **One adapter, no scattered calls.** All Amplitude access lives in
    `src/features/analytics/`; an ESLint `no-restricted-imports` rule bans
    `@amplitude/*` anywhere else (§6.1 — `.eslintrc.json` change, minimal and
    additive).
  - **Autocapture narrowed.** `attribution` (UTM / referrer — acquisition
    analysis, no PII) and `sessions` on; `pageViews`, `formInteractions`
    (could read typed values), `fileDownloads`, `elementInteractions` **off**.
    Explicit product events only.
  - **Identity.** Buyer = the opaque per-device session id (`intra.sessionId` —
    no account, no wallet, already the right stable internal id). Business = the
    internal business uuid, also an Amplitude group. Operators are never
    identified into Amplitude. `reset()` on a true identity change so the next
    account never inherits the previous one. Never an identifier: email, phone,
    wallet data, business name, address.
  - **Redaction is enforced, not trusted.** `sanitizeProps` (client and server)
    allows only primitives, drops any content/identifier/secret key, truncates
    long strings, warns in dev, never throws. Intent events carry
    `intent_type` / `category` / `has_*` booleans — never the message string.
  - **One Amplitude project + `environment` property** (`development | staging |
production`) + an `is_test` flag (operator-set `localStorage` key /
    `?intra_test=1`; server side, any `[DEMO SEED]` business). Local dev is
    **disabled unless** `NEXT_PUBLIC_AMPLITUDE_API_KEY` is set locally.
  - **No separate consent gate for the pilot.** Analytics initialises with the
    app, as web push and the service worker already do. Proportionate for a
    controlled pilot: opaque device/business ids only, no PII, no raw
    conversation text, autocapture narrowed. Revisit before any non-pilot / EU
    rollout — deferred-init for a consent gate is available in the SDK.
  - **The operator scorecard** (`scorecard.ts`, on `/api/pilot/funnel`) stays
    operational-truth: every figure a genuine `COUNT` from `audit_events`, `0`
    never an estimate, works with no analytics key. Amplitude-side dashboards,
    funnels and cohorts are documented in `docs/ANALYTICS.md` as a build list
    for Victor.
- **Consequences:** new dep `@amplitude/analytics-browser`. New module
  `src/features/analytics/{events,properties,config,identity,client,
AnalyticsProvider,AnalyticsBusinessIdentity,useAnalytics,forward,server,
scorecard}`. New `NEXT_PUBLIC_AMPLITUDE_API_KEY` (client) and `AMPLITUDE_API_KEY`
  (server-only) — both optional, the layer degrades to a no-op without them.
  `src/app/layout.tsx` mounts `<AnalyticsProvider />`; `.eslintrc.json` gains
  the import ban; `/api/pilot/funnel` now returns `{ funnel, scorecard }`;
  `/api/businesses/quick-start` adds `business.id` to its response.
  `pilot.ts` and the whole attestation / payments / economic path are untouched.
  **Amplitude-UI verification (events queryable, dashboards built) is Victor's —
  see `docs/ANALYTICS.md`.**
- **Requirements:** M9.5 §1–§55; CLAUDE.md §4.1 (no fabricated data — analytics
  is behavioural metadata, never presented as merchant/payment evidence), §4.2
  (no prohibited sensitive data — enforced by `sanitizeProps`), §5 (engineering
  standards), §6.1 (`.eslintrc.json` + `layout.tsx` changed, justified), §6.2
  (new package, phase started).

---

## ADR-022 — Visual system moves to a warm editorial palette (supersedes ADR-009's direction)

- **Date:** 2026-09-07
- **Status:** Accepted (supersedes the palette in [ADR-009](#adr-009--calm-clinic-visual-system-ease-health-reference))
- **Context:** The "calm clinic" forest-green system (ADR-009) read as clinical
  and product-generic for what Intra actually is — an approachable way for
  students and small-business owners to get real work done. Ahead of the M10
  pilot the visual direction was reworked toward a warm editorial workspace
  (Claude-style reference): calm ivory canvas, ink-dark actions, a serif display
  face used with restraint, generous whitespace, warm hairline borders.
- **Decision:** Re-point every token in `src/styles/tokens.css` to the new
  palette — canvas `#faf9f5`, white surfaces, warm near-black text `#141413`,
  **ink `#1f1e1d` as the single action colour** (replacing forest green
  `#0f3e17`), adjusted status washes, larger radii (10 / 16 / 24px), a wider
  `--container-max` (72rem), a larger display step. `src/styles/globals.css`
  gains three component utilities — `.eyebrow` (uppercase kicker), `.page-enter`
  (staggered rise-in, **guarded by `prefers-reduced-motion`**), `.interactive-card`
  (hover lift) — plus a faint radial-gradient page background and `::selection`
  tint. The public surfaces (`/`, `/agent`, `/request`, `/supplier/onboard`,
  `Header`, `Footer`, `MainContainer`) are rebuilt on the new system; a sticky
  header with a reduced public nav (`Home`, `For businesses`, `Docs` + a
  "Join as a business" CTA) keeps operator-only routes (`/activity`,
  `/operator`, `/evidence`) out of the marketing chrome.
- **Consequences:** every token-driven component picks up the new palette
  automatically; internal pages not yet re-laid-out (`TaskPage`, supplier
  workspace, operator, activity, evidence, docs) inherit the colours cleanly but
  keep their old spacing/heading rhythm until re-touched — a follow-up, not a
  regression. `Header.test.tsx` updated for the reduced nav. What ADR-009 keeps:
  light-first (no dark mode), flat surfaces (no drop shadows), status colours
  always paired with an icon + label, system font stacks (no web-font fetch),
  accessibility mandates (`NFR-A11Y-001`, `NFR-UX-001`).
- **Requirements:** `NFR-UX-001`, `NFR-A11Y-001`, PRD §7; CLAUDE.md §6.1
  (`src/styles/` tokens are load-bearing — this is a deliberate, documented
  full-system change).

---

## ADR-023 — Buyer order payment via MiniPay (on-chain, non-custodial, human-approved, additive)

- **Date:** 2026-09-07
- **Status:** Accepted (code-complete; one real MiniPay transaction pending — see
  `docs/PAYMENTS.md` live-test runbook)
- **Context:** Until now Intra had **no** buyer→business order settlement
  anywhere — a buyer accepts a quote, gets a pre-filled WhatsApp message, and
  pays the business off-platform (BR-001, ADR-003). The only `payments` code is
  the never-configured x402 _agent query fee_. M10.5 adds an on-chain payment
  path **through Intra's own UI**, settled in [MiniPay](https://www.opera.com/products/minipay)
  (Opera's non-custodial Celo wallet), as a distribution channel — MiniPay is a
  **payment surface, not** the product, the agent, or a source of truth.
- **Decision:** A new deterministic module `src/features/payments/order/`
  (server) + `src/features/payments/minipay/` (client). A payment **intent** is
  born **only** from `createOrderPaymentIntent`, which requires
  `task.status === "HANDOFF_READY"` (the buyer already approved the commercial
  terms) and reads recipient / amount / asset **exclusively** from the accepted
  `commitments` row. The buyer's wallet builds an ERC-20 `transfer` over the
  project's `viem` stack (no ethers, no wagmi) and returns a tx hash — the
  **only** value the client submits. `verifyOrderPayment` reads the real Celo
  receipt server-side and only reaches `CONFIRMED` when chain, success, the USDC
  `to`, and a single Transfer to the intent's recipient for the intent's exact
  amount all match. The path is **additive** — the WhatsApp handoff stays the
  fallback and nothing gates on payment.
  - **USDC only** for the pilot (6 dp, address already in `adapter/networks.ts`).
  - **NGN quotes + a real NGN→USD reference rate** (`NGN_USD_RATE_URL`, default
    the keyless `open.er-api.com`), locked into the intent and always shown with
    its source + timestamp. Source down ⇒ `503`, never a guessed rate (§16).
  - **Intent immutable** after creation; a terms change (`quotes/revision.ts`,
    `tasks/exception-service.ts`) invalidates it and a fresh human approval is
    required.
  - **The agent boundary holds:** `payWithMiniPay` is **not** an LLM tool; the
    controller is a plain module; `MODEL_TOOLS` is untouched (§3).
  - **Server-side verification is mandatory** — the server never trusts a client
    "success" (§18). Replay is blocked by a `UNIQUE` `tx_hash`, the controller's
    `TX_ALREADY_USED`, and `matchReceipt`'s recipient+amount binding.
  - **No EAS schema change** (§28): the commitment attestation was already
    written at accept time with `buyer: zero`; the settlement `txHash` lives only
    in `order_payments` + the evidence trace. The **handover** attestation
    (written later) picks up the real payer via `commitment.buyerAddress`, which
    already flows into `encodeHandoverData({ buyer })` — no schema touched.
  - **Product analytics** gains 11 events (`payment_method_viewed` →
    `payment_confirmed` funnel), 3 forwarded server-side; a throwing analytics
    arm cannot fail settlement (`safeForward`, tested).
- **Consequences:** new migration `0011_*` (`order_payments` table + enum,
  `tx_hash` unique, partial-unique live-intent-per-commitment index). New
  server-only env `NGN_USD_RATE_URL` (no secret). `getTaskView` gains
  `orderPayment`; `TaskPage` renders `PayPanel` before the handoff card;
  `evidence/trace.ts` gains an `orderPayment` section + two consistency checks;
  `notifications/catalogue.ts` gains 4 events; `analytics/events.ts` gains 11.
  `viem` was already admitted (ADR-018) — no new chain library. The real
  end-to-end MiniPay transaction (§41) needs Victor's phone + a funded wallet + a
  real SME and happens during the M10 pilot; deterministic tests with a fake
  receipt client cover every branch.
- **Requirements:** M10.5 §1–§54; CLAUDE.md §4.1 (no fabricated payment / hash /
  settlement — `CONFIRMED` only on a real receipt), §4.2 (no prohibited data —
  only a public `0x` address and a `tx_hash` are stored, no signature or key),
  §4.3 (human approval preserved — commercial _and_ wallet approval stay
  separate and manual), §6.2 (x402 phase already started; `viem` already
  admitted), BR-001 (Intra is evaluator, never custodian — the transfer is
  wallet→business direct).

---

## ADR-025 — Stateful buyer conversation: durable canonical intent, deterministic-first with a bounded Haiku fallback

- **Date:** 2026-09-13
- **Status:** Accepted (M10.4; extends ADR-019 — no new model provider, no new
  agent framework)
- **Context:** A real conversation ("Pastries for an event" → "cakes") looped
  on a generic reply forever. Root cause was a vocabulary gap in
  `extract.ts`'s `CATEGORY_KEYWORDS` (fixed directly — bakery words added to
  the `food` regex), **not** a state-tracking gap: `mergeUserIntent`
  (`memory.ts`) already accumulated a brief correctly across turns before this
  milestone. Two real gaps remained: (1) the deterministic keyword lists can
  never cover every phrasing, and nothing existed to interpret an unrecognised
  word without inventing a category; (2) conversation state lived in a
  `globalThis` Map — non-persistent by CLAUDE.md §4.4's original design, but a
  genuine liability once a request can land on a fresh serverless instance
  with no memory of the last one (the same class of bug already hit once in
  `run/service.ts`, phase D).
- **Decision:**
  - **`UserIntent` stays the one canonical state.** No competing model was
    introduced. `mergeUserIntent` keeps its "later explicit value wins,
    absent field untouched" rule and now additionally returns `corrected` — the
    strict subset of changed fields that overwrote an already-defined value —
    so a contradiction is detected and reported, never silently combined,
    without changing what the merge actually does.
  - **Conversation state moved into the same Postgres/PGlite database as
    everything else** (one new table, `conversation_sessions`: `sessionId`
    primary key, `intent` jsonb, `turns` jsonb capped at 40, timestamps). No
    Redis, no vector store, no second database. No separate summary column —
    a compact summary is derived on read from the existing `summariseIntent()`
    rather than persisting a redundant second copy of the same information.
    `src/features/intent/repository.ts` is the storage backend;
    `src/features/intent/memory.ts` keeps the staleness (1h TTL) and turn-cap
    rules on top of it, unchanged in effect from the in-memory version it
    replaces.
  - **Deterministic extraction still runs first, always, unmodified in
    contract.** `classify.ts` / `extract.ts` keep their pure, synchronous
    signatures — a decision made explicitly to avoid rewriting 100+ passing
    unit tests for a component that was never the bug.
  - **The Haiku fallback is a new, narrow, additive path** —
    `src/features/intent/assist.ts` + `src/features/intent/model/{schema,prompt}.ts`
    — reusing ADR-019's existing provider plumbing verbatim
    (`resolveModelProvider`, `ModelProvider.generate`, `DEFAULT_MODEL_LIMITS`,
    forced-tool-call JSON validation, the same `claude-haiku-4-5-20251001`
    default). A new `ModelPurpose` value (`classify_conversation`) was added to
    the existing closed union; no new env var, no new provider, no agent
    framework. It is called **only** when the deterministic layer found no
    category at all — from any of its three distinct "I don't know" shapes
    (a bare unrecognised word, a request/price phrase naming nothing
    recognised, or a discovery/comparison phrase `resolveDomain` rejects) —
    and never once a category is already known, so a brief in progress never
    reaches the model. On any failure (no provider, timeout, bad JSON, schema
    mismatch, an "unclear" classification) it returns `null` and the caller's
    existing deterministic reply is the answer, unchanged from before this
    milestone.
  - **The model never decides domain truth.** It returns, at most, a
    `category` (constrained by a Zod enum built from `domain.ts`'s own
    registry, never a second hand-written list) and a `service` string.
    `routeReading` and `resolveDomain` — both untouched — are the only code
    that decides availability, eligibility, or what happens next. The prompt
    context is deliberately compact: the accumulated `UserIntent`, its
    existing one-line `summariseIntent()` summary, and the last 4 turns —
    never the full transcript, so a long conversation never grows the prompt.
- **Consequences:** New migration `0013_*` (`conversation_sessions`).
  `handleConversationTurn` / `resetConversation` / `getConversation` /
  `recordTurn` / `clearConversation` are now `async` and take `db` as their
  first argument, matching every other repository-backed feature in the repo;
  `POST /api/conversation` threads its existing `db` through instead of
  resolving a second one. `conversation.test.ts` and `memory.test.ts` became
  integration tests against a fresh embedded PGlite per test (the same
  pattern every other DB-backed test already uses) rather than unit tests
  against a `globalThis` map; behaviour asserted is identical plus the new
  `corrected` field and the assisted-fallback scenarios.
- **Requirements:** milestone 10.4 §1–§15; CLAUDE.md §4.1 (no invented
  category, price, or provider), §6.2 (Anthropic-only, no new provider, no
  agent framework — upheld), ADR-019 (upheld, extended with one new
  `ModelPurpose`).
