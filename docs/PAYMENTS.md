# Payments — Celo x402 adapter

Intra sells one thing over x402: the **query / information service** behind a
quote route. The customer's final order is never paid through Intra (BR-001,
FR-REC-004). x402 is wired behind a provider-neutral adapter (ADR-011); the rest
of the app never imports `@x402/core`.

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

| Var                    | Required           | Default        | Notes                                                                                                                                                    |
| ---------------------- | ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X402_API_KEY`         | to enable payments | —              | Metering secret from the dashboard. **Never** `NEXT_PUBLIC_*`; never logged. Unset ⇒ everything is `PAYMENT_SERVICE_UNAVAILABLE`.                        |
| `X402_NETWORK`         | no                 | `eip155:42220` | `eip155:42220` or `eip155:11142220`. An unknown value throws at startup.                                                                                 |
| `X402_ASSET`           | no                 | `USDC`         | `USDC` or `USDT` (USDT mainnet-only).                                                                                                                    |
| `X402_FACILITATOR_URL` | no                 | per network    | Override only for testing.                                                                                                                               |
| `X402_ATTRIBUTION_TAG` | no                 | —              | ERC-8021 `celo_...` tag from hackathon registration. Recorded on receipts and passed in `PaymentRequirements.extra.reference`. Absent ⇒ no tag anywhere. |

The **$0.05 task-level cap** is a constant (`PAYMENT_MAX_FEE_USD`), not an env
var. The 402 challenge only ever advertises `min(routeFee, $0.05)`and the`exact` scheme enforces that the on-chain authorisation equals it.

## Flow (`POST /v1/:business/:route/quote`)

1. **No `X-PAYMENT`** on a paid route → `402` with `error.details.accepts[0]`
   (`{ scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra }`).
   Audit `payment.challenge_issued`. No task.
2. Agent signs an EIP-3009 `transferWithAuthorization` and retries with
   `X-PAYMENT: <base64 payment payload>`.
3. Server: cap/requirements match → facilitator `POST /verify` → facilitator
   `POST /settle`.
4. `settle.success` **and** a valid `0x…64hex` `transaction` → immutable
   `service_payments` row `SETTLED`, audit `payment.settled`, task
   `AWAITING_QUOTE`, response `200` + `X-PAYMENT-RESPONSE` header.
5. Any failure (bad header, verify invalid, settle failed, facilitator error,
   cap mismatch) → immutable `service_payments` row `FAILED`, audit
   `payment.failed`, response `402 PAYMENT_FAILED`. **No task, no tx hash.**

**Never fabricated:** a 402 settlement, an `X-PAYMENT` verification, a receipt,
or a transaction hash. A facilitator timeout is treated as `FAILED`.

## Immutability & idempotency

- `service_payments` rows are **insert-only** (BR-005) — there is no update
  function. A SETTLED row is never edited.
- `txHash` is unique; `authorizationKey` (a SHA-256 of the signed authorisation
  — never the signature itself) is unique. Re-presenting the same `X-PAYMENT`
  replays the first receipt and does **not** call `/verify` or `/settle` again.
- The `Idempotency-Key` header still applies; its stored identity includes a
  hash of the `X-PAYMENT` header, so an unpaid probe and its paid retry are
  distinct.

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

## cPay

cPay (the closed-beta agent marketplace) has no public SDK or docs. When access
lands, add `src/features/payments/adapter/cpay.ts` implementing the same
`PaymentAdapter` interface and branch on it in `getPaymentAdapter()`.
