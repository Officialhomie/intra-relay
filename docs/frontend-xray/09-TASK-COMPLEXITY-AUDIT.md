# 09 — Task Complexity Audit

> A ruthless count of what each workflow demands of the user: things to
> understand, read, decide, enter, tap, remember, verify, wait for, recover
> from. Then, per workflow:
>
> ```
> USER GOAL
>  → MINIMUM NECESSARY USER ACTIONS
>  → CURRENT USER ACTIONS
>  → SYSTEM ACTIONS THAT COULD BE ABSTRACTED
>  → TECHNICAL DETAILS THE USER CURRENTLY ENCOUNTERS
>  → POTENTIAL COGNITIVE LOAD
> ```
>
> **The objective is to expose every place the interface makes the user think
> about the implementation instead of the outcome.** Nothing is redesigned.
> "Minimum necessary" respects the abstraction boundary ([`02` §5]) — a required
> consent / decision / verification counts as necessary.

---

# Counting method

For each workflow the columns are:

- **Understand** — concepts the user must hold to proceed correctly
- **Read** — distinct blocks of copy on the critical path (labels, callouts,
  helper text) — approximate
- **Decide** — genuine choices (not "click Next")
- **Enter** — fields typed / selected
- **Tap** — button/link/checkbox taps on the happy path
- **Remember** — things carried between screens/sessions with no system support
- **Verify** — things the user must check for correctness
- **Wait** — async waits (with the system's own feedback)
- **Recover** — failure modes the user may have to handle

---

# W1 — Buyer: get a printing quote (conversational, `/agent`)

| Understand | Read | Decide |    Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | -------: | --: | -------: | -----: | ---: | ------: |
|          4 |  ~14 |    2–4 | 1–5 msgs | 3–8 |        1 |      3 |    2 |       4 |

- **Understand**: (1) the assistant turns my words into a request; (2) it stops
  for my decision; (3) I send the WhatsApp message myself; (4) the conversation
  isn't saved (but my request is — the label doesn't make this clear).
- **Read**: intro message, demo `Callout`, per-turn replies, "So far:" chips,
  stage labels (7), the recommendation ("Why this one?", trade-offs,
  uncertainties), the approval `dl` (6 rows), `finalOrderStatement`, the outcome
  4-step list.
- **Decide**: keep talking vs proceed; correct the brief or not; accept or
  decline; (if declining) give a reason.
- **Enter**: 1–5 natural-language messages; possibly 1–5 correction fields.
- **Tap**: send (×1–3), maybe "Not quite right?" + "Use these details", "Approve
  {price} with {business}", "Open your order and copy the message".
- **Remember**: the task exists in `BuyerWorkPanel` — but only on this device.
- **Verify**: that the agent understood the brief; the price and business on the
  approval card; the quote isn't expired.
- **Wait**: discovery + quote requests (the "waiting for N printers to reply"
  stage — genuinely async).
- **Recover**: run expired (30 min), run stuck, `CLARIFICATION_NEEDED`,
  `NO_VIABLE_OFFER` / `FAILED`.

**GOAL**: "get a real price from a real business, and decide."
**MINIMUM NECESSARY**: 1 message (or a few) + 1 decision (accept/decline) + send
the message + confirm sent. = **~4 intentional actions**.
**CURRENT**: ~3–8 taps + 1–5 messages + (optional) a correction.
**COULD BE ABSTRACTED**: the entire discovery/scoring/quote-request loop is
already abstracted to a 7-stage spine; nothing more should be hidden here.
**TECHNICAL DETAILS ENCOUNTERED**: none on the happy path (the engineering trace
is 2 `<details>` deep). The ✨ "agent's reasoning" label. "Agent query fee" in the
recommendation `<details>`.
**COGNITIVE LOAD**: **Low-to-moderate.** The main load is _waiting_ and _trust_
("is this price OK? can I trust a business I've never heard of?") — which the
"What I cannot confirm" / "Not independently verified" copy addresses directly.
The "Demo only" label adds a small "is this real?" doubt.

---

# W2 — Buyer: get a printing quote (form, `/request`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          3 |   ~9 |      2 |     6 |   3 |        1 |      2 |    1 |       3 |

- **Enter**: Paper size, copies, colour, deadline, delivery area, + pick a
  printer. (Defaults: A5 / 100 / full-colour — so **3 fields** are effectively
  required.)
- **Decide**: the brief values; which printer.
- **Tap**: "Find a printing quote", pick a printer radio, "Send request & get a
  quote".
- **Wait**: the printer's response (then the user is on `/tasks/:id`).

**GOAL**: same as W1.
**MINIMUM NECESSARY**: 3 field values + 1 printer choice + submit = **~5 actions**
(before the decision, which happens on `/tasks/:id`).
**CURRENT**: ~5 fields + 1 radio + 2 taps.
**COULD BE ABSTRACTED**: the two-phase (brief → pick) split is a small friction;
the printer list is a radio group of 1–2 items.
**TECHNICAL DETAILS ENCOUNTERED**: none. "replies within N min" and "Prices
confirmed X ago" are user-relevant, not implementation.
**COGNITIVE LOAD**: **Low.** It's a 3-field form. The risk is the empty state
("No printers are live yet") which gives the user nothing to do but wait.

---

# W3 — Buyer: decide on a quote + hand off (`/tasks/:id`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          5 |  ~22 |    2–3 |   0–1 | 4–7 |        2 |      4 |    1 |       3 |

- **Understand**: (1) the quote is the printer's figure, not verified; (2) my
  decision is separate from sending the order; (3) I send + agree the order
  directly; (4) the handover code proves I collected it; (5) if I pay via
  MiniPay, that's a _separate_ approval.
- **Read**: the brief `DataList`, the quote card (8 rows + 2 status labels),
  "Intra's read of this quote" (total, per-flyer, "Why this looks OK",
  "What Intra cannot confirm", the verification note), the decision panel copy,
  the handoff card copy + the full pre-filled message, the "Intra does not send
  this" callout, the handover code panel, the order-problem panel copy.
- **Decide**: proceed vs not; (if not) a reason; whether to pay via MiniPay.
- **Enter**: an optional decline reason.
- **Tap**: "Proceed with this printer" → "Copy message" / "Open in WhatsApp" →
  "I've sent this to the printer" (+ optionally "Pay with MiniPay" → wallet
  approve → the button auto-advances).
- **Remember**: the handover code (to say aloud later); that the task is on this
  device.
- **Verify**: the price and business; the quote isn't expired; the pre-filled
  message is correct; the payment amount + recipient (if paying).
- **Wait**: (if paying) network confirmation.
- **Recover**: quote expired, decline by mistake (no undo), payment failure,
  wallet rejection, "another device".

**GOAL**: "go ahead with this printer, and get my order to them."
**MINIMUM NECESSARY**: read the quote → 1 decision → copy/send the message → 1
"sent" confirmation = **~4 intentional actions**.
**CURRENT**: ~4–7 taps across 2–3 panels.
**COULD BE ABSTRACTED**: the "sent" self-report is a necessary honesty step
(Intra can't observe WhatsApp) — keep it. The x402 `PaymentReceipt` card
(usually `UNAVAILABLE`) adds a block the buyer must parse and dismiss mentally.
**TECHNICAL DETAILS ENCOUNTERED**:

- the x402 `PaymentReceipt` — "Agent service payment", `UNAVAILABLE`, and on the
  rare `SETTLED` path: `attributionTag`, atomic amounts, CAIP-2 network, "via
  agent payment protocol" ([`02` P1]).
- the raw brief keys in the WhatsApp message (`size:`, `full-colour`).
- "Proofline pilot" as a label the buyer has no context for.
- the contact channel type shown as `whatsapp` (lowercase enum) in `HandoffCard`.
  **COGNITIVE LOAD**: **Moderate-to-high.** This screen carries the most panels and
  the most conditional rendering in the app. A `HANDOFF_READY` task with a MiniPay
  option shows: quote card + recommendation card + `PayPanel` + `HandoffCard` +
  `HandoverCodePanel` + `OrderProblemPanel` + activity + feedback = **7–8 stacked
  blocks**. The user must figure out which one is the current action.

---

# W4 — Buyer: pay the order via MiniPay (`PayPanel`)

| Understand | Read | Decide | Enter |          Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | -----------: | -------: | -----: | ---: | ------: |
|          3 |   ~8 |      2 |     0 | 2–3 + wallet |        0 |      2 |    1 |       4 |

- **Understand**: (1) I approve the wallet transaction (separate from the
  commercial approval); (2) NGN is converted to USDC at a locked reference rate;
  (3) Intra never holds it.
- **Read**: "You've agreed the price with {business}…", the `DataList` (Business
  / Order / Amount / "You'll pay {n} USDC" + rate hint / "Goes to {short}"),
  "Your wallet will ask you to confirm this payment. The network fee is paid from
  your wallet balance.", the phase callouts.
- **Decide**: pay via wallet vs WhatsApp handoff; approve/reject in the wallet.
- **Enter**: nothing in Intra (the wallet handles the rest).
- **Tap**: "Pay with MiniPay" → [wallet approve] → the panel auto-advances.
- **Verify**: the USDC amount and the NGN it converts from; the recipient (short
  address).
- **Wait**: "We're waiting for the network to confirm it. This page updates on
  its own." (~seconds to ~100s).
- **Recover**: wallet rejection, wrong chain, rate source down, verify hiccup.

**GOAL**: "pay the business now."
**MINIMUM NECESSARY**: 1 tap + 1 wallet approval = **2 actions**.
**CURRENT**: exactly that (the panel does the rest).
**COULD BE ABSTRACTED**: nothing more should be — the wallet approval is a
required, separate human action (M10.5 §34).
**TECHNICAL DETAILS ENCOUNTERED**: "USDC", "network fee", a shortened `0x…`
address, the reference-rate source name, an explorer link on the receipt. **No
ABI, no contract address, no chain-id, no atomic units on the default view** —
this is well-abstracted.
**COGNITIVE LOAD**: **Low.** The one real ask is trust in the FX rate + the
recipient, both of which are shown. The "you can close this and come back" copy
removes the "did it work?" anxiety.

---

# W5 — Buyer: confirm pickup (Proofline)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          2 |   ~6 |      1 |   0–1 | 1–2 |        0 |      1 |    0 |       1 |

- **Understand**: it's optional; it records only what I confirm (not proof).
- **Enter**: nothing, or a pickup code if collecting from another phone.
- **Tap**: "Confirm I've collected this order" (or "Have a pickup code instead?"
  → enter → "Confirm with code").
- **Recover**: `NOT_READY_FOR_PICKUP` (merchant hasn't marked ready).

**GOAL**: "record that I collected my order."
**MINIMUM NECESSARY**: 1 tap.
**CURRENT**: 1 tap (2 + a field for the code path).
**TECHNICAL DETAILS ENCOUNTERED**: "Proofline pilot" (jargon); the disclaimer.
**COGNITIVE LOAD**: **Very low.** The main friction is understanding what
"Proofline pilot" and "operational evidence" mean — a buyer will likely just tap
the button.

---

# W6 — Buyer: the handover code (`HandoverCodePanel` + say aloud)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          1 |    2 |      0 |     0 |   0 |        1 |      0 |    0 |       0 |

- **Remember**: the 6-char code, to say to the merchant at collection.
- No taps — it's read-only in the app; the action is verbal, in person.

**GOAL**: "give the merchant proof I was there."
**COGNITIVE LOAD**: **Very low in the app**, but there's an unstated coordination
burden (the buyer must have the app open, or remember the code, at collection —
and not confuse it with the merchant's _pickup_ code, which looks identical).

---

# W7 — Buyer: decide on a proposed price change (`PriceChangePanel`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          2 |   ~5 |      1 |     0 |   1 |        0 |      2 |    0 |       1 |

- **Understand**: the agreed price stands until I choose; if I accept, any
  payment I'd started is void.
- **Read**: "{business} wants to change the price", the money sentence, the `dl`
  (5 rows), the "still stands until you decide" callout.
- **Decide**: accept the new price vs keep the agreed one.
- **Verify**: the old vs new amount; the business's reason.

**GOAL**: "respond to the price change."
**MINIMUM NECESSARY**: read + 1 decision = **1 action**.
**CURRENT**: exactly that.
**COGNITIVE LOAD**: **Low.** The panel does the money math ("NGN 700 more") and
shows the reason verbatim.

---

# W8 — Buyer: cancel an agreed order / report a failed handover

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          2 |   ~5 |      2 |   0–1 |   3 |        0 |      0 |    0 |       1 |

- **Understand**: Intra held no money — nothing to refund here; the two parties
  sort it out directly.
- **Tap**: open the `<details>` → "Cancel this order" / "The pickup or handover
  failed" → the action button.
- **Enter**: an optional note.

**GOAL**: "back out / flag a problem."
**COGNITIVE LOAD**: **Low.** The "nothing to refund here" copy pre-empts the main
confusion.

---

# W9 — Business: quick-start onboarding (`/supplier/onboard`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          3 |  ~16 |      3 |  9–11 |  ~5 |        1 |      2 |    0 |       2 |

- **Understand**: (1) an operator verifies before customers can reach me; (2) I
  send every quote; (3) customers pay me directly (Intra holds nothing).
- **Read**: the value-prop copy (H1 + subcopy + 3-step grid + 4 `WHY` cards),
  "What we will never ask for" callout, the 3 card titles, the pricing-model
  cards (label + explanation + example ×3), the consent copy, "No card, no
  wallet…", the success card + "Keep this link" callout.
- **Decide**: category; pricing model; consent (an explicit tick).
- **Enter**: businessName, category, serviceName, pricingModel, [priceAmount,
  priceUnit], city, serviceArea, contactName, contactChannelValue, consent =
  **9–11 fields**.
- **Tap**: 3 pricing radio cards, the consent checkbox, "Set up my business",
  "Open your workspace".
- **Remember**: the manage link (`?t=…`) — **the only way back in**.
- **Verify**: the WhatsApp number; the price.
- **Recover**: `INVALID_BODY` field errors; `409 BUSINESS_EXISTS`.

**GOAL**: "let customers find my service."
**MINIMUM NECESSARY**: name, what I do, service name, price (or "quote per job"),
city, area, contact name, WhatsApp number, consent = **9 fields** — all genuinely
needed (a business can't be callable without them).
**CURRENT**: 9–11 fields, 1 screen, ~5 taps.
**COULD BE ABSTRACTED**: category → template selection, the slug, the `/v1`
endpoint, the manage-token generation, the DRAFT lifecycle — **all already
hidden.**
**TECHNICAL DETAILS ENCOUNTERED**: essentially none. "manage link" / "it is not a
wallet key" is the only crypto-adjacent phrase, and it's a reassurance.
**COGNITIVE LOAD**: **Moderate.** It's a 9-field form with 3 real decisions, on
one screen, with the value prop in-flow. The pricing-model choice is the only
genuine head-scratcher, and the 3 example lines address it. The manage-link
"remember this" burden is the biggest risk.

---

# W10 — Business: full onboarding (`/supplier/onboard/full`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          4 |  ~28 |      4 |    15 | ~10 |        2 |      3 |    0 |       3 |

- **Enter**: 15 fields over 4 steps (businessName, contactName, channel type +
  value, city, country, serviceArea, operatingHours, turnaround, category,
  serviceSummary ≤ 280, quoteResponseTime, quoteCurrency, wantsPaidQueries,
  [payoutAddress]).
- **Tap**: ~10 (per-step "Continue" ×3, radio/checkbox selections, "Preview my
  Capability Card").
- **Remember**: the review URL (`draftRouteUrl`); the fact that they must now
  **email an operator a JSON blob**.
- **Recover**: per-step validation; the artificial "Preparing…" failure.

**GOAL**: same as W9, with an operator's help.
**MINIMUM NECESSARY**: the 9 from W9 + maybe area/hours/turnaround for a richer
card = ~12.
**CURRENT**: 15 fields, 4 steps, and **the workflow does not complete in the
app** — it ends at `DraftRoutePreview` with "Send these answers to your Intra
operator."
**COULD BE ABSTRACTED**: everything W9 abstracts, plus — critically — the
persistence itself. The full form is the same shape as quick-start plus 4 fields;
there's no technical reason it produces a draft instead of a business.
**TECHNICAL DETAILS ENCOUNTERED**: "Capability Card", "MCP server", "route",
"ACTIVE" (caps enum), "Agent query fee", "$0.02", "Public Celo payout address",
and — in the `<details>` — the **raw route JSON**.
**COGNITIVE LOAD**: **High, and misdirected.** The merchant does 15 fields of
work and 4 decisions, then has to understand that (a) nothing was saved, (b) they
must find an operator, (c) they must send them a JSON payload. This is the single
worst load-to-outcome ratio in the product ([`00` §20 #3], [`02` P5]).

---

# W11 — Business: send a quote (`QuoteResponseForm`)

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          3 |  ~10 |    3–4 |   2–8 | 3–5 |        0 |      2 |    0 |       2 |

- **Understand**: (1) the buyer sees these figures as my quote; (2) Intra doesn't
  verify them; (3) an expiry means they must ask again.
- **Read**: the brief `DataList` (5 rows), the quote/decline toggle, field
  labels + hints (~8), "How the buyer sees this" callout.
- **Decide**: quote vs decline; **fixed vs range**; whether to set an expiry;
  **confidence level** (low/med/high); whether to add delivery/availability/
  assumptions.
- **Enter**: at minimum `amountMin` + `turnaround` (2 fields); at maximum 8
  (amountMin, amountMax, deliveryCharge, turnaround, availabilityNote,
  assumptions, confidence, expiresAt).
- **Tap**: the toggle, price-type select, maybe the "Add more detail" `<details>`,
  "Send quote to buyer".
- **Verify**: the amount; the turnaround.
- **Recover**: `QUOTE_EXISTS`, `ROUTE_UNAVAILABLE`, validation.

**GOAL**: "answer this customer with a price."
**MINIMUM NECESSARY**: amount + turnaround + send = **3 actions**.
**CURRENT**: 2–8 fields + a fixed/range decision + a confidence decision + a
`datetime-local` picker (if setting an expiry).
**COULD BE ABSTRACTED**: `confidence`, `fixed` vs `range`, and the
`datetime-local` expiry are precision the persona may not want — they're behind a
`<details>` in part, but `fixed/range` and the confidence default are on the main
form.
**TECHNICAL DETAILS ENCOUNTERED**: "Estimated range", "Confidence" (low/med/high),
`datetime-local` (a 2-step mobile picker), "Assumptions" as a field label.
**COGNITIVE LOAD**: **Moderate, and higher than it needs to be** for the
"just send a number and a turnaround" common case. This is the app's
highest-frequency merchant interaction (`AGENTIC_ARCHITECTURE.md` §5.3).

---

# W12 — Business: revise a price / edit a published price

| Understand | Read | Decide | Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | --: | -------: | -----: | ---: | ------: |
|          3 |   ~7 |    1–2 |   2–3 | 2–3 |        0 |      1 |    0 |       1 |

- **Understand**: before acceptance the new price replaces the old; after
  acceptance it's a _request_ the customer must accept; editing the _published_
  price never changes a quote.
- **Enter**: new amount, turnaround (optional), a **required reason**.
- The forms explain the before/after distinction in copy ("This customer has
  already agreed that price, so your new one is a request they must accept.").

**GOAL**: "change my price."
**COGNITIVE LOAD**: **Low-to-moderate.** The before/after-acceptance rule is a
real concept but the copy carries it well.

---

# W13 — Business: mark ready + sign the handover

| Understand | Read | Decide | Enter |          Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----: | -----------: | -------: | -----: | ---: | ------: |
|          3 |   ~8 |      1 |     1 | 2–4 + wallet |        1 |      1 |    1 |       3 |

- **Understand**: (1) Proofline is optional operational evidence; (2) the pickup
  code is what I read to the buyer; (3) the handover confirmation needs my own
  wallet (the payout-address one).
- **Enter**: the buyer's handover code.
- **Tap**: "Mark ready for pickup" → [read the pickup code to the buyer] →
  "Confirm handover" → [wallet connect] → [wallet sign] → done.
- **Remember**: the pickup code (until the buyer collects); which wallet to use.
- **Verify**: the buyer's code matches; the connected wallet is the right one.
- **Recover**: no wallet, wrong wallet, `ATTESTATION_FAILED`.

**GOAL**: "record that this order was handed over."
**MINIMUM NECESSARY**: mark ready (1 tap) + confirm handover (enter code + 1 tap

- wallet sign) = **~4 actions across two moments**.
  **CURRENT**: exactly that, plus the wallet connect step.
  **TECHNICAL DETAILS ENCOUNTERED**: "wallet", "signature", "MetaMask or Valora",
  "Connect the wallet for this business's on-file payout address", "(Simulated —
  not on any real network.)", "View the record" (explorer). The schema UID / tx
  hash / EIP-712 detail is **not** shown (it's in the operator view).
  **COGNITIVE LOAD**: **Moderate-to-high** for the handover-sign step specifically
  — it requires a wallet, the _right_ wallet, and comfort with `eth_signTypedData_v4`
  (surfaced as "Waiting for your wallet…"). A non-crypto-native merchant may not
  have a wallet at all, in which case this whole feature is inaccessible to them
  (the code path still requires `window.ethereum`).

---

# W14 — Operator: verify + activate a route (`/operator`)

| Understand | Read | Decide |   Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ------: | --: | -------: | -----: | ---: | ------: |
|          4 |  ~14 |      7 | 1 (key) |  ~8 |  1 (key) |      6 |    0 |       2 |

- **Understand**: each of the 6 checks is a manual attestation; activation can't
  be defaulted; the freshness clock starts now; the key is session-only.
- **Enter**: the operator key (once per session).
- **Decide**: tick each of 6 checkboxes (7 counting "activate now vs not").
- **Verify** (out of band, then tick): consent recorded, contact channel tested,
  payout address verified (ownership off-chain), a dated price source seen, the
  SLA agreed, a sample request run through.
- **Tap**: 6 checkboxes + "Verify and activate".
- **Remember**: the operator key (`sessionStorage`, lost on tab close).
- **Recover**: `CHECKLIST_INCOMPLETE`, `CONSENT_MISSING`, wrong key.

**GOAL**: "get this business live, safely."
**MINIMUM NECESSARY**: the 6 verifications (each is a real safety check —
`AC-SUP-*`) + activate = **7 deliberate actions**. This is the abstraction
boundary; none of it should be automated.
**CURRENT**: exactly that.
**TECHNICAL DETAILS ENCOUNTERED**: "public payout address (ownership confirmed
off-chain)", "Sample request run through the route", "Query fee / SLA", the
near-raw `StatusPill` (`route.status.replace(/_/g," ")`).
**COGNITIVE LOAD**: **High by design.** The operator is doing verification work,
not clicking through a wizard. The load is appropriate; the friction (re-entering
the key, the enum-ish status label) is not.

---

# W15 — Operator: trace a transaction (`EvidencePanel`)

| Understand | Read | Decide |       Enter | Tap | Remember | Verify | Wait | Recover |
| ---------: | ---: | -----: | ----------: | --: | -------: | -----: | ---: | ------: |
|          6 |  ~35 |      0 | 1 (task id) |   1 |        0 |   many |    0 |       1 |

- **Understand**: the two attestation types (Intra-signed vs merchant-signed),
  `refUID` linkage, mock vs on-chain, the consistency cross-check.
- **Read**: 7 cards of `Ref` rows — task, provider, commitment attestation,
  handover attestation, service payments, consistency, timeline.
- **Enter**: a task id.
- **Verify**: the consistency cross-check ("Handover links to commitment: yes /
  MISMATCH"), whether anything is simulated.

**GOAL**: "prove this one transaction."
**TECHNICAL DETAILS ENCOUNTERED**: **everything** — `PENDING_ATTESTATION`,
`attestationMode: "mock"`, schema UIDs, attestation UIDs, tx hashes, `refUID`,
ERC-8004 agent id, "MISMATCH". This is [`02` P3].
**COGNITIVE LOAD**: **Very high** — but this is a forensic tool for an operator
or a judge, so a raw view is arguably correct. The concern is that it's also the
surface a hackathon judge sees, and "MISMATCH" as a bare string reads badly.

---

# Summary table — load-to-outcome ratio

| Workflow                  | Necessary actions |   Current actions | Technical leaks                            | Load                   | Verdict                                      |
| ------------------------- | ----------------: | ----------------: | ------------------------------------------ | ---------------------- | -------------------------------------------- |
| W1 Buyer quote (chat)     |                ~4 |        3–8 + msgs | 0 (trace nested)                           | Low–Mod                | **Good**                                     |
| W2 Buyer quote (form)     |                ~5 |                ~7 | 0                                          | Low                    | **Good**                                     |
| W3 Buyer decide + handoff |                ~4 |               4–7 | x402 card, raw msg keys, "Proofline pilot" | Mod–High               | **Too many stacked panels**                  |
| W4 MiniPay pay            |                 2 |                 2 | 0 (well abstracted)                        | Low                    | **Good**                                     |
| W5 Confirm pickup         |                 1 |               1–2 | "Proofline pilot" jargon                   | Very low               | **Good**                                     |
| W6 Handover code          |        0 (verbal) |                 0 | —                                          | Very low               | **OK; coordination burden + code confusion** |
| W7 Price-change decide    |                 1 |                 1 | 0                                          | Low                    | **Good**                                     |
| W8 Cancel / problem       |                 1 |                 3 | 0                                          | Low                    | **Good**                                     |
| W9 Quick-start onboard    |          9 fields |       9–11 fields | ~0                                         | Mod                    | **Good**                                     |
| W10 Full onboard          |               ~12 |     15 + dead end | Capability Card, MCP, route, raw JSON      | **High + misdirected** | **The worst ratio**                          |
| W11 Send a quote          |                 3 | 2–8 + 2 decisions | range/confidence/datetime-local            | Mod (too high)         | **Highest-frequency friction**               |
| W12 Revise / edit price   |               1–2 |               2–3 | 0                                          | Low–Mod                | **Good**                                     |
| W13 Mark ready + sign     |                ~4 |       ~4 + wallet | wallet, right-wallet, sign                 | Mod–High               | **Wallet-gated; inaccessible without one**   |
| W14 Operator activate     | 7 (all necessary) |                 7 | enum status label, key re-entry            | High (by design)       | **Load is right; friction is not**           |
| W15 Operator trace        |                 0 |                 1 | everything                                 | Very high              | **Raw by design; "MISMATCH" reads badly**    |

## The places the interface makes the user think about the implementation

1. **W10 full onboarding** — "Capability Card", "MCP server", "route", the raw
   route JSON, and the requirement to hand a payload to an operator. The merchant
   is made to understand Intra's data model to get a business online.
2. **W3 x402 `PaymentReceipt`** — on the (rare) `SETTLED` path: attribution tags,
   atomic amounts, CAIP-2 network ids, "via agent payment protocol".
3. **W3 the WhatsApp message** — raw brief keys (`size:`, `full-colour`) in the
   text a person reads.
4. **W11 quoting** — `fixed`/`range`, `confidence` low/med/high, `datetime-local`.
5. **W13 handover signing** — the whole feature requires `window.ethereum`; the
   merchant must know which wallet is "the payout-address wallet".
6. **W14/W15 operator** — enum-ish status labels, `sessionStorage` key re-entry,
   raw `PENDING_ATTESTATION` / "MISMATCH" in the trace.
7. **W1/W3/W5** — "Demo only — nothing here is saved" and "Proofline pilot" are
   labels the user has to decode and (in the first case) partly distrust.

## The places the interface correctly keeps the user on the outcome

- **W4 MiniPay** — "network fee", a shortened address, a locked rate with its
  source. No ABI, no contract, no chain-id.
- **W1 agent run** — a 7-word stage spine and a "who did what" narrative instead
  of a 13-state machine and tool calls.
- **W7 price change** — the money delta computed for you, the reason verbatim.
- **W8 cancel** — "Intra never held any money for this order, so there is nothing
  to refund here."
- **W9 quick-start** — category → template, slug, endpoint, lifecycle all hidden;
  9 plain fields.
- **All exceptions** — `describeTaskException` answers "what / do I act / what
  next / the money" in plain language, every time.
