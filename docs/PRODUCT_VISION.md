# Intra Relay — Product Vision and Scope

**Status:** Product north star. The hackathon MVP remains governed by
[`PRD.md`](PRD.md). This document explains why the MVP exists, what it proves,
and what must remain deferred.

## 1. The product in one sentence

**Intra Relay turns WhatsApp-native, non-API businesses into trusted services
that AI agents can use.**

It translates a business's ordinary operating information—human knowledge,
price lists, WhatsApp order channels, spreadsheets, and service rules—into a
fresh, structured capability an agent can understand. The business stays in
control of what is published and the customer stays in control of every final
order.

## 2. The problem Relay solves

Many small businesses do not have a repository, reliable website, API, clean
catalogue, or technical team. They often operate through WhatsApp and a human
owner whose price, availability, and turnaround information changes quickly.

Agents cannot safely use a business when they do not know:

- what the business can actually do;
- what information is required for a valid request;
- whether a price or availability statement is current;
- who is authorised to answer for the business;
- whether a customer, not the agent, approved a final order; and
- whether the real-world job was completed.

Relay is the managed adapter for this gap. It is **not** a consumer shopping
agent, a general marketplace, a merchant chatbot, or a generic MCP wrapper.

## 3. The three layers

```text
Any buyer agent / buyer interface
        │ structured request
        ▼
Intra Relay
  - business onboarding and consent
  - capability card and public REST contract
  - freshness, route status, and merchant controls
  - structured quote request and human order handoff
        │
        ▼
Local business
  - responds through its existing human workflow
```

### 3.1 Relay: the capability and control layer

Relay gives every participating business one or more **Capability Cards**.
A card specifies what the business can do, the required request inputs, the
expected response, its service-level agreement, its current availability, and
the final-order policy. Agents consume the structured contract; merchants see
plain-language service information and controls.

Relay's non-negotiable properties are:

1. **Merchant-controlled:** a route must be verified before publication and
   can be paused immediately.
2. **Fresh:** price/availability data must have a confirmation timestamp and
   becomes unavailable when stale.
3. **Channel-neutral:** an agent may come from WhatsApp, Telegram, web, or an
   internal procurement tool. Relay does not own consumer chat distribution.
4. **Human-approved:** a buyer always approves and sends the final order;
   Intra never places it or custodians buyer funds.
5. **Honest about payment:** Celo/x402 query payments are only represented as
   settled after official verification and a valid transaction hash.

### 3.2 Proofline: the fulfilment-evidence module

**Proofline is not a separate app. It is Relay's future evidence layer.**

A payment receipt proves that money moved; it does not prove a flyer was
printed, a rider delivered an item, or a customer collected a service. Proofline
records the independently meaningful operational events after a quote:

```text
Quote issued → buyer approves final order → merchant marks ready
→ buyer confirms pickup/delivery → fulfilment record
```

The initial Proofline record should be lightweight: actor, event type, time,
order/task reference, and a buyer/merchant confirmation method such as a
one-time pickup code. It is not escrow, dispute arbitration, a credit score, or
a claim that every event is cryptographically verified.

**Pilot status:** the two-event pilot (merchant marks ready → buyer confirms
pickup) is implemented and gated on a confirmed buyer handoff. See
[`PRD.md`](PRD.md) §6 F-PROOF and [`DECISIONS.md`](DECISIONS.md) ADR-016. Nothing
beyond those two events — no score, escrow, or dispute flow — has been built.

Over time, verified records can support a portable merchant reliability signal
such as on-time completion rate. Any such metric must disclose its sample size,
period, and calculation; it must never be fabricated or inferred from marketing
claims.

## 4. Why Intra is different

| Product category           | What it does                                             | What Intra Relay does instead                                                                                    |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Consumer agent             | Owns the user chat and routes requests to services       | Supplies a trustworthy business capability to **any** agent; it does not compete for the buyer's chat interface. |
| Website-to-tool platform   | Converts an existing website/repository into agent tools | Serves businesses with no website, codebase, or clean API by managing the capability for them.                   |
| Agent wallet/policy system | Controls an agent's identity, budget, and allowed spend  | Provides the business-state and offline fulfilment evidence those agents need to transact responsibly.           |
| Merchant WhatsApp chatbot  | Answers a business's own customer messages               | Creates a structured, externally callable business service with freshness and approval controls.                 |

## 5. Celo's role

Celo is not a decorative checkout button. Where official access is available,
it provides two bounded capabilities:

1. **Agent-to-business information payments:** an agent can pay a small x402
   query fee for current, useful business information. This fee is distinct from
   the customer's final order price.
2. **Auditable receipts:** verified payment and future fulfilment events can be
   recorded as low-cost, inspectable evidence.

The product remains useful without payment access: a business can still publish
a fresh capability, answer a quote request, and complete a human-approved
WhatsApp handoff. Never block the core real-world workflow on an unverified
facilitator or beta integration.

## 6. The hackathon proof

The MVP proves one exact journey for **campus flyer printing**:

```text
Printer onboarding → operator verification → active, fresh printing route
→ buyer/agent submits structured request → printer returns genuine quote
→ buyer reviews and sends WhatsApp handoff
→ optional: merchant marks job ready → buyer confirms pickup (Proofline pilot)
```

The MVP does **not** need a broad merchant directory, a WhatsApp bot, multiple
verticals, autonomous checkout, escrow, a public reputation score, or a custom
blockchain protocol. Add a new workflow only after this flow works with real
businesses and buyers.

## 7. Decision test for future work

Before implementing a feature, ask:

1. Does it make a local business more accurately callable by any agent?
2. Does it improve freshness, merchant authority, buyer approval, or
   fulfilment evidence?
3. Can a non-technical merchant understand and control it on a phone?
4. Does it preserve the rule that final orders and funds remain buyer-controlled?
5. Is it needed to prove the flyer-printing MVP, rather than a future platform
   ambition?

If the answer to 5 is no, document it as a post-hackathon opportunity rather
than adding it to the MVP.
