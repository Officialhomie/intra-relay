# M10 — Business readiness checklist

What a real business must provide before it is pilot-ready, split by what it
actually gates — not collected because it might someday be useful. Two
onboarding paths exist; this checklist applies to both, and calls out exactly
where they differ.

- **Quick-start** (`/supplier/onboard`) — one screen, five required fields,
  recommended default. Builds the business **and** its first route directly.
- **Full onboarding** (`/supplier/onboard/full`) — sixteen fields,
  operator-assisted, builds a **draft** an operator reviews before anything is
  created. Use this path when a business needs on-chain payment (see
  §Payment below) or when an operator is filling the form out with the SME in
  person.

Every field on both forms is visible in
[`docs/BUSINESS_ONBOARDING.md`](BUSINESS_ONBOARDING.md) (the operator
questionnaire) and `src/features/businesses/schema.ts`; this document is the
gate list, not a re-derivation of the form.

---

## REQUIRED TO DISCOVER

The minimum for the business to exist and be findable by the agent at all.

| Field                                                                    | Quick-start                              | Full onboarding       |
| ------------------------------------------------------------------------ | ---------------------------------------- | --------------------- |
| Business name                                                            | ✅ required                              | ✅ required           |
| Category (`printing` \| `design` \| `catering` \| `delivery` \| `other`) | ✅ required                              | ✅ required           |
| City, country                                                            | ✅ required (country defaults `Nigeria`) | ✅ required           |
| Consent to Intra requesting + displaying a quote                         | ✅ required, blocking                    | ✅ required, blocking |

Never collected on either form: a street/home address, a national ID, a
government ID number, or anything not needed to be found.

## REQUIRED TO QUOTE

What the route needs to actually answer a request. **Quick-start defers
several of these to "fill in later, from the business's own workspace"** —
they are not blocking on day one, but a route cannot be activated without them.

| Field                                                          | Quick-start                                                                              | Full onboarding                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Service name / what the business quotes                        | ✅ required (`serviceName`, becomes the route name)                                      | ✅ required (`serviceSummary`, ≥10 chars — agent-facing) |
| Pricing model (`FIXED` \| `STARTING_FROM` \| `QUOTE_REQUIRED`) | ✅ required                                                                              | via `quoteResponseTime` + operator-set pricing           |
| Price amount + unit                                            | required unless `QUOTE_REQUIRED`                                                         | set later, via `EditPublishedPriceForm`                  |
| Quote currency                                                 | ✅ required (default `NGN`)                                                              | ✅ required                                              |
| Service area (delivery / pick-up)                              | deferred to the workspace                                                                | ✅ required at onboarding                                |
| Opening hours                                                  | not collected by quick-start at all                                                      | ✅ required                                              |
| Typical turnaround                                             | not collected by quick-start at all                                                      | ✅ required                                              |
| How fast the business commits to replying                      | not collected by quick-start (defaults via the category template's `responseSlaMinutes`) | ✅ required (`quoteResponseTime`)                        |
| Order contact channel (WhatsApp/email/phone number)            | ✅ required                                                                              | ✅ required                                              |

**Quick-start's deferred fields are not a gap** — the route is created
`DRAFT` either way, and `docs/BUSINESS_ONBOARDING.md`'s activation checklist
(below) catches anything still missing before a real buyer can reach it.

## REQUIRED TO RECEIVE PAYMENT

This section did not exist in this shape before M10.5 — read it carefully.

**Intra never asks for**: a seed phrase, private key, password, BVN, NIN,
card, or bank-login credential (`FR-SUP-003`, checked by a dedicated test).
The **only** wallet field is a public Celo/EVM address (`0x…`, format-checked,
ownership verified out-of-band by an operator — never by collecting a
secret).

**Two things this address now pays for, and they are easy to conflate:**

1. The x402 **agent query fee** — a few cents, per-query, and still dormant
   (`X402_API_KEY` unset in every environment). Nothing pays this today.
2. The buyer's **order payment via MiniPay** (M10.5) — the real order total,
   in USDC, sent directly wallet-to-wallet. **Live in production the moment
   [PR #2](https://github.com/Officialhomie/intra-relay/pull/2) merges** —
   `NETWORK_ENV=production` is already set.

Both draw from the exact same `business.payoutAddress` column. The full
onboarding form's copy only mentions the first ("Let AI agents pay a small fee
… This pays for the information, never the customer's order") — it does not
yet mention MiniPay. Until that copy is rewritten, an operator filling this
form out with an SME should explain **both** purposes verbally.

**What this audit found and fixed:**

- **Quick-start never collects a payout address at all.** The column is
  `NOT NULL` in the database, so a quick-start business is stored with the
  literal zero address (`0x000…000`) as a placeholder — by original design,
  because before M10.5 nothing ever paid that address for real (x402 was
  always dormant; see the code comment in `quick-start.ts`: _"A business with
  no payout address is fine — Intra only needs one when the business wants to
  charge agents a fee to answer, which is not a day-one decision."_ That
  reasoning predates MiniPay).
- **Nothing validated the address was real before activation.** The
  activation checklist's "public payout address verified" item is a checkbox
  an operator ticks; the underlying `routeHasRequiredFields` check only
  confirms the stored string is non-empty — the zero address passes it.
- **Fix shipped this milestone**: `createOrderPaymentIntent` and
  `getOrderPaymentForTask` now refuse to offer MiniPay to any business whose
  `payoutAddress` is the zero-address placeholder — a buyer is told "This
  business hasn't set up on-chain payment yet" and falls back to the
  WhatsApp handoff, instead of a wallet being pointed at an address that
  would irrecoverably burn real USDC. Tested (`intent.integration.test.ts`,
  `order-flow.integration.test.ts`).

**What is still a manual operator step, deliberately not built as a feature
this milestone** (Phase 4/7 discipline — small pilot, not worth a self-service
UI yet): **there is no way today for a quick-start business to add a payout
address after the fact.** `updateBusiness` exists at the repository layer but
is not exposed through any API. So, for the M10 pilot:

- **If a pilot SME should be able to receive a MiniPay payment**: onboard them
  through **full onboarding**, with "Let AI agents pay a small fee" checked,
  so a real `payoutAddress` is captured at creation. Verify it the same way as
  any payout address (below).
- **If a pilot SME was already onboarded via quick-start and needs a payout
  address added later**: this needs a direct, careful database update by an
  operator with `DATABASE_URL` access — not a self-service path. Flag to
  Victor as a real follow-up (a small "add/edit payout address" endpoint) if
  more than one or two pilot SMEs need this; not worth building for the
  printing pilot's scale of 1–3 SMEs.
- **This is fine either way**: MiniPay is optional. A business with no real
  payout address still fully supports the WhatsApp-handoff commercial flow.

**Ownership verification (before activation, every time)**: a small test
transfer, or an approved signing flow — never by collecting the private key.
The operator ticks `publicAddressVerified` only after actually doing this.

## REQUIRED TO FULFIL

Nothing beyond what's already required to quote. Fulfilment (Proofline) is
entirely optional (`FR-PROOF`) and needs no extra business data — the
merchant's existing manage-token authenticates the "mark ready for pickup"
step.

## REQUIRED TO COMPLETE HANDOVER

- The business's payout address (see above) doubles as the wallet address
  that must sign the handover attestation
  (`eth_signTypedData_v4` from the merchant's own injected wallet). **A
  business onboarded without a real payout address cannot complete a real
  on-chain handover attestation either** — this was already true before
  M10.5 (M9's design) and is a second, independent reason a real payout
  address matters for a pilot SME, on top of MiniPay.
- No separate data collection — the handover code is generated automatically
  at commitment creation and surfaced to the buyer through the task view.

## OPTIONAL / LATER

Collected only when relevant, never blocking activation:

- Additional services/routes beyond the first (`service_added` — supported,
  not yet exercised by any real business).
- Editing published pricing after go-live (`EditPublishedPriceForm`).
- Enabling the paid agent-query fee (`wantsPaidQueries`) — meaningless while
  `X402_API_KEY` is unset everywhere.

**Never collected, on any path, for any reason**: a home address, a reference
list, a business registration/tax ID, social media follower counts, or
anything else "which might be useful later." If a future feature genuinely
needs one of these, it gets collected when that feature ships, not
speculatively now.

---

## Activation checklist (unchanged from `docs/BUSINESS_ONBOARDING.md`)

An operator verifies all six before a route goes `ACTIVE`:

- [ ] Supplier consent recorded.
- [ ] Contact channel tested.
- [ ] Public Celo address **format valid AND ownership actually verified** —
      don't just tick this because the field is non-empty; the platform will not
      stop you (see the gap above).
- [ ] Price/availability information is genuine and dated.
- [ ] Required quote questions defined.
- [ ] SLA and quote expiry agreed.

A route with an incomplete checklist cannot reach `ACTIVE`
(`routeHasRequiredFields`) — but, as this audit found, "complete" and "correct"
are not the same check for the payout address specifically. Treat the
checklist as a floor, not a guarantee.
