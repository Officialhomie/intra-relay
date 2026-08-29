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
- **Status:** Accepted
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
