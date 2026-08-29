# Intra Capability API (`/v1`)

Public, **agent-readable** REST. No authentication — an AI agent discovers a
business's quote routes and requests a quote. MCP is **not** implemented yet; a
future MCP adapter will expose the same route data without changing this API.

Responses use the standard envelope: `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message", "details? } }`.

No endpoint returns, and no code path fabricates, a 402 settlement, an
`X-PAYMENT` verification, a receipt, or a transaction hash (ADR-004).

---

## `GET /v1/:businessSlug/capabilities` → 200

The capability document for a business and **all** of its quote routes (any
status). `Cache-Control: no-store` — route status can change at any time.
`404 BUSINESS_NOT_FOUND` for an unknown slug.

```jsonc
{
  "success": true,
  "data": {
    "business": {
      "slug": "campus-prints-ng",
      "name": "Campus Prints NG",
      "category": "printing",
      "location": { "city": "Lagos", "country": "Nigeria" },
      "operatorVerified": true,
    },
    "finalOrderPolicy": {
      "humanApprovalRequired": true,
      "statement": "Intra never places the final order or moves buyer funds. …",
    },
    "routes": [
      {
        "slug": "flyer-printing",
        "name": "Flyer printing quote",
        "description": "A structured request for current flyer pricing, availability, and turnaround.",
        "status": "ACTIVE", // route lifecycle status
        "lastUpdatedAt": "2026-08-30T10:00:00.000Z",
        "priceUpdatedAt": "2026-08-30T09:55:00.000Z",
        "stale": false, // price data older than 14 days
        "endpoint": "/v1/campus-prints-ng/flyer-printing/quote",
        "quoteEndpoint": "/v1/campus-prints-ng/flyer-printing/quote",
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
          "paid": true,
          "facilitator": "x402",
          "available": false,
          "state": "PAYMENT_SERVICE_UNAVAILABLE",
          "note": "Paid route, but no x402 / cPay facilitator is configured. …",
        },
        "payoutAddress": "0x0000000000000000000000000000000000000001",
        "responseSlaMinutes": 30,
        "finalOrderPolicy": { "humanApprovalRequired": true, "statement": "…" },
        "orderContact": {
          // present ONLY while status === "ACTIVE"
          "channel": "whatsapp",
          "value": "+2348000000000",
          "note": "Order channel — a human sends the final order here. Intra never sends it.",
        },
      },
    ],
    "generatedAt": "2026-08-30T10:00:00.000Z",
  },
}
```

`orderContact` is **omitted** for any route that is not `ACTIVE`.

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

### Outcomes

| Status  | `error.code` / `data`                    | When                                                                                 | Side effects                                                                                                        |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **404** | `BUSINESS_NOT_FOUND` / `ROUTE_NOT_FOUND` | unknown slug                                                                         | none                                                                                                                |
| **409** | `ROUTE_UNAVAILABLE`                      | route is not `ACTIVE`, not operator-verified, or its price data is stale (> 14 days) | **none — no task, no payment request**                                                                              |
| **422** | `VALIDATION_FAILED`                      | a required input is missing or invalid                                               | none — no task                                                                                                      |
| **503** | `PAYMENT_SERVICE_UNAVAILABLE`            | valid request on a **paid** route while no x402 / cPay facilitator is configured     | **a `Task` (`AWAITING_QUOTE`) and audit events are created**; a `service_payments` row is recorded as `UNAVAILABLE` |
| **202** | `data.outcome = "AWAITING_QUOTE"`        | valid request on a **free** route (`queryFeeUsd === 0`)                              | task + audit created                                                                                                |
| **501** | `PAYMENT_FLOW_NOT_IMPLEMENTED`           | a facilitator is configured but the 402 flow is unbuilt                              | task created                                                                                                        |

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

`PAYMENT_SERVICE_UNAVAILABLE` body:

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

### Notes

- **Staleness**: a route's price data must have been confirmed within
  `PRICE_FRESHNESS_MAX_AGE_MS` (14 days). `priceUpdatedAt` is set at operator
  activation and can be refreshed later.
- **No synchronous quote**: a supplier responds out of band within the SLA. The
  agent-side result endpoint (`GET /v1/tasks/:id`) and the real x402 402 →
  authorise → settle flow arrive with the payment phase (ADR-004).
- **Audit**: a valid request writes `capability.quote_requested`,
  `task.submitted`, `task.awaiting_quote`, and `payment.unavailable`.
