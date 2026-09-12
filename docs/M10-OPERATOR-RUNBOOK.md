# M10 — Operator runbook: one business, prospect to completed

The step-by-step process for taking **one** real business from first contact
through its first completed transaction. Written for whoever is acting as
Intra's operator during the pilot (`OPERATOR_API_KEYS`) — today, Victor.

Companion docs: [`BUSINESS_ONBOARDING.md`](BUSINESS_ONBOARDING.md) (the
onboarding questionnaire), [`M10-BUSINESS-READINESS.md`](M10-BUSINESS-READINESS.md)
(exactly what data gates what), [`PILOT.md`](PILOT.md) (recruitment,
checkpoints, the daily log, bug-severity rules — this runbook is the
step-by-step underneath that document's checkpoint table).

Every stage below states: **who** performs it, **what the system does**,
**what evidence** it leaves, **what's automatable**, and **what needs human
judgment**. Stages marked 🤖 are already system-driven; 🧑 are irreducibly
human for this pilot's scale.

---

## PROSPECT

**Who:** operator, off-system. **System does:** nothing yet.

Find a real SME that genuinely does the work (flyer printing — the only pilot
vertical, `M10-LIVE-COMMERCE-PILOT.md` §10), spans one of the three pricing
behaviours (`PILOT.md` §3: fixed / starting-from / quote-required), responds
reasonably fast, is comfortable on a phone, and — new for M10.5 — **controls a
real Celo wallet if they should be able to receive a MiniPay payment**
(`M10-BUSINESS-READINESS.md` — a payout address is only ever collected through
full onboarding).

🧑 Entirely human judgment. Not something to automate for 1–3 SMEs.

## FORM SENT

**Who:** operator. **System does:** nothing — there is no invite/tracking
mechanism today, just a URL.

Send the SME the onboarding link. Decide **which** form up front based on
PROSPECT:

- Needs to receive a real MiniPay payment, or you're filling the form out
  together in person → `/supplier/onboard/full`, and check "Let AI agents pay
  a small fee" so a real payout address is captured (`M10-BUSINESS-READINESS.md`
  explains why this checkbox is the only path to a real address today).
- Otherwise, WhatsApp-handoff-only for now → `/supplier/onboard` (quick-start,
  one screen, five fields, faster).

🧑 The choice of form is a judgment call about this specific SME; sending the
link is trivial and not worth automating for this volume.

## FORM RECEIVED

**Who:** the business, self-serve. **System does (🤖):** quick-start creates
the business **and** its first route in one call, `route.status = DRAFT`;
full onboarding produces a **draft** for the operator to review before
anything is created (nothing exists yet in the database from the full-onboarding
path until the operator acts on it — see the next stage).

**Evidence:** `business.createdAt`; `audit_events` rows `business.created` /
`route.created`; a `manageUrl` shown once to the business (their private link
— not the operator's).

## DATA REVIEW

**Who:** operator, at `/operator` → **Review queue** tab (lists routes in
`DRAFT` / `PENDING_VERIFICATION`). **System does (🤖):** nothing changes state
yet — this is read-only review.

Check against `M10-BUSINESS-READINESS.md`'s three gate lists (discover / quote
/ payment) and the six-item activation checklist in `BUSINESS_ONBOARDING.md`.
**Specifically verify the payout address is real** — the platform will not
stop an operator from activating a route with the zero-address placeholder
(`M10-BUSINESS-READINESS.md`'s gap-and-fix section); this is the one checklist
item that needs an actual look, not just a tick.

🧑 Judgment: is the price genuinely dated and real? Is the service description
something an agent (and a buyer) will actually understand? Is the payout
address real and does this business genuinely control it?

## NEEDS CHANGES

**Who:** operator ↔ business, off-system (WhatsApp/call). **System does:**
nothing — there is no in-app "request changes" flow. The route simply stays
in `DRAFT`/`PENDING_VERIFICATION` until re-reviewed.

🧑 Fully manual, by design, for this scale — building a structured
change-request flow for 1–3 SMEs would be exactly the kind of feature creep
`PILOT.md` §8 warns against.

## VERIFIED → PILOT READY

**Who:** operator only (`OPERATOR_REQUIRED` if attempted without an operator
key). **System does (🤖):** `PATCH /api/routes/[id]/status` with the full
activation checklist → the route becomes `ACTIVE` **and**, in the same
atomic call, `business.verifiedByOperatorAt` / `verifiedByOperatorLabel` are
stamped and `business.status` flips to `ACTIVE`. This is one system action,
not two — "VERIFIED" and "PILOT READY" are the same moment from the
database's point of view; the split above is for the operator's own
checklist, not two separate clicks.

Blocked unless **every** checklist item is `true` and the route has every
required field (name, description, non-empty input schema, a non-negative
query fee, a positive SLA, a non-empty endpoint, and a non-empty — not
necessarily _real_, see DATA REVIEW — payout address).

**Evidence:** `audit_events` row `route.status_changed` (`from`/`to`/`by`);
server-forwarded analytics event `business_ready`. **This is the point a real
buyer can discover the business** (`GET /api/routes/active` starts returning
it).

🤖 The gate itself is fully automated and cannot be bypassed by a non-operator
(tested). 🧑 Deciding the checklist items are actually true is not automatable.

## FIRST REQUEST

**Who:** a real buyer, through `/agent` (the recruited path — see
`M10-LIVE-COMMERCE-PILOT.md` §5.A). **System does (🤖):** conversation →
intent classification → discovery finds the now-active route → a task is
created and submitted; `request_received` fires (server-forwarded, since
there's no browser actor for a merchant-side event) and the merchant gets a
notification.

**Evidence:** `taskId`; `audit_events` `task.submitted`; the buyer's own
funnel events (`ANALYTICS.md` §20). Nothing for the operator to do here except
watch, per `PILOT.md` §6's "observe silently."

## FIRST QUOTE

**Who:** the business, from `/supplier/[slug]/requests` (their manage-token
link). **System does (🤖):** `POST /api/routes/[id]/quotes` records the
quote, notifies the buyer, `quote_sent` fires.

**Evidence:** `quotes` row; response latency is already tracked
(`quoteResponses.latency` in `/api/pilot/funnel`) — this is the number
`PILOT.md` §10's three-SME comparison table wants.

🧑 Nothing operator-side unless the business needs help using the form —
that's the SME onboarding rehearsal's job (`PILOT.md` §5), not a recurring
operator task.

## FIRST PAYMENT

**Who:** the buyer, choosing between two paths — both are legitimate
successful outcomes (`M10-LIVE-COMMERCE-PILOT.md` §6):

1. **WhatsApp handoff** (always available): buyer accepts → copies the
   pre-filled message → sends it themselves → confirms they sent it
   (`task.handoffConfirmedAt`, fires `workflow_completed`). The actual payment
   happens entirely off-platform — Intra never sees it.
2. **MiniPay** (once [PR #2](https://github.com/Officialhomie/intra-relay/pull/2)
   is merged, and only if the business has a real payout address): buyer
   accepts → the "Pay for your order" panel appears → taps "Pay with
   MiniPay" → their wallet confirms → the server independently verifies the
   on-chain receipt before ever showing "Payment confirmed"
   (`docs/PAYMENTS.md`'s MiniPay section has the full mechanics).

**System does (🤖):** everything past the buyer's own tap/send is automatic
and safety-gated (human commercial approval, then human wallet approval,
never combined; server-side verification only, never a trusted client
"success"). **Operator does nothing** for this step unless something breaks.

**Evidence:** `task.handoffConfirmedAt`, and/or `order_payments` row +
on-chain receipt. If using MiniPay for the pilot's first real transaction,
follow `docs/PAYMENTS.md`'s live-test runbook exactly — physical phone,
funded wallet, real SME payout address.

## FULFILLED

**Who:** the business, from their requests page (manage token). **System does
(🤖):** `POST /api/tasks/[id]/proofline/ready` records `READY_FOR_PICKUP`,
generates a one-time pickup code, `fulfillment_started` fires.

**Optional** (`FR-PROOF`) — a completed pilot transaction with no Proofline
event at all is still a full success.

## HANDED OVER

Two independent things can happen here — don't conflate them:

1. **The buyer physically receives the order** and optionally confirms it in
   Proofline (`BuyerPickupPanel` → `fulfilment_completed`, new this
   milestone). Operational evidence only, explicitly labeled "not a
   cryptographic proof, not a payment settlement" everywhere it's shown.
2. **The two-party handover attestation**: the merchant, from
   `HandoverAttestPanel`, is asked for the code the buyer read out and signs
   an EIP-712 typed-data message with their own wallet (`eth_signTypedData_v4`)
   — Intra relays it on-chain (paying gas) but is never the attester. This
   writes a real EAS attestation on Celo mainnet today (both schemas
   registered, a funded relayer).

**Who:** buyer (Proofline confirm) and merchant (handover signature) — no
operator action in the happy path.

🧑 **Needs real-world test**: whether a real, non-technical merchant can
complete `eth_signTypedData_v4` from their own wallet without a facilitator
standing over their shoulder. This has never happened outside a test.

## COMPLETED

**Who:** operator, at `/operator` → **Evidence** tab, or directly `GET
/api/operator/evidence/[taskId]`. **System does (🤖):** reconstructs the whole
transaction by `taskId` — quote, commitment, payment (if any), handover (if
any), and a consistency cross-check (does the confirmed payment's recipient
match the business's on-file payout address? does the handover reference the
commitment's attestation UID?).

**Evidence to capture** (the pack described in full in `PILOT.md` §9 and
`M10-LIVE-COMMERCE-PILOT.md` §7): task reference, quote terms, buyer approval
timestamp + `offerFingerprint`, any Celo tx hash(es), both EAS UIDs +
`celo.easscan.org` links, provider identity, buyer identity (session prefix
only), per-step timestamps, and the plain-language outcome. **Never hand-edit
a record to make it match** — if the evidence is inconsistent, that inconsistency
is itself the finding.

🤖 Assembly is fully automated (`buildTransactionTrace`). 🧑 Judging whether
the assembled evidence actually tells a convincing, truthful story is not.

---

## After the first completion

Log it in the daily operator log (`PILOT.md` §8), classify anything that went
wrong by severity (P0 stops the pilot; `PILOT.md` §8's table), and check it
against the first-transaction gate (`PILOT.md` §7): buyer flow, business flow,
notification, human approval, fulfilment, handover, and evidence must **all**
have worked, with no open P0/P1, before recruiting past this one SME/buyer
pair. Then repeat PROSPECT → COMPLETED for SME B and SME C
(`PILOT.md` §3's three deliberately different pricing models), and follow the
checkpoint table through to the final report.
