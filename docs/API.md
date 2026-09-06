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
handoffConfirmedAt, proofline }`. `403 FORBIDDEN` on a session mismatch.

- `task` carries the lifecycle timestamps: `submittedAt`, `quotedAt`,
  `buyerDecidedAt`, `handoffConfirmedAt`, `closedAt`, plus `buyerDecision`
  (`"ACCEPTED" | "DECLINED" | null`) and `buyerDeclineReason`.
- `route` carries freshness (`priceUpdatedAt`, `verifiedAt`, SLA).
- `supplier` is `null` until a quote exists. From `RECOMMENDED` it carries
  `{ name, city, country }`; `contactChannelType` / `contactChannelValue` stay
  `null` until the buyer accepts (`HANDOFF_READY`).
- `quotes[]` each carry `effectiveStatus` — the stored `status` unless a
  `RECEIVED` quote is past `expiresAt`, in which case `"EXPIRED"` (read-time).
- `recommendation` (present from `RECOMMENDED`, `null` on a supplier decline)
  carries `rationale`, the never-sent `orderMessage`, and read-time
  `reasoning[]`, `uncertainties[]`, `verificationNote`, `quoteExpired`, and
  `normalized` (`totalMin/Max` incl. delivery, per-flyer `unitPriceMin/Max`,
  parsed `turnaround`, `assumptions[]`).
- `handoffConfirmedAt` is the ISO time the buyer confirmed they sent the
  message, or `null`.
- `proofline` is `null` until the handoff is confirmed, then carries the
  Proofline pilot evidence (`disclaimer`, `evidenceStatus`, `readyForPickupAt`,
  `pickupConfirmedAt`, `pickupConfirmedBy`, `events[]`). Never the pickup code.

### `POST /api/tasks/:id/decision` → 200

Headers: `x-session-id` (must match), `Idempotency-Key`. The buyer's explicit
choice on the quote in front of them. Requires task status `RECOMMENDED`
(`409 TASK_NOT_AWAITING_DECISION` otherwise). Body:

- **`{ "decision": "ACCEPT" }`** — task `RECOMMENDED → HANDOFF_READY`; audits
  `task.buyer_accepted` then `task.handoff_ready`; the supplier contact and the
  WhatsApp message become visible. If the quote's `expiresAt` has passed the
  quote is marked `EXPIRED` (audit `quote.expired`) and the message gains a
  "reconfirm the price" line — acceptance is still allowed.
- **`{ "decision": "DECLINE", "reason"?: string }`** — task
  `RECOMMENDED → CANCELLED`; audit `task.buyer_declined` (the reason is stored on
  the task, not in the audit payload). Nothing is ordered.

Intra never sends the message or places the order. A repeat with the same key
replays; a fresh key after the task has left `RECOMMENDED` returns
`409 TASK_NOT_AWAITING_DECISION`. `400` on an invalid `decision`.

### `POST /api/tasks/:id/handoff-confirm` → 200

Headers: `x-session-id` (must match), `Idempotency-Key`. The buyer confirms they
have sent the pre-filled message to the printer. Requires task status
`HANDOFF_READY` (`409 HANDOFF_NOT_READY` otherwise). Sets `task.handoffConfirmedAt`,
appends a content-free `task.handoff_confirmed` audit event, and unlocks the
feedback form. Idempotent — a repeat returns the first `handoffConfirmedAt`. No
task status change.

### Proofline pilot — fulfilment evidence

Two optional events **after** a confirmed handoff (`FR-PROOF-*`, ADR-016).
Both are **operational evidence** — every response carries a `data.view.disclaimer`
saying so. Not a payment, not settlement, not a proof, no reliability score.
`GET /api/tasks/:id` includes `proofline` (see above) once the handoff is
confirmed; it never contains the pickup code.

#### `POST /api/tasks/:id/proofline/ready` → 201

Merchant records the job is ready for pickup. Headers: `x-manage-token` (the
route's business manage token) + `Idempotency-Key`.

- `401 PROOFLINE_MERCHANT_AUTH_REQUIRED` — missing / wrong manage token.
- `409 HANDOFF_NOT_CONFIRMED` — the buyer has not confirmed the handoff yet.
- `409 ALREADY_MARKED_READY` — a `READY_FOR_PICKUP` event already exists.
- `404 TASK_NOT_FOUND`.
- On success: `data = { view, pickupCode }`. `pickupCode` is a 6-char code the
  merchant reads to the buyer; it is returned here (and replayed for the same
  Idempotency-Key) but never on any buyer-facing surface. Audit
  `proofline.ready_for_pickup`.

#### `POST /api/tasks/:id/proofline/confirm-pickup` → 201

Buyer confirms collection. Headers: `Idempotency-Key`, and `x-session-id` for the
signed-in path. Body: `{ "code"?: string }`.

- Accepted if the `x-session-id` matches the task's session (`method:
"buyer_session"`) **or** `code` matches the pickup code (`method:
"one_time_code"`, case-insensitive).
- `409 NOT_READY_FOR_PICKUP` — the merchant has not marked it ready.
- `409 PICKUP_ALREADY_CONFIRMED` — replay.
- `401 PICKUP_CONFIRM_REJECTED` — neither a matching session nor a valid code.
- `404 TASK_NOT_FOUND`.
- On success: `data = { view, method }`. Audit `proofline.pickup_confirmed`.

`view` shape: `{ disclaimer, evidenceStatus: "NOT_STARTED" |
"MERCHANT_MARKED_READY" | "BUYER_CONFIRMED_PICKUP", readyForPickupAt,
pickupConfirmedAt, pickupConfirmedBy, events: [{ type, actorRole,
confirmationMethod, evidenceStatus, at }] }`.

### `POST /api/routes/:id/quotes` → 201 (quote) / 200 (decline)

Headers: operator key **or** the business manage token — else
`401 SUPPLIER_AUTH_REQUIRED`. The route must be `ACTIVE` (`409 ROUTE_UNAVAILABLE`
otherwise — no quote, no payment).

- **Quote:** `{ taskId, amountMin, amountMax?, deliveryCharge?, turnaround,
availabilityNote?, assumptions?, confidence?, fixed?, expiresAt? }`. Builds a
  `Recommendation` with a **pre-filled WhatsApp order message that is never
  sent** and moves the task `AWAITING_QUOTE → RECOMMENDED` (stamping
  `quotedAt`). It stops there — the buyer must accept via
  `POST /api/tasks/:id/decision` before it reaches `HANDOFF_READY`.
  `409 QUOTE_EXISTS` on a second response for the same task.
- **Decline:** `{ decline: true, taskId, reason }`. Records a `DECLINED` quote
  and moves the task to `FAILED` (`failureReason: "SUPPLIER_DECLINED"`,
  `quotedAt` + `closedAt` stamped).

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
