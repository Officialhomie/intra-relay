PROCEED WITH MILESTONE 7 — PHASE B: SURFACES

Phase A is complete and verified.

The current system has:

working multi-turn conversation → commerce handoff
accumulated intent forwarded correctly into the agent run
visible intent understanding
user-facing “Start a new request”
attention model
notification domain
persisted notifications
notification deduplication
buyer/business notification generation
pilot instrumentation
agent-task ownership
M6 exception and pricing functionality

Phase A gates are green:

TypeScript
lint
build
format
55 files / 515 tests / 0 failures

Now implement Phase B — Surfaces.

Core objective

Turn the underlying workflow and notification domain into an experience where a human can immediately understand:

What do I need to do?

What is currently happening?

What am I waiting for?

What has finished?

The surfaces must make the existing system feel coherent.

Do not add new domain complexity unless required by the UI.

Do not begin PWA/push implementation yet.

1. BUYER HOME

Transform the buyer entry experience into a true home/workspace.

The user should immediately see:

Primary action

What do you need?

Natural-language input remains the dominant entry point.

Active work

Show persisted work, not the in-memory agent run store.

Group intelligently into:

Needs your attention
Waiting
In progress
Ready
Completed

Do not expose internal statuses.

Example:

Needs your attention

A business proposed a new price for your flyer order.

[Review]

2. BUYER ACTIVE-WORK LIST

A buyer must be able to return to the application without relying on a notification.

The home should allow them to discover:

active requests
pending approvals
ongoing fulfilment
handover-required jobs
recently completed jobs

Selecting an item should open the current authoritative server state.

Do not reconstruct task state from stale client memory.

3. BUYER ACTION CENTRE

Build the in-app action centre using the new notification domain.

It must support:

unread count
readable notifications
action-required indicators
timestamps that are human-friendly
deep links
read/unread state

The action centre should answer:

What requires my attention?

without showing raw event names.

4. BUSINESS HOME

Build the equivalent action-first business workspace.

The first screen should answer:

What needs my attention?

Example:

2 new customer requests

What is happening?

Example:

1 customer is reviewing your quote

What have I completed?

Example:

8 completed jobs

Is this useful?

Show the existing real business-value metrics.

Do not create a large analytics dashboard.

5. BUSINESS REQUEST EXPERIENCE

Make the request workflow extremely fast.

Opening:

New customer request

should immediately show all known context:

Flyer printing
500 copies
A5
Full colour
Needed Friday
Yaba
Budget not specified

Do not expose fields that are unknown.

Do not fabricate missing information.

The primary actions should be obvious:

[Send quote]

[Decline]

6. FAST QUOTE FLOW

A business should be able to quote without navigating through unnecessary screens.

Target:

Open request
→ enter price
→ choose validity
→ optional note
→ send

Keep the existing pricing integrity model.

Do not mutate historical quotes.

7. NOTIFICATION → EXACT WORKFLOW

Every actionable notification must deep-link to the correct workflow.

Examples:

New request
→ request page

Customer approved quote
→ active job

Price change
→ price-change decision

Handover issue
→ handover/problem surface

Do not link people to generic home pages.

8. STALE ACTION RE-CHECK

This is mandatory.

Every time a user opens an actionable notification or action-centre item:

retrieve current server state
verify authorization
verify action is still legal
render the current state
hide/disable obsolete actions

Example:

A quote expires.

The old notification remains.

User opens it.

Expected:

This quote has expired.

Not:

[Approve]

Then offer a legitimate next action, such as:

[Find another option]

only when the underlying system actually supports that action.

9. NOTIFICATION DEDUPLICATION

Use the Phase A dedupe model.

An evolving workflow should not create a wall of repetitive notifications.

For example:

quote changed
quote changed again
quote changed again

should become a sensible current notification rather than three separate unread tasks where appropriate.

Verify dedupe behavior in the UI.

10. ACTION-CENTRE LANGUAGE

Use human language.

Good:

Your quote is ready to review.

Bad:

QUOTE_READY

Good:

The business proposed a new price.

Bad:

PRICE_CHANGE_PROPOSED

Good:

Your order is ready for handover.

Bad:

HANDOFF_READY

The user must never need knowledge of internal state names.

11. NOTIFICATION PRIORITY

Make urgency visually meaningful.

For example:

Needs action

Strongest treatment.

Time-sensitive

Clearly urgent but not alarming.

Informational

Subtle.

Completed

Confirmation-oriented.

Do not use color as the only signal.

12. MULTIPLE ACTIVE TASKS

The buyer may have several workflows at once.

The UI must handle:

multiple active requests
different states
different businesses
several notifications
several completed orders

Do not assume one active task per person.

The same applies to a business receiving multiple requests.

13. EMPTY STATES

Every surface must explain itself.

Buyer

No active requests yet.

Tell me what you need and I'll help you find an option.

Business

No customer requests yet.

When someone needs one of your services, their request will appear here.

Never show:

No data.

14. RESPONSIVE DESIGN

The surfaces must work on:

360px
390px
desktop

Test:

buyer home
conversation
action centre
task list
task detail
business home
request detail
quote form
exception states

Do not merely resize desktop UI.

Design for mobile use.

15. NAVIGATION

The application should have a simple mental model.

Buyer:

Home
Requests
Activity / Notifications

Business:

Home
Requests
Business

Use the actual existing routing structure where possible.

Do not introduce unnecessary navigation.

The user should always know:

where am I?

what needs attention?

how do I return to my active work?

16. RESUME EXPERIENCE

Manually verify:

Buyer

Create request.

Leave app.

Return later through normal navigation.

The active request must still be visible.

Business

Receive/request lifecycle.

Leave app.

Return.

The request must still exist and show current state.

The experience cannot depend on the in-memory agent run store.

17. CONSISTENCY BETWEEN NOTIFICATION AND HOME

If a notification says:

“A new quote is ready.”

the home/action centre should agree.

If the quote is subsequently accepted:

unread state should update appropriately
action should disappear or move state
active work should reflect current truth

Do not allow notification state and task state to drift.

18. READ/UNREAD SEMANTICS

Define clear behavior:

Opening a notification should generally mark it read.

But reading must NOT:

approve
decline
cancel
confirm fulfilment
acknowledge handover

Reading is not taking the underlying action.

This distinction is important.

19. ACTION REQUIRED MUST BE EXPLICIT

An item can be unread without requiring action.

Example:

Your order has been completed.

It may be unread, but it is not an action-required task.

The visual system must distinguish:

unread

from:

action required
20. DO NOT MAKE NOTIFICATIONS THE ONLY PATH

A user must be able to recover even if:

push is unavailable
permission was denied
notification was missed
device changed
email was deleted

The application itself must surface active work.

21. BUSINESS VALUE MUST REMAIN VISIBLE

The business home should retain the real M6 value metrics.

Use actual data only.

Example:

6 requests received
4 quotes sent
3 accepted
2 completed

Do not fabricate.

Where there is insufficient data, explain that honestly.

22. PRODUCT LANGUAGE AUDIT

Before completing Phase B, scan all modified and adjacent surfaces for technical leakage.

Remove or rewrite normal-user occurrences of:

API
endpoint
session
agent ID
buyer claim
EAS
ERC-8004
x402
internal status names
database language

Advanced technical trace surfaces may retain this information.

Normal user surfaces must not.

23. SECURITY

Test:

notification recipient authorization
task access
business request access
deep-link access
stale action protection
read/unread authorization
cross-account leakage

A notification ID is not an authorization mechanism.

The server remains authoritative.

24. TESTING

Add tests for:

Buyer
home loads
active tasks appear
states are grouped correctly
action centre
unread count
read behavior
multiple tasks
start over
resume
Business
home loads
requests appear
action-required state
fast quote
active work
completed work
multiple requests
Notifications
correct recipient
correct type
dedupe
unread/read
deep links
stale state
authorization
Responsive/accessibility

Test the key surfaces at mobile widths.

25. MANUAL BROWSER ACCEPTANCE

Before Phase B is complete, manually test:

Buyer
Open app as first-time user.
Understand what to do.
Create a natural request.
Leave the page.
Return.
Find the request from the home.
Continue the task.
Receive an actionable state.
Open it from the action centre.
Perform the action.
Verify the home updates.
Business
Open business workspace.
See what requires attention.
Receive a request.
Open it.
Understand the request.
Send a quote.
Return to home.
Verify request state.
Continue later.
Verify completed state.

Do not call Phase B complete until these are actually performed.

26. PHASE B GATE

Stop after Phase B.

Do not start Phase C until all are true:

TypeScript clean
lint clean
build succeeds
format clean
all tests pass
buyer home browser-verified
business home browser-verified
action centre browser-verified
stale action behavior browser-verified
deep links browser-verified
mobile surfaces manually checked
no user-facing technical leakage found

Then provide a short report and wait.

27. IMPORTANT SCOPE RULE

Do not implement:

PWA manifest
service worker
push subscription
VAPID
web-push
native apps

in Phase B.

Those belong to Phase C.

Phase B is about making the existing system human-visible and resumable inside the web application.

FINAL STANDARD

At the end of Phase B, a human should be able to say:

“I can see everything that needs my attention.”

and:

“I know what is happening with my requests.”

and:

“I can leave the app and come back without losing my place.”

The business owner should be able to say:

“When a customer needs me, I can see exactly what they want and respond quickly.”

Do not optimize for the number of screens created.

Optimize for:

clarity → attention → action → continuity.

---

2/2

The LLM reasoning layer (Claude Haiku) has never run against the real API — only the mock. Do you want it live for the pilot?

1. Keep mock for now
   Stay on `AGENT_MODEL_PROVIDER=mock`. The product works fully — deterministic clarification instead of model-phrased. Zero cost. Revisit later. (Recommended — not a Phase C concern.)

2. I’ll add an ANTHROPIC_API_KEY
   You provide a key (put it in `.env.local` yourself — I never handle keys). I wire `AGENT_MODEL_PROVIDER=anthropic` and verify one real assisted run. ~cents of spend for the pilot.

3. Other
   Type your own answer here.

