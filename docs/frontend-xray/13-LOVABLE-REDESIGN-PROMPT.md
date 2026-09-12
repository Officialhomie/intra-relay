# 13 — Lovable Redesign Prompt

> **This file is the prompt. Paste everything below the line into Lovable.**
> It is self-contained — it does not require any other document. It describes a
> real product with real workflows and real constraints. Redesign the frontend;
> do not change the product.

---

# Redesign the Intra frontend

You are redesigning the entire frontend of **Intra** — a mobile-first commerce
workflow product. This is a **visual and interaction redesign only**. Every
workflow, every state, every rule described below must be preserved exactly. Do
not invent features. Do not change business logic. Do not add a backend
capability. Do not bypass any human approval step.

Read this whole brief before designing anything.

---

## PART 1 — WHAT INTRA IS

Intra makes a real, offline, WhatsApp-run local business (today: a campus
flyer-printing shop in Nigeria) usable by a customer or an AI assistant —
**without the business building any software**, and **without either side losing
human control of the money or the final order**.

A customer describes what they need in plain words. Intra turns it into a clear
request, sends it to a real verified business, and brings back a genuine price
from a real person. The customer decides. Then the customer sends the order and
pays the business **directly** — over WhatsApp, or on-chain through a wallet
called MiniPay. Optional steps at the end let both sides confirm the handover
actually happened.

**Intra is not:** a shop, a marketplace, a directory, an escrow service, a
delivery company, a chatbot that places orders, or a crypto app. It never holds
anyone's money. It never sends the final order. It never signs a payment for the
customer.

**The feeling to design for:**

- "I tell Intra what I need."
- "Intra helps me move this forward."
- "I always understand what's happening."
- "I know when it's my turn to decide."
- "I know what happens next."

The product should feel **calm, warm, trustworthy, human, intelligent, fast, and
premium — without feeling corporate or technical.** It is used by students and
small-business owners on inexpensive Android phones, in daylight, often
one-handed, sometimes on a slow or metered connection.

---

## PART 2 — WHO USES IT

Everyone is identified by a link or a code. **There are no accounts, no
passwords, no email sign-up, no user profiles.** Do not design a login screen, a
sign-up flow, a profile page, or an avatar system.

### 1. The Buyer (a student or small-business owner)

Wants a real price and a way to order. Identified by an anonymous device session
(remembered in the browser). Their whole history lives on that device — if they
switch phones they lose access (this is a known limitation; the redesign should
make the "save this link" moment prominent, but must not invent an account
system to fix it).

### 2. The Buyer's AI assistant (optional)

Some buyers arrive through an AI assistant that talks to Intra on their behalf.
The assistant can find businesses, compare prices, and prepare a recommendation —
but it **always stops and hands the decision back to the human**. The human still
approves, still sends the order, still pays.

### 3. The Business / Merchant (the printer)

Wants their existing service to take orders without building anything. Identified
by a private "manage link" they save. They receive requests, send prices, and
mark work done. They use the product on a phone, often mid-job.

### 4. The Operator (an Intra team member)

Verifies a business is real and safe before it goes live, and can pause any
business instantly. Identified by an operator key. This is an internal tool.

### 5. The Judge / Evaluator (public)

Looks at a public "evidence" page to check what's real vs demonstration data.

---

## PART 3 — WHAT USERS ARE TRYING TO ACCOMPLISH (jobs to be done)

**Buyer:**

- Turn a vague need ("I need 500 flyers by Friday") into something a business can
  price.
- Judge whether a price from a business they've never met is fair.
- Stay in control of the money and the order.
- Not have to understand crypto, blockchain, or wallets to pay.
- Leave, come back later, and pick up exactly where they were.

**Business:**

- Take structured orders without building an app or an API.
- Set prices their own way, and know an agreed price won't change underneath
  them.
- Find out a request arrived without having to watch a screen.
- Have completed jobs build a record — **not a star rating**.

**Operator:**

- Verify a business is safe before customers can reach it.
- Prove a transaction is real.

---

## PART 4 — THE MAIN USER JOURNEYS

### Journey A — Business gets set up

1. Business opens the one-screen setup, fills ~9 plain fields (business name,
   what they do, first service, how they price it, city, area, contact name,
   WhatsApp number, and **ticks a consent box** to show their prices to
   customers).
2. Their business is created but **not live yet** — an operator has to verify it.
3. They get a **private manage link** shown once with "Keep this link — it's how
   you get back in."
4. An operator verifies 6 things (consent recorded, WhatsApp tested, payout
   address checked, a dated price seen, response time agreed, a test request run)
   and activates it.
5. The business is now live. Its price data automatically expires after 14 days
   if not reconfirmed — it goes "stale" and stops taking requests until an
   operator re-confirms it.

### Journey B — Buyer gets a quote and decides

1. Buyer opens the home screen and types what they need in plain words (or picks
   an example).
2. Intra shows what it understood; the buyer can correct it.
3. Intra finds businesses, checks who's available, asks for prices, and compares
   — shown as a calm progress sequence ("Finding printers who can do this",
   "Waiting for 2 printers to reply — printers answer as people, not APIs, so
   this part genuinely takes time").
4. Intra presents a **recommendation**: who, how much, how fast, and **why** —
   plus the other options it found (with the price and speed difference in plain
   money and time), and the ones it ruled out and why. It also says clearly
   **what it can't confirm**.
5. The buyer reaches the **approval moment**. This screen shows the full deal on
   the surface — the business, the price, whether it's fixed or an estimate, when
   it's expected, how long the price holds, and **who they pay: the business,
   directly. Intra never holds, sends, or takes this money.** The button says
   exactly what it does: **"Approve ₦4,500 with Campus Print"**.
6. Buyer approves (or declines, optionally with a reason).

### Journey C — Buyer completes the order

Once approved, the buyer's task screen shows:

- **Pay the business** (optional) — pay now from a wallet, or use the WhatsApp
  handoff. See PART 8.
- **Send the order** — a ready-written WhatsApp message is shown in full. The
  buyer copies it or opens WhatsApp, sends it themselves, then taps **"I've sent
  this to the printer."** Intra never sends it.
- **Your collection code** — a short code the buyer shows the business at pickup
  so the record can prove they were really there.

### Journey D — Fulfilment (all optional)

- Business marks the order **ready for pickup** and gets a short code to read to
  the buyer.
- Buyer taps **"Confirm I've collected this order"** (from their phone, or by
  entering the code).
- At collection, the buyer says their code; the business enters it and confirms
  the handover with their own wallet. This writes a shared record that **both
  sides confirmed the exchange happened at a time** — it does **not** prove
  quality, quantity, or timeliness, and it is **not** a rating.
- Buyer leaves feedback (useful? + optional comment).

### Journey E — When things go wrong (all handled today, keep them)

- Business declines / withdraws / can't do the job → the task closes with a plain
  explanation: **what happened, whether the buyer needs to do anything, what
  happens next, and what happened to their money** ("Nothing was charged through
  Intra").
- Buyer declines a quote → nothing is ordered.
- Buyer cancels an agreed order or reports a failed handover → the order closes;
  **no refund is claimed** ("Intra never held any money for this order").
- Business proposes a new price on an already-agreed order → the buyer decides;
  the agreed price stands until they do; the difference is shown in plain money
  ("₦700 more") with the business's reason in their own words.
- The AI run finds no usable offer → "Nothing was ordered and no money moved. Try
  again."

### Journey F — Returning after an interruption

The buyer can close the app at any point and come back. The home screen always
shows every request grouped into 5 plain buckets: **Needs your attention · Ready
· Waiting · In progress · Completed** — each with a one-line status and a
verb-first action ("Review", "Open and send", "Confirm pickup"). Notifications
(in-app and optional push) deep-link straight to the exact next step. The task
screen is fully resumable — nothing is lost.

---

## PART 5 — INFORMATION ARCHITECTURE

Design three role-scoped areas plus a small public area. **Not a dashboard.**

### Buyer area

- **Home** (`/agent`) — "What do you need?" — the conversation entry, and below
  it the grouped list of all the buyer's requests.
- **Activity** (`/activity`) — notifications (split into "Needs your attention"
  and "Updates"), notification settings, and the same grouped request list.
- **Task** (`/tasks/:id`) — everything about one request (see PART 6, this is the
  most important screen).
- Persistent **bottom navigation** on mobile: Home · Activity · Requests
  (with a "needs you" count badge). On the Task screen the bottom bar is replaced
  by that task's sticky primary action.

### Business area (all reached through the private manage link)

- **Workspace** — action-first: what needs you, what's happening, your record,
  your services.
- **Requests inbox** — incoming requests to quote/decline; prices you've sent
  (with the option to revise); handed-off orders (mark ready, confirm handover).
- **Service settings** — business details, service status and freshness, pause a
  service.
- A slim top context bar; the requests inbox and workspace can be one screen
  with a "Needs you (n) / In progress" switch.

### Operator area

- One console with three tabs: **Review queue** (verify + activate), **Metrics**,
  **Evidence trace**. This is an internal tool — apply the design system but
  don't force it into a mobile shell.

### Public

- **Landing** (`/`) — explain the product, route to a buyer or business start.
- **Evidence** (`/evidence`) — real results vs demonstration data vs unavailable
  integrations, kept strictly separate; every number is a real count.
- **Docs** (`/docs`) — the technical contract for AI-assistant builders
  (deliberately technical — leave it technical).

---

## PART 6 — THE MAJOR SCREENS

### S1 — Landing (`/`)

Explain, in warm plain language: what Intra does, that the customer stays in
control, that Intra never holds money, that a real person responds. Two clear
paths: **"I need something made"** (→ Home) and **"I run a business"** (→ setup).
No stock photos. One purpose-built illustration is allowed (a
"request-handed-from-one-party-to-another" motif). Keep the existing honest lines
like _"No wallets, no private keys, and no final order without your approval."_

### S2 — Buyer Home (`/agent`)

- Title: **"What do you need?"**
- A conversation input. The buyer types; a friendly assistant replies in plain
  language, asks only for what's still missing, and shows a small "so far:" chip
  summary of what it understood.
- When there's enough to act, the structured run appears **inline in the same
  thread** — a calm progress sequence, then a recommendation, then the approval
  moment.
- Below a divider: the grouped request list (5 buckets, see PART 4 Journey F).
- **Fix the current copy** "Demo only — nothing here is saved" → it's misleading.
  Say something true and calm like _"This chat isn't saved — but your requests
  are."_

### S3 — Activity (`/activity`)

Notifications split into **Needs your attention** / **Updates**. Each is a
tappable row: a level indicator, a plain title ("A quote is ready for your
decision"), one line of context, a relative time. Opening a row marks it read and
goes straight to the step. Reading is not the same as doing the thing — the
underlying action still waits on the task screen. Plus notification settings (two
simple switches) and the grouped request list.

### S4 — Task (`/tasks/:id`) — THE MOST IMPORTANT SCREEN

Today this screen stacks 7–8 panels and the user has to hunt for the current
action. **Redesign it as one screen with four zones, top to bottom:**

**Zone 1 — Status.** A status pill with a **plain-language** label (never an
internal code): "Waiting for a price" · "Quote ready — your decision" · "Ready to
send" · "Closed" · "Cancelled". Plus a one-line summary: "500 flyers · Campus
Print · created 2h ago". This is always in the first viewport — the user never
scrolls to learn where things stand.

**Zone 2 — What now (the focus card).** The **one** thing to do right now,
rendered in full, with its primary action **sticky at the bottom of the screen**:

- Waiting for a price → a calm "the business is preparing your price" state
  (illustration B4), no action.
- Quote ready → the offer + **"Approve ₦X with [business]"** / **"Not this one"**.
- Ready to send → "Send your order to [business]" + the full ready-written
  WhatsApp message + **[Copy message]** **[Open WhatsApp]**, then **"I've sent
  this"**; plus, if payment is offered, a **[Pay ₦X]** button that opens the pay
  sheet; plus "When you collect, show this code: **A4K9-2**".
- Handed off → "Confirm you collected your order" + [Confirm].
- Price change proposed → this **becomes** Zone 2 (it outranks everything): both
  amounts, the difference in plain money, the business's reason, [Accept ₦X] /
  [Keep the price I agreed].
- Exception (closed/failed) → the exception card (see PART 10): what happened /
  what to do / what's next / what happened to your money.
- A quiet "Something wrong with this order?" link at the bottom opens a sheet
  (cancel / report a handover problem).

**Zone 3 — Detail (quiet, collapsible).** Expandable sections, collapsed by
default: **Your brief** · **The quote** (price, turnaround, "fixed price" or
"estimate — confirm before paying", validity) · **How Intra reads this quote**
(total incl. delivery, per-item price, "why this looks OK", "what Intra can't
confirm") · **Payment** (only if relevant — and on the happy path just the honest
one-liner, never chain details).

**Zone 4 — History (collapsed).** The activity timeline in plain labels
("Request submitted", "Sent to the printer", "Quote received", "You chose to
proceed", "You confirmed the message was sent"). The feedback prompt appears here
once the task is complete.

### S5 — Business setup (`/supplier/onboard`)

The one-screen version. ~9 plain fields in 3 groups (Your business / Your first
service / Where and who). The pricing-model choice is a **segmented control**:
"Set price" / "Price starts from" / "Priced per job" — each with a one-line
explanation and an example ("A4 black & white — ₦50 per page"). A **prominent,
unbundled consent checkbox**: "You can show my prices to customers." Keep the
"What we'll never ask for" reassurance (seed phrase, private key, password, BVN,
NIN, bank login, card). The success state shows the manage link once, large, with
**"Keep this link — it's how you get back in and manage your prices."**
_(There is also a longer "detailed" form in the current app that produces a draft
only and dead-ends — treat the one-screen version as the only onboarding path;
the detailed form is operator-internal and out of scope for this redesign.)_

### S6 — Business requests inbox (`/supplier/:slug/requests`)

The merchant's daily screen. A fast card stack:

- **Incoming**: each card shows the request brief at a glance (paper size,
  quantity, colour, needed by, delivery area) + when it was sent + the reply
  target ("reply within 30 min"). One primary action: **"Send quote"** →
  opens a **bottom sheet** (see S7). A secondary "Decline" (needs a reason).
- **Prices you've sent**: "Customer is reviewing" / "Customer agreed", the price
  and turnaround, and a "Change this price" affordance.
- **Handed-off orders**: "Mark ready for pickup" → shows the pickup code to read
  to the buyer; and "Confirm handover" (enter the buyer's code, sign with the
  business wallet).
  Keep the disclaimer on the fulfilment section verbatim: _"operational evidence
  only, never a payment or a guarantee."_

### S7 — Send-a-quote sheet (bottom sheet)

**Two fields by default:** the **amount** (in the business's currency) and the
**turnaround** ("same day", "2 working days"). A segmented **"Fixed price /
Price range"** toggle. An optional **"Holds for:"** chip group (1 day / 3 days /
No limit). Everything else — delivery charge, availability note, assumptions,
confidence level — is behind a single **"Add detail"** disclosure, collapsed.
One line of reassurance: _"The buyer sees these as your quote, entered through
Intra. Intra doesn't independently check them."_ Sticky primary: **"Send
quote"**. This must feel like it takes 10 seconds.

### S8 — Pay sheet (bottom sheet) — see PART 8.

### S9 — Operator console (`/operator`)

Sign-in with a key (held only for the session, never stored — say so). Three
tabs. Review queue: per business, the details + a 6-checkbox verification list
with plain labels; "Verify and activate" is disabled until all 6 are ticked.
Metrics and Evidence: plain tables and a task-trace lookup. Internal tool —
functional, clean, not fancy.

### S10 — Evidence (`/evidence`)

Three clearly separated zones: **Real results** (a targets-vs-actual table +
detail) · **Demonstration data** (visually set apart, "never counted as
adoption") · **Unavailable & external integrations** (status list). Plus "What
changed from feedback" and a CSV/JSON download. Honest empty state: _"No real
activity recorded yet — that is the honest state, not a bug."_

### S11 — Offline (`/offline`)

Shown when there's no connection. Illustration B5 (a disconnected line) + _"You're
offline. Your work is safe on the server — reconnect and open the page again."_ +
[Try again].

---

## PART 7 — THE IMPORTANT STATES (design all of these)

You must design every one of these states for the relevant screens. **Never show
an internal code** — always the plain-language label.

**Task:** Draft → Sent → Waiting for a price → Quote ready — your decision →
Ready to send → (Closed / Cancelled).

**Quote:** Current offer · Change proposed — needs your decision · Replaced by a
newer price · Expired — the business no longer guarantees this price · The
business turned this job down.

**Business service:** Draft · Awaiting operator check · Available to customers ·
Paused · Stale (still "available" but the price is > 14 days old, so treated as
unavailable until reconfirmed).

**Payment (the buyer→business order payment):** not started · preparing ·
waiting for your wallet · payment submitted · payment confirmed · didn't go
through · cancelled.

**Agent query fee (a separate, tiny fee the AI assistant pays for information —
usually not applicable):** "Not charged" · "Unavailable — no service fee was
charged and no receipt exists. Intra never fabricates a payment." **Never show
the technical detail of this on a buyer screen.**

**Fulfilment evidence:** not started → ready for pickup → collected.

**Agent run (the AI working):** a 7-step calm sequence — understand · find
businesses · check availability · ask for prices · compare · your decision ·
recorded. Each step shows an icon **and a word** ("Finding printers…" / "Found 3
printers" / "Waiting for 2 printers to reply"). No bare spinner anywhere.

**Every async surface** needs: loading (skeleton, not a spinner), empty,
validation error, network error, success, and "unavailable/honest" states.

---

## PART 8 — THE PAYMENT MODEL (design this carefully)

There are two money flows. **Only one is visible to the buyer as a payment.**

### The order payment (buyer → business) — "Pay with MiniPay"

This is the buyer paying the business for the order, directly, on-chain, through
a wallet called **MiniPay** (a phone wallet popular in the target market). Intra
**never touches this money** — it goes wallet-to-business.

**Design the pay sheet as exactly four steps:**

```
1. REVIEW   →   2. CONFIRM   →   3. PAY   →   4. VERIFIED
```

- **REVIEW** — "Pay [business] for [order]". The amount in the buyer's currency
  (₦), large and clear. Below it, quieter: "≈ $4.20, at today's rate" with a
  **"How this is calculated"** disclosure (only there: the exchange rate, its
  source, and when it was locked — "locked 12:04, from open.er-api.com"). And
  "Goes to: Campus Print". A line: _"You've agreed this price. Paying is
  optional — you can also send the WhatsApp message and pay however you
  arranged."_
- **CONFIRM** — "Your wallet will ask you to approve this payment. The network
  fee comes from your wallet balance." One button: **"Pay ₦4,500"**.
- **PAY** — the wallet opens (that's the wallet's own screen). Intra shows
  "Waiting for your wallet…", then "Payment submitted — waiting for the network
  to confirm it. This page updates on its own. You can close this and come back."
- **VERIFIED** — illustration B2, a calm checkmark, "Payment confirmed", the
  amount, and a small "View transaction" link. A notification also fires.

**Rules for the payment UI:**

- The word "MiniPay" appears as a **payment method** ("Pay with MiniPay"), with
  the MiniPay logo. It is not a crypto feature, not a wallet feature — it's _how
  you pay_.
- On the default/happy path: **no contract address, no chain ID, no "gas", no
  token amount in raw units, no blockchain terms.** "Network fee" is the only
  concession, and only at the CONFIRM step.
- The USDC amount and the exchange rate live **only** behind "How this is
  calculated". Never on the summary.
- If the buyer has no wallet: "Open this order in MiniPay to pay from your wallet
  — or send the WhatsApp message below." The WhatsApp path is always visible and
  always works.
- "Confirmed" is only ever shown after real verification. Never fake it.
- If a payment fails: "The payment didn't go through. No payment was confirmed.
  Try again, or use the WhatsApp handoff." Then the money line: nothing was lost.

### The agent query fee (assistant → information service)

A tiny separate fee an AI assistant might pay to get fresh information. **It is
currently never active** and is not the buyer's money. On a buyer screen, if it
appears at all, it's one honest grey line: _"No agent query fee — this came
through the web."_ **Never** show its technical detail (attribution tags, token
units, network identifiers) on any buyer screen.

---

## PART 9 — THE HANDOVER & EVIDENCE MODEL

At the end, both sides can confirm the handover happened. Design this to be
**exceptionally clear** — the buyer must understand: **who, what, when, where,
what to say/show, and when it's complete.**

### The buyer's side, on the task screen (Ready-to-send and after):

- **Who**: the business name.
- **What**: the order summary ("500 A5 flyers, full colour").
- **Where**: the pickup/delivery area from their brief ("UNILAG main gate").
- **What to show**: **"When you collect, show this code: `A4K9-2`"** — the code
  large and clear, with "This is how the record shows you were really there."
- **Confirm collection**: after the business marks it ready, a button "Confirm
  I've collected this order". Or "Have a pickup code instead?" (if collecting
  from another phone).
- **Complete**: illustration B3 (two connected nodes, both filled), "Order
  complete — you confirmed the handover", and "Nothing else is needed."

### The business's side, in the requests inbox:

- "Mark ready for pickup" → shows a **6-character pickup code** to read to the
  buyer, in a clear bordered block: "Read this to the customer at collection."
- "Confirm handover" → "Ask the customer for the code they were given, then
  confirm this job was handed over. This is recorded as part of the transaction
  history." Enter the code, confirm with the business wallet.
- On success: "Handover confirmed. Recorded [time]." (or "Simulated — not on any
  real network" in test environments — keep that honest label).

**IMPORTANT — the two codes:** the buyer's "show this code" and the business's
"pickup code" are two different mechanisms that currently look identical and are
confusing. **Differentiate them clearly by direction and label:**

- Buyer's code → labelled **"Your collection code — show this to the business"**
- Business's code → labelled **"Give this code to the customer"**
  Use a distinct visual container / accent for each so they're never mistaken.

### What the evidence proves — say it plainly wherever it appears:

_"This records that both sides confirmed the exchange happened. It does not prove
the quality, quantity, or timeliness of the work, and it is not a rating."_

---

## PART 10 — ERRORS

Every exception, on every screen, must answer four questions in this order, in
plain language:

1. **What happened** — a plain, blameless headline ("The business turned this
   request down", "The handover didn't go through", "This is taking longer than
   expected").
2. **What I can do** — a recovery action, as a button where possible ("Start a
   new request", "Try again", "Contact the business directly").
3. **What happens next** — one quiet sentence ("This request is closed. Your
   details were not shared any further.").
4. **What happened to my money** — **always present**, always true, never
   speculative:
   - "Nothing was charged through Intra." / "No money moved. Nothing was
     ordered." / (if they paid the business directly) "If you paid the business
     directly, settle that with them."

Tone: use the calm **`attention`** style for "you can retry", the calm
**`neutral`** style for "this is closed, here's where it stands", and the
**`critical`** style _only_ for a genuine system failure. **Never leak a
technical error code, stack trace, or internal identifier.**

The root error screen already reads _"Something went wrong on our side. Nothing
you did caused it, and no request was sent to a printer."_ — keep exactly that
spirit.

---

## PART 11 — ASYNC WORK & RETURNING USERS

- The buyer can leave at any point. The **grouped request list** (5 buckets) is
  the safety net — a missed notification never means a lost task.
- **Notifications feel like continuity, not interruption.** In-app: a badge on
  the bottom-nav Bell + a row in Activity. Push (optional, only offered once the
  buyer has something actually in flight): a system notification that
  deep-links to the exact next step.
- When a buyer returns via a notification, the target zone gets a **one-time
  gentle highlight** so their eye lands on what changed.
- **Never** interrupt with a modal for a background event. A quiet toast at most,
  and never for money/decision events (those are notifications + in-place state).
- The PWA install prompt is a **slim bar**, only when there's async work, never
  on first load, dismissible permanently. _"Add Intra to your home screen so we
  can tell you when a business replies."_

---

## PART 12 — THE TRUST MODEL

Trust is built through **clarity, explicit human action, transparent status, and
honest confirmation** — **not** through piles of technical information.

**Design these trust moments deliberately:**

- **Before the buyer commits** — the recommendation says _why_ this option AND
  _what Intra can't confirm_, and shows the alternatives it beat.
- **At the decision** — the full deal on the surface (business, price, fixed vs
  estimate, expected time, price validity, "who you pay: the business, directly.
  Intra never holds, sends, or takes this money."). Never behind a disclosure.
  The button names the consequence.
- **At payment** — the amount, the recipient, the rate (behind a disclosure), and
  "confirmed" only after real verification.
- **At handoff** — the whole message shown; "Intra does not send this message and
  never pays a business for you."
- **At fulfilment** — every record carries its plain-language limits ("not a
  proof, not a payment, not a guarantee", "not a rating").
- **On failure** — always the money line.
- **Publicly** — `/evidence` separates real from demo, and shows its method.

**These exact phrases must survive the redesign, at their current moments** (you
may re-style them, not remove or soften them):

- "No wallets, no private keys, and no final order without your approval."
- "Intra never holds, sends or takes this money."
- "Intra does not send this message and never pays a supplier for you."
- "Entered by the printer or an Intra operator. Not independently checked by
  Intra."
- "operational evidence, not a cryptographic proof, not a payment settlement, not
  a guarantee"
- "it is not a rating, and it does not vouch for the quality of the work"
- "Intra never held any money for this order, so there is nothing to refund
  here."
- "Public address only — Intra never stores or asks for a private key or seed
  phrase."
- "Nothing was charged through Intra." / "No money moved. Nothing was ordered."
- "Nothing you did caused it, and no request was sent to a printer."

---

## PART 13 — COMPLEXITY: WHAT TO HIDE, WHAT TO SHOW

### HIDE (the user must never have to think about these):

- Internal status names / state-machine codes (always use the plain label).
- The AI's internal steps, tool calls, timings, model details, run IDs.
- API request/response shapes, retry/idempotency mechanics.
- Cryptographic commitments, hashes, salts, signatures.
- Token amounts in raw units, decimals, contract addresses, chain IDs,
  network identifiers (CAIP), "gas".
- Smart-contract / attestation implementation, schema identifiers.
- The words "capability card", "quote route", "input schema", "MCP", "x402",
  "EAS", "ERC-8004", "attribution tag" — **none of these on a buyer or merchant
  screen.**
- The exchange-rate source URL and JSON (put the rate + source name + timestamp
  behind "How this is calculated").
- Raw brief field keys in any message (humanise: "Paper size: A5", not
  "size: A5"; "Full colour", not "full-colour").

### SHOW (because it affects trust, money, consent, timing, or a decision):

- **The full deal at the approval moment** — price, business, fixed vs estimate,
  timing, validity, who you pay.
- **"Intra never holds this money" / "you pay the business directly"** — at the
  decision and at payment.
- **The exchange rate, its source, and lock time** — behind "How this is
  calculated", not hidden entirely.
- **Who the payment goes to** (the business, shortened address is fine).
- **"Confirmed" only after real verification** + a way to check (explorer link).
- **Freshness** — "Prices confirmed 3 days ago"; "stale — needs reconfirming".
- **The consent tick** — explicit, unbundled, never pre-checked.
- **The operator verified this business** — "Verified by an operator 3 days ago".
- **Whether something is real or demonstration** — labelled.
- **The money line on every failure.**
- **The handover code** and what it's for.
- **What the evidence does and doesn't prove.**

---

## PART 14 — MOBILE / PWA EXPECTATIONS

- **Mobile is the primary environment.** Design at **360px** first, then 375 /
  390 / 430, then tablet, then desktop. Do not shrink a desktop layout.
- **Bottom navigation** for the buyer (Home / Activity / Requests + a "needs you"
  badge). Replaced by the task's sticky action on the task screen.
- **Sticky primary action** at the bottom of every action screen — a `surface`
  bar with a hairline top, safe-area padding, a full-width button. The page
  scrolls under it.
- **Bottom sheets** for every focused sub-task (send a quote, pay, confirm
  pickup, decline with a reason). Drag handle, scrollable body, sticky action,
  scrim behind. Not modals.
- **Segmented controls, steppers, and chip groups** instead of dropdowns and
  number pads where the choice set is small and known.
- **One-handed**: primary actions in the bottom third; destructive actions need a
  second tap (inline "are you sure?").
- **Touch targets** ≥ 44px; list rows ≥ 64px; the whole consent row is tappable.
- **Inputs** are 16px (no iOS zoom), with the right `inputMode`.
- **Offline**: a thin honest strip, not a blocker; the offline page has a real
  message; API failures show the calm network-error state, never a fake success.
- **Installable PWA**: `start_url` is the buyer Home. Standalone display,
  portrait. The manifest theme colour and all app icons must use the new palette
  (they currently use an old green — fix this).
- **Service worker behaviour** (do not change): nothing about prices, quotes,
  approvals, payments, or fulfilment is ever served from a cache — the buyer
  always sees live server state or a clean "you're offline".

---

## PART 15 — VISUAL DIRECTION

**Warm editorial workspace.** Calm, premium, human, operational. Think: a
well-made notebook and a trustworthy independent shop — **not** a fintech
dashboard, **not** a crypto terminal, **not** a generic AI chat app.

### Palette (light only — no dark mode)

- **Canvas**: warm ivory `#faf9f5`.
- **Surfaces**: white `#ffffff`; sunken `#f4f2ec`.
- **Text**: near-black `#141413`; muted `#3d3d3a`; subtle `#73726c`.
- **One action colour**: ink `#1f1e1d` — every primary button, primary link,
  active nav item, and the app mark. Warm white `#faf9f5` for text on ink.
- **Action wash**: warm sand `#f0ede4` — selected segments, the approval-card
  tint, the "you are here" nav pill. (Do **not** use a cold blue-grey.)
- **Borders**: warm hairline `#e4e1d8`; strong `#c8c4b8`.
- **Status** (always paired with an icon AND a word — never colour alone):
  - Positive `#28563a` on `#e6efe6` — done, confirmed, verified, available.
  - Attention `#7a5300` on `#f6ecd6` — needs your decision/action; time-sensitive.
  - Critical `#8a1f1f` on `#f6e3df` — failed, error, declined.
  - Info `#2f4858` on `#e4ebe9` — informational.
  - **Neutral / honest `#73726c` on `#f2efe8`** — the "here's what is NOT
    happening / NOT verified / NOT real" tone. **Calm, matter-of-fact, never like
    an error.** This is the visual voice of Intra's honesty. Use it for "no
    receipt exists", "not saved", "operational evidence, not proof", "stale".

### Typography

- **Body / UI / mono**: system font stacks (no web font for these — the audience
  is on metered connections).
- **Display / headings**: a single warm, humanist, lightly-editorial face,
  **self-hosted, subset, `font-display: optional`** (so it never blocks
  rendering and never shifts layout — it falls back to a system serif on a slow
  connection). One weight. Used for the screen question, screen titles, and card
  titles only. If a self-hosted face isn't possible, use Georgia at weight 400 —
  **do not** fall back to an all-sans design (that reads generic).
- Scale (rem): display 2.25→2.75 · title 1.5 · heading 1.25 · body 1 · small
  .875 · meta .75. Tight negative tracking on display/title, near-zero on body.
- An uppercase "eyebrow" kicker (~0.72rem, letter-spaced, weight 600) over titles.

### Shape & elevation

- **Radii**: 10px (inputs, buttons, chips) · 16px (cards, sheets) · 24px (hero
  panels) · 999px (pills). Nothing in between.
- **No drop shadows anywhere.** Elevation = a hairline border + surface tint. A
  raised element (an open sheet, a focused card) gets a stronger border + a 1px
  warm inner top highlight. The only overlay is a bottom-sheet scrim
  (`rgba(20,20,19,.32)`).
- Generous whitespace. Hairline dividers, not heavy rules or colour bands.

### Components (the vocabulary — reuse these everywhere)

- **Callout** — the trust device. Four tones (info / attention / positive /
  neutral). The `neutral` tone carries every honesty statement.
- **StatusPill** — a coloured dot + an UPPERCASE plain-language label.
- **DataList / DataRow** — label + value (+ optional hint). For briefs, quotes,
  business details, the deal summary.
- **List row** — a full-width tappable row (leading indicator, primary line,
  context line, trailing action pill or chevron). For the request list, the
  inbox, notifications.
- **SegmentedControl** — binary/ternary choices (fixed/range, pricing model).
- **Stepper** — quantity, with preset chips (50 · 100 · 250 · 500 · 1000).
- **ChipGroup** — optional constrained choices (expiry, deadline quick-picks).
- **Bottom sheet** — every focused sub-task.
- **Stepper/tracker** — the agent progress spine (icon + word per step); the
  2-step fulfilment tracker; the 4-step payment tracker.
- **Exception card** — the consistent error container (PART 10).

### What to avoid

- Crypto-terminal aesthetics, monospace-everywhere, "web3" gradients, glowing
  nodes, coin/chain imagery.
- Generic AI-chat aesthetics, a chatbot avatar, an "AI thinking" shimmer beyond
  the honest progress spine.
- Big dashboards, KPI tiles, charts, data grids. (The only tables are the two
  simple ones on `/evidence` and `/operator`.)
- Excessive cards, badges, gradients, glassmorphism, drop shadows.
- Stock photography, fabricated merchant logos/photos/testimonials, "trusted by"
  strips, fake user counts.
- Decorative animation that competes with or delays an action.

---

## PART 16 — MOTION

Motion communicates: transition, progress, attention, confirmation, completion,
continuity. It never entertains and never delays.

- **Screen transitions**: 180ms cross-fade + 8px directional slide; keep the
  primary action in place so the thumb doesn't chase it.
- **Sheet open**: 220ms slide-up + scrim fade; drag-to-dismiss tracks the finger.
- **Disclosure expand**: 160ms height + fade; no bounce.
- **Progress**: the active step's icon swaps + a 1px underline sweeps under it
  (400ms).
- **Notification arrival (app open)**: the Bell badge scales 1→1.15→1 once
  (250ms). No sound, no takeover.
- **Confirmation** (decision recorded, quote sent): the button label cross-fades
  to the done state + a checkmark draws in (300ms), then the screen advances.
- **Completion** (payment verified, handover complete): the relevant illustration
  fades + rises 6px; one calm checkmark. **No confetti, no burst.**
- **Error**: the affected card's border pulses the `critical` colour once (no
  shake) + the error text fades in (200ms).
- **Continuity** (returning from a push): the target zone rises in 12px once so
  the eye lands on what changed.

Every animation ≤ 400ms, nothing blocks input, and
`prefers-reduced-motion: reduce` collapses everything to an instant opacity
change.

---

## PART 17 — ASSETS

### Use the existing icon system

**lucide-react** (thin line icons). Stay on it. Do not introduce dozens of
bespoke icons. The only custom glyph is the app mark.

### Design (not generate) — the brand

- **App mark**: rebuild the existing concept — _two nodes connected by a line_ (a
  request handed from one party to another) — as a clean geometric mark in the
  ink colour. Single stroke weight, no gradient, no 3D, reads at 16px. Deliver as
  an SVG + derived PNGs (16/32/180/192/512/maskable-512).
- **Wordmark**: "Intra" in the display face (or a lightly customised sans),
  weight 400–500, tight tracking, as a locked lockup with the mark, plus a
  mark-only variant for tight mobile headers.
- **Favicon**: derive from the app mark (`icon.svg` + a `.ico` fallback). There
  is currently **no proper favicon** — the browser tab shows a badly-downscaled
  192px PNG in the old green. Add a real one.
- **Regenerate the PWA icon set and the OG image** in the new palette (they
  currently use an old forest green).

### Generate — a small, restrained illustration set (8 pieces, one consistent

style: flat, 2-colour = ink + one status wash, thin geometric line, no faces, no
stock tropes, no crypto imagery, ~1:1, SVG):

- **B1 "Your decision"** — the approval moment.
- **B2 "Payment confirmed"** — the pay-sheet VERIFIED step + the confirm
  notification. Calm, not celebratory.
- **B3 "Order handed over"** — two connected nodes, both filled. Handover
  complete.
- **B4 "Waiting on the business"** — a quiet clock / paper plane. The "your
  request reached a real person" state.
- **B5 "You're offline"** — a disconnected line between two nodes.
- **B6 "Nothing needs you"** — a calm complete mark. Caught-up empty states.
- **B7 "Set your business up"** — a storefront linked to an abstract "assistant".
  The setup hero.
- **B8 "This couldn't be completed"** — a broken/paused line, neutral not
  alarming. The exception card header.

These appear **only** at those 8 moments. Nowhere else.

### Source (official brand assets, don't draw)

- **MiniPay** logo — for the "Pay with MiniPay" button and the method chooser.
- **USDC** mark — small, only behind "How this is calculated" and on the receipt.
- **Celo** mark — only on `/docs`.
- **WhatsApp** glyph — the "Open in WhatsApp" button (or reuse the existing
  lucide message icon if licensing is a concern).

### Do NOT add

Stock photos, merchant photography, avatars, 3D renders, blockchain/crypto
decorative imagery, an AI mascot, animated/Lottie illustrations, dark-mode asset
variants (beyond one reversed app mark).

---

## PART 18 — WHAT MUST BE PRESERVED (do not "improve" these away)

1. **The buyer sends the final WhatsApp order themselves** — the ready-written
   message is shown in full and never auto-sent.
2. **The buyer decision is its own explicit step**, with the full deal on the
   surface, before the business contact is revealed.
3. **The wallet approval is a separate action** from approving the price.
4. **"Confirmed / paid" only after real verification.** Never a fabricated
   receipt — an honest "unavailable" state instead.
5. **Freshness** — a confirmation timestamp; auto-"stale" at 14 days.
6. **The consent tick** — explicit, unbundled, never pre-checked.
7. **Operator verification (all 6 checks)** before a business goes live.
8. **Public wallet address only** — shown shortened; never a private key / seed
   phrase / bank / card / ID number requested anywhere.
9. **Demo / not-saved state is labelled** (but re-word it to be accurate — the
   _chat_ isn't saved; the _requests_ are).
10. **The fulfilment disclaimer, verbatim**, on every fulfilment surface.
11. **"Both sides confirmed the exchange — not a proof of quality, not a
    rating."**
12. **The plain-language status labels, the "who did what" narrative, the
    consequence-named buttons, the exception cards, the honest empty states** —
    these are the product's strongest existing UX. Re-style, don't remove.
13. **Accessibility**: real labels, associated errors, visible focus, status by
    icon + word, reduced-motion support, 16px inputs, 360px support.
14. **The existing warm-editorial direction, the light-first / flat / hairline /
    no-shadow / one-action-colour system, and the no-web-font-for-body rule.**

---

## PART 19 — WHAT MUST BE FIXED

1. **`/tasks/:id` is overloaded** (7–8 stacked panels). Restructure into the
   4-zone focus layout (PART 6 S4). The user must instantly know: current
   status · what happened · what to do now · what's next.
2. **No persistent buyer navigation.** Add the bottom nav (Home / Activity /
   Requests).
3. **The send-a-quote form is too heavy for a phone.** Reduce to 2 default fields
   - a bottom sheet + "Add detail" disclosure.
4. **The payment surface reads like a blockchain transaction.** Make it
   REVIEW → CONFIRM → PAY → VERIFIED, with chain detail hidden behind "How this
   is calculated".
5. **The two handover codes look identical and are confusing.** Differentiate by
   direction and label, with distinct visual containers.
6. **The x402 agent-fee card leaks technical detail** on the buyer's task screen.
   Reduce it to one honest line; move any real detail out of the buyer view.
7. **"Demo only — nothing here is saved" is misleading.** Re-word.
8. **Stale forest-green colour** in the app manifest, theme colour, OG image, and
   the global error screen — replace everywhere with the ink palette.
9. **No proper favicon; three inconsistent brand marks** (a CSS "circle + serif
   I" in the header, a plain square in the social card, a two-node mark in the
   app icons — all different, and the icons are in the old green). One app mark,
   one wordmark, one favicon, used consistently.
10. **Internal pages (task, supplier, operator, activity, evidence) inherited the
    palette but not the spacing/rhythm.** Apply the full system everywhere.
11. **Empty / error / success states are all "a lucide icon in a circle."** Use
    the 8 purpose-built illustrations at the trust moments; keep icons elsewhere.
12. **`/request` (an old form-based entry) is orphaned** — not linked from
    anywhere. Fold a "prefer a form?" option into the Home conversation, or drop
    the separate route. Do not maintain two parallel buyer entry points.
13. **The "detailed" onboarding form dead-ends** (produces a draft, no save).
    Treat the one-screen setup as the only onboarding; the detailed form is
    operator-internal and out of scope.

---

## PART 20 — WHAT MUST NOT BE INTRODUCED

- **No new backend capability, no new business model, no new vertical.** Flyer
  printing only.
- **No autonomous purchases.** The AI never buys, never pays, never accepts.
- **No payment custody.** Intra never holds funds; MiniPay is wallet → business
  direct.
- **No accounts, no login, no passwords, no profiles, no avatars.**
- **No escrow, no dispute-resolution flow, no refund flow, no star ratings, no
  reputation score, no reviews.**
- **No fabricated data** — no fake merchants, testimonials, transaction volume,
  user counts, "trusted by" logos, or sample reviews.
- **No fake UI states** standing in for real backend truth (no "payment
  successful" without verification, no "verified" badge without an operator
  check).
- **No exposed private merchant data** on public or buyer surfaces (contact
  details appear only after the buyer accepts; payout addresses only on the
  business's own settings page, shortened).
- **No unnecessary blockchain surfaces** — no wallet-connect on the landing page,
  no chain selector, no token balance display, no transaction history feed.
- **No dark mode.** No web fonts for body/UI text.
- **No dense admin layouts, no dashboards, no charts** beyond the two existing
  simple tables.

---

## PART 21 — WHAT A SUCCESSFUL REDESIGN LOOKS LIKE

The redesign succeeds if:

1. **A first-time buyer who knows nothing about crypto** can go from "I need
   flyers" to an approved order and a sent WhatsApp message without ever seeing a
   word they don't understand, and without ever being unsure whose money is
   whose.
2. **On any screen, the user can point to the one primary thing to do next.**
   `/tasks/:id` in particular always answers "what now?" in the first viewport.
3. **A merchant can open a request, understand it, and send a price in under 20
   seconds on a phone, one-handed.**
4. **The payment feels like paying** — review, confirm, pay, done — not like
   signing a blockchain transaction.
5. **The handover is unmistakable**: the buyer knows who, what, where, what to
   show, and when it's complete; the two codes are never confused.
6. **A user who closes the app mid-flow and returns an hour later** lands exactly
   where they left off, with a clear "here's what changed."
7. **Every failure tells the user what happened, what they can do, what's next,
   and what happened to their money** — calmly, with no error codes.
8. **Trust is felt through clarity and honesty**, not through technical detail.
   The "here's what is NOT happening" moments feel reassuring, not alarming.
9. **It looks like one coherent, warm, premium product** — not a marketing site
   bolted to an admin panel. The internal screens feel as considered as the
   landing page.
10. **Nothing about the product's actual behaviour has changed.** Every workflow,
    state, rule, and honest disclaimer from this brief is intact.

---

## PART 22 — DELIVERABLE SCREENS (build these)

Mobile-first, in priority order:

**Buyer:**

1. Home (`/agent`) — conversation + grouped request list + bottom nav.
2. Task (`/tasks/:id`) — the 4-zone focus layout, all states (waiting / quote
   ready / ready to send / handed off / price change / exception).
3. The approval moment (inline in Home and as Task Zone 2).
4. The pay sheet (REVIEW → CONFIRM → PAY → VERIFIED).
5. The handover content (buyer side: code, confirm collection, complete).
6. Activity (`/activity`) — notifications + settings + list.
7. Landing (`/`).

**Business:** 8. One-screen setup (`/supplier/onboard`) + the "keep this link" success state. 9. Requests inbox (`/supplier/:slug/requests`) — incoming / sent / handed-off. 10. The send-a-quote sheet. 11. The revise-price sheet + the "confirm handover" flow. 12. Business workspace (`/supplier/:slug`) + service settings (`/review`).

**Operator / public:** 13. Operator console (`/operator`) — 3 tabs. 14. Evidence (`/evidence`). 15. Docs (`/docs`) — keep it technical, just apply the system. 16. Offline, error, not-found.

**Design-system artefacts:**

- The token set (colours by role, type scale, spacing, radii, motion).
- The component library (Callout, StatusPill, DataList, list row, SegmentedControl,
  Stepper, ChipGroup, bottom sheet, tracker, exception card, buttons, inputs,
  empty/loading/error/success states).
- The app mark, wordmark, favicon, PWA icon set, OG image.
- The 8 illustrations.

---

_End of prompt. Build the frontend. Keep the product._
