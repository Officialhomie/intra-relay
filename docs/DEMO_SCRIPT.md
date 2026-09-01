# Intra — hackathon demo script

A 6–8 minute walkthrough of the full flyer-printing loop:

**supplier onboarding → operator verification → buyer request → genuine quote →
WhatsApp handoff → (optional) verified Celo query-fee receipt.**

Everything below is real application behaviour against the persistent database.
Nothing is faked. Where a step depends on external Celo / cPay access, it is
marked **CONDITIONAL** and the honest fallback is described — see
[`CLAIMS.md`](CLAIMS.md).

---

## 0. Before you start (2 min, off-camera)

```bash
# clean database + schema
rm -rf .pglite && npm run db:migrate

# operator key so you can verify routes during the demo
#   .env.local:
#   OPERATOR_API_KEYS=demo:demo-operator-key-01
npm run dev
```

Open two browser profiles/windows so the roles stay visually separate:

- **Operator / supplier ops** — `http://localhost:3000/operator`
- **Buyer** — `http://localhost:3000/request`

Have a terminal ready for the two onboarding API calls in step 1. (In production
these are run by an Intra operator during guided onboarding — ADR-005/ADR-008 —
so the buyer- and supplier-facing UI never exposes raw route creation.)

> Fast path: `npm run db:seed` creates one pre-verified `[DEMO SEED]` printer and
> an ACTIVE route. Use it only if you want to skip straight to the buyer flow;
> the full script below does **not** use the seed.

---

## 1. Supplier onboarding (1 min)

**Show the guided form first.** In the buyer window open
`http://localhost:3000/supplier/onboard` and walk through the three steps
(Business → Service → Review). Point out:

- the only wallet value asked for is a **public** address — the "What we will
  never ask for" callout lists seed phrase, private key, BVN, NIN, bank login,
  card details;
- "Create my capability draft" produces a **reviewable draft** — nothing is
  published, no payment is accepted, no message is sent.

**Then create the real records** (operator-run onboarding). In the terminal:

```bash
# 1a. create the business — returns its slug and a private manage token
curl -s -X POST http://localhost:3000/api/businesses \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-biz-0001' \
  -d '{
    "businessName": "Campus Prints NG",
    "contactName": "Ada Obi",
    "contactChannelType": "whatsapp",
    "contactChannelValue": "+2348012345678",
    "category": "printing",
    "city": "Lagos",
    "country": "Nigeria",
    "quoteCurrency": "NGN",
    "payoutAddress": "0x1111111111111111111111111111111111111111",
    "consentToQuoteDisplay": true
  }' | tee /tmp/intra-biz.json

# 1b. attach the flyer-printing quote route (created in DRAFT)
curl -s -X POST http://localhost:3000/api/businesses/campus-prints-ng/routes \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-route-0001' \
  -d '{ "templateId": "flyer-printing" }'
```

Note from the first response:

- `data.slug` → `campus-prints-ng`
- `data.manageToken` → the supplier's private link token (used in step 4)
- `data.status` → `PENDING_VERIFICATION` (not live)

---

## 2. Operator verification & activation (1.5 min)

In the **operator window** (`/operator`):

1. Enter the operator key (`demo-operator-key-01`). Point out the note: the key
   is held for this browser session only, never sent to a server for storage,
   never logged.
2. The **Campus Prints NG** route appears in the review queue as `DRAFT`.
3. Read the pre-activation checklist aloud — recorded consent, tested contact
   channel, verified public address, dated price source, agreed SLA, tested
   sample request. Tick all six.
4. Click **Verify and activate**.

Result: route → `ACTIVE`, business → verified + `ACTIVE`, price freshness clock
starts. Try clicking activate with a box unticked first to show the server
rejects it (`CHECKLIST_INCOMPLETE`) — the browser cannot bypass it.

**Optional:** open `http://localhost:3000/v1/campus-prints-ng/capabilities` to
show the machine-readable capability document an AI agent would read — route
status, input schema, response schema, SLA, `payment.state`, and the
human-approval policy.

---

## 3. Buyer request → genuine quote (2 min)

In the **buyer window** (`/request`):

1. Fill the brief: size `A5`, quantity `250`, colour `Full colour`, needed by
   `Friday 3pm`, delivery area `UNILAG main gate`. Submit invalid first (blank
   deadline) to show inline, associated field errors.
2. **Find a printing quote** → the printer picker lists Campus Prints NG with
   its city and "replies within 30 min" and price-confirmed freshness.
3. **Send request & get a quote** → you land on `/tasks/:id`. Status
   `AWAITING QUOTE`. The activity timeline shows _Request created → Request
   submitted → Sent to the printer_, and the **Agent service payment** card
   reads `UNAVAILABLE` — "no service fee was charged and no receipt exists"
   (this buyer path never charges; the paid path is the agent `/v1` API).

Now act as the supplier. In a terminal or the supplier window:

- **Supplier window:** open
  `http://localhost:3000/supplier/campus-prints-ng/requests?t=<manageToken>`
  (token from step 1a). The buyer's structured request is listed. Fill the quote
  response form: amount `18000` NGN, turnaround `Same day if approved by noon`,
  add an assumption `Artwork supplied print-ready`, set an expiry. Submit.

Back in the **buyer window**, refresh `/tasks/:id`. The task is now
`RECOMMENDED` — a real quote is in, but nothing has been decided:

- **The quote** card shows the raw figures with the label _"Entered by the
  printer or an Intra operator. Not independently checked by Intra."_ and the
  quote validity date.
- **Intra's read of this quote** normalises it: total incl. delivery, price per
  flyer, turnaround, a short "why this looks OK" list, and a **"what Intra
  cannot confirm"** list (estimate vs fixed, expiry, low confidence, "Intra
  cannot see your WhatsApp conversation").
- The printer's **name and city** are shown, but **not their phone number** yet.

---

## 4. Buyer chooses, then the WhatsApp handoff (1.5 min)

Still `RECOMMENDED`. In **Your choice**:

- Point out the line: _"Intra does not place the order or pay the printer."_
- Click **Proceed with this printer**. (Or demo the other branch: **Not this
  one** → optional reason → the task becomes `CANCELLED`, nothing is ordered,
  and feedback still opens.)

The task moves to `HANDOFF_READY` and only now does the **Order handoff — you
send this yourself** card appear, with the supplier's contact revealed:

- the pre-filled message contains the brief and the quoted price;
- **Intra does not send it.** Show the callout: "Intra does not send this message
  and never pays a supplier for you."
- Click **Copy message**, then **Open in WhatsApp** — this opens the buyer's own
  WhatsApp with the text pre-filled and the cursor on Send. The buyer decides.
- Click **I've sent this to the printer** — this is the buyer's own report;
  Intra cannot observe WhatsApp.

The activity timeline now shows the three distinct, separately timestamped
events: **Quote received → You chose to proceed → You confirmed the message was
sent**.

Submit feedback ("Yes, useful") to close the loop and show the audit trail
recording it.

---

## 5. OPTIONAL — Proofline fulfilment evidence (1 min)

This is the **Proofline pilot** (PRODUCT_VISION §3.2, ADR-016): two optional
events that record whether the real-world job actually completed. It runs **only
after** the buyer has confirmed the handoff in step 4. Say up front: _"This is
operational evidence — timestamped statements by the people involved. It is not a
cryptographic proof, not a payment, and not a reliability score."_

1. **Supplier window** (`/supplier/<slug>/requests?t=<manageToken>`): scroll to
   **Handed-off orders**. The buyer's order is listed with a **Mark ready for
   pickup** button. Click it. Intra shows a **6-character pickup code** — "read
   this to the buyer at the counter". (Try clicking it again: `409` — one event
   only. Try the page without the `?t=` token: the code is not shown.)
2. **Buyer window** (`/tasks/:id`): the **Fulfilment evidence (Proofline pilot)**
   card now says _"The printer marked this order ready for pickup"_ — attributed,
   not a claim by Intra. The buyer taps **Confirm I've collected this order**
   (signed-in path), or expands **Have a pickup code instead?** and types the
   code (works from any device).
3. Both windows now show **Buyer confirmed pickup** with the method used. The
   task activity timeline gained `Printer marked the order ready for pickup` and
   `You confirmed you collected the order`.

Point out: nothing here moved money, placed an order, or produced a score — and
"pickup confirmed" appeared only because the **buyer** recorded it.

---

## 6. CONDITIONAL — verified Celo query-fee receipt (1 min)

This step proves the **agent-to-business paid query**, distinct from the buyer's
order. It requires an official Celo x402 facilitator API key
(`X402_API_KEY`) — see [`PAYMENTS.md`](PAYMENTS.md).

**Without the key (default):** show the honest failure. An agent calling the
paid route gets a structured 503, and no receipt is created:

```bash
curl -s -i -X POST http://localhost:3000/v1/campus-prints-ng/flyer-printing/quote \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-agent-0001' \
  -d '{ "input": { "size": "A5", "quantity": 250, "colour": "full-colour",
        "deadline": "Friday 3pm", "deliveryArea": "UNILAG main gate" } }'
# → HTTP 503  { "error": { "code": "PAYMENT_SERVICE_UNAVAILABLE", ... } }
```

**With the key set** (`X402_API_KEY`, `X402_NETWORK=eip155:42220`, optionally
`X402_ATTRIBUTION_TAG`), the same call first returns `402 PAYMENT_REQUIRED` with
the x402 `accepts` requirements (amount capped at $0.05). The agent signs an
EIP-3009 authorisation, retries with `X-PAYMENT`, and the server calls the
official facilitator `/verify` then `/settle`. Only on a verified transaction
hash does the task page show a **SETTLED** receipt with the paid amount, the
network, and a **View on Celoscan** link. If verification fails, the receipt is
`FAILED` — no task, no hash, no fabricated success.

Show the receipt timeline on `/tasks/:id` and open the Celoscan link.

---

## What to say about proof

> "Everything you just saw — onboarding, operator verification, the quote, the
> handoff — is the real application against a real database. The one thing gated
> on credentials we don't control is live Celo settlement: without the
> facilitator key it returns an explicit unavailable state, and it will only
> ever display a payment as settled after the official facilitator confirms a
> transaction hash. We don't fake receipts."

Keep [`CLAIMS.md`](CLAIMS.md) open in a tab in case a judge asks what is and
isn't proven.
