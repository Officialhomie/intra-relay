# Intra — Technical Specification

**Companion:** `docs/PRD.md`  
**Status:** Architecture decision record for the hackathon MVP

## 1. Architecture

Intra is one TypeScript/Next.js web application with a server-side API and responsive mobile-first UI. The initial supplier integration is REST plus a structured route schema—not MCP. A future MCP adapter will expose the same active route data without changing supplier onboarding.

```text
Buyer UI ────────┐
Supplier UI ─────┼── Intra API ── Postgres
Operator UI ─────┘     │
                       ├── Celo RPC + attribution verification
                       ├── x402 facilitator / `buy` (conditional)
                       └── WhatsApp order deep link
```

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| App/UI | Existing Next.js 15 + TypeScript + Tailwind scaffold | already validated, mobile-ready base |
| Validation | Zod | shared client/server schemas |
| Persistence | Postgres with Prisma or Drizzle | auditable relational data |
| Sessions | secure passwordless/operator sessions | suppliers should not need wallet login initially |
| Celo client | viem | Celo and fee-currency support |
| Agent | provider-neutral server tool adapter | avoid framework lock-in |
| Payments | official x402 facilitator / `buy` only after access | verifiable settlement |

## 3. Modules

| Module | Responsibility |
|---|---|
| `features/tasks` | buyer task validation/lifecycle |
| `features/businesses` | supplier onboarding and consent |
| `features/routes` | quote schemas and route lifecycle |
| `features/quotes` | quote issuance, expiry, recommendation inputs |
| `features/agent` | bounded route selection and rationale |
| `features/payments` | 402 handling, callback verification, immutable receipts |
| `lib/celo` | RPC, attribution tag, mainnet confirmation helpers |
| `features/analytics` | privacy-minimised adoption metrics |

## 4. API contract

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/tasks` | create draft buyer task |
| POST | `/api/tasks/:id/submit` | validate and process task |
| GET | `/api/tasks/:id` | task, quotes, payments, recommendation |
| POST | `/api/businesses` | onboard supplier business |
| POST | `/api/businesses/:slug/routes` | create route |
| PATCH | `/api/routes/:id/status` | safe lifecycle change |
| POST | `/api/routes/:id/quotes` | operator/supplier quote response |
| POST | `/v1/:businessSlug/:routeSlug/quote` | agent-accessible paid quote route |
| POST | `/api/payments/x402/callback` | authenticated, idempotent settlement callback |
| POST | `/api/feedback` | buyer feedback |
| GET | `/api/operator/metrics` | operator evidence export |

### x402 contract rules

- Without payment, a verified active route returns the facilitator-provided 402 payload.
- `X-PAYMENT` is verified by the official facilitator, never by a browser-side boolean.
- Successful response requires confirmed settlement and a stored transaction hash.
- With no configured access, return `503 PAYMENT_SERVICE_UNAVAILABLE`; do not create a fake receipt.

## 5. Persistence and invariants

```text
businesses 1──* quote_routes 1──* quotes
tasks      1──* quotes
tasks      1──* service_payments
tasks      1──1 recommendation
tasks      1──* feedback
```

- `service_payments.tx_hash` is unique when present.
- Only verified routes may be active.
- Only `SETTLED` payments render as paid.
- One active recommendation per task.
- Wallet private-key material is never persisted.

## 6. Security and operations

- Place RPC/facilitator secrets only in deployment environment variables.
- Enforce task budget server-side; browser never controls it.
- Verify callback authentication/signatures before payment-state mutation.
- Use idempotency keys for submissions, callbacks, and quotes.
- Do not log payment-authorisation contents.
- Rate-limit public API/onboarding endpoints; audit operator actions.
- Required environment variables: database URL, session secret, Celo RPC URL, operator allowlist, agent-wallet reference. Facilitator URL/credential and attribution tag are added only after official issuance.

## 7. Test strategy

- Unit: Zod schemas, lifecycle transitions, budget policy, order-message formatter.
- Integration: task → route → 402 → verified callback → recommendation.
- Contract: official facilitator fixtures after access is granted.
- E2E: mobile buyer task, supplier onboarding, route activation, WhatsApp handoff.
- Mainnet: one low-value genuine settlement only after registration and tag setup.
