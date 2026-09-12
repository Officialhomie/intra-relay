# 07 — Trust, Money & Blockchain UX

> The complete lifecycle of every money- and trust-related action, traced through
> the UI and the services. For each step:
>
> - **THINKS** — what the user believes is happening
> - **ACTUALLY** — what the system is doing
> - **CONFIRM** — what the user must explicitly confirm
> - **AUTOMATES** — what the system does without asking
> - **SEE** — what the user needs to see
> - **NOT SEE** — what the user does not need to see
> - **WRONG** — what can go wrong
> - **UI** — how the interface responds
>
> Nothing redesigned. Companion: [`02-COMPLEXITY-ABSTRACTION.md`](02-COMPLEXITY-ABSTRACTION.md) §3,
> [`05-INTERACTION-STATE-MODEL.md`](05-INTERACTION-STATE-MODEL.md) §2.7–2.8,
> `docs/PAYMENTS.md`, `CLAUDE.md` §4, ADR-003/004/011/017/018/023.

---

# 0. The two money flows + the one attestation rail

| Flow                         | Table                                   | Who pays whom                                    | Custody                                         | Status today                                                                                        |
| ---------------------------- | --------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **x402 agent query fee**     | `service_payments`                      | the buyer's _agent_ → a paid information service | Intra never touches it                          | **always `UNAVAILABLE`** on the buyer web flow; `503` on `/v1` without a key                        |
| **MiniPay order payment**    | `order_payments`                        | the _buyer_ → the _business_, on-chain USDC      | non-custodial — wallet → business direct        | code-complete; live only when `NETWORK_ENV=production`; one real MiniPay tx still pending (ADR-023) |
| **EAS handover attestation** | `commitments` + `handover_attestations` | — (no money)                                     | Intra is the _evaluator_, never the _custodian_ | mock in staging, on-chain in production; `viem` admitted (ADR-018)                                  |

**The invariant across all three** (`BR-001`, `CLAUDE.md` §4.1/4.3): Intra never
custodies funds, never signs or executes the buyer's final supplier payment, and
never presents a settlement as real without verification + a real transaction
hash.

---

# 1. Quote creation (business → Intra → buyer)

**THINKS**: "I'm telling the customer my price."
**ACTUALLY**: `submitQuote` inserts a `RECEIVED` `quotes` row, builds a
`Recommendation` with a pre-filled `orderMessage` (**generated, never sent**),
moves the task `AWAITING_QUOTE → RECOMMENDED`, appends `quote.received` +
`recommendation.created` audit events, notifies the buyer.
**CONFIRM**: the merchant confirms the numbers, `fixed` vs `range`, an optional
`expiresAt`, `confidence`, by tapping "Send quote to buyer".
**AUTOMATES**: the recommendation summary, the `orderMessage` templating, the
currency (inherited from the route), the task transition, the notification.
**SEE** (merchant): `Callout` "How the buyer sees this — The buyer is shown these
figures as the printer's quote, entered through Intra. Intra does not
independently verify them."
**SEE** (buyer): the quote card labelled "Fixed price" / "Estimate — confirm
before paying"; "Entered by the printer or an Intra operator. Not independently
checked by Intra."; the validity line.
**NOT SEE**: the quote row id, the revision number, the audit event names, the
`orderMessage` generation.
**WRONG**: a second response (`409 QUOTE_EXISTS`); the route not `ACTIVE` (`409
ROUTE_UNAVAILABLE`); the task already past `AWAITING_QUOTE`; `401
SUPPLIER_AUTH_REQUIRED`.
**UI**: `Callout tone="success"` "Quote sent — The buyer will now review your
quote and decide whether to proceed. If they do, they message you directly.";
`router.refresh()`.

**Trust posture**: honest — the quote is explicitly the merchant's figure, not
Intra's, everywhere it appears.

---

# 2. Quote acceptance (the human-approval gate)

**THINKS**: "I'm choosing to go ahead with this printer at this price."
**ACTUALLY**: `decideOnQuote` (or `approveAgentRun`): task `RECOMMENDED →
HANDOFF_READY`; `buyerDecision = "ACCEPTED"`; the accepted quote row gets
`acceptedAt` (**now immutable — no code path edits it**); the `orderMessage` is
finalised (with a reconfirm line if expired); `createCommitmentForApproval`
writes a `commitments` row `PENDING_ATTESTATION` and issues the handover secret
(`handoverCommit = keccak256(code‖salt)` published; `code` → the buyer's
session-scoped view; `salt` withheld server-side); the contact channel is
revealed; both parties are notified.
**CONFIRM**: the buyer taps "Proceed with this printer" (or "Proceed anyway —
I'll reconfirm" on an expired quote). In the agent console this is bound to
`offerFingerprint` — a stale fingerprint is refused.
**AUTOMATES**: the task transition, the commitment creation, the secret issuance,
the `orderMessage` regeneration, the notifications, the `validUntil` resolution
(`QUOTE_EXPIRY` or a 24h `DEFAULT_WINDOW`).
**SEE**: the full offer on the surface — Business / Service / **Total price** /
"Fixed — the printer committed to this amount" or "An estimate — the final amount
can still move" / Expected completion / **Price held until** / **Who you pay**:
"{business}, directly" + "Intra never holds, sends or takes this money."
**NOT SEE**: `keccak256`, the salt, the commit hash, the commitment row, the
audit events, `offerFingerprint` (only its _effect_ — "The quote changed…").
**WRONG**: the task not `RECOMMENDED` (`409 TASK_NOT_AWAITING_DECISION`); the
quote moved after it was shown (`APPROVAL_STALE` in the agent console); a network
failure mid-decision (the write is idempotent — the key replays).
**UI**: on accept, `onDecided()` reloads → the page becomes S-04c (`PayPanel` +
`HandoffCard` + `HandoverCodePanel` + `OrderProblemPanel`). On decline, →
`describeTaskException("BUYER_CANCELLED")` info `Callout` + the feedback form.

**Trust posture**: **this is the product's core boundary and it is exposed in
full.** The approval card puts money, counterparty, terms, expiry and the "Intra
never holds this money" statement on the surface, never behind a disclosure. The
button names its own consequence.

---

# 3. Price change on an agreed order

**THINKS** (buyer): "The business wants more/less — do I accept?"
**ACTUALLY**: the business's `reviseQuote` inserted a `PROPOSED` row pointing at
the accepted one (**the accepted row is never touched**). The buyer's
`decideOnPriceChange`:

- ACCEPT → the accepted row → `SUPERSEDED`; the `PROPOSED` row → `RECEIVED` +
  `acceptedAt`; the recommendation + `orderMessage` regenerated; audit
  `quote.change_accepted`; **`invalidateOrderPaymentsForTask`** (any MiniPay
  intent on the old amount is killed).
- DECLINE → the `PROPOSED` row → `WITHDRAWN`; the originally agreed terms stand.
  **CONFIRM**: "Accept {new amount}" / "Keep the price I agreed".
  **AUTOMATES**: the row transitions, the recommendation/message regeneration, the
  payment-intent invalidation, the audit.
  **SEE**: **both amounts, the money delta ("NGN 700 more"), the business's verbatim
  reason, when they asked**; `Callout tone="unavailable"` "Until you choose, the
  price you originally agreed still stands. Nothing has changed and no money has
  moved."
  **NOT SEE**: the row ids, `supersedesQuoteId`, the audit payload.
  **WRONG**: no pending change (`409 NO_PENDING_CHANGE`); the session mismatch
  (`403 FORBIDDEN`); a business trying to stack two proposals (`409
CHANGE_ALREADY_PENDING`).
  **UI**: a `warning`-tinted `PriceChangePanel`; `onDecided()` reloads and the panel
  disappears.

**Trust posture**: the integrity rule ("an agreed price cannot change underneath
the buyer") is enforced in code (no edit path exists) and surfaced honestly
("still stands until you decide").

---

# 4. Payment intent (MiniPay) — creation

**THINKS**: "Starting the payment."
**ACTUALLY**: `POST /api/tasks/:id/order-payment` → `createOrderPaymentIntent`:
requires `task.status === "HANDOFF_READY"` (commercial terms already approved);
reads `recipientAddress`, the USDC `amountAtomic`, and — critically — **fetches a
live NGN→USD reference rate** (`NGN_USD_RATE_URL`, default keyless
`open.er-api.com`), **locks it** into the intent with its `rateSource` and
`rateLockedAt`. All four (recipient / amount / rate / source) are frozen — a
terms change invalidates the intent, it is never mutated.
**CONFIRM**: nothing yet — the buyer tapped "Pay with MiniPay" but the wallet has
not opened.
**AUTOMATES**: the recipient/amount resolution from the commitment, the FX fetch

- lock, the intent row.
  **SEE**: the `DataList` gains "You'll pay {n} USDC" with the hint "≈ reference
  rate from {source}, locked {time}", and "Goes to {0x1234…abcd}".
  **NOT SEE**: the FX endpoint URL, the JSON shape, the intent id, `amountAtomic`
  as an integer, USDC decimals.
  **WRONG**: the rate source unreachable → `503` and the panel shows "Paying in the
  app isn't available for this order" — **a rate is never guessed** (M10.5 §16).
  The commitment expired → "The agreed offer has expired. Ask the business to
  reconfirm the price."
  **UI**: button "Preparing…"; then "Waiting for your wallet…".

**Trust posture**: the **FX rate is `MUST BE EXPLAINED` and is** — value, source,
and lock time all shown. The buyer is paying naira-denominated but settling in
USDC, and the conversion is transparent and frozen.

---

# 5. Wallet interaction + transaction submission

**THINKS**: "My wallet is asking me to confirm — I approve and it's paid."
**ACTUALLY**: `wallet-adapter.payOrder` (the **one** place a wallet transaction
is built): lazy-imports `viem`; checks `chainId === celo.id`; if not, calls
`wallet_switchEthereumChain`; builds an ERC-20 `transfer` via
`encodeFunctionData(erc20Abi, "transfer", [recipient, amount])`;
`sendTransaction` to the USDC contract; returns `{ txHash }`. **The tx hash is
the only value the client submits back** (`POST .../submit { txHash }` → status
`CONFIRMING`, audit `order_payment.submitted`, verification scheduled).
**CONFIRM**: **the buyer approves the transaction in the wallet's own UI** — this
is a distinct human action from the commercial approval (M10.5 §34).
**AUTOMATES**: the ABI encoding, the chain check + switch, the transaction
construction, the hash submission, scheduling verification via `after()`.
**SEE**: "Your wallet will ask you to confirm this payment. The network fee is
paid from your wallet balance." Phase labels: "Waiting for your wallet…" →
"Recording…".
**NOT SEE**: the ABI, `encodeFunctionData`, the USDC contract address, `chainId`
in hex, `value: 0n`, the `viem` client construction.
**WRONG**:

- User rejects → `WalletPayError("USER_REJECTED")` → `POST .../cancel` → phase
  `cancelled` → "Payment cancelled. Nothing was confirmed."
- Wrong chain, switch refused → `WalletPayError("WRONG_CHAIN")` → "Switch your
  wallet to the Celo network to continue."
- No wallet → "No wallet is available in this browser. Open the order in MiniPay
  to pay."
- Send fails → `WalletPayError("SEND_FAILED")` → "The wallet couldn't send the
  payment."
- Server unreachable _after_ the tx is sent → phase `confirming` + "The tx is
  real and on-chain — this is a reporting hiccup, not a payment failure… reopen
  the order and it will pick up."
  **UI**: a `cancel` text-link while busy; on each error a matching `Callout` with
  the WhatsApp fallback named.

**Trust posture**: **"network fee" not "gas"; no contract address on the default
view (M10.5 §6, §47).** The wallet approval is correctly a separate, explicit
step. The client cannot claim "paid" — it only reports a hash.

---

# 6. Transaction verification + payment confirmation

**THINKS**: "It says it's checking with the network."
**ACTUALLY**: `verifyOrderPayment` (server-side, scheduled + on every poll, ≤ 8
attempts) reads the **real Celo transaction receipt**: chain matches, the tx
succeeded, the `to` is the USDC contract, and there is **a single `Transfer`
event to the intent's recipient for the intent's exact amount**. Only then →
status `CONFIRMED`, `settledAt` stamped, `payerAddress` recorded from the
on-chain `from` (**never claimed by the client**). Replay is blocked by a
`UNIQUE` `tx_hash`, the controller's `TX_ALREADY_USED`, and `matchReceipt`'s
recipient+amount binding.
**CONFIRM**: nothing — verification is automatic.
**AUTOMATES**: the receipt read, the multi-field match, the status transition,
the notifications, the analytics forward (server-side, because "the buyer often
closes the tab before the network confirms").
**SEE**: `Callout tone="info"` "Payment submitted — We're waiting for the network
to confirm it. This page updates on its own." After ~100 s: "Still checking with
the network. You can close this and come back — the status is saved." On confirm:
a `Card` "Payment confirmed" / Business / Amount (NGN · USDC) / Status: Paid /
a `<details>` "Transaction details" → "View transaction" explorer link.
**NOT SEE**: the receipt-read logic, the `Transfer`-event parsing, `verifyAttempts`,
the `after()` schedule.
**WRONG**: the receipt doesn't match (wrong recipient / amount / a revert) →
status `FAILED` → "The payment didn't go through — No payment was confirmed. Try
again, or use the WhatsApp handoff." The window elapses → `EXPIRED`.
**UI**: `PayPanel` polls every 2.5 s; the phase drives the copy; the confirmed
receipt has an explorer link.

**Trust posture**: **`CONFIRMED` is only ever reached by a real receipt read
server-side** (`CLAUDE.md` §4.1 upheld). The client's "success" is never trusted.

---

# 7. Merchant payout

**THINKS** (merchant): "The customer paid me."
**ACTUALLY**: there is no "payout" step — the buyer's wallet transferred USDC
**directly to the business's payout address** (`commitment.providerAddress`).
Intra never held it. The `order_payment.received` notification tells the business
"The customer's payment for this order has been confirmed on-chain. Continue with
fulfilment."
**SEE** (merchant): the `ActionCentre` notification; there is **no merchant-side
payment receipt screen** — the merchant checks their own wallet.
**NOT SEE**: any Intra-mediated settlement (there isn't one).
**WRONG**: n/a — the transfer is wallet-to-wallet.

**Trust posture**: non-custodial by construction. The gap: the merchant has no
in-app view of "who has paid me" beyond the notification — they rely on their
wallet.

---

# 8. Settlement receipt (x402 query fee)

**THINKS**: usually nothing — this is the _agent's_ fee, not the buyer's, and it
is almost always `UNAVAILABLE`.
**ACTUALLY**: `submitTask` writes an `UNAVAILABLE` `service_payments` row
immediately (no `X402_API_KEY`). The `/v1` quote endpoint runs the real x402 flow
only with a key: `402 PAYMENT_REQUIRED` → `X-PAYMENT` → official facilitator
`verify` → `settle` → a receipt with a **real mainnet tx hash**. Failure taxonomy
(ADR-017): `FAILED` (bad auth, retryable) / `UNAVAILABLE` (`503`, not the agent's
fault) / `INDETERMINATE` (`503`, settle timeout — never "paid", never
re-authorised).
**CONFIRM**: n/a (the agent authorises, not the human).
**AUTOMATES**: everything — the challenge, the verify, the settle, the immutable
receipt (append-only, a `SETTLED` row is never edited), the failure classification.
**SEE**: `PaymentReceipt` `Card` with a `StatusPill` and, per status, a `Callout`:

- `UNAVAILABLE`: "Agent payment verification is not available right now, so no
  service fee was charged and no receipt exists. Intra never fabricates a
  payment."
- `NOT_REQUIRED`: "No agent query fee applies — this request came through the
  web…"
- `AUTHORISED`: "Settlement outcome is being reconciled… It is not shown as paid
  until that confirmation comes through."
- `SETTLED`: amount / network / **transaction (`shortHash` + "View on
  Celoscan")** / attribution tag / settled-at.
- `FAILED`: "No transaction was made and no receipt exists."
  **NOT SEE** (but currently does — [`02` P1]): the raw `attributionTag` (`celo_…`
  string), `amountAtomic / 1e6` inline math, the CAIP-2 network fallback, "via
  agent payment protocol".
  **WRONG**: config errors degrade to `UNAVAILABLE` with one logged warning — they
  never 500 the quote workflow or block free routes.
  **UI**: the `Callout` per status; a settled-timeline sub-list.

**Trust posture**: honest (no fabricated receipt, ever) but **over-exposed** on
the `SETTLED` path — the chain fields belong in an operator view, not the buyer's.

---

# 9. Handover (the two-party protocol)

**THINKS** (buyer): "I say a code when I collect my flyers."
**THINKS** (merchant): "I confirm the customer picked up their order."
**ACTUALLY**:

1. At approval, `issueHandoverSecret` publishes `handoverCommit =
keccak256(code‖salt)`; the buyer alone receives `code` (`HandoverCodePanel`,
   session-scoped); the server withholds `salt`.
2. At collection, the buyer says the code aloud.
3. The merchant enters it → `POST .../handover/sign-request { code }` → on a
   match, the server returns **EIP-712 typed data** including `code` + `salt`, a
   frozen `signNonce`, and a real EAS `deadline` (10-min window).
4. The merchant's wallet (**must be the payout-address wallet**) signs via
   `eth_signTypedData_v4`.
5. `POST .../handover/submit { signature }` → the server relays it to EAS via
   `attestByDelegation` (or a labelled mock in staging). The merchant's key
   proves their participation; possession of `code` proves the buyer was there.
   **2-of-2, server as non-signing referee.**
   **CONFIRM**: the buyer says the code (in person); the merchant signs with their
   wallet.
   **AUTOMATES**: the commit-reveal, the EIP-712 build, the nonce/deadline freeze,
   the delegation relay, the mock-vs-onchain decision.
   **SEE** (buyer): "Say this to the business when you collect your order — it's how
   the record shows you were really there." + the code.
   **SEE** (merchant): "Ask the customer for the code they were given, then confirm
   that this job was handed over. This confirmation will be recorded as part of the
   transaction history." + the wallet stage labels + "(Simulated — not on any real
   network.)" / "View the record".
   **NOT SEE**: the schema UID, `refUID`, the EIP-712 struct, `attestByDelegation`,
   the salt, `signNonce`. (These appear only in the operator `TraceView`.)
   **WRONG**: wrong code → no state change; wrong wallet → "Connect the wallet for
   this business's on-file payout address…"; the relay fails → `ATTESTATION_FAILED`
   → "That didn't go through. You can try again without re-asking for the code."; no
   wallet → "This needs a wallet in this browser (like MetaMask or Valora)…".
   **UI**: `HandoverAttestPanel` stages; on success a `Callout tone="success"`.

**Trust posture**: the wording stays plain ("Confirm that this job was handed
over"); the wallet reality surfaces only in errors/status. **The honesty bound
(ADR-018) is enforced**: the attestation proves the parties completed the
protocol at a time — **not** quantity, quality, timeliness, or satisfaction.

---

# 10. Evidence

## Proofline (operational evidence)

**THINKS**: "I'm recording that the order was ready / collected."
**ACTUALLY**: two append-only `proofline_events` rows (`READY_FOR_PICKUP`,
`PICKUP_CONFIRMED`), each with an `actorRole` + `confirmationMethod`. **No claim
is made unless its required actor recorded it** (`FR-PROOF-006`). No public
reliability / reputation / on-time score is derived.
**SEE**: the `PROOFLINE_DISCLAIMER` **verbatim on every Proofline surface**:
_"operational evidence, not a cryptographic proof, not a payment settlement, not
a guarantee."_ Plus "This is the printer's statement, not a check by Intra."
**NOT SEE**: the append-only mechanics, the 6-char code generation.
**WRONG**: an event before `handoffConfirmedAt` (`409`); `confirm-pickup` before
`ready` (`409`); a replay (`409`); a wrong/replayed code (never records).
**UI**: attributed event lines ("Printer marked the order ready for pickup ·
{date}"); `Callout`s per status.

## EAS attestations

**THINKS**: "There's a record of this transaction."
**ACTUALLY**: a `commitments` attestation (signed by Intra) + a
`handover_attestations` attestation (signed by the merchant), on the canonical
EAS deployment on Celo mainnet — or a **labelled mock** in staging (`NETWORK_ENV`

- `ATTESTATION_SIGNER_KEY` absent → `attestationMode: "mock"`, "(Simulated — not
  on any real network.)").
  **SEE** (buyer/merchant): "recorded as part of the transaction history"; the
  simulated label; "View the record" (explorer) only when real.
  **SEE** (operator): the full `TraceView` — schema UIDs, attestation UIDs +
  explorer links, tx hashes, `attestationMode`, a **consistency cross-check**
  ("Handover links to commitment: yes / MISMATCH"), and a "Contains simulated
  records" warning.
  **NOT SEE** (buyer/merchant): the schema UIDs, the `refUID` chaining.
  **WRONG**: the write fails → `ATTESTATION_FAILED`, retryable, "Your decision is
  safely recorded. One background record could not be written yet and will be
  retried." — **the decision is never lost to a failed attestation.**

## Public evidence page

**SEE**: three strictly-separated zones (Real results / Demo data / Unavailable &
external integrations), "What changed from feedback", CSV/JSON export. **Every
figure is a `COUNT` from existing tables** — "no separate tracking, no session
ids, no fabricated adoption". Demo data (the single `[DEMO SEED]` business) is
excluded from every real number.
**NOT SEE**: session ids, task content, addresses, contact details — the export
"publish[es] only counts and a bucketed distribution".

**Trust posture**: exemplary. The honesty rules (`CLAUDE.md` §4.1) are visible
in the copy itself.

---

# 11. Failure / retry / cancellation / disputes

| Situation                           | THINKS                   | ACTUALLY                                                                                                                                                                                | UI                                                                                                                                                               |
| ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer declines a recommendation     | "Not this one"           | task `RECOMMENDED → CANCELLED`; nothing ordered                                                                                                                                         | info `Callout` "You cancelled this request"; feedback opens                                                                                                      |
| Buyer cancels an agreed order       | "I need to back out"     | task `HANDOFF_READY → CANCELLED` (`BUYER_CANCELLED_AFTER_AGREEMENT`); live quotes `WITHDRAWN`; MiniPay intent invalidated; **no refund claimed**                                        | `OrderProblemPanel` → "Intra never held any money for this order, so there is nothing to refund here. If you paid the business directly, settle that with them." |
| Buyer reports a failed handover     | "The pickup didn't work" | task → `FAILED` (`HANDOVER_FAILED`); the order is **not** marked complete; no completion record written                                                                                 | exception `Callout` "The handover didn't go through… Contact the business directly to sort out the collection."                                                  |
| Business withdraws before agreement | —                        | task → `FAILED` (`PROVIDER_WITHDREW`); "You had not agreed anything, so nothing is owed."                                                                                               | exception `Callout`                                                                                                                                              |
| Business withdraws after agreement  | —                        | task → `FAILED` (`PROVIDER_WITHDREW_AFTER_AGREEMENT`); MiniPay intent invalidated; "Nothing was charged through Intra. If you had paid the business directly, sort that out with them." | exception `Callout`                                                                                                                                              |
| Business cannot fulfil              | —                        | task → `FAILED` (`PROVIDER_CANNOT_FULFILL`)                                                                                                                                             | exception `Callout`                                                                                                                                              |
| x402 settle timeout                 | —                        | `service_payments` recorded `AUTHORISED` / `SETTLE_INDETERMINATE`, no tx hash; the agent is told **not** to re-authorise                                                                | `AUTHORISED` "being reconciled — not shown as paid"                                                                                                              |
| MiniPay verify hiccup               | "Did it work?"           | the tx is real and on-chain; the server lost track temporarily                                                                                                                          | "reopen the order and it will pick up"                                                                                                                           |
| A wallet double-tap                 | —                        | `startedRef` guard → no-op; or `TX_ALREADY_USED` if a hash is re-submitted                                                                                                              | silent (the button is disabled while busy)                                                                                                                       |

**There is no dispute-resolution flow.** By design (`CLAUDE.md` MVP boundary — no
escrow, no dispute resolution). Every exception's `moneyNote` is a plain,
non-speculative statement, and the recovery is always "contact the business
directly" + "start a new request".

---

# 12. What the user thinks vs what is real — the honest gaps

| The user might think…                                        | The reality                                                                                 | Is the UI honest about it?                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Intra processed my payment"                                 | Intra never touched it — wallet → business direct                                           | **Yes** — "Intra never holds, sends or takes this money" on the approval card and PayPanel                                                                       |
| "The quote is Intra's price"                                 | it's the merchant's figure, unverified                                                      | **Yes** — "Entered by the printer… Not independently checked by Intra" (3 places)                                                                                |
| "This attestation proves my flyers were printed well"        | it proves the handover protocol completed at a time — nothing about quality                 | **Yes** — ADR-018 honesty bound, the Proofline disclaimer, "not a guarantee"                                                                                     |
| "The Proofline record is a reputation score"                 | it's two attributed events; no score is derived                                             | **Yes** — "it is not a rating", twice on the supplier workspace                                                                                                  |
| "The x402 fee is part of my order cost"                      | it's the agent's information fee, capped at $0.05, distinct from the order                  | **Yes** — "query fee only — never the customer order"; "$0.003 — paid to ask for the price, never part of your order"                                            |
| "Payment shows as done, so it settled"                       | `SETTLED`/`CONFIRMED` requires a real verified tx hash                                      | **Yes** — the honesty `Callout`s; no fabricated receipt path exists                                                                                              |
| "The conversation and my request aren't real (it says demo)" | the task, quote, decision **are** persisted                                                 | **NO — [`06` §3, `02` P10]** the "Demo only — nothing here is saved" label is about the _conversation transcript_ and the _agent run store_, not the domain rows |
| "I can get back to my request from any device"               | localStorage-bound, no recovery                                                             | **NO** — the constraint is only stated after access is lost ([`00` §20 #1])                                                                                      |
| "My locked USDC amount won't change"                         | correct — the intent is immutable; a terms change invalidates it and needs a fresh approval | **Yes** — the rate hint shows "locked {time}"; a terms change → "Ask the business to reconfirm the price"                                                        |

---

# 13. Trust-copy inventory (the phrases that carry the boundary)

Verbatim, with location:

- "No wallets, no private keys, and no final order without your approval." — `/`
- "It does not pretend to be the business, make purchases for you, or hold your
  money." — `/`
- "Intra never holds, sends or takes this money." — `ApprovalPanel`
- "Intra does not send this message and never pays a supplier for you." —
  `HandoffCard`
- "Intra does not place the order or pay the printer — if you proceed, you send
  the message yourself and agree the order directly." — `DecisionPanel`
- "Intra never fabricates a payment." — `PaymentReceipt` (`UNAVAILABLE`)
- "no service fee was charged and no receipt exists" — `PaymentReceipt`
- "The network fee is paid from your wallet balance." — `PayPanel`
- "Entered by the printer or an Intra operator. Not independently checked by
  Intra." — quote card, `RecommendationCard`, `QuoteResponseForm`
- "operational evidence, not a cryptographic proof, not a payment settlement, not
  a guarantee" — `PROOFLINE_DISCLAIMER`, everywhere Proofline appears
- "This is the printer's statement, not a check by Intra." — `BuyerPickupPanel`
- "it is not a rating, and it does not vouch for the quality of the work" —
  `/supplier/:slug` `Callout`
- "Intra never held any money for this order, so there is nothing to refund
  here." — `OrderProblemPanel`
- "No money moved. Nothing was ordered." / "Nothing was charged through Intra." —
  `describeTaskException` money notes
- "Public address only — Intra never stores or asks for a private key or seed
  phrase." — `/supplier/:slug/review`, onboarding
- "A seed phrase, private key, password, BVN, NIN, bank login, or card details."
  (what is never asked) — both onboarding forms
- "It is held only for this browser session and never stored on a server or
  logged." — `OperatorConsole`
- "This link carries your private manage token… it is not a wallet key and holds
  no funds" — `/supplier/:slug/review`
- "Every figure is aggregated from the product's own records — no separate
  tracking, no session ids, no fabricated adoption." — `/evidence`
- "Nothing here is estimated." — `/supplier/:slug` record card
- "(Simulated — not on any real network.)" — `HandoverAttestPanel`, `OutcomePanel`
- "Nothing you did caused it, and no request was sent to a printer." — `error.tsx`

**These phrases are the product.** Any redesign must preserve every one of them
at its current surface.
