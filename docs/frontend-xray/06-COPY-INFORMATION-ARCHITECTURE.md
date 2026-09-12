# 06 — Copy & Information Architecture

> Every meaningful piece of user-facing text in the application, inventoried
> verbatim from the source. **Not rewritten.** For each: where it appears, the
> role/task, intended meaning, and an assessment (clear? jargon? action?
> status? trust/risk? redundant? hierarchy correct?).
>
> Verbatim strings are in "quotes". File anchors given per block.

---

# 1. Global / brand

| String                                                                     | Where                                  | Assessment                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Intra"                                                                    | logo (`Header`), `site.name`           | clear                                                                                                                                            |
| "The trusted business layer for AI-agent commerce"                         | `site.tagline`, `<title>` template, OG | **jargon for the buyer persona** ("AI-agent commerce"); accurate for the agent-builder audience. The two audiences are conflated in one tagline. |
| "Real businesses. Clear quotes. You stay in control."                      | `Footer`                               | clear; the strongest one-line summary of the value prop                                                                                          |
| "Intra · {year}"                                                           | `Footer`                               | clear                                                                                                                                            |
| Nav: "Home" (→ `/agent`), "For businesses" (→ `/supplier/onboard`), "Docs" | `Header`                               | "Home" pointing at `/agent` (not `/`) is a mismatch with the mental model of "home"; a first-time visitor expects `/`                            |
| "Join as a business"                                                       | `Header` CTA                           | clear, action-oriented                                                                                                                           |

---

# 2. Landing page (`/`, `src/app/page.tsx`)

| String                                                                                                                                                            | Role                      | Assessment                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| eyebrow "The trusted business layer for AI commerce"                                                                                                              | H1 kicker                 | jargon; "AI commerce" undefined                                               |
| H1 "A clearer way to get work done with real local businesses."                                                                                                   | value prop                | **clear and human** — better than the tagline                                 |
| "Intra turns your request into a brief a real business can act on. You get a fresh quote, keep the final say, and never have to decode technical tools to begin." | subcopy                   | clear; "decode technical tools" pre-empts the crypto fear                     |
| CTA "I need something made"                                                                                                                                       | primary                   | clear intent framing                                                          |
| CTA "I run a business"                                                                                                                                            | secondary                 | clear                                                                         |
| "No wallets, no private keys, and no final order without your approval."                                                                                          | trust line under the CTAs | **strong trust copy**; front-loads the three fears                            |
| quote card "A request, made simple" / "I need 100 flyers for Friday. What will it cost?"                                                                          | example                   | concrete, on-target for the persona                                           |
| "Verified business — A real person responds to the brief."                                                                                                        | trust point               | clear                                                                         |
| "WhatsApp handoff — You send the order when you are ready."                                                                                                       | trust point               | clear; sets the human-in-the-loop expectation                                 |
| "How it works" / "One calm path from question to quote."                                                                                                          | section                   | "calm path" is brand voice; fine                                              |
| step 01 "Tell us what you need — Describe a printing job in everyday language. No specialist terms required."                                                     | how-it-works              | clear; "printing job" narrows honestly                                        |
| step 02 "Get a real response — A verified business reviews the brief and sends an honest price and turnaround."                                                   | how-it-works              | clear                                                                         |
| step 03 "Choose with confidence — You approve the quote and send the final order yourself on WhatsApp."                                                           | how-it-works              | clear; reinforces the boundary                                                |
| "Helpful technology. Human decisions."                                                                                                                            | section                   | the product thesis in 3 words                                                 |
| "Intra makes information legible between agents and businesses. It does not pretend to be the business, make purchases for you, or hold your money."              | section body              | **excellent boundary statement**; slightly abstract ("legible") for a student |
| "You stay in control — No order is placed until you choose to send it."                                                                                           | trust card                | clear                                                                         |
| "Businesses stay visible — A real business owns its availability and price."                                                                                      | trust card                | clear                                                                         |
| "Agents get clarity — Structured requests replace guesswork and back-and-forth."                                                                                  | trust card                | audience mismatch on a buyer landing page (this speaks to agent builders)     |
| "For business owners" / "Let customers find the service you already provide."                                                                                     | business panel            | clear                                                                         |
| "Set up your first service in one screen. You review each request and keep the customer relationship direct."                                                     | business panel            | clear, sets expectations                                                      |
| CTA "Set up my business"                                                                                                                                          | business panel            | clear                                                                         |

---

# 3. Buyer conversation (`/agent`, `ConversationView` + `AgentConsole`)

| String                                                                                                                                                               | Role                  | Assessment                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Your workspace" (eyebrow) / "What do you need?" (H1)                                                                                                                | `/agent` header       | clear, direct                                                                                                                                                                                                |
| "Describe it in your own words. We'll turn it into a clear request for a real business; you'll see the price before you decide what happens next."                   | subcopy               | clear                                                                                                                                                                                                        |
| intro "Hi — tell me what you need and I'll find a business on Intra that can do it, get you a real price, and let you decide. I never send an order or pay for you." | first message         | **clear + trust**; "I" personifies the assistant                                                                                                                                                             |
| "Demo only — nothing here is saved."                                                                                                                                 | persistent `Callout`  | **misleading — see [`02` P10]**. The conversation isn't saved, but the task, quote, decision and commitment that a run produces _are_. A first-time user could read this as "this doesn't do anything real." |
| "Start a new request"                                                                                                                                                | button                | clear; the tooltip-less behaviour (forgets the thread, not orders) is not stated                                                                                                                             |
| "So far:" + chips                                                                                                                                                    | understanding summary | clear, low-commitment                                                                                                                                                                                        |
| placeholder "e.g. I need 500 flyers by Friday in Yaba"                                                                                                               | textarea              | good concrete example                                                                                                                                                                                        |
| "Something went wrong. Try again in a moment."                                                                                                                       | error                 | generic but non-alarming; no code leaked                                                                                                                                                                     |
| `AgentConsole` "What do you need?" / "Ask for something else"                                                                                                        | `IntentInput` label   | the "Ask for something else" state can double up with the conversation input ([`00` §20 #6])                                                                                                                 |
| "Plain language is fine — I'll tell you if I need anything else."                                                                                                    | hint                  | reassuring                                                                                                                                                                                                   |
| example chips "500 flyers by Friday" / "200 leaflets by tomorrow" / "1000 posters for Saturday"                                                                      | `IntentInput`         | good; all printing (honest scope)                                                                                                                                                                            |
| "Ask the agent" / "Working…"                                                                                                                                         | button                | clear                                                                                                                                                                                                        |
| "Demo — this conversation is not saved. Nothing is ordered without your approval."                                                                                   | `IntentInput` footer  | same issue as above; the second sentence is the important one                                                                                                                                                |

## 3.1 Agent run stages (`stages.ts` — `labelFor`)

| Stage      | Progressive label                                               | Done label                                          | Blocked label                             |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| understand | "Understanding your request"                                    | "Understood your request"                           | "I can't take this one on"                |
| discover   | "Finding printers who can do this"                              | "Found 3 printers who offer this"                   | "No printer is offering this right now"   |
| check      | "Checking who is available now"                                 | "2 of 3 can take it on today"                       | "None of them can take the job right now" |
| quote      | "Asking for current prices" / "Waiting for 2 printers to reply" | "3 quotes came back"                                | "No printer replied in time"              |
| compare    | "Comparing the options"                                         | "Compared 3 quotes"                                 | "None of the quotes work for this order"  |
| decide     | "Your decision"                                                 | "You approved Campus Print"                         | —                                         |
| record     | "Recording your decision"                                       | "Decision recorded and your order message is ready" | —                                         |

Details: "Printers answer as people, not APIs — this part is genuinely
asynchronous." / "3 were ruled out before asking, so no fee was spent on them." /
"Nothing is ordered and no money moves until you approve." — **all clear, all
human, no jargon.** This is the best copy in the product.

## 3.2 Recommendation (`RecommendationPanel`)

| String                                                                                                                                                              | Assessment                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "Recommended" (eyebrow)                                                                                                                                             | clear                                                                                                                                      |
| "fixed price" / "estimate" (`StatusPill`)                                                                                                                           | clear                                                                                                                                      |
| "Ready within {turnaround}" / "This price holds until {date} ({relative})" / "No expiry was given, so treat this as indicative rather than held."                   | clear; "held" vs "indicative" is a useful distinction                                                                                      |
| "Why this one?" (+ "✨ agent's reasoning")                                                                                                                          | clear; the ✨ label is the only "AI-ness" signal                                                                                           |
| "Other options I found (2)"                                                                                                                                         | clear                                                                                                                                      |
| alternative comparison "NGN 700 cheaper, but 1 day slower"                                                                                                          | **excellent** — the trade-off in plain money + time                                                                                        |
| "I ruled out 2 printers" (`<details>`) — "{name} — {because}"                                                                                                       | clear; honest about what was excluded                                                                                                      |
| "What I cannot confirm" (`Callout tone="unavailable"`)                                                                                                              | **strong trust copy**                                                                                                                      |
| "Details" (`<details>`) — "Quote issued", "Quote expires", "Price basis", "Printer's own confidence", "Agent query fee", "Printer last confirmed prices", "Service" | mostly clear; "Agent query fee" needs its inline explanation ("$0.003 — paid to ask for the price, never part of your order") which it has |

## 3.3 Approval (`ApprovalPanel`) — the hard gate

| String                                                                                           | Assessment                                                              |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| "Before we go ahead"                                                                             | clear framing                                                           |
| labels: Business / Service / Total price / Expected completion / Price held until / Who you pay  | clear, complete                                                         |
| "Fixed — the printer committed to this amount" / "An estimate — the final amount can still move" | **clear risk statement**                                                |
| "{business}, directly" / "Intra never holds, sends or takes this money."                         | **the boundary, verbatim, on the surface** — correct                    |
| button "Approve {price} with {business}"                                                         | **exemplary** — names the consequence, the amount, and the counterparty |
| "Decline — don't proceed"                                                                        | clear; no ambiguity                                                     |
| "Why not? (optional)" placeholder "Too expensive, too slow, found another printer…"              | clear, low-friction                                                     |

## 3.4 Outcome (`OutcomePanel`)

| String                                                                                                                                                                                                                                                    | Assessment                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "Agreed with {name}"                                                                                                                                                                                                                                      | clear                                                                                         |
| 4-step list: "Your decision is recorded" / "The agreed price and terms are locked to this order" / "You send the printer the message and agree the order" / "You collect, and confirm the handover"                                                       | **clear roadmap**; sets the "you're not done yet" expectation                                 |
| "Open your order and copy the message"                                                                                                                                                                                                                    | clear CTA                                                                                     |
| "Intra does not send that message and never pays the printer for you. You send it, and you pay them directly."                                                                                                                                            | boundary; correct                                                                             |
| "Record details" (`<details>`) — "(simulated — not on a public chain)"                                                                                                                                                                                    | honest about mock mode                                                                        |
| "You didn't go ahead. Nothing was ordered and no money moved. The printer was told you passed, which keeps their availability accurate."                                                                                                                  | clear; "keeps their availability accurate" is a nice touch (explains why the printer is told) |
| `outcomeCopy` unsuccessful titles: "No printers are live yet" / "No printer can take this right now" / "Nobody replied in time" / "The quotes that came back cannot work" / "The quote lapsed before you saw it" / "That is outside what this agent does" | **all clear, all benign, none leak a code**                                                   |
| fallback "That did not go through. Something went wrong while the agent was working. Nothing was ordered and no money moved."                                                                                                                             | non-alarming; the technical filter (`looksTechnical`) prevents leaks                          |

## 3.5 Activity feed (`ActivityFeed`)

Actor labels: "You" / "Agent" / "Printer" / "Intra". Narrative lines: "You asked:
"…"" / "Read your request and worked out the brief." / "Recommended {name} and
stopped for your decision." / "You approved it." / "Recorded the agreed price and
terms, and prepared your order message." — **clear, actor-attributed, no tool
names.**

Engineering trace: "Engineering trace (N events)" / "Run id" / "Reasoning:
{provider}/{model} · N calls" or "deterministic rules only" / mono lines — this
is deliberately technical, deliberately nested. Fine.

---

# 4. Buyer task page (`/tasks/:id`, `TaskPage`)

## 4.1 Status labels (`StatusPill.ts:taskStatusLabel`)

| Enum             | Label                         | Assessment                                       |
| ---------------- | ----------------------------- | ------------------------------------------------ |
| `DRAFT`          | "Draft"                       | fine                                             |
| `SUBMITTED`      | "Sent"                        | clear                                            |
| `AWAITING_QUOTE` | "Waiting for a price"         | **clear** — no "quote" jargon                    |
| `RECOMMENDED`    | "Quote ready — your decision" | clear + action                                   |
| `HANDOFF_READY`  | "Ready to send"               | clear                                            |
| `FAILED`         | "Closed"                      | soft; the exception `Callout` carries the detail |
| `CANCELLED`      | "Cancelled"                   | clear                                            |

## 4.2 Timeline event labels (`TaskPage.tsx:EVENT_LABEL`)

Sample: "Request created" / "Sent to the printer" / "Quote received" / "You chose
to proceed with this printer" / "Ready for your WhatsApp handoff" / "You confirmed
the message was sent" / "Printer marked the order ready for pickup" / "Order
recorded" / "Order handover secured" / "Query fee settled on-chain". — **mostly
clear**; "Query fee settled on-chain" and "Order handover secured" are slightly
technical but rare.

## 4.3 Brief field labels (`briefLabel`)

"Paper size" / "How many" / "Colour" / "Needed by" / "Delivery / pick-up" —
clear, plain.

## 4.4 Quote card

| String                                                                                                                                                          | Assessment                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| "Fixed price" / "Estimate — confirm before paying"                                                                                                              | **clear risk framing**                                                                  |
| "Entered by the printer or an Intra operator. Not independently checked by Intra."                                                                              | **strong trust copy** — repeated (also on `RecommendationCard` and `QuoteResponseForm`) |
| "Quote validity" — "Valid until {datetime} ({relative})" / "Expired {relative} — reconfirm the price before paying" / "No stated expiry — treat as an estimate" | clear                                                                                   |

## 4.5 "Intra's read of this quote" (`RecommendationCard`)

"Total incl. delivery" / "Per flyer" (hint "for 100 copies") / "Turnaround" /
"Why this looks OK" / "What Intra cannot confirm" / the verification note. — the
`verificationNote` (from `buildRecommendationDetail`) states plainly that the
figures are operator/printer-entered and not independently verified. Clear.

## 4.6 Decision panel

"Your choice" / "This is your decision. Intra does not place the order or pay the
printer — if you proceed, you send the message yourself and agree the order
directly." — **boundary, verbatim.** "Proceed with this printer" / "Proceed
anyway — I'll reconfirm" / "Not this one" / "Confirm — don't proceed". Clear.

Expired warning: "This quote has expired — You can still go ahead, but the price
is no longer guaranteed. If you proceed, the message to the business asks them to
reconfirm the current price and turnaround before you pay." — clear.

## 4.7 Handoff card

| String                                                                                                                                                            | Assessment                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| "Order handoff — you send this yourself"                                                                                                                          | clear                         |
| "You chose to proceed with this printer. Send them the message below to agree the order."                                                                         | clear                         |
| "The quote had expired when you accepted it — Ask the printer to reconfirm the current price and turnaround before you pay. The message below already says this." | clear                         |
| "Message to send" + the `<pre>` block                                                                                                                             | clear; the full text is shown |
| "Intra does not send this message and never pays a supplier for you. Review it, then send it and agree the final order directly with the printer."                | boundary; correct             |
| "Copy message" / "Copied" / "Open in WhatsApp"                                                                                                                    | clear                         |
| "Once you have sent the message to the printer, let us know so we can ask how it went."                                                                           | clear                         |
| "I've sent this to the printer"                                                                                                                                   | clear self-report framing     |
| "You marked this as sent on {date}."                                                                                                                              | clear                         |

## 4.8 The pre-filled WhatsApp message (`buildOrderMessage`)

```
Hi {business}, I'd like to order flyer printing.

My request:
- size: A5
- quantity: 500
- colour: full-colour
- deadline: Friday 3pm
- deliveryArea: UNILAG main gate

Your quote: NGN 4500 (2 working days) — fixed price.
Assumptions: artwork supplied print-ready

Please confirm availability and the final price so I can approve the order.
```

**Assessment**: functional but shows **raw enum keys** (`size:`, `quantity:`,
`colour:`, `deliveryArea:` with the hyphenated `full-colour`). The buyer sees
these humanised everywhere else in the app, but the message a real person reads
in WhatsApp has the raw keys. Minor but visible. The closing line ("so I can
approve the order") correctly keeps the buyer in control.

## 4.9 Payment receipt (x402)

| String                                                                                                                                                                                       | Assessment                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Agent service payment" (title)                                                                                                                                                              | clear enough                                                                                                                                                         |
| labels "Not charged" / "Payment requested" / "Reconciling" / "Paid" / "Did not go through" / "Unavailable"                                                                                   | clear                                                                                                                                                                |
| `UNAVAILABLE`: "Agent payment verification is not available right now, so no service fee was charged and no receipt exists. Intra never fabricates a payment."                               | **strong trust copy**                                                                                                                                                |
| `NOT_REQUIRED`: "No agent query fee applies — this request came through the web, not a paid agent API call. Nothing was charged."                                                            | clear                                                                                                                                                                |
| `AUTHORISED`: "Settlement outcome is being reconciled — The query-fee payment was authorised but could not be confirmed yet. It is not shown as paid until that confirmation comes through." | clear; honest about the indeterminate state                                                                                                                          |
| `SETTLED` rows: "query fee only — never the customer order (max $0.05)" / "Network: {label} · via {providerLabel}" / "View on Celoscan" / "Attribution tag: {raw celo_… string}"             | **[`02` P1]** — "Attribution tag" + the raw string is implementation on a buyer surface; the atomic-amount math (`amountAtomic / 1e6`) and CAIP-2 fallback also leak |

## 4.10 MiniPay `PayPanel`

| String                                                                                                                                  | Assessment                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "Pay for your order"                                                                                                                    | clear                                                                       |
| "You've agreed the price with {business}. Pay them securely from your wallet, or use the WhatsApp handoff below."                       | **clear** — presents the choice, keeps the fallback visible                 |
| "Amount" (NGN) / "You'll pay {n} USDC" hint "≈ reference rate from {source}, locked {time}"                                             | **correct** — the rate + source + lock time are `MUST BE EXPLAINED` and are |
| "Goes to {0x1234…abcd}"                                                                                                                 | clear (shortened)                                                           |
| "Your wallet will ask you to confirm this payment. The network fee is paid from your wallet balance."                                   | **clear** — "network fee" not "gas"                                         |
| button "Pay with MiniPay" / "Pay from your wallet" / "Preparing…" / "Waiting for your wallet…" / "Recording…"                           | clear phase labels                                                          |
| "Payment submitted — We're waiting for the network to confirm it. This page updates on its own."                                        | clear                                                                       |
| "Still checking with the network. You can close this and come back — the status is saved."                                              | **excellent** — tells the user it's safe to leave                           |
| "Payment cancelled. Nothing was confirmed."                                                                                             | clear                                                                       |
| "The payment didn't go through — No payment was confirmed. Try again, or use the WhatsApp handoff."                                     | clear + recovery                                                            |
| "Payment confirmed" / "Paid" / "Transaction details" / "View transaction"                                                               | clear                                                                       |
| "Paying in the app isn't available for this order — {reason}. You can still send the WhatsApp message below to agree and pay directly." | clear; the fallback is always named                                         |

## 4.11 Handover code (`HandoverCodePanel`)

"Your handover code" / "Say this to the business when you collect your order —
it's how the record shows you were really there." — **clear**; explains _why_
without jargon. The code box itself has no label ([`00` §20 #8]).

## 4.12 Buyer pickup (`BuyerPickupPanel`)

"Fulfilment evidence (Proofline pilot)" — **"Proofline pilot" is jargon**; a
buyer has no context for it. "Optional. When your order is ready, the printer
marks it here. You then confirm you collected it — that is all this records." —
clear. "The printer marked this order **ready for pickup** on {date}. This is the
printer's statement, not a check by Intra." — **strong trust copy.** "Confirm
I've collected this order" / "Have a pickup code instead?" / "Use this if you are
collecting from a different phone." — clear. The `PROOFLINE_DISCLAIMER` verbatim.

## 4.13 Order problem panel (`OrderProblemPanel`)

"Something wrong with this order?" / "Intra never held any money for this order,
so there is nothing to refund here. If you paid the business directly, settle
that with them." — **exemplary money copy.** "Cancel this order" / "The pickup or
handover failed" — clear, distinct.

## 4.14 Exceptions (`describeTaskException`)

Each of 9 cases has: headline / whatHappened / actionNeeded / whatNext /
moneyNote. Samples:

- "The business turned this request down — The business you asked said it can't
  take this job — usually because of the area, the timing or how busy it is."
- "The business can no longer honour the price you agreed — After you agreed the
  price, the business said it can't proceed at that price or at all."
- "The handover didn't go through — The pickup or handover for this order wasn't
  completed — the code didn't match, or one side reported a problem."
- Money notes: "No money moved. Nothing was ordered." / "Nothing was charged
  through Intra. If you had paid the business directly, sort that out with them."

**Assessment: exemplary.** Every case is plain, blameless where appropriate, and
never invents a financial outcome.

## 4.15 Feedback form

"Was this useful?" / "Yes" / "Not really" / "Anything the printer or Intra should
know? (optional)" / "Send feedback" / "Thanks for the feedback — It helps us keep
this printer's route accurate." — clear, low-friction.

## 4.16 Error states

"This request belongs to another device — Requests are tied to the browser that
created them. Open the link on that device, or start a new request." — **clear
but a dead end** ([`00` §20 #1]); the recovery ("Open the link on that device")
assumes the user has that device.
"Request not found — The link may be wrong or the request was removed."
"Could not load this request." / "Try again"

---

# 5. Buyer work list (`BuyerWorkPanel`)

Group labels: "Needs your attention" / "Ready" / "Waiting" / "In progress" /
"Completed" — **clear, plain, no enums.** Headlines (see [`05` 2.13]) are all
one plain sentence. "No active requests yet — Tell me what you need above and
I'll help you find a business and get a real price." — clear. Action pills:
"Review" / "Open and send" / "Confirm pickup" / "See what to do" / "View" —
clear, verb-first.

---

# 6. Activity / notifications

"Activity" (H1) / "What has happened on your requests, and what needs you." —
clear. "Needs your attention" / "Updates" — clear split. Level badges: "Needs
action" / "Time-sensitive" / "Update" / "Completed". "Unread" dot. "Mark all as
read". "Nothing needs you right now — When a business responds or your order
moves forward, it will show up here."

Notification titles/bodies (see [`05` 2.11]) — **all plain, no enum, no amount,
no address, no code**. Sample: "A quote is ready for your decision — {business}
sent a price. Open the order to see it and choose whether to go ahead."

`NotificationSettings`: "Notifications while you're away" / "Notify me when
something needs my attention" / "Also send the quieter updates, not just action
needed" / "This browser can't send notifications when the app is closed. You'll
still see everything in Activity when you come back." / "Off-tab notifications
aren't set up on this deployment yet. Activity always shows what needs you." —
**clear**; "Off-tab" is slightly jargony.

`PushPrompt`: "{reason} Want us to notify you when something needs you — even if
this tab is closed?" / "Enable notifications" / "Not now".

`InstallPrompt`: "Add Intra to your home screen so we can let you know when
something needs your attention, even when the app is closed." / "Add to home
screen" / "Not now" / "Tap [Share] then 'Add to Home Screen'." — clear.

`ServiceWorker`: "A new version of Intra is ready. Update now" — clear.

`OfflineBanner`: "You are offline. Intra will keep showing the last loaded page;
new requests need a connection." — clear.

---

# 7. Business onboarding

## 7.1 Quick-start (`/supplier/onboard`, `QuickStartForm`)

| String                                                                                                                                                                                                                                                                                                                                                                                                          | Assessment                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| eyebrow "For business owners" / H1 "Start where your customers already are."                                                                                                                                                                                                                                                                                                                                    | clear, resonant                                                               |
| "Tell Intra about one service you offer. We make it clear to customers and agents, while you keep control of every quote and conversation."                                                                                                                                                                                                                                                                     | clear                                                                         |
| overview "Add one service" / "Set your pricing" / "Receive requests"                                                                                                                                                                                                                                                                                                                                            | clear                                                                         |
| `WHY_BUSINESSES_JOIN` (4 cards): "Requests arrive already specific" / "You set the price, every time" / "An agreed price stays agreed" / "Completed jobs build a record"                                                                                                                                                                                                                                        | **strong** — each is a real product behaviour, none promises "more customers" |
| "Completed jobs build a record — Jobs both sides confirm add to a history attached to your business. It is a record of what happened, not a rating."                                                                                                                                                                                                                                                            | **excellent** — pre-empts the "reputation score" fear                         |
| `Callout` "What we will never ask for — A seed phrase, private key, password, BVN, NIN, bank login, or card details. Intra never holds your money — customers pay you directly."                                                                                                                                                                                                                                | **strong trust copy**                                                         |
| card titles "Your business" / "Your first service" / "Where and who"                                                                                                                                                                                                                                                                                                                                            | clear                                                                         |
| "What do you do?" / "How do you price it?"                                                                                                                                                                                                                                                                                                                                                                      | plain                                                                         |
| pricing model cards: "Set price — You charge the same amount every time. Customers see it up front. e.g. A4 black & white — ₦50 per page" / "Price starts from — You have a base price, and the final amount depends on the job. e.g. Flyer printing — from ₦15,000" / "Priced per job — You look at each request and send your price. Nothing is published up front. e.g. Phone repair — depends on the fault" | **clear** — model, business-facing explanation, concrete example              |
| "Who should customers ask for?" / "WhatsApp number for orders"                                                                                                                                                                                                                                                                                                                                                  | plain                                                                         |
| "Customers message you here to place the order. Intra never sends it for you."                                                                                                                                                                                                                                                                                                                                  | boundary; clear                                                               |
| consent "You can show my prices to customers — Your price is shown with your business name when a customer asks for this service."                                                                                                                                                                                                                                                                              | **clear consent copy**                                                        |
| "Set up my business"                                                                                                                                                                                                                                                                                                                                                                                            | clear CTA                                                                     |
| "No card, no wallet, and no private keys — ever. An operator checks your details before customers can reach you."                                                                                                                                                                                                                                                                                               | trust + expectation                                                           |
| success "{business} is set up. Your first service, {service}, is ready. An Intra operator checks your details before customers can reach you. You can add your opening hours, service area and payout details from your workspace in the meantime."                                                                                                                                                             | clear next-steps                                                              |
| "Keep this link — That link is how you get back in and manage your prices. It is not a wallet key and holds no money — but treat it as private."                                                                                                                                                                                                                                                                | **important** — the manage link is the only way back in, and this says so     |

## 7.2 Full onboarding (`/supplier/onboard/full`, `OnboardingForm`)

| String                                                                                                                                                                                                                                                    | Assessment                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| "Full onboarding" / "The detailed version, normally filled in with an Intra operator. It builds a draft you can review before anything goes live. Most businesses are better served by the one-screen setup."                                             | clear; steers to quick-start                                                                        |
| step copy: "Business — Who buyers and agents reach." / "Area & hours — Where and when you work." / "Your service — What agents can ask for." / "Consent — Fees, consent, and review."                                                                     | clear                                                                                               |
| "This becomes your business identity. We never ask for a home or street address."                                                                                                                                                                         | trust                                                                                               |
| "The person who can confirm a quote or pause the service. This name is never shown to agents."                                                                                                                                                            | clear                                                                                               |
| step 3 "Your first agent-ready service" / "Start with one service you can quote reliably."                                                                                                                                                                | "agent-ready" is jargon-adjacent but explained                                                      |
| "What can this service do? — One or two sentences in your words, e.g. A5/A4 flyer printing, full-colour or black-and-white, bulk discounts over 200 copies."                                                                                              | clear                                                                                               |
| "How quickly do you reply to a quote request? — Be honest — agents and buyers see this as your response time."                                                                                                                                            | clear                                                                                               |
| "Quote currency — The currency you quote the customer's job in. Separate from any tiny agent query fee."                                                                                                                                                  | the "agent query fee" distinction surfaces here                                                     |
| step 4 "Keep your service safe and in your control — Onboarding does **not** give your business an AI agent, an MCP server, or automated order acceptance. You review every quote and the customer approves every order."                                 | **important expectation-setting**; "MCP server" is jargon but the sentence is a negation so it's OK |
| "Let AI agents pay a small fee (about $0.02) to request a quote. This pays for the information, never the customer's order."                                                                                                                              | clear; the "$0.02" is concrete                                                                      |
| "Public Celo payout address — Public address only — it receives the agent query fee. An operator verifies it before activation. Not needed to receive customer orders."                                                                                   | clear                                                                                               |
| "I consent to Intra requesting a quote for my business and showing that quote to a buyer."                                                                                                                                                                | clear consent copy                                                                                  |
| "Before your service goes live: 1. You review the plain-language Capability Card on the next screen. 2. An operator verifies your contact, consent, and payout address. 3. Only then does the route become ACTIVE. You can pause it any time in one tap." | clear; "ACTIVE" (caps enum) leaks                                                                   |
| "This creates a **draft**. It does not publish a route, accept payment, or send any message to a customer."                                                                                                                                               | honest, but the _result_ is a dead end ([`01` J16])                                                 |

## 7.3 Draft preview (`DraftRoutePreview`)

| String                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Assessment                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| "Your Capability Card" / "This is what an AI agent would see once your service is active. Nothing is saved or submitted yet."                                                                                                                                                                                                                                                                                                                                                                                        | "Capability Card" is a coined term; explained in situ                 |
| `Callout` "Draft — not live — This route cannot receive a quote request or any payment. An operator must verify your details and consent before it becomes public. You can ask an operator to pause it at any time, in one tap."                                                                                                                                                                                                                                                                                     | clear                                                                 |
| card labels: Service / Business / Service area / Opening hours / Typical turnaround / Quote response time / Quote currency / Agent query fee / Public payout address / Status                                                                                                                                                                                                                                                                                                                                        | mostly plain                                                          |
| "An agent must send" + fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | clear                                                                 |
| "Public to agents once active" / "Stays private" panels                                                                                                                                                                                                                                                                                                                                                                                                                                                              | clear                                                                 |
| lifecycle explainer: "Draft — Your details only. Not saved, not visible to anyone." / "Pending verification — An operator is checking your contact, consent, and payout address." / "Active — Live. Agents can request a quote and see your Capability Card and order contact." / "Paused — You or an operator stopped it. No new requests until an operator reactivates it." / "Stale — Still Active, but your price/availability is older than 14 days, so Intra treats it as unavailable until you reconfirm it." | **clear**                                                             |
| `Callout` "This is not an AI agent — Onboarding does not give your business an AI agent, an MCP server, or automated order acceptance. Intra publishes a structured Capability Card and relays a request; you send every quote and the customer approves and pays for every order directly."                                                                                                                                                                                                                         | clear negation                                                        |
| "Next step — Send these answers to your Intra operator. They create the business and route, verify your details, and only then activate it. Your review link will be {url}."                                                                                                                                                                                                                                                                                                                                         | **the dead-end instruction** — asks the merchant to email a JSON blob |
| "View the raw route payload (for your operator)" `<details>`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | technical, deliberately                                               |
| "Start over"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | clear                                                                 |

---

# 8. Business workspace (`/supplier/:slug` + `/requests` + `/review`)

| String                                                                                                                                                                                                                                                  | Assessment                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| "Your business" (eyebrow) / "{name}" / "{city}, {country}"                                                                                                                                                                                              | clear                                                |
| `Callout` "Read-only view — Open your manage link to see what needs you, send prices, and mark work ready."                                                                                                                                             | clear                                                |
| "{n} customers are waiting for your price" banner                                                                                                                                                                                                       | clear, urgent                                        |
| "What's happening" / stat labels "Reviewing your quote" / "Price change waiting" / "In progress" / "To hand over"                                                                                                                                       | clear                                                |
| "Nothing is in flight right now. New requests will appear here and in your requests inbox."                                                                                                                                                             | clear empty state                                    |
| "Your record so far" / "Requests received" / "Prices sent" / "Customers who agreed" / "Jobs completed" / "Typical reply time" / "Requests you priced"                                                                                                   | clear                                                |
| "Counted from your own requests and orders. Nothing here is estimated."                                                                                                                                                                                 | **trust** — no fake metrics                          |
| "No customer requests yet — When someone needs one of your services, their request will appear here and in your requests inbox — with everything they have told us about the job."                                                                      | clear                                                |
| `Callout` "Why finishing jobs here matters — Completed jobs can contribute to a verifiable history attached to your business. That record shows the jobs both sides confirmed — it is not a rating, and it does not vouch for the quality of the work." | **excellent** — pre-empts the reputation fear, twice |
| "What you offer" / "Service settings"                                                                                                                                                                                                                   | clear                                                |
| route status "Available to customers" / "Not yet live"                                                                                                                                                                                                  | **clear** — no enum                                  |
| "You aim to reply within {N} minutes"                                                                                                                                                                                                                   | clear                                                |
| "You have not added a service yet. Your Intra operator can add your first one."                                                                                                                                                                         | reveals the operator dependency                      |

### `/supplier/:slug/requests`

| String                                                                                                                                                                                                                                               | Assessment                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "Incoming requests — What customers have asked for, and what needs your response."                                                                                                                                                                   | clear                                                                               |
| stale note: "That request now has your price on it — see 'Prices you have sent' below." / "That order has been handed off — see 'Handed-off orders' below." / "That request is no longer waiting for a price. It may have been withdrawn or closed." | **excellent** — handles the stale-deep-link case explicitly                         |
| "Customer request" / "Sent {relative} · reply within {N} min"                                                                                                                                                                                        | clear                                                                               |
| brief labels (`BRIEF_LABEL`): "Paper size" / "Quantity" / "Colour" / "Needed by" / "Delivery / pick-up" / "Budget: Not specified"                                                                                                                    | clear; "Budget: Not specified" is hardcoded (there is no budget field for printing) |
| "Prices you have sent — You can still change a price here. Once a customer has agreed one, they have to accept the change before it takes effect."                                                                                                   | clear                                                                               |
| "Customer agreed" / "Customer is reviewing your quote"                                                                                                                                                                                               | clear                                                                               |
| `Callout` "Waiting on the customer — You asked to change this price. The amount they agreed still stands until they accept."                                                                                                                         | clear                                                                               |
| "Handed-off orders — The buyer has sent their WhatsApp order. Optionally record the two Proofline fulfilment events — operational evidence only, never a payment or a guarantee."                                                                    | "Proofline fulfilment events" is jargon; the qualifier is right                     |
| "Order for {route name}" / "Handed off {relative}"                                                                                                                                                                                                   | clear                                                                               |

### `QuoteResponseForm`

| String                                                                                                                                                                                                                                                                | Assessment                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "Send a quote" / "Decline" (toggle)                                                                                                                                                                                                                                   | clear                                                                          |
| "Price type" — "Fixed price" / "Estimated range"                                                                                                                                                                                                                      | **jargon-adjacent for the persona** ([`02` P2])                                |
| "Price ({currency})" / "From ({currency})" / "To ({currency})"                                                                                                                                                                                                        | clear                                                                          |
| "Turnaround — e.g. same day, 2 working days"                                                                                                                                                                                                                          | clear                                                                          |
| "Quote valid until — Optional — after this the customer must ask again."                                                                                                                                                                                              | clear; the `datetime-local` input is fiddly on mobile                          |
| "Add more detail (optional)" `<details>` — "Delivery charge — Leave blank if delivery is included or not applicable." / "Availability note — e.g. can start after 2pm today" / "Assumptions — e.g. artwork supplied print-ready" / "Confidence — Low / Medium / High" | "Confidence" and its 3 levels are a precision control the persona may not want |
| `Callout` "How the buyer sees this — The buyer is shown these figures as the printer's quote, entered through Intra. Intra does not independently verify them. Set an expiry if the price is only good for a limited time."                                           | **strong trust copy**                                                          |
| "Reason for declining — Out of delivery area / at capacity this week"                                                                                                                                                                                                 | clear                                                                          |
| success "Quote sent — The buyer will now review your quote and decide whether to proceed. If they do, they message you directly."                                                                                                                                     | clear expectation                                                              |
| "Request declined — The buyer has been told this request cannot be fulfilled."                                                                                                                                                                                        | clear                                                                          |

### `ChangePriceForm`

"Change this price" / "You quoted {amount}." / "This customer has already agreed
that price, so your new one is a request they must accept. Until they do, the
agreed price stands." vs "They have not agreed yet, so your new price replaces
the old one." / "Why is it changing? — The customer sees this in your own words.
e.g. Card stock went up this morning" / "Ask the customer to accept" vs "Send the
new price" / "Sent. The customer has to accept the change before it takes effect
— the price they agreed still stands until they do." — **clear, explains the two
cases.**

### `EditPublishedPriceForm`

"Edit this price" / "How you price it" / "This is the price customers see before
they ask. Any job someone has already agreed keeps the price you agreed — this
does not change a quote." / "Saved." — clear.

### `/supplier/:slug/review`

| String                                                                                                                                                                                               | Assessment                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| "Supplier review" (eyebrow)                                                                                                                                                                          | fine                                                                  |
| `Callout` "You can manage this business — This link carries your private manage token. Keep it to yourself — it is not a wallet key and holds no funds, but it lets you pause your routes."          | **important** — "manage token" is jargon but the sentence de-risks it |
| "Ask your Intra operator for your manage link to pause a route or respond to requests."                                                                                                              | reveals the operator dependency + the no-re-issue gap                 |
| "Business details" / "Authorised contact" / "Order channel" / "Quote currency" / "Public payout address" — hint "Public address only — Intra never stores or asks for a private key or seed phrase." | **strong trust copy**                                                 |
| "Quote-display consent — Recorded {datetime}" / "Not recorded"                                                                                                                                       | clear                                                                 |
| "Payout-address verification — Verified by operator {relative}" / "Pending operator verification"                                                                                                    | clear                                                                 |
| "Capability routes" / "What each state means"                                                                                                                                                        | "Capability routes" is jargon                                         |
| state explainer (Draft/Pending verification/Active/Paused/Stale)                                                                                                                                     | clear (same as `DraftRoutePreview`)                                   |
| `Callout` "Price data is stale — This route is Active but its price/availability has not been confirmed in 14 days. Agents cannot request a quote until an operator reconfirms it."                  | clear                                                                 |
| "What agents can see when this route is Active" + field chips + "Your WhatsApp order contact — only while the route is Active, verified, and fresh."                                                 | clear                                                                 |
| `PauseRouteButton`: "Pause route" / "Pause this route now? Buyers cannot send new requests until an operator reactivates it." / "Yes, pause route" / "Keep it live"                                  | clear; the "only an operator can reactivate" is stated                |

---

# 9. Proofline / handover (merchant side)

`MerchantFulfilmentPanel`: "Fulfilment evidence (Proofline pilot)" / "Optional.
When this order is printed and ready, mark it here. You'll get a short code to
read to the buyer; they confirm collection on their own phone." / "Mark ready for
pickup" / "Marked ready on {date}. Waiting for the buyer to confirm they
collected it." / "Pickup code" / "Read this to the buyer at collection. Or they
can confirm from their own request link." / "Buyer confirmed pickup" —
**clear**; "Proofline pilot" is jargon.

`HandoverAttestPanel`: "Confirm handover" / "Ask the customer for the code they
were given, then confirm that this job was handed over. This confirmation will be
recorded as part of the transaction history." / "Code from the customer" /
"Connecting wallet…" / "Waiting for your wallet…" / "Recording…" / "Confirm
handover" / "Handover confirmed. Recorded on {date}." / "(Simulated — not on any
real network.)" / "View the record" / "That didn't go through. You can try again
without re-asking for the code." / "This needs a wallet in this browser (like
MetaMask or Valora) to confirm the handover." / "Connect the wallet for this
business's on-file payout address to confirm this handover." — **the plain wording
holds** ("Confirm that this job was handed over"), the wallet reality surfaces
only in the error/status strings.

`PROOFLINE_DISCLAIMER` (verbatim, on every Proofline surface): _"operational
evidence, not a cryptographic proof, not a payment settlement, not a guarantee"_
(exact string in `src/features/proofline/status.ts` — `PROOFLINE_DISCLAIMER`).

---

# 10. Operator console

"Operator" (eyebrow) / "Route review and verification" / "Verify supplier data
before a route goes live, and pause any route immediately if its data is stale or
consent is withdrawn." — clear. "Operator sign-in" / "Enter your operator key. It
is held only for this browser session and never stored on a server or logged." —
**strong security copy.** "Operating as verified operator" / "Sign out". Tabs:
"Review queue" / "Metrics" / "Evidence". "Nothing needs review — New routes from
supplier onboarding will appear here for verification."

`OperatorRouteCard`: "Consent — Recorded {relative}" / "Not recorded" / "Order
channel" / "Query fee / SLA" / "Last updated" / "Confirm before activation" +
the 6 `ACTIVATION_CHECK_LABELS`:

1. "Quote-display consent is recorded"
2. "Order channel tested and reachable"
3. "Public payout address verified (ownership confirmed off-chain)"
4. "Genuine, dated price source seen"
5. "Response SLA agreed with the supplier"
6. "Sample request run through the route"

"Verify and activate" / "Reactivate route" / "Pause route" / "The change did not
go through." — clear for an operator; check #3's "(ownership confirmed
off-chain)" is jargon but the audience can handle it.

`StatusPill` here shows `route.status.replace(/_/g," ")` — "pending verification"
lowercased, or "DRAFT"/"PAUSED" near-raw ([`00` §20 #7]).

---

# 11. Evidence (`/evidence`, `EvidenceView`)

"Evidence" (eyebrow) / "What Intra has actually done" / "Real results,
demonstration data, and unavailable integrations are kept strictly separate.
Every figure is aggregated from the product's own records — no separate tracking,
no session ids, no fabricated adoption." — **strong** integrity statement.

Zone headings: "Real results" (badge "live data") / "Demo data" (badge "not real
activity") / "Unavailable & external integrations" (badge "status") / "What
changed from feedback" / "Recent activity" (badge "operator only").

"Aggregated on read from genuine product activity. Dev-seed demonstration data is
excluded from every number here." / "Everything created by npm run db:seed — a
single illustrative printer and route. Shown so the interface has something to
render during a walkthrough. Never counted as adoption." / "Capabilities that
depend on access Intra does not control. Where a status is unavailable, the
product returns an explicit unavailable state rather than a stand-in." — **all
clear, all honest.**

"No real activity recorded yet — No genuine businesses, tasks, or feedback exist
in this database. Real numbers appear here as soon as a non-seed business is
onboarded and a buyer sends a request." — clear about the honest empty state.

`SnapshotBody` labels: "Participating businesses" / "Quote routes" / "Independent
buyer sessions" / "Returning buyers" / "Session task spread" / "Tasks" / "Quote
requests completed" / "Handoffs confirmed by the buyer" / "Supplier quotes" /
"Quote-response latency" / "Route pause / activation events" / "Buyer feedback" /
"Verified Celo settlements" — clear; a few need the `hint` they carry.

"How these numbers are produced" `<details>` + `report.methodology` lines +
"Report generated {datetime} UTC."

---

# 12. Docs (`/docs`)

Deliberately technical — "Agent route contract" / "Businesses publish a
capability. Agents handle the protocol." / "The route returns HTTP 402. The agent
retries with a signed X-PAYMENT authorisation; a server-side call to the official
Celo facilitator verifies it and settles on-chain." / "Illustrative contract
only. This is not a live merchant endpoint or a settlement claim." / "No
screenshot, preview, or database row is ever treated as a payment receipt — only
a facilitator-verified transaction hash." — appropriate for the audience
(agent builders).

---

# 13. Error boundaries

`error.tsx`: "Something went wrong on our side — This page hit an unexpected
error. Nothing you did caused it, and no request was sent to a printer. Try
again, or head back home." — **excellent** — blameless, and explicitly says no
side effect occurred.
`not-found.tsx`: "Not found — That page does not exist. Go home."
`global-error.tsx`: "Intra is temporarily unavailable — The app failed to load.
Please refresh the page in a moment."

`requestErrorCopy` (agent surface): "This run has expired — Runs are held for 30
minutes and are never saved. Your request text is still here." / "This run
belongs to another device" / "Still working" / "The quote changed — The offer
moved after it was shown to you, so that approval no longer applies. Review the
current one." / "We could not identify this browser — Your browser is blocking
the local storage this demo uses to keep your request separate from other
people's." / "Connection lost — We could not reach the server. The agent keeps
working in the background." — **all clear, all benign.**

---

# 14. Information-hierarchy assessment

## What is communicated well

- **Trust / risk**: consistently front-loaded. "Intra never holds your money",
  "no order without your approval", "not independently verified", "operational
  evidence not proof", "it is not a rating" — repeated at every relevant point.
- **Required action**: `StatusPill` labels + `BuyerWorkPanel` headlines +
  notification titles all name the action ("your decision", "ready to send",
  "confirm pickup").
- **System status**: every async surface has a phase label, not a bare spinner.
- **What happens next**: `OutcomePanel`'s 4-step list, the lifecycle explainers,
  the exception `whatNext` lines.

## Where the hierarchy is off

1. **The tagline speaks to agent builders, not buyers** — "AI-agent commerce" is
   the first thing a student sees, on a page whose CTA is "I need something
   made".
2. **"Demo only — nothing here is saved"** is more prominent than it deserves
   and is partly false (the task/quote/decision _are_ saved).
3. **"Capability Card" / "Proofline pilot" / "manage token" / "capability
   routes" / "quote route"** — coined terms that are explained in situ but still
   land on the merchant repeatedly.
4. **The x402 `PaymentReceipt`** buries the honest "no fee was charged" message
   under chain fields (attribution tag, atomic amounts) when `SETTLED`.
5. **The WhatsApp message** shows raw brief keys (`size:`, `full-colour`) — the
   one place the buyer sees un-humanised data.
6. **The operator checklist** and `TraceView` use enum-ish language that the
   audience can read but that undercuts the "no jargon" standard elsewhere.

## Redundancy (mostly intentional — the trust lines)

- "Not independently verified / checked by Intra" appears on the quote card, the
  recommendation card, and `QuoteResponseForm` — **intentional and correct.**
- "Intra never holds / sends / pays" appears on the landing page, `ApprovalPanel`,
  `HandoffCard`, `OutcomePanel`, `OrderProblemPanel`, `PayPanel`, onboarding —
  **intentional and correct** (the boundary can't be over-stated).
- "It is not a rating" appears twice on the supplier workspace (the `WHY`
  card + the "Why finishing jobs matters" `Callout`) — slightly redundant but
  low-cost.
- The lifecycle explainer ("Draft / Pending / Active / Paused / Stale") appears
  verbatim in both `DraftRoutePreview` and `/supplier/:slug/review` — could share
  a component.
