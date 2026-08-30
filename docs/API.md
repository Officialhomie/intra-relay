# Intra API (MVP backend)

Implements the routes in `docs/TECHNICAL_SPEC.md` §4. All responses use the
envelope `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message", "details? } }`.

## Conventions

| Concern                  | Rule                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content type             | `application/json`                                                                                                                                                                                                                  |
| Writes (`POST`, `PATCH`) | require an **`Idempotency-Key`** header (8–200 chars). Repeat with the same key + body → the stored response is replayed; same key + different body → `409 IDEMPOTENCY_KEY_CONFLICT`.                                               |
| Buyer identity           | opaque **`x-session-id`** header (≥ 8 chars). A task is readable/submittable only by its own session. No account, no wallet login.                                                                                                  |
| Operator identity        | **`x-operator-key`** header matching an `OPERATOR_API_KEYS` entry. Required to activate/reactivate a route and to read the operator queue.                                                                                          |
| Supplier identity        | **`x-manage-token`** header matching a business's `manageToken` (ADR-008). Authorises fail-safe supplier actions on that business only: pause a route, submit for review, respond to / decline its requests. Never a wallet secret. |
| Money                    | amounts are strings (Postgres `numeric`) to preserve precision.                                                                                                                                                                     |
| Prohibited data          | no endpoint accepts or returns a private key, seed phrase, password, BVN/NIN, card, or bank credential. Wallet values are public addresses only.                                                                                    |

## Endpoints

### `POST /api/businesses` → 201

Body: the onboarding payload (`businessName`, `contactName`,
`contactChannelType`, `contactChannelValue`, `category`, `city`, `country`,
`quoteCurrency`, `payoutAddress`, `consentToQuoteDisplay: true`). Creates a
business in `PENDING_VERIFICATION` with `consentAt` set. The response includes a
one-time **`manageToken`** — hand the supplier `…/supplier/<slug>/review?t=<manageToken>`.
`409 BUSINESS_EXISTS` on a duplicate slug.

### `POST /api/businesses/:slug/routes` → 201

Body: `{ "templateId"?: string }` (defaults to the business category's
template). Creates a `DRAFT` quote route. `409 ROUTE_EXISTS` if the business
already has that route.

### `PATCH /api/routes/:id/status` → 200

Body: `{ "status": …, "checklist"?: {…} }`. Enforces the lifecycle graph
(`DRAFT → PENDING_VERIFICATION → ACTIVE ⇄ PAUSED`, any → `ARCHIVED`).

- **`PAUSED`** / **`DRAFT → PENDING_VERIFICATION`**: operator key **or** the
  business manage token (`x-manage-token`).
- **`ACTIVE`** (incl. reactivating a paused route): operator key only, plus a
  `checklist` with all six checks `true` — `consentRecorded`,
  `contactChannelTested`, `publicAddressVerified`, `priceSourceDated`,
  `slaAgreed`, `sampleRequestTested`. Stamps `verifiedAt`, `priceUpdatedAt`,
  the checklist, and marks the business operator-verified.
- Errors: `409 INVALID_ROUTE_TRANSITION`, `401 OPERATOR_REQUIRED`,
  `409 CHECKLIST_INCOMPLETE`, `409 CONSENT_MISSING`.

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
`{ task, route, supplier, quotes, payments, recommendation, feedback, timeline,
handoffConfirmedAt }`. `route` carries freshness (`priceUpdatedAt`,
`verifiedAt`, SLA). `supplier` (name + contact channel + city) is `null` until a
recommendation exists. `handoffConfirmedAt` is the ISO time the buyer confirmed
they sent the message, or `null`. `403 FORBIDDEN` on a session mismatch.

### `POST /api/tasks/:id/handoff-confirm` → 200

Headers: `x-session-id` (must match), `Idempotency-Key`. The buyer confirms they
have sent the pre-filled message to the printer. Requires task status
`HANDOFF_READY` (`409 HANDOFF_NOT_READY` otherwise). Appends a content-free
`task.handoff_confirmed` audit event and unlocks the feedback form. Idempotent —
a repeat returns the first `handoffConfirmedAt`. No task status change.

### `POST /api/routes/:id/quotes` → 201 (quote) / 200 (decline)

Headers: operator key **or** the business manage token — else
`401 SUPPLIER_AUTH_REQUIRED`. The route must be `ACTIVE` (`409 ROUTE_UNAVAILABLE`
otherwise — no quote, no payment).

- **Quote:** `{ taskId, amountMin, amountMax?, deliveryCharge?, turnaround,
availabilityNote?, assumptions?, confidence?, fixed?, expiresAt? }`. Builds a
  `Recommendation` with a **pre-filled WhatsApp order message that is never
  sent**; moves the task `AWAITING_QUOTE → RECOMMENDED → HANDOFF_READY`.
  `409 QUOTE_EXISTS` on a second response for the same task.
- **Decline:** `{ decline: true, taskId, reason }`. Records a `DECLINED` quote
  and moves the task to `FAILED` (`failureReason: "SUPPLIER_DECLINED"`).

### `POST /api/feedback` → 201

Body: `{ taskId, useful: boolean, comment? }`. `404 TASK_NOT_FOUND` if the task
does not exist.

### `GET /api/operator/routes` → 200

Headers: `x-operator-key` (`401 OPERATOR_REQUIRED` otherwise). The operator
review queue: every non-archived route with its business.

### `GET /api/routes/active` → 200

Public. ACTIVE routes a buyer can send a request to
(`?routeSlug=flyer-printing` by default).

### `GET /api/evidence` → 200

Public. Privacy-minimised experiment tracking (MET-001, ADR-013): aggregates on
read from existing tables — no analytics store, no session ids, no task content.
`?format=csv` streams a `scope,section,metric,value` spreadsheet; the default and
`?format=json` return the full report with separate `real` and `demo` scopes,
integration statuses, and the feedback changelog. Rendered at `/evidence`.

### `GET /api/operator/metrics` → 200

Headers: `x-operator-key` (`401 OPERATOR_REQUIRED` otherwise). The same report as
`/api/evidence` plus `recentEvents` — a content-free feed of the last 25 audit
events (type + timestamp only). `?format=csv` supported. Rendered in the
`/operator` **Metrics** tab.

## Public capability API (`/v1`)

The agent-readable REST surface — `GET /v1/:businessSlug/capabilities` and
`POST /v1/:businessSlug/:routeSlug/quote` — is documented separately in
[`docs/CAPABILITY_API.md`](CAPABILITY_API.md).

## Not exposed yet

- `POST /api/payments/x402/callback` and the real x402 402 → authorise → settle
  flow (the `/v1` quote route currently returns `PAYMENT_SERVICE_UNAVAILABLE`
  for paid routes) arrive with the payment phase and real facilitator
  credentials (`docs/DECISIONS.md` ADR-004).
- `GET /v1/tasks/:id` (agent-side result read) and MCP — later.
