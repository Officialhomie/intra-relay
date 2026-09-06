# Intra Capability API (`/v1`)

Public, **agent-readable** REST. No authentication — an AI agent discovers a
business's quote routes and requests a quote. MCP is **not** implemented yet; a
future MCP adapter will expose the same route data without changing this API.

Responses use the standard envelope: `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message", "details? } }`.

No endpoint returns, and no code path fabricates, a 402 settlement, an
`X-PAYMENT` verification, a receipt, or a transaction hash (ADR-004).

---

## Capability Card contract

Each entry in `data.routes` is a **Capability Card** — the machine-readable
statement of one verified route. A card always states, for another agent:

| Field                         | Meaning                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `name`, `description`         | what the verified printer can do                                                                 |
| `inputSchema`                 | the required (and optional) request fields                                                       |
| `status`                      | route lifecycle status (`DRAFT` … `ARCHIVED`) — **not** a usability verdict                      |
| `availability`                | whether the route accepts a quote request **right now** (`AVAILABLE` / `UNAVAILABLE` + `reason`) |
| `quoteSla`                    | response expectation — asynchronous, supplier replies within `responseWithinMinutes`             |
| `freshness`                   | when price/availability was last confirmed, when it goes stale, and the stale behaviour          |
| `stale`, `priceUpdatedAt`     | retained flat fields (same data as `freshness`)                                                  |
| `finalOrderPolicy`, `handoff` | final order needs buyer approval and a human-sent WhatsApp handoff                               |
| `orderContact`                | concrete order channel — **only** on a route whose `availability.state` is `AVAILABLE`           |
| `payment`                     | free vs. paid, the `$0.05` query-fee cap, and x402 facilitator state                             |

**An `ACTIVE` route with stale critical data is never silently presented as
current.** Its `status` stays `ACTIVE` but `availability.state` becomes
`UNAVAILABLE` with `reason: "STALE"`, `orderContact` is dropped, and the quote
endpoint returns `409 ROUTE_UNAVAILABLE`. `PAUSED`, `DRAFT`, and
`PENDING_VERIFICATION` routes report `reason: "NOT_ACTIVE"`; a route or business
that is not operator-verified reports `reason: "NOT_VERIFIED"`.

## `GET /v1/:businessSlug/capabilities` → 200

The capability document for a business and **all** of its quote routes (any
status). `Cache-Control: no-store` — route status can change at any time.
`404 BUSINESS_NOT_FOUND` for an unknown slug.

All values below are **clearly-marked demo data** — not a real merchant, address,
or endpoint.

```jsonc
{
  "success": true,
  "data": {
    "version": "0.2", // capability-document contract version
    "business": {
      "slug": "demo-campus-prints",
      "name": "Demo Campus Prints (sample)",
      "category": "printing",
      "location": { "city": "Lagos", "country": "Nigeria" },
      "operatorVerified": true,
    },
    "finalOrderPolicy": {
      "humanApprovalRequired": true,
      "whatsappHandoffRequired": true,
      "statement": "Intra never places the final order or moves buyer funds. …",
    },
    "routes": [
      {
        "slug": "flyer-printing",
        "name": "Flyer printing quote",
        "description": "A structured request for current flyer pricing, availability, and turnaround.",
        "status": "ACTIVE", // route lifecycle status
        "availability": {
          "state": "AVAILABLE", // "UNAVAILABLE" when not accepting quote requests
          "acceptingQuoteRequests": true,
          "reason": "OK", // OK | NOT_ACTIVE | NOT_VERIFIED | STALE
          "detail": "The route is active, operator-verified, and its price data is fresh. …",
        },
        "quoteSla": {
          "responseWithinMinutes": 30,
          "expectation": "No synchronous quote. A valid request is recorded and a supplier responds out of band, normally within responseWithinMinutes.",
        },
        "lastUpdatedAt": "2026-08-30T10:00:00.000Z",
        "priceUpdatedAt": "2026-08-30T09:55:00.000Z",
        "stale": false, // price data older than 14 days
        "freshness": {
          "priceConfirmedAt": "2026-08-30T09:55:00.000Z",
          "maxAgeDays": 14,
          "staleAfter": "2026-09-13T09:55:00.000Z",
          "stale": false,
          "behaviour": "Price/availability data must be reconfirmed by the supplier within maxAgeDays. Once staleAfter passes (or it was never confirmed) the route becomes UNAVAILABLE and the quote endpoint returns 409 ROUTE_UNAVAILABLE until it is refreshed.",
        },
        "endpoint": "/v1/demo-campus-prints/flyer-printing/quote",
        "quoteEndpoint": "/v1/demo-campus-prints/flyer-printing/quote",
        "inputSchema": {
          "type": "object",
          "fields": [
            {
              "key": "size",
              "label": "Paper size",
              "type": "string",
              "required": true,
              "example": "A5",
            },
            {
              "key": "quantity",
              "label": "Number of copies",
              "type": "string",
              "required": true,
              "example": "100",
            },
            {
              "key": "colour",
              "label": "Colour preference",
              "type": "string",
              "required": true,
              "example": "full-colour",
            },
            {
              "key": "deadline",
              "label": "Needed by",
              "type": "string",
              "required": true,
              "example": "Friday 3pm",
            },
            {
              "key": "deliveryArea",
              "label": "Delivery / pick-up area",
              "type": "string",
              "required": true,
              "example": "UNILAG main gate",
            },
          ],
        },
        "responseSchema": {
          "type": "object",
          "fields": [
            { "key": "status", "type": "string", "enum": ["RECEIVED", "DECLINED", "EXPIRED"] },
            { "key": "currency", "type": "string" },
            { "key": "amountMin", "type": "number" },
            { "key": "amountMax", "type": "number", "required": false },
            { "key": "deliveryCharge", "type": "number", "required": false },
            { "key": "fixed", "type": "boolean" },
            { "key": "turnaround", "type": "string" },
            { "key": "availabilityNote", "type": "string", "required": false },
            { "key": "assumptions", "type": "string", "required": false },
            {
              "key": "confidence",
              "type": "string",
              "enum": ["low", "medium", "high"],
              "required": false,
            },
            { "key": "expiresAt", "type": "string", "format": "date-time", "required": false },
            { "key": "declineReason", "type": "string", "required": false },
          ],
        },
        "payment": {
          "queryFeeUsd": 0.02,
          "maxFeeUsd": 0.05,
          "paid": true,
          "provider": "x402",
          "available": false,
          "state": "PAYMENT_SERVICE_UNAVAILABLE",
          "code": "NOT_CONFIGURED", // or "CONFIG_ERROR" if an X402_* value is invalid
          "outcomes": "200 SETTLED · 402 PAYMENT_REQUIRED (no X-PAYMENT) · 402 PAYMENT_FAILED (bad authorisation) · 503 PAYMENT_SERVICE_UNAVAILABLE · 503 PAYMENT_SETTLEMENT_INDETERMINATE",
          "note": "Paid route, but no x402 / cPay facilitator is configured. …",
        },
        "payoutAddress": "0x0000000000000000000000000000000000000001",
        "responseSlaMinutes": 30,
        "finalOrderPolicy": {
          "humanApprovalRequired": true,
          "whatsappHandoffRequired": true,
          "statement": "…",
        },
        "handoff": {
          "humanApprovalRequired": true,
          "channelType": "whatsapp",
          "mechanism": "Intra returns a pre-filled WhatsApp message with the quote. A human buyer reviews it, sends it to the supplier, and settles payment directly. No agent sends the message or pays the supplier.",
        },
        "orderContact": {
          // present ONLY while availability.state === "AVAILABLE"
          "channel": "whatsapp",
          "value": "+2348000000000", // demo number
          "note": "Order channel — a human sends the final order here. Intra never sends it.",
        },
      },
    ],
    "generatedAt": "2026-08-30T10:00:00.000Z",
  },
}
```

`orderContact` is **omitted** for any route that is not `AVAILABLE` (paused,
draft, pending verification, unverified, or stale). `handoff` is always present
and states the mechanism without a concrete contact value.

### Example — an `ACTIVE` route gone stale (demo data)

```jsonc
{
  "slug": "flyer-printing",
  "status": "ACTIVE",
  "availability": {
    "state": "UNAVAILABLE",
    "acceptingQuoteRequests": false,
    "reason": "STALE",
    "detail": "The route is ACTIVE but its price/availability data has not been reconfirmed within the freshness window, so it is explicitly unavailable until the supplier refreshes it. …",
  },
  "stale": true,
  "freshness": {
    "priceConfirmedAt": "2026-07-01T09:00:00.000Z",
    "maxAgeDays": 14,
    "staleAfter": "2026-07-15T09:00:00.000Z",
    "stale": true,
    "behaviour": "…",
  },
  // no `orderContact`
}
```

---

## `POST /v1/:businessSlug/:routeSlug/quote`

Headers: **`Idempotency-Key`** (8–200 chars) is required. A repeat with the same
key + body replays the first outcome exactly, including the created task id.

Body:

```jsonc
{
  "requester": "erc8004:0xYourAgentId", // optional; stored as the task session, never trusted for auth
  "input": {
    // route input fields (see capabilities.inputSchema)
    "size": "A5",
    "quantity": 250,
    "colour": "full-colour",
    "deadline": "Friday 3pm",
    "deliveryArea": "UNILAG main gate",
  },
}
```

Paid routes speak **Celo x402** — see [`docs/PAYMENTS.md`](PAYMENTS.md).
`X-PAYMENT: <base64 payment payload>` carries the signed EIP-3009 authorisation;
a settled response returns `X-PAYMENT-RESPONSE`.

### Outcomes

| Status  | `error.code` / `data`                                               | When                                                                                                                                                     | Side effects                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **404** | `BUSINESS_NOT_FOUND` / `ROUTE_NOT_FOUND`                            | unknown slug                                                                                                                                             | none                                                                                                                                                                                                                      |
| **409** | `ROUTE_UNAVAILABLE`                                                 | route is not `ACTIVE`, not operator-verified, or its price data is stale (> 14 days)                                                                     | **none — no task, no settlement**                                                                                                                                                                                         |
| **422** | `VALIDATION_FAILED`                                                 | a required input is missing or invalid                                                                                                                   | none — no task                                                                                                                                                                                                            |
| **402** | `PAYMENT_REQUIRED`                                                  | paid route, x402 configured, **no `X-PAYMENT`** — `details.accepts[0]` holds the x402 requirements, `details.maxFeeUsd` the $0.05 cap                    | audit `payment.challenge_issued`; **no task**                                                                                                                                                                             |
| **402** | `PAYMENT_FAILED`                                                    | `X-PAYMENT` present, authorisation **genuinely bad** — undecodable, over the $0.05 cap, `verify.isValid = false`, or an on-chain revert (`details.code`) | immutable `service_payments` row `FAILED`; audit `payment.failed`; **no task**. The agent may fix and retry with a fresh authorisation.                                                                                   |
| **200** | `data.outcome = "QUOTE_PENDING"`, `data.payment.status = "SETTLED"` | `X-PAYMENT` verified + settled on-chain                                                                                                                  | immutable `SETTLED` receipt (`txHash`, `network`, `explorerUrl`); audits `payment.settled` + `capability.quote_requested`; task `AWAITING_QUOTE`; `X-PAYMENT-RESPONSE` header                                             |
| **503** | `PAYMENT_SERVICE_UNAVAILABLE`                                       | no x402 key / an invalid `X402_*` config; **or** the facilitator was unreachable on `verify` (`details.retryable = true`, `details.code`)                | no-key path: `Task` (`AWAITING_QUOTE`) + `service_payments` `UNAVAILABLE`. verify-unreachable path: `service_payments` `UNAVAILABLE` (no `authorization_key`), **no task**.                                               |
| **503** | `PAYMENT_SETTLEMENT_INDETERMINATE`                                  | `verify` passed but `settle` timed out / returned no usable tx hash (`details.retryable = false`, `details.guidance`)                                    | immutable `service_payments` row `AUTHORISED` (`errorCode = SETTLE_INDETERMINATE`, **no tx hash**); audit `payment.indeterminate`; **no task**. Re-presenting the same `X-PAYMENT` returns this again — never re-settled. |
| **202** | `data.outcome = "AWAITING_QUOTE"`                                   | valid request on a **free** route (`queryFeeUsd === 0`)                                                                                                  | task + audit created                                                                                                                                                                                                      |

Never fabricated: a settlement, an `X-PAYMENT` verification, a receipt, or a
transaction hash. A `settle` timeout is claimed **neither** way.

**Idempotency:** the `Idempotency-Key` scope folds in a hash of the `X-PAYMENT`
header, so an agent can reuse the same key for the `402` probe and the paid
retry (the standard x402 pattern).

`PAYMENT_REQUIRED` body: `details = { x402Version, resource, accepts: [ { scheme:
"exact", network: "eip155:42220", asset, amount, payTo, maxTimeoutSeconds, extra
} ], maxFeeUsd: 0.05 }`.

`data.payment` on a `200`: `{ status: "SETTLED", provider, txHash, network,
assetSymbol, amountAtomic, explorerUrl }`.

`ROUTE_UNAVAILABLE` body:

```jsonc
{
  "success": false,
  "error": {
    "code": "ROUTE_UNAVAILABLE",
    "message": "This route cannot take a quote request right now.",
    "details": {
      "route": {
        "slug": "flyer-printing",
        "status": "PAUSED",
        "verified": true,
        "stale": false,
        "reason": "NOT_ACTIVE",
      },
      "payment": { "requested": false },
    },
  },
}
```

`VALIDATION_FAILED` body: `details.fieldErrors` is `{ "<field>": ["<message>"] }`.

`PAYMENT_SERVICE_UNAVAILABLE` body (no facilitator key — a `Task` is created):

```jsonc
{
  "success": false,
  "error": {
    "code": "PAYMENT_SERVICE_UNAVAILABLE",
    "message": "This is a paid route and no x402 / cPay facilitator is configured. No 402 was issued, no receipt or transaction exists.",
    "details": {
      "taskId": "…",
      "taskStatus": "AWAITING_QUOTE",
      "payment": {
        "status": "UNAVAILABLE",
        "queryFeeUsd": 0.02,
        "facilitator": null,
        "settlement": null,
        "txHash": null,
      },
    },
  },
}
```

When an `X-PAYMENT` was presented but the facilitator was unreachable on
`verify`, the body is `{ code: "PAYMENT_SERVICE_UNAVAILABLE", details: { code:
"VERIFY_REQUEST_FAILED", retryable: true, payment: { status: "UNAVAILABLE",
settlement: null, txHash: null } } }` and **no task** is created — retry once the
facilitator recovers.

`PAYMENT_SETTLEMENT_INDETERMINATE` body:

```jsonc
{
  "success": false,
  "error": {
    "code": "PAYMENT_SETTLEMENT_INDETERMINATE",
    "message": "Verification passed but the settlement outcome is unknown. Do not re-authorise — that could pay twice.",
    "details": {
      "code": "SETTLE_INDETERMINATE",
      "retryable": false,
      "guidance": "Do NOT retry with a new X-PAYMENT authorisation. Check the block explorer for a transfer from your payer address; if it landed, the query fee is already paid. Ask the route operator to reconcile.",
      "payment": { "status": "AUTHORISED", "settlement": "unknown", "txHash": null },
    },
  },
}
```

### Notes

- **Staleness**: a route's price data must have been confirmed within
  `PRICE_FRESHNESS_MAX_AGE_MS` (14 days). `priceUpdatedAt` is set at operator
  activation and can be refreshed later. The capability card exposes the exact
  `freshness.staleAfter` instant; past it the card's `availability.state` flips
  to `UNAVAILABLE` (`reason: "STALE"`) while `status` stays `ACTIVE`, and this
  endpoint returns `409 ROUTE_UNAVAILABLE`.
- **No synchronous quote**: a supplier responds out of band within the SLA. The
  agent-side result endpoint (`GET /v1/tasks/:id`) and the real x402 402 →
  authorise → settle flow arrive with the payment phase (ADR-004).
- **Audit**: a valid request writes `capability.quote_requested`,
  `task.submitted`, `task.awaiting_quote`, and `payment.unavailable`.
