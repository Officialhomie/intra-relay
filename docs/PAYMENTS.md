# Payments — Celo x402 adapter

Intra sells one thing over x402: the **query / information service** behind a
quote route. The customer's final order is never paid through Intra (BR-001,
FR-REC-004). x402 is wired behind a provider-neutral adapter (ADR-011); the rest
of the app never imports `@x402/core`.

**Audited & hardened 2026-08-31 (ADR-017)** — against the installed
`@x402/core@2.24.0` SDK and the config below. No live facilitator key was
present, so live settlement was **not** exercised; the `FakeFacilitator`
contract tests are the boundary.

## Official configuration (verified 2026-08-30)

Source: <https://docs.celo.org/build-on-celo/build-with-ai/x402> and the live
`GET /supported` on each facilitator. Baked into
`src/features/payments/adapter/networks.ts`.

|                      | Celo Mainnet                                                                                                 | Celo Sepolia                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| CAIP-2 network       | `eip155:42220`                                                                                               | `eip155:11142220`                                                |
| Facilitator API      | `https://api.x402.celo.org`                                                                                  | `https://api.x402.sepolia.celo.org`                              |
| Dashboard (API keys) | `https://x402.celo.org`                                                                                      | same                                                             |
| USDC                 | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` (6 dp), EIP-712 `{name:"USDC",version:"2"}`                     | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` (6 dp), same domain |
| USDT                 | `0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e` (6 dp), EIP-712 `{name:"Tether USD",version:"1"}`               | —                                                                |
| Explorer             | `https://celoscan.io/tx/<hash>`                                                                              | `https://celo-sepolia.blockscout.com/tx/<hash>`                  |
| Scheme               | `exact`, x402Version 2, gasless EIP-3009 `transferWithAuthorization` (facilitator pays gas, never custodies) | same                                                             |

Facilitator endpoints: `POST /verify` (open), `POST /settle` (needs
`X-API-Key`), `GET /supported`, `GET /health`. `/settle` failures: `401`
(bad key), `402` (out of credits), `429` (rate limit). New accounts get free
credits; then $0.001 per settlement, topped up with USDC on the dashboard.

## Environment variables (server-only)

| Var                    | Required           | Default        | Notes                                                                                                                                                                                                                                              |
| ---------------------- | ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X402_API_KEY`         | to enable payments | —              | Metering secret from the dashboard. **Never** `NEXT_PUBLIC_*`; never logged. Unset ⇒ everything is `PAYMENT_SERVICE_UNAVAILABLE`.                                                                                                                  |
| `X402_NETWORK`         | no                 | `eip155:42220` | `eip155:42220` or `eip155:11142220`. An unknown value is **logged once and degrades to `PAYMENT_SERVICE_UNAVAILABLE`** — it never crashes the quote workflow. `readPaymentConfig()` still throws (deploy check).                                   |
| `X402_ASSET`           | no                 | `USDC`         | `USDC` or `USDT` (USDT mainnet-only). Same degrade-on-invalid behaviour as `X402_NETWORK`.                                                                                                                                                         |
| `X402_FACILITATOR_URL` | no                 | per network    | Override only for testing.                                                                                                                                                                                                                         |
| `X402_ATTRIBUTION_TAG` | no                 | —              | ERC-8021 `celo_...` tag from hackathon registration (`/^celo_[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/`). A value that does not match is **ignored with a logged warning** — never recorded as a real attribution claim (BR-007). Absent ⇒ no tag anywhere. |

The **$0.05 task-level cap** is a constant (`PAYMENT_MAX_FEE_USD`), not an env
var. The 402 challenge only ever advertises `min(routeFee, $0.05)`and the`exact` scheme enforces that the on-chain authorisation equals it.

## Flow (`POST /v1/:business/:route/quote`)

1. **No `X-PAYMENT`** on a paid route → `402 PAYMENT_REQUIRED` with
   `error.details.accepts[0]` (`{ scheme, network, asset, amount, payTo,
maxTimeoutSeconds, extra }`) and `error.details.maxFeeUsd`. Audit
   `payment.challenge_issued`. No task.
2. Agent signs an EIP-3009 `transferWithAuthorization` and retries with
   `X-PAYMENT: <base64 payment payload>` — the natural retry **reuses the same
   `Idempotency-Key`** (the header hash is folded into the idempotency scope, so
   the probe and the paid retry are distinct records that each replay cleanly).
3. Server: decode → cap / requirements match (server-side spend cap) →
   facilitator `POST /verify` → facilitator `POST /settle`.

### Outcomes

| Outcome                                                                                                           | HTTP  | `error.code` / `data`                                                                | Receipt row                                                                 | Task?            |
| ----------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------- |
| Settled                                                                                                           | `200` | `data.payment.status = "SETTLED"` (+ `X-PAYMENT-RESPONSE`)                           | `SETTLED` (immutable, unique `tx_hash`)                                     | `AWAITING_QUOTE` |
| **Bad authorisation** — undecodable header, over the `$0.05` cap, `verify.isValid = false`, or an on-chain revert | `402` | `PAYMENT_FAILED` (`details.code`)                                                    | `FAILED` (immutable)                                                        | none             |
| **Facilitator / network unreachable** on verify, or `X402_*` misconfigured, or no key                             | `503` | `PAYMENT_SERVICE_UNAVAILABLE` (`details.retryable = true`)                           | `UNAVAILABLE` (immutable, no `authorization_key` so a retry is not blocked) | none¹            |
| **Settlement indeterminate** — `verify` passed but `settle` timed out or returned no usable hash                  | `503` | `PAYMENT_SETTLEMENT_INDETERMINATE` (`details.retryable = false`, `details.guidance`) | `AUTHORISED`, `error_code = SETTLE_INDETERMINATE` (immutable, no `tx_hash`) | none             |

¹ On the **no-facilitator** path a `Task` is still created (the free
request→quote→handoff flow is not blocked); on the verify-unreachable path with
an `X-PAYMENT` present, no task.

- **Re-presenting the same `X-PAYMENT`** (any `Idempotency-Key`): a `SETTLED`
  authorisation replays its receipt; a `FAILED` one returns `402` "already
  rejected"; an `AUTHORISED` (indeterminate) one returns the same `503` — the
  facilitator is **never** re-called for a known authorisation.
- **Indeterminate guidance to the agent:** do **not** re-authorise with a new
  nonce (that could pay twice). Check the block explorer for a transfer from the
  payer address; ask the route operator to reconcile.

**Never fabricated:** a settlement, an `X-PAYMENT` verification, a receipt, or a
transaction hash. A `settle` timeout is claimed **neither** way (indeterminate),
never as success and never as a clean failure.

## Immutability & idempotency

- `service_payments` rows are **insert-only** (BR-005) — there is no update
  function. A SETTLED row is never edited.
- `tx_hash` is unique; `authorization_key` (a SHA-256 of the signed authorisation
  — never the signature itself) is unique. `SETTLED`, `FAILED`, and `AUTHORISED`
  rows carry it; `UNAVAILABLE` rows do not (verification never happened, so a
  later retry must not be blocked — the hash is kept in the audit body only).
- Re-presenting the same `X-PAYMENT` replays the first outcome and does **not**
  call `/verify` or `/settle` again.
- **Concurrency:** two agents presenting the same `X-PAYMENT` at once converge on
  one immutable row — `insertOrGetByAuthorizationKey` inserts with
  `onConflictDoNothing` and re-reads; the losing request serves the winner's
  `SETTLED` receipt rather than a spurious `402`.
- The `Idempotency-Key` header applies per **scope**: the quote endpoint's scope
  is `v1.quote:<biz>:<route>:probe` with no payment and
  `v1.quote:<biz>:<route>:pay:<sha256(X-PAYMENT)>` with one. The same key can be
  used for the 402 probe and the paid retry.

## Logs & receipts

- The EIP-3009 authorisation and signature are **never persisted or logged**.
  `service_payments.verification` holds only the facilitator's verify/settle
  result summary (`isValid`, `payer`, `transaction`, `network`, `amount`).
- The attribution tag: x402 settlement transactions are submitted by the
  **facilitator**, so Intra cannot inject ERC-8021 calldata. The tag is stored
  on the receipt and emitted in the `payment.settled` audit for our own
  attribution claims, and passed as `extra.reference` in case the facilitator
  forwards it. Direct-tx tagging (`@celo/attribution-tags` `toDataSuffix`) would
  only apply to a future cPay-direct adapter.

## Deployment guidance

1. On the dashboard (<https://x402.celo.org>) connect the payout wallet and
   **Create API key** (off-chain signature, no gas). Copy it once.
2. Set `X402_API_KEY` in the hosting platform's server environment (e.g.
   `vercel env add X402_API_KEY production`). Do not put it in `.env.example`,
   `.env.local` committed anywhere, or any client bundle.
3. Choose `X402_NETWORK` (`eip155:42220` for the real hackathon; Sepolia for a
   dry run) and `X402_ASSET`.
4. Once hackathon registration returns the ERC-8021 tag, set
   `X402_ATTRIBUTION_TAG`.
5. Run `npm run db:migrate` (adds the receipt columns) before the app boots.
6. Verify: `GET /v1/<business>/capabilities` should show
   `payment.state: "AVAILABLE"` and `payment.network` for active paid routes;
   a `POST …/quote` without `X-PAYMENT` should return `402` with `accepts`.
7. Fund settlement credits with USDC on the dashboard beyond the free tier.

## Demo fallback (no key — the current state)

`X402_API_KEY` is unset in this repo. That is a **first-class supported state**,
not a broken one:

- A **paid** route's quote endpoint returns
  `503 { "error": { "code": "PAYMENT_SERVICE_UNAVAILABLE" } }` — no 402, no
  receipt, no hash. The capability document shows
  `payment.state: "PAYMENT_SERVICE_UNAVAILABLE"` and `payment.code`.
- A **free** route (`queryFeeUsd === 0`) is completely unaffected — `202
AWAITING_QUOTE`.
- The **buyer web flow** is unaffected: submit → `AWAITING_QUOTE`, with a
  `service_payments` row of `NOT_REQUIRED` (no agent query fee applies to a
  human-submitted task). The task page says so in plain language.

```bash
# paid route, no key → explicit unavailable
curl -s -i -X POST http://localhost:3000/v1/<biz>/flyer-printing/quote \
  -H 'content-type: application/json' -H 'idempotency-key: demo-x402-01' \
  -d '{ "input": { "size":"A5","quantity":250,"colour":"full-colour",
        "deadline":"Fri 3pm","deliveryArea":"UNILAG main gate" } }'
# → HTTP/1.1 503  {"success":false,"error":{"code":"PAYMENT_SERVICE_UNAVAILABLE",…}}
```

The in-repo `FakeFacilitator`
(`src/features/payments/adapter/__fixtures__/`) is **test-only** — it is never
wired into `getPaymentAdapter()` and cannot be reached from a running server.
Never present it, or any fixture tx hash, as a real settlement.

## cPay

cPay (the closed-beta agent marketplace) has no public SDK or docs. When access
lands, add `src/features/payments/adapter/cpay.ts` implementing the same
`PaymentAdapter` interface and branch on it in `getPaymentAdapter()`.
