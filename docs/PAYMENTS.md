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

---

# Buyer order payment (MiniPay) — M10.5, ADR-023

A **separate** payment path from the x402 adapter above. x402 is the _agent
query fee_ (BR-004). This is the **buyer paying the business for the order**, on
Celo, through [MiniPay](https://www.opera.com/products/minipay) — Opera's
non-custodial wallet. It is **additive**: the pre-filled WhatsApp handoff still
sits beside it and is the fallback for every buyer who can't or won't pay
on-chain (M10.5 §5, §50).

Module: `src/features/payments/order/` (server) + `src/features/payments/minipay/`
(client). It does **not** touch `MODEL_TOOLS`, the x402 adapter, the registered
EAS schemas, or the WhatsApp handoff.

## What stays true (the §2 / §43 invariants)

| Guarantee | How |
| --- | --- |
| Intra never custodies funds | the wallet transfers USDC straight to the business payout address; no Intra address is ever in the path |
| The human approves the commercial terms | the payment intent can only be created once `task.status === "HANDOFF_READY"` — i.e. the buyer already accepted the quote |
| The human approves the wallet transaction | `PayPanel` → the wallet's own confirm dialog; Intra never holds a key or a signature |
| The agent cannot pay | the controller is a plain server module; `payWithMiniPay` is **not** an LLM tool (§3) |
| Amount + recipient are server-authoritative | `createOrderPaymentIntent` reads them **only** from the accepted `commitments` row — never the client, an LLM, or free-form text (§8, §9). The submit route accepts **only** a `txHash`. |
| The intent is immutable after creation | no code path updates `recipientAddress` / `amountAtomic` / `assetAddress` / `quoteId`. A terms change (`quotes/revision.ts`, `tasks/exception-service.ts`) calls `invalidateOrderPaymentsForTask` → the intent is `EXPIRED` and a fresh human approval mints a new one (§11). |
| "Confirmed" cannot be spoofed | `CONFIRMED` is reachable **only** through `verifyOrderPayment` reading a real Celo receipt (§17–§19). The server never trusts a client "success". |
| Replay is blocked | `order_payments.tx_hash` is `UNIQUE`; the controller rejects a hash already linked to another payment (`TX_ALREADY_USED`); `matchReceipt` requires the transfer to go to _this_ intent's recipient for _this_ intent's exact amount, so a receipt for order A cannot confirm order B. |
| A dead order can't be paid | every task-exception path expires the live intent; a **confirmed** on-chain payment is left exactly as it is — no refund, no reversal, no fabricated outcome (§4.1). |

## NGN → USD reference rate (§16)

SMEs quote in **naira**; MiniPay settles **USD stablecoins**. Bridging them:

- A real, public FX rate is fetched server-side from `NGN_USD_RATE_URL`
  (default `https://open.er-api.com/v6/latest/USD` — free, keyless, no secret).
- The rate + its source + the fetch timestamp are **locked into the payment
  intent** at creation and **always shown to the buyer**:
  _"₦45,000 · ≈ 30.00 USDC (reference rate from open.er-api.com, locked 14:32)"_.
- It is a **reference** rate, not a guaranteed one. If the buyer disputes it,
  they use the WhatsApp handoff.
- If the source is unreachable, `createOrderPaymentIntent` returns
  `503 PAYMENT_METHOD_UNAVAILABLE` — a rate is **never guessed** (§8, §15).
- 10-minute in-memory cache (`rate.ts`). Conversion is integer-first
  (`convertNgnMinorToUsdcAtomic`): `round(ngnMinor × 1e4 ÷ ngnPerUsd)`.

## Asset — USDC only

One asset for the pilot: **USDC on Celo mainnet**
(`0xcEBA9300f2b948710d2653dD7B07f33A8B32118C`, 6 dp — the address already
verified in `adapter/networks.ts`). MiniPay also supports USDT and cUSD;
cNGN is **not** a MiniPay asset. Additional stablecoins are a later, deliberate
addition, not an M10.5 scope creep.

## Lifecycle

```
CREATED ─▶ AWAITING_WALLET ─▶ SUBMITTED ─▶ CONFIRMING ─▶ CONFIRMED
   │                                           │
   ├──────────────▶ CANCELLED (buyer dismissed the wallet — order untouched)
   ├──────────────▶ EXPIRED   (30-min window elapsed, or terms changed)
   └──────────────▶ FAILED    (tx reverted, or the receipt does not match the intent)
```

- `POST /api/tasks/[id]/order-payment` — `x-session-id` + `Idempotency-Key`.
  `createOrderPaymentIntent`. `503 PAYMENT_METHOD_UNAVAILABLE` if disabled or the
  rate source is down. A repeat within the window returns the same intent.
- `POST /api/tasks/[id]/order-payment/submit` — body `{ txHash }` only.
  `recordSubmittedOrderPayment` → `CONFIRMING` + schedules `verifyOrderPayment`
  via `after()`. Idempotent on the hash.
- `POST /api/tasks/[id]/order-payment/cancel` — `cancelOrderPayment`. No
  idempotency key. Refuses once a `txHash` exists.
- `GET /api/tasks/[id]/order-payment` — polls; also re-runs verification for
  anything in flight (`resumeOrderPaymentVerification`, §22 — resumable across a
  tab close / device switch).

`verifyOrderPayment` asserts, in order: receipt found · `status === "success"` ·
`chainId` matches (when the provider returns it) · `to` is the USDC contract ·
**exactly one** USDC `Transfer` to the intent's recipient for the intent's exact
amount. All pass ⇒ `CONFIRMED` + `settledAt` + `payerAddress` (from the Transfer
`from`), and `commitment.buyerAddress` is bound to the payer **if still zero**
(used by the later _handover_ attestation — the commitment attestation was
already written at accept time and is **not** re-touched, §28). No receipt yet ⇒
stays `CONFIRMING`, up to 8 checks, then keeps checking on the next open — never
a false `FAILED` (§21).

## Environment (server-only, no secret)

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `NETWORK_ENV` | to enable | `staging` | `production` gates the path on — same gate the attestation layer uses. Otherwise the WhatsApp handoff is the only order path. |
| `NGN_USD_RATE_URL` | no | `https://open.er-api.com/v6/latest/USD` | Public FX endpoint returning `{ rates: { NGN } }` on a USD base. **No key.** |
| `RPC_URL` | no | `https://forno.celo.org` | Reused from the attestation config. Verification is a public `eth_getTransactionReceipt` read. |

`readOrderPaymentConfig()` is `enabled` only when `NETWORK_ENV=production` **and**
USDC is configured. No key is needed — settlement verification is a public RPC
read and the buyer's wallet signs everything.

## Evidence

`GET /api/operator/evidence/[taskId]` (`evidence/trace.ts`) gains an
`orderPayment` section — status, `txHash` + celoscan link, asset, `amountAtomic`,
recipient, `payerAddress`, the locked rate + source + timestamp, `verified`
boolean — and `consistency.orderPaymentConfirmed` +
`consistency.paymentRecipientMatchesPayout` (the confirmed transfer went to the
business's on-file payout address).

## MiniPay Mini App directory (Victor's step)

Detection is `window.ethereum?.isMiniPay === true` — the wallet is
**pre-connected** inside the MiniPay in-app browser (no `eth_requestAccounts`
ceremony). To list Intra in the MiniPay dApp store:

1. Deploy to a public HTTPS URL (done — `intra-relay.vercel.app`).
2. Verify the buyer flow renders at a 360 px viewport inside a webview, external
   links are `target="_blank" rel="noreferrer"`, and a cold deep link to
   `/tasks/<id>` works.
3. Submit through the MiniPay dev portal
   (<https://www.mento.org/developers> → MiniPay) with the app URL, icon, and a
   one-line description. This needs the MiniPay developer account — Victor's.

## Live-test runbook (§41 — one real MiniPay transaction)

M10.5 lands **code-complete, one real MiniPay transaction pending** (same shape
as M9's outstanding on-chain item). The deterministic tests cover every branch
with a fake receipt client; the real transaction needs Victor:

1. A physical Android phone with MiniPay installed, **Developer mode** on
   (MiniPay → Settings → About → tap the version 7×), site testing enabled.
2. A MiniPay wallet funded with a small amount of **USDC on Celo** (a few
   dollars) and enough of a stablecoin for the network fee.
3. A **real SME** onboarded with a **real Celo payout address** (operator-
   verified out of band per `FR-SUP-003` — never by collecting a secret).
4. Set `NETWORK_ENV=production` on the deployment (already set for attestation).
5. From the MiniPay in-app browser, open the deployed app, drive a flyer order
   as a buyer: submit the brief → receive the SME's quote → **accept it**.
6. On the task page, the "Pay for your order" panel shows the ₦ amount, the
   locked USDC amount + rate provenance, and "Pay with MiniPay".
7. Tap it → MiniPay's confirm sheet → approve. Note the tx hash MiniPay shows.
8. The panel moves to "Payment submitted", then "Payment confirmed" within a
   minute or two (the `GET` poll re-runs verification).
9. Confirm on <https://celoscan.io/tx/<hash>>: a single USDC transfer, from the
   MiniPay wallet, to the SME's payout address, for the exact locked amount.
10. `GET /api/operator/evidence/<taskId>` (operator key) → `orderPayment.status
    === "CONFIRMED"`, `verified: true`, `consistency.paymentRecipientMatchesPayout
    === true`.
11. Report the tx hash. Then M10.5's outstanding item is closed.

**Never** fabricate the transaction, the hash, or the confirmed state to close
this item (§42).
