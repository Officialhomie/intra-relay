# Agentic Architecture — where AI belongs inside Intra Relay

**Status:** Engineering analysis and proposals. Not a requirements document.
`docs/PRD.md` remains the source of truth. **Everything in this document is
NEEDS-ID** — no requirement ID covers any of it yet, and `CLAUDE.md` §6.2
separately forbids installing an AI SDK until Victor explicitly starts the
phase. Nothing here is buildable without both.

**Companions:** `docs/UX_ARCHITECTURE.md` (the workflow findings this builds on)
· `docs/PRODUCT_VISION.md` (the product boundary this is tested against)
· `~/.claude/rules/ux-simplification.md`

---

## 1. What is being proposed, as I understand it

Not "add a chatbot". The proposal is that **agentic behaviour is a fundamental
capability of the system**, not a feature bolted onto a CRUD dashboard.

The first manifestation is **conversational onboarding**: instead of a merchant
filling a 15-field form, an agent talks to them — voice in, voice or text back —
asks only what it still needs, handles pictures by switching the interface to an
upload action, and at the end shows a preview titled _this is how agents will
see your business_. Nothing is written until the human approves it.

The stated pattern is: **collect → structure → preview → request approval →
publish.** The agent does the cognitive work; the human keeps the authority.

The proposal then generalises that to ten capabilities: onboarding, business
maintenance, capability generation, discovery, negotiation, transaction
execution, verification, memory, monitoring, and compliance/policy — sitting on
an Agent Runtime with memory, tools, and policies underneath, settling on Celo.

And one UX principle, which I think is the most valuable line in the whole
proposal: **the agent should not replace the UI.** Conversation is the input
layer; the UI is the confirmation and action layer. Not a talking avatar on a
full screen — a conversation that fills in a form you can see and correct.

I agree with the framing and with that principle. What follows is where it fits
this codebase, and where it quietly changes what Intra is.

---

## 2. The one thing that would change the product

The proposal includes a **Commerce Agent** that discovers businesses, compares
them, negotiates prices, checks spending authority, and executes payment; plus a
**Financial Agent** doing escrow and refunds, and a reputation layer.

That is a buyer-side agent. Intra is a merchant-side service. Building it would
make Intra the consumer agent it has explicitly said it is not:

| Source                   | What it says                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `PRODUCT_VISION.md` §4   | Intra "supplies a trustworthy business capability to **any** agent; it does not compete for the buyer's chat interface" |
| `PRODUCT_VISION.md` §2   | Out of scope: general shopping agent, public marketplace                                                                |
| `CLAUDE.md` §4.3         | Intra "never custodies funds and never signs or executes a buyer's **final** supplier payment or order"                 |
| `CLAUDE.md` MVP boundary | Out of scope: custody, escrow, remittances, swaps, automatic final payments                                             |
| `PRODUCT_VISION.md` §3.2 | Reputation is a _future_ Proofline output, must disclose sample size and method                                         |

So: **agentic negotiation, autonomous transaction execution, escrow, spending
policy, and reputation scoring are a different product.** They may well be the
right second product. They are not this one, and building them inside this repo
during the hackathon would break the boundary the whole pitch rests on.

The reframe that keeps everything valuable:

> **Intra is the callee, not the caller.** The agents Intra builds are the ones
> that operate _Intra's own complexity_ on behalf of the merchant and the
> operator. The buyer's agent is someone else's product — Intra's job is to be
> the thing it can trust.

Read that way, most of the ten capabilities survive intact, and two of them
become much stronger than the proposal makes them.

---

## 3. Capability-by-capability verdict

| #   | Proposed              | Verdict                      | Why                                                                                                                         |
| --- | --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Agentic onboarding    | **Build**                    | Purest expression of the thesis; fixes F1/F2/F3; ~80% of the scaffolding already exists                                     |
| 2   | Business maintenance  | **Build — strongest fit**    | Freshness is already a core rule with no human interface. See §5.2                                                          |
| 3   | Capability generation | **Build, narrowed**          | Merchant describes the service in words → template + fields. Must stay template-bounded, not free-form tool invention       |
| 4   | Discovery             | **Reshape**                  | Not a marketplace search. Make the _capability contract_ itself intent-legible. See §5.6                                    |
| 5   | Negotiation           | **Out**                      | Buyer-side agent behaviour; also blocked by F7 (one route per task)                                                         |
| 6   | Transaction execution | **Out — boundary violation** | `CLAUDE.md` §4.3, `BR-001`. The buyer sends and pays. Non-negotiable                                                        |
| 7   | Verification          | **Already exists**           | This is Proofline. Agentic addition: evidence gathering, not adjudication. See §5.5                                         |
| 8   | Memory                | **Narrow, with care**        | Merchant-side operational memory is fine. Buyer profiling conflicts with the privacy-minimised metrics ADR                  |
| 9   | Monitoring            | **Build**                    | Operationalises the operator's job; pairs with the notification adapter                                                     |
| 10  | Compliance / policy   | **Partly exists**            | Route lifecycle, operator checklist, and the $0.05 cap already _are_ policy enforcement. Agent spend policy is out (see #6) |

---

## 4. The keystone rule

One architectural rule makes all of this safe, and it is worth stating before
any code:

> **The model may only ever produce a value that passes an existing Zod schema,
> and a human commits the write.**

The LLM never touches the database. It proposes a `BusinessOnboardingInput`, or
a `SubmitQuoteRequest`, or a `FlyerPrintingInput`. That proposal is rendered
into the same form the human would have filled, they correct it, and the
_existing_ validated service function performs the write.

Consequences:

- a hallucination can at worst produce a **wrong proposal the human sees and
  edits** — it can never produce an invalid row, a fabricated price, or a
  fabricated payment;
- every safety test already written (prohibited-field tests, lifecycle
  invariants, idempotency) keeps applying unchanged, because the write path is
  unchanged;
- voice/AI becomes an **input adapter**, not a parallel feature with its own
  data path. One schema, several ways to fill it.

This mirrors what the repo already does well with payments: a typed adapter, a
`noop` default, an honest unavailable state, and no fabrication.

---

## 5. Where it belongs in this codebase

Six surfaces, in order of value. File paths are real.

### 5.1 Onboarding Agent — the merchant's first contact

`OnboardingForm.tsx` · `businesses/schema.ts` · `templates.ts` ·
`DraftRoutePreview.tsx`

Most of this is already in place, which is why it is the right first build:

- the target schema exists (`businessOnboardingSchema`, 15 fields, Zod);
- the service templates exist (`getTemplateForCategory` → input fields, SLA,
  query fee) — so "capability generation" is _selection from a template_, not
  free-form invention;
- the confirmation screen exists and already does exactly the job the proposal
  describes. `DraftRoutePreview` literally says _"This is what an AI agent would
  see once your service is active"_, and splits public-to-agents from
  stays-private;
- there is no persistence to break, because of F1.

So the work is: a conversation that fills `BusinessOnboardingInput`, rendering
into the existing step UI as it goes, ending at the existing preview, which then
calls the **one-transaction `submitServiceForReview`** proposed in
`UX_ARCHITECTURE.md` §3.1.

**These are the same piece of work.** Do not sequence them separately — an
agentic onboarding that ends in "email this JSON to an operator" is worse than
the form, because it raises the expectation and then breaks it.

Interface shape: conversation on top, the live form underneath, filling in as
the merchant talks. They can always type into it directly. Consent and the
payout address stay as explicit taps — see §7.

### 5.2 Freshness Agent — my strongest recommendation

`routes/freshness.ts`

This is the best agentic opportunity in the product and the proposal does not
name it.

`PRICE_FRESHNESS_MAX_AGE_MS` is 14 days. After that, `routeIsQuoteReady`
returns `STALE` and the route silently stops accepting work. Today **the
merchant is never told** — not before, not when it happens. A printer's phone
simply goes quiet, and they have no idea their listing went dark.

Freshness is Intra's headline differentiator (`PRODUCT_VISION.md` §3.1: "price
data must have a confirmation timestamp and becomes unavailable when stale") and
it currently has **no human interface at all**.

An agent that reaches out before the deadline:

> "Your flyer prices go stale on Thursday — after that agents stop seeing you.
> Still ₦4,500 for 100 A5 full-colour?"

Merchant replies "yes" or "make it 5,000", the agent proposes a route update,
the merchant confirms, `priceUpdatedAt` moves. One message, one reply, route
stays live.

This turns a punitive rule into a service, and it is the same **perceive →
reason → act → verify** loop the proposal asks for — with the merchant holding
the commit. It also rides on the notification adapter proposed in
`UX_ARCHITECTURE.md` §3.3, so it should be built after that.

### 5.3 Quote Drafting Agent — the highest-frequency interaction

`supplier/QuoteResponseForm.tsx` · `quotes/service.ts`
(`submitQuoteRequestSchema`)

Onboarding happens once. **Quoting happens every single time.** This is where a
merchant's daily friction actually lives, and it is the interaction most likely
to happen on a phone, one-handed, in a noisy shop, mid-job.

Today the printer must fill a structured form: `amountMin`, optional
`amountMax`, `deliveryCharge`, `turnaround`, `availabilityNote`, `assumptions`,
`confidence`, `fixed`, `expiresAt`.

With voice they could say:

> "Four thousand five hundred, ready Thursday afternoon — that's if they bring
> the design by tomorrow."

→ `amountMin: 4500`, `fixed: true`, `turnaround: "Thursday afternoon"`,
`assumptions: "Design supplied by tomorrow"`. Rendered into the form, printer
taps Send.

The SLA clock (`responseSlaMinutes`) is the product's promise to the buyer. This
is the change most likely to make merchants actually meet it.

### 5.4 Operator Verification Assistant

`operator/OperatorConsole.tsx` · the server-side 6-point checklist

The checklist is enforced server-side and must stay a human decision. But an
agent can **gather the evidence** and present it per item: consent timestamp
recorded; contact parses as a valid WhatsApp number; payout address is a valid
checksummed EVM address not previously seen; declared SLA is plausible for the
category; service summary is specific rather than boilerplate.

Agent assembles evidence, operator ticks each box. This is the cleanest possible
split of cognitive work from authority, and it makes the operator step fast
enough to be viable at more than a handful of merchants.

### 5.5 Proofline evidence assistant

`features/proofline/`

Verification already exists as a module. The agentic addition is **prompting and
capturing**, never adjudicating: nudge the merchant to mark ready, nudge the
buyer to confirm pickup, structure a free-text reply into a fulfilment event.

Hard limit: the agent must never _infer_ that fulfilment happened.
`PRODUCT_VISION.md` §3.2 bounds Proofline to recorded events with a confirmation
method. An agent concluding "probably delivered" would be exactly the fabricated
evidence `CLAUDE.md` §4.1 forbids.

### 5.6 Make the capability contract itself intent-legible

`v1/[businessSlug]/capabilities` · `routes/capability.ts` ·
`ROUTE_READY_DETAIL`

The least obvious and possibly highest-leverage item: for an infrastructure
product, **the most agentic thing you can ship is a contract other agents
succeed against on the first try.**

The repo is already unusually good here — `ROUTE_READY_DETAIL` writes its
unavailability reasons _for another agent to act on without reading Intra's
source_. That instinct is right and should be pushed further: worked request and
response examples, the full error taxonomy inline, explicit freshness semantics,
and a plain statement of the final-order policy so a calling agent knows before
it starts that it must hand back to a human.

This makes every external agent better at using Intra without Intra running a
single model. It is the answer to "discovery" that does not require becoming a
marketplace.

---

## 6. Where the code goes

Reuse the payment adapter pattern exactly — it is the repo's best-established
answer to "a capability we do not fully control".

```
src/features/ai/
  adapter/
    types.ts      # LlmAdapter · TranscriptionAdapter · SpeechAdapter
    config.ts     # env parsing; malformed config degrades, never throws
    index.ts      # getLlmAdapter() — returns noop when unconfigured
    noop.ts       # NOT_CONFIGURED; every form still works
  extraction/     # conversation -> a specific Zod schema, one file per surface
  session.ts      # turn state; server-side only
```

Rules carried over from `payments/adapter/` (ADR-011, ADR-017):

- **no key configured → the feature is honestly unavailable**, and the typed
  form path continues to work untouched;
- **never log the transcript or audio payload** the way the authorisation
  payload is never logged;
- **malformed config degrades with one logged warning**, never a 500;
- **the API key never appears** in a response, an audit event, or `describe()`.

Add to the audit trail, since `audit_events` is already the product's memory:
`ai.extraction.proposed` and `ai.extraction.accepted` — recording that a
proposal was made and that a human accepted it. That gives an honest answer to
"did a person approve this?" months later, and it is the cheapest possible
version of the "memory" capability.

---

## 7. On voice specifically — four design critiques

The idea is right. Some of the assumptions around it need testing.

**Data cost is a product constraint, not a detail.** Nigerian campus merchants
pay for bandwidth by the megabyte. Full-duplex audio in _and_ synthesised speech
out is the most expensive possible interaction. Recommendation: **push-to-talk
voice input, text output.** Short clips up, structured text and a filled form
down. Reading long confirmations aloud is slow, data-hungry, and worse than
letting someone read at their own pace. Keep TTS optional, off by default, and
reserved for short prompts.

**Accent and code-switching decide whether this works at all.** Nigerian
English, Pidgin, and Yoruba/Igbo/Hausa code-switching, plus money spoken as
"two-fifty" or "four thousand five" rather than digits. Transcription quality
here is the single biggest technical risk and it is not something to discover on
demo day. Test with real recordings from real target users before building the
flow around it.

**Degradation is mandatory, not a nice-to-have.** Bad signal, no key, model
down, a merchant who would simply rather type: the form must remain fully
usable. Voice is an enhancement to a working path, never the only path. Same
principle as `PAYMENT_SERVICE_UNAVAILABLE` — the core workflow is never blocked
on an unavailable dependency.

**Conversation plus contextual UI, exactly as proposed.** This is the right
call and worth restating as a build rule: the form is always visible and always
editable; the conversation fills it in; the merchant can take over by typing at
any point; and **consent and the payout address are tapped, never spoken into
existence.** A consent tick inferred from "yeah okay" is not consent
(`FR-SUP-005`), and a wallet address transcribed from speech is a
character-accuracy problem no one should accept.

---

## 8. What none of this changes

Everything in `UX_ARCHITECTURE.md` §2 stands unchanged. Restating the three that
an agentic layer is most likely to erode:

1. **The buyer sends the WhatsApp order and pays the printer directly.** No
   agent, of Intra's or anyone else's, does this. `BR-001`, `CLAUDE.md` §4.3.
2. **`SETTLED` only on a verified transaction hash.** A model may never
   summarise, infer, or narrate a payment outcome. `BR-005`, §4.1.
3. **Operator verification before a route goes live.** An assistant may gather
   evidence; it may not approve. `AC-SUP-*`.

And one new rule specific to this layer:

4. **A model's output is a proposal, never a write.** Every AI-originated value
   passes an existing Zod schema and a human confirmation before it reaches the
   database.

---

## 9. Sequencing

The prerequisites are not optional. Items 1–3 of `UX_ARCHITECTURE.md` §4 gate
all of this: there is no point conversationally collecting a business that the
system then cannot save, cannot notify, and cannot hand a workspace link to.

| Phase | Work                                                                               | Depends on                               |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 0     | `submitServiceForReview` transaction · manage-link delivery · notification adapter | —                                        |
| 1     | AI adapter skeleton + `noop` + config tolerance                                    | ADR + Victor starting the phase          |
| 2     | Onboarding Agent (§5.1) — text first, then push-to-talk                            | phase 0 + 1                              |
| 3     | Quote Drafting Agent (§5.3)                                                        | phase 1                                  |
| 4     | Freshness Agent (§5.2)                                                             | notification adapter                     |
| 5     | Operator evidence assistant (§5.4) · Proofline nudges (§5.5)                       | phase 1                                  |
| —     | Capability contract enrichment (§5.6)                                              | **none** — buildable today, no AI needed |

§5.6 is worth noting separately: it is the only item here that needs no model,
no key, no dependency, and no new phase — and for an infrastructure product it
may be the most agentic thing on the list.

## 10. Before any of this starts

Per `CLAUDE.md` §3 and §6.2:

- requirement IDs must be issued for each capability built (none exist today);
- an ADR is required before adding any AI SDK, transcription, or speech
  dependency, covering provider, data handling, what is sent off-device, and the
  degradation contract;
- transcripts and audio are user data from a business — decide retention and
  disclosure in that ADR before the first request is made, not after.
