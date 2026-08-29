# Intra API (MVP backend)

Implements the routes in `docs/TECHNICAL_SPEC.md` §4. All responses use the
envelope `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message", "details? } }`.

## Conventions

| Concern                  | Rule                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content type             | `application/json`                                                                                                                                                                    |
| Writes (`POST`, `PATCH`) | require an **`Idempotency-Key`** header (8–200 chars). Repeat with the same key + body → the stored response is replayed; same key + different body → `409 IDEMPOTENCY_KEY_CONFLICT`. |
| Buyer identity           | opaque **`x-session-id`** header (≥ 8 chars). A task is readable/submittable only by its own session. No account, no wallet login.                                                    |
| Operator identity        | **`x-operator-key`** header matching an `OPERATOR_API_KEYS` entry. Required to activate a route and to record a quote.                                                                |
| Money                    | amounts are strings (Postgres `numeric`) to preserve precision.                                                                                                                       |
| Prohibited data          | no endpoint accepts or returns a private key, seed phrase, password, BVN/NIN, card, or bank credential. Wallet values are public addresses only.                                      |

## Endpoints

### `POST /api/businesses` → 201

Body: the onboarding payload (`businessName`, `contactName`,
`contactChannelType`, `contactChannelValue`, `category`, `city`, `country`,
`quoteCurrency`, `payoutAddress`, `consentToQuoteDisplay: true`). Creates a
business in `PENDING_VERIFICATION` with `consentAt` set. `409 BUSINESS_EXISTS`
on a duplicate slug.

### `POST /api/businesses/:slug/routes` → 201

Body: `{ "templateId"?: string }` (defaults to the business category's
template). Creates a `DRAFT` quote route. `409 ROUTE_EXISTS` if the business
already has that route.

### `PATCH /api/routes/:id/status` → 200

Body: `{ "status": "DRAFT" | "PENDING_VERIFICATION" | "ACTIVE" | "PAUSED" | "ARCHIVED" }`.
Enforces the lifecycle graph
(`DRAFT → PENDING_VERIFICATION → ACTIVE ⇄ PAUSED`, any → `ARCHIVED`).
Moving to **`ACTIVE`** requires a valid operator key, a consenting business, and
a complete route; it stamps `verifiedAt` and marks the business
operator-verified. `409 INVALID_ROUTE_TRANSITION` / `401 OPERATOR_REQUIRED` /
`409 CONSENT_MISSING` otherwise.

### `POST /api/tasks` → 201

Headers: `x-session-id`. Body: `{ freeText?, structuredInput?, buyerWalletOptIn?,
route?: { routeId } | { businessSlug, routeSlug } }`. Creates a `DRAFT` task. If
a route is referenced it must be `ACTIVE`, else `409 ROUTE_UNAVAILABLE`.

### `POST /api/tasks/:id/submit` → 200

Headers: `x-session-id`. Validates the flyer brief
(`size`, `quantity`, `colour`, `deadline`, `deliveryArea`) — `422
INCOMPLETE_BRIEF` with the missing fields if not. Re-checks the bound route: if
it is no longer `ACTIVE`, the task moves to `FAILED` and the call returns
`409 ROUTE_UNAVAILABLE` (no payment request is issued). On success the task
moves `SUBMITTED → AWAITING_QUOTE` and an `UNAVAILABLE` service-payment row is
recorded (no x402 access yet).

### `GET /api/tasks/:id` → 200

Headers: `x-session-id` (must match). Returns
`{ task, quotes, payments, recommendation, feedback, timeline }` where
`timeline` is the ordered audit trail. `403 FORBIDDEN` on a session mismatch.

### `POST /api/routes/:id/quotes` → 201

Headers: `x-operator-key`. Body: `{ taskId, amountMin, amountMax?, turnaround,
assumptions?, confidence?, fixed?, expiresAt? }`. The route must be `ACTIVE`
(`409 ROUTE_UNAVAILABLE` otherwise — no quote, no payment). Creates the quote,
builds a `Recommendation` with a **pre-filled WhatsApp order message that is
never sent**, and moves the task `AWAITING_QUOTE → RECOMMENDED → HANDOFF_READY`.
`409 QUOTE_EXISTS` on a second quote for the same task.

### `POST /api/feedback` → 201

Body: `{ taskId, useful: boolean, comment? }`. `404 TASK_NOT_FOUND` if the task
does not exist.

## Not exposed yet

- `POST /api/payments/x402/callback` and the agent-side paid quote route
  (`/v1/:businessSlug/:routeSlug/quote`) arrive with the payment phase and real
  facilitator credentials (`docs/DECISIONS.md` ADR-004). Until then every
  service payment is `UNAVAILABLE` and no settlement is fabricated.
- `POST /api/operator/metrics` (adoption export) — later phase.
