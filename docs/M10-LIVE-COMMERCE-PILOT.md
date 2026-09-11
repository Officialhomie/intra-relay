# M10 — Live Commerce Pilot: what we're proving, and what's still unproven

**Status: pilot-readiness audit, not a feature milestone.** This document is
the validation contract for M10. It does not add features; it states,
precisely, what the accumulated M1–M10.5 build can prove today, what only real
usage can prove, and what stops the pilot if it goes wrong.

Companion docs: [`PILOT.md`](PILOT.md) (the operator's runbook — recruitment,
checkpoints, evidence pack, daily log; **written before M10.5** and still
accurate for everything except the economic path — see §4 below),
[`ANALYTICS.md`](ANALYTICS.md) §20 (the funnel this pilot is measured against),
[`M10-BUSINESS-READINESS.md`](M10-BUSINESS-READINESS.md) (what a pilot
business must provide), [`M10-OPERATOR-RUNBOOK.md`](M10-OPERATOR-RUNBOOK.md)
(the step-by-step operator process), `CLAUDE.md` §4 (safety rules — still
apply, without exception).

---

## 1. What exactly are we proving?

One sentence: **that a real person with a real need can get it met through
Intra, end to end, without a developer in the loop.**

Unpacked, the thesis has five parts, and M10 succeeds only if all five hold for
at least one real transaction:

1. A real buyer can express a genuine need in their own words and Intra turns
   it into a usable, structured brief without confusing them.
2. A real business — not a seeded fixture — can respond with a real quote
   through a workflow they actually complete themselves (operator-assisted
   activation only, per BR-002).
3. The buyer can make an informed choice: understand what they're agreeing to,
   including that the price could change and what happens next.
4. The commercial and, optionally, the on-chain economic exchange completes
   with the safety invariants intact — human approval preserved at every
   money-adjacent step, nothing fabricated.
5. The two parties can complete a handover and the system can produce evidence
   that it happened — without over-claiming what that evidence proves.

Printing is the only pilot vertical (Phase 4 below). This is a depth test, not
a breadth test.

## 2. What assumptions are still unproven?

Everything downstream of "the code runs and the tests pass." Concretely:

- That a real, non-technical Nigerian SME can complete quick-start onboarding
  **unassisted** and understand what "pricing model" and "consent to display a
  quote" mean without a developer explaining it.
- That a real buyer's natural-language request produces a brief the business
  finds usable — not just one that passes Zod validation.
- That the recommendation and its caveats ("Intra has not independently
  verified this quote") are legible to someone who has never seen the product,
  not just to whoever wrote the copy.
- That a real business responds inside a time window a buyer will actually
  wait for.
- That a real buyer trusts an on-chain USDC payment enough to use MiniPay
  instead of just messaging the business on WhatsApp directly (this is
  genuinely unknown — MiniPay has zero real transactions as of this document).
- That push notifications reach and are acted on outside a lab — a real phone,
  backgrounded app, cold notification tap → resume.
- That the handover protocol (buyer states a code, merchant signs) is something
  two real, non-technical people can complete without a facilitator explaining
  each step.
- That the evidence produced (`GET /api/operator/evidence/[taskId]`) actually
  answers the question a skeptical outsider would ask: _did this really
  happen?_

None of these are things more code can prove. Only people can.

## 3. What parts are already proven by automated tests?

As of this document: **696 tests, 81 files, 0 failures**, plus a green
`tsc`/`lint`/`format:check`/`build`. What that coverage actually establishes —
and, as importantly, what it does _not_:

| Proven by tests                                                                                                                                                                                                   | NOT proven by tests                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The deterministic commerce state machine (task → quote → approval → handoff) transitions correctly and rejects invalid transitions                                                                                | Whether a real business or buyer understands what state they're in                                                                        |
| Every payment-adapter failure mode (x402: bad auth, unreachable facilitator, indeterminate settlement) degrades honestly, never fabricates                                                                        | Whether a real buyer trusts the payment enough to use it                                                                                  |
| MiniPay: every `verifyOrderPayment` mismatch (wrong chain / contract / recipient / amount / reverted tx) → `FAILED`, never a false `CONFIRMED`; replay blocked; a throwing analytics call can't affect settlement | That a real MiniPay transaction, on a real phone, in a real wallet, actually confirms this way — **zero real transactions have happened** |
| The handover protocol's crypto (EIP-712 typed-data signing, delegated `attestByDelegation`) verifies correctly against a wrong signer, an expired deadline, a wrong code                                          | Whether two real people (merchant with a wallet, buyer relaying a code) can complete it without help                                      |
| Notification dedupe, push payload shape, preference gating                                                                                                                                                        | Whether a real push notification, on a real locked phone, actually gets tapped and resumes the workflow                                   |
| Every analytics event's shape is sanitized (no raw text, no secrets, no PII) before it can leave the process                                                                                                      | Whether the resulting funnel data tells a story anyone can act on                                                                         |
| The full economic/attestation stack is _armed_ in production: `NETWORK_ENV=production`, a funded signer, both EAS schemas registered on Celo mainnet (verified via `getSchema`)                                   | That any of it has ever fired for a real transaction — it hasn't                                                                          |

The test suite answers "does the machine behave correctly." The pilot answers
"do the humans."

## 4. What can ONLY be proven with real users?

Everything in §2. Concretely, the checkpoints in `docs/PILOT.md` §7 remain the
mechanism: SME onboarding rehearsal (timed, unassisted, observed not coached),
buyer first-use test (silent observation, natural phrasing encouraged), the
first real notification round-trip on a real device, and the first real
economic transaction.

**What changed since `PILOT.md` was written (2026-09-06):** that document
predates M10.5. It assumed the buyer's final payment is always an off-platform
WhatsApp exchange (x402 being the only on-chain path, and only for the agent
query fee — which stays honestly `UNAVAILABLE`, no key configured). As of this
document, MiniPay is a second, **optional**, on-chain settlement surface for
the order itself. `PILOT.md`'s recruitment, rehearsal, and checkpoint
structure is unchanged and still the operating process; only its economic-path
assumptions are extended, not replaced — see §5 Layer E below and
`docs/PAYMENTS.md`'s MiniPay live-test runbook for the one thing that's
genuinely new: a real MiniPay transaction is now part of "the first real
economic transaction" checkpoint, as an alternative to (not a replacement for)
the WhatsApp cash/transfer path.

## 5. Live-pilot readiness audit — layer by layer

Classification key: **READY** (code-complete, tested, deployed or one merge
away) · **BLOCKED** (a real dependency is missing) · **MANUAL OPERATOR STEP**
(works, requires a human in the loop by design — acceptable for M10's scale)
· **NEEDS REAL-WORLD TEST** (code is ready; only real usage validates it).

### A. Buyer

**READY**, with one caveat. The conversational entry (`/agent` →
`ConversationView` → `AgentConsole`) is the pilot's primary, fully-instrumented
path: intent classification, field extraction, discovery, recommendation, and
the full buyer analytics funnel (§20 in `ANALYTICS.md`) all fire from there.
Deterministic fallback (no `ANTHROPIC_API_KEY` behavior) and the bounded model
layer (≤4 calls/run, 12s timeout, schema-validated) are both tested and were
live-verified against a real Anthropic call in Phase D.

**NEEDS REAL-WORLD TEST**: whether real natural-language phrasing (not the
brief's own scripted examples) reliably classifies and extracts correctly.

**Caveat, not a blocker**: `/request` (the structured-form entry, PRD S-002)
is unregistered with analytics and de-navigated since M7 — see
`ANALYTICS.md` §20. It still works; it just isn't the recruited path.

### B. Business

**MANUAL OPERATOR STEP + one genuine gap.** Two onboarding forms exist:
quick-start (`/supplier/onboard`, the recommended one-screen setup) and full
onboarding (`/supplier/onboard/full`, operator-assisted, detailed). Route
**activation is always operator-gated** (`OPERATOR_API_KEYS`) by design
(BR-002) — this is the intended manual step, not a bug.

**Genuine gap found in this audit**: quick-start **never collects a payout
address at all** — it stores the literal zero address as a placeholder
(`src/features/businesses/quick-start.ts`). Full onboarding only collects one
if the merchant opts into "let AI agents pay a small fee" — a checkbox framed
entirely around the x402 query fee, with no indication that the same field is
also the MiniPay order-settlement destination. The activation checklist's
`publicAddressVerified` is a checkbox an operator ticks; nothing in
`changeRouteStatus` validates the address is real (`routeHasRequiredFields`
only checks the string is non-empty — the zero address passes). Full detail
and the fix applied this milestone: [`M10-BUSINESS-READINESS.md`](M10-BUSINESS-READINESS.md).

**NEEDS REAL-WORLD TEST**: whether a real SME completes quick-start
unassisted, and how long it takes (`PILOT.md` §5's timed rehearsal).

### C. Quote

**READY.** All three pricing models (`FIXED`, `STARTING_FROM`,
`QUOTE_REQUIRED`) are implemented and tested; quote revision, expiry, and the
immutable-once-accepted rule are all covered by the integration suite built
across M5/M6.

**NEEDS REAL-WORLD TEST**: whether a real SME's quote response time is fast
enough that a real buyer doesn't abandon (`PILOT.md` §6).

### D. Acceptance (human approval)

**READY.** `decideOnQuote` is the single, tested chokepoint; `ACCEPT` is never
an LLM-callable tool (ADR-019); a stale/expired quote is flagged, never
silently auto-accepted.

### E. MiniPay payment

**READY, but not yet live**, plus the gap fixed in §B above. M10.5 is
code-complete: 696 tests including every verification-mismatch branch, replay
protection, and an end-to-end `create → submit → verify → CONFIRMED` lifecycle
against a fake receipt client. **`NETWORK_ENV=production` is already set in
Vercel** — the moment
[PR #2](https://github.com/Officialhomie/intra-relay/pull/2) merges to
`master`, MiniPay goes live for any business with a real payout address, with
no further env change.

**Blocking action**: merge PR #2. That is Victor's call, not an automated
step — see `docs/PAYMENTS.md`'s note on why this session left it open.

**NEEDS REAL-WORLD TEST (§41 in `docs/PAYMENTS.md`)**: one genuine end-to-end
MiniPay transaction — a physical Android phone in MiniPay dev mode, a wallet
funded with a few dollars of USDC on Celo, a real SME with a **real** payout
address (not the placeholder — see §B). Zero real MiniPay transactions have
happened. **MiniPay is optional** for a successful pilot transaction — the
WhatsApp handoff is always the fallback, and a transaction that completes
entirely off-platform (as every transaction has until now) still counts as a
successful pilot workflow.

### F. Fulfilment (Proofline)

**READY.** Two-event pilot (merchant marks ready, buyer confirms pickup),
fully tested, explicitly labeled "operational evidence, not proof or
settlement" everywhere it's shown. **Fixed this milestone**: the buyer's own
confirmation had no analytics signal at all (`fulfilment_completed`, new — see
`ANALYTICS.md` §20).

**NEEDS REAL-WORLD TEST**: whether real participants use it at all — it's
explicitly optional (FR-PROOF), so a completed pilot transaction with zero
Proofline events is not a failure.

### G. Handover

**READY, live on Celo mainnet.** The two-party EAS `attestByDelegation` flow
(merchant signs off-chain, Intra relays — never the attester) is built, tested
(9 integration tests), and armed in production: both schemas registered on
Celo mainnet (verified via read-only `getSchema`), a funded relayer
(`0xb7bA9Dac…74E61`, ~4 CELO as of the last check). The commitment attestation
already fires automatically, for real, on every buyer approval today.

**NEEDS REAL-WORLD TEST**: whether a real merchant can complete
`eth_signTypedData_v4` from their own injected wallet without help — this has
never happened outside a test or a local key.

### H. Evidence

**READY.** `GET /api/operator/evidence/[taskId]` (`evidence/trace.ts`)
reconstructs one transaction from `commitments`, `handover_attestations`,
`order_payments`, and `audit_events` by `taskId`, cross-checks consistency
(does the handover reference the commitment's attestation UID? does the
confirmed payment's recipient match the business's on-file payout address?),
and states plainly what it is not: not a check by Intra of quality, quantity,
or satisfaction (M9 §18). Everything in the evidence pack template
(`PILOT.md` §9) is either already exposed here or is a plain DB field an
operator can read directly.

**NEEDS REAL-WORLD TEST**: whether the assembled evidence actually reads as
convincing to someone outside the project (a judge, an investor, a skeptical
SME) — that is a communication question, not a code question.

---

## 6. What constitutes a successful real transaction?

All of the following, for one `taskId`:

1. A real buyer, using their own words, reached `HANDOFF_READY` through the
   conversational flow.
2. A real business (not a seeded fixture) supplied the quote, through a
   workflow they completed themselves up to activation.
3. The buyer made an informed, explicit accept decision (`buyerDecision =
ACCEPTED`, `offerFingerprint` bound).
4. The commercial exchange completed — either the WhatsApp handoff (the buyer
   confirms they sent it) or a confirmed MiniPay payment (`GET
.../order-payment` → `status: CONFIRMED`, receipt verified server-side).
5. The buyer confirmed the handoff (`task.handoffConfirmedAt` set) —
   `workflow_completed` fires. This is the one non-optional terminal signal.
6. Optionally, the two parties completed the merchant-signed handover
   attestation and/or Proofline pickup confirmation.
7. `GET /api/operator/evidence/[taskId]` reconstructs the whole thing
   consistently, with no manual DB edit to make it match (§26 in `PILOT.md`).

A transaction that completes steps 1–5 with **no** MiniPay payment and **no**
Proofline event is still a genuine success — those two are additive, not
required.

## 7. What evidence must be captured?

Unchanged from `PILOT.md` §9: task reference, quote record, buyer approval
(timestamp + `offerFingerprint`), any Celo tx hash(es) (commitment
attestation, handover attestation, and now optionally a MiniPay settlement
tx), EAS UIDs + `celo.easscan.org` links, provider identity (payout address;
`providerAgentId` — still `"0"`, documented, not hidden), buyer identity
(opaque session prefix only), timestamps per step, handover completion (who
signed, when), and the outcome. Cross-check against `GET
/api/operator/evidence/[taskId]`. No personal data in anything judge-facing.

## 8. What metrics define the funnel?

The full mapping and the Amplitude funnel definition live in
[`ANALYTICS.md` §20](ANALYTICS.md#20-m10-live-commerce-pilot--the-one-end-to-end-funnel-2026-09-11)
— built by reviewing the existing 58-event tracking plan first: **13 of the
15 required funnel steps already exist under a different, equivalent name;
exactly two genuinely new events were added** (`payment_intent_created`,
`fulfilment_completed`), each closing a real, concrete instrumentation gap
found during this audit rather than duplicating something that already
existed.

## 9. What failure states terminate or pause the pilot?

Unchanged from `PILOT.md` §8 — this document does not loosen it:

- **P0** (security / financial integrity / authorization / false completion /
  wrong identity) → **STOP the pilot immediately.** Fix before any further
  activity.
- **P1** (blocks a core workflow) → fix before continuing to the next
  checkpoint.
- A payment showing `CONFIRMED` without a matching, independently-verifiable
  Celo receipt is automatically P0 — the test suite exists specifically to
  make this class of bug unreachable in code, but a real transaction is the
  first time the _deployed_ system is exercised, not the source.
- Fabricating a user, transaction, quote, settlement, tx hash, attestation, or
  piece of feedback to "keep the pilot moving" is prohibited without
  exception (`CLAUDE.md` §4.1, `PILOT.md` §12) and is itself a P0.

## 10. What is explicitly OUT OF SCOPE for M10?

Per Phase 4 of this audit's brief, restated as a hard boundary:

- No restaurant, electronics, or generic vendor marketplace.
- No nationwide business discovery or automated merchant pricing.
- No multi-vertical marketplace UI. **Printing stays the only pilot
  vertical** — the architecture (category adapters in
  `src/features/intent/domain.ts`, generic pricing models, the route
  abstraction) is already general enough for a future vertical, but adding
  one now would be testing breadth, not the thesis in §1.
- No new payment rail beyond MiniPay + the still-dormant x402 adapter.
- No custody, escrow, or automated settlement beyond what's already built and
  reviewed (`BR-001` stands).
- No feature built merely because a pilot participant suggests it —
  `PILOT.md` §8's "no feature creep" rule stands: record it, don't build it,
  unless it's actively preventing the product from delivering its core
  outcome.

## 11. What must be true before M11 begins?

Every item in `PILOT.md` §7's checkpoint table, through Checkpoint 7 (the
final report), plus:

- At least one real transaction has completed end-to-end (§6 above), with its
  evidence pack captured and cross-checked.
- The M10 final report (`PILOT.md` §11 structure) has been written with a
  **truthful** classification (A–D) — not optimized for morale.
- Per `PILOT.md` §50 and this document: **STOP after the report.** Do not
  auto-start another feature milestone. Return the evidence first, and let
  Victor decide what M11 is, if anything.

This document's own scope ends at pilot-readiness. It does not itself claim
the pilot happened — see §12.

## 12. Current state of this document (2026-09-11)

This audit found and fixed one safety gap (§B, §E — the zero-payout-address
guard) and one instrumentation gap (§F, closed with two new events), all
covered by new tests. It did not run a pilot. Zero real buyers, zero real
non-fixture SMEs, and zero real MiniPay/handover transactions exist as of this
document. The next action is entirely Victor's: recruit per `PILOT.md` §3–4,
then follow [`M10-OPERATOR-RUNBOOK.md`](M10-OPERATOR-RUNBOOK.md).
