# Analytics & Pilot Observability (M9.5)

> The M10 prerequisite report. Product analytics is **Amplitude**, sitting
> alongside — never replacing — the operational audit trail. See
> [`DECISIONS.md` ADR-021](DECISIONS.md) for the architecture rationale.
>
> **Status:** code + tests + gates complete and deployed. Amplitude-UI
> verification (events queryable, dashboards built) is **Victor's** — see
> [§17 Handoff checklist](#17-handoff-checklist-victor).

---

## 1. Two forms of truth

|              | Operational truth                          | Product analytics                    |
| ------------ | ------------------------------------------ | ------------------------------------ |
| **Question** | What did the system do?                    | How are humans behaving?             |
| **Store**    | `audit_events` (+ `pilot.*`)               | Amplitude                            |
| **Owner**    | always on, authoritative                   | measurement only, never a dependency |
| **Surface**  | `/api/pilot/funnel` scorecard, `/evidence` | Amplitude dashboards                 |

If Amplitude is down / unconfigured: requests, quotes, approvals, notifications,
fulfilment and handover all still work. Nothing about the product changes.

---

## 2. Existing analytics — audit map (§2)

| Existing event                                                                                                                          | Measures                             | Source                          | Audience | To Amplitude?                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------- | -------- | ------------------------------------------------------- |
| `pilot.conversation_started`                                                                                                            | buyer entered a conversation         | `api/conversation`              | buyer    | mirrored client-side as `conversation_started`          |
| `pilot.conversation_run_started`                                                                                                        | conversation produced a run          | `api/conversation`              | buyer    | superseded by `intent_ready`                            |
| `pilot.notification_created`                                                                                                            | a notification row was written       | `notifications/service`         | both     | forwarded as `notification_created`                     |
| `pilot.notification_opened`                                                                                                             | recipient marked one read            | `api/notifications/[id]/read`   | both     | tracked client-side as `notification_opened`            |
| `pilot.workflow_resumed`                                                                                                                | arrived at a live workflow from push | `pwa/ResumeSignal`              | both     | tracked client-side as `workflow_resumed`               |
| `pilot.push_permission_*`                                                                                                               | permission prompt outcome            | `pwa/PushPrompt`                | both     | mirrored client-side (same names)                       |
| `pilot.push_subscribed`                                                                                                                 | a push subscription created          | `api/push/subscribe`            | both     | mirrored client-side                                    |
| `pilot.pwa_install_*`                                                                                                                   | install prompt outcome               | `pwa/InstallPrompt`             | buyer    | mirrored client-side (same names)                       |
| domain `task.*`, `quote.*`, `route.*`, `proofline.*`, `commitment.*`, `handover.*`, `payment.*`, `recommendation.created`, `business.*` | the transaction funnel               | services via `appendAuditEvent` | operator | powers the **scorecard**; not duplicated into Amplitude |

The `pilot.*` layer and `pilot.ts` are **unchanged**. New events are additive.

---

## 3. Event naming convention (§51)

`snake_case`. Stable — a name means exactly one thing forever. If a meaning
genuinely changes, add a new name; never silently repurpose. The runtime list is
`EVENT_NAMES` in [`events.ts`](../src/features/analytics/events.ts); the typed
shape is `AnalyticsEventMap`.

---

## 4. Tracking plan (§8)

`ˢ` = forwarded from the server (no browser actor). All others are client events.

### Buyer

| Event                            | Trigger                                                 | Key properties                                                                                                                 |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app_opened`                     | `AnalyticsProvider` mounts (once per load)              | `role`, `platform`, `pwa_installed`, `returning`                                                                               |
| `conversation_started`           | first turn of a conversation                            | —                                                                                                                              |
| `message_sent`                   | buyer sends a chat message                              | `turn_count`                                                                                                                   |
| `intent_detected`                | first commercial intent in the conversation             | `intent_type`, `category`, `turn_count`                                                                                        |
| `intent_clarification_requested` | the turn asks for a missing field                       | `intent_field_missing`, `clarification_count`, `turn_count`                                                                    |
| `intent_ready`                   | complete intent → a run starts                          | `intent_type`, `category`, `optimization`, `has_quantity`, `has_location`, `has_deadline`, `has_budget`, `clarification_count` |
| `discovery_started`              | agent run begins looking for providers                  | `category`                                                                                                                     |
| `results_shown`                  | run reaches a recommendation / options / no-offer state | `option_count`, `has_recommendation`                                                                                           |
| `result_selected`                | buyer selects a specific option                         | `option_rank`                                                                                                                  |
| `approval_viewed`                | the decision becomes actionable                         | `quote_expired`                                                                                                                |
| `approval_accepted`              | buyer confirms the order                                | `pricing_model`, `quote_expired`                                                                                               |
| `approval_declined`              | buyer declines                                          | `reason_given`                                                                                                                 |
| `workflow_waiting`               | task enters a waiting state                             | `workflow_stage`                                                                                                               |
| `workflow_resumed`               | arrived from a notification                             | `notification_channel`                                                                                                         |
| `workflow_completed`             | task reaches a successful terminal state                | `via_notification`                                                                                                             |
| `workflow_cancelled`             | run/task ends without an offer or is cancelled          | `reason_code`                                                                                                                  |
| `exception_viewed`               | buyer views a failure / exception panel                 | `reason_code`                                                                                                                  |
| `feedback_submitted`             | buyer submits "was this useful"                         | `useful`, `has_comment`                                                                                                        |

### Business

| Event                           | Trigger                                  | Key properties                                                                            |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `business_onboarding_started`   | first input on the quick-start form      | —                                                                                         |
| `business_onboarding_completed` | quick-start POST succeeds                | `category`, `pricing_model`                                                               |
| `service_added`                 | an additional service/route created      | `category`                                                                                |
| `pricing_configured`            | published price set / edited             | `pricing_model`                                                                           |
| `business_ready`ˢ               | a route goes ACTIVE (business available) | `pricing_model`                                                                           |
| `request_received`ˢ             | a real request reaches the business      | `category`, `pricing_model`, `has_quantity`, `has_deadline`, `has_location`, `has_budget` |
| `request_opened`                | the quote form for a request is shown    | `category`                                                                                |
| `request_declined`              | business declines a request              | `reason_given`                                                                            |
| `quote_started`                 | first input on the quote form            | —                                                                                         |
| `quote_sent`                    | quote submitted                          | `pricing_model`, `turnaround_given`                                                       |
| `price_change_started`          | business opens the change-price flow     | —                                                                                         |
| `price_change_submitted`        | a price change is proposed               | —                                                                                         |
| `fulfillment_started`           | business marks an order ready for pickup | —                                                                                         |
| `handover_started`              | business begins confirming the handover  | —                                                                                         |
| `handover_completed`            | the handover attestation is recorded     | `mode` (`onchain` \| `mock`)                                                              |
| `business_job_completed`        | buyer confirmed pickup (merchant view)   | —                                                                                         |

### Notifications

| Event                   | Trigger                                                         | Key properties                                  |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `attention_required`ˢ   | a domain event needs a human (ACTION_REQUIRED / TIME_SENSITIVE) | `domain_event`, `level`, `audience`             |
| `notification_created`ˢ | a notification row is written                                   | `domain_event`, `level`, `notification_channel` |
| `push_sent`ˢ            | a push was dispatched (never "delivered" — see §20)             | `domain_event`                                  |
| `notification_opened`   | recipient opens a notification in-app                           | `domain_event`, `level`, `notification_channel` |
| `workflow_resumed`      | (shared with buyer)                                             | `notification_channel`                          |

### Push / PWA

`push_permission_prompted`, `push_permission_granted`, `push_permission_denied`,
`push_subscribed`, `push_unsubscribed`, `pwa_install_prompted`,
`pwa_install_accepted`, `pwa_install_dismissed`. No properties.

### Buyer order payment — MiniPay (M10.5, ADR-023)

The buyer paying the **business** on-chain via MiniPay — distinct from the x402
_agent query fee_. All go through `sanitizeProps`; a signature, key, or raw
wallet payload is **never** a property. `network` is the numeric chain id
(`42220`), `asset` is `"USDC"`.

| Event                    | Trigger                                                            | Key properties                        |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| `payment_method_viewed`  | the "Pay for your order" panel renders after an accepted quote    | `minipay_available`, `wallet_available` |
| `minipay_available`      | the panel renders inside the MiniPay in-app browser               | `minipay_available`, `wallet_available` |
| `minipay_selected`       | buyer taps "Pay with MiniPay" / "Pay from your wallet"            | `payment_method`                      |
| `wallet_request_started` | the wallet transaction is about to be requested                   | `payment_method`, `network`, `asset`  |
| `wallet_approved`        | the wallet returned a tx hash                                     | `payment_method`, `network`, `asset`  |
| `wallet_rejected`        | the buyer dismissed the wallet (→ intent `CANCELLED`, order fine) | `payment_method`                      |
| `payment_submitted`ˢ     | the tx hash is recorded server-side, verification scheduled       | `payment_method`, `network`, `asset`  |
| `payment_confirmed`ˢ     | `verifyOrderPayment` read a matching Celo receipt                 | `payment_method`, `network`, `asset`  |
| `payment_failed`ˢ        | the receipt did not match the intent, or the tx reverted          | `payment_method`, `network`, `asset`  |
| `payment_resumed`        | an in-flight payment is picked up again on page load (§22)        | `payment_method`                      |
| `payment_receipt_viewed` | the confirmed-payment receipt card is shown                       | `payment_method`                      |

`payment_submitted` / `payment_confirmed` / `payment_failed` are **also**
forwarded from the server (`SERVER_FORWARDED_EVENTS`) because the buyer often
closes the tab before the network confirms — the funnel stays complete either
way. A throwing analytics arm cannot fail settlement (`safeForward` in
`verify.ts` / a `try/catch` in `controller.ts`).

---

## 5. Core reusable properties (§33)

`role` · `environment` · `platform` · `pwa_installed` · `is_test` ·
`intent_type` · `category` · `optimization` · `has_quantity` · `has_location` ·
`has_deadline` · `has_budget` · `pricing_model` · `workflow_stage` ·
`notification_channel` · `level` · `clarification_count` · `turn_count`.

**Metadata, never raw text** (§10, §26). No message strings, no contact details,
no names, no addresses, no tokens, no handover secret/salt, no wallet keys, no
tx hashes. Enforced by `sanitizeProps` in
[`properties.ts`](../src/features/analytics/properties.ts) — applied on both the
client and the server before anything leaves the process.

---

## 6. Identity strategy (§5–§7)

|          | Anonymous                                  | Identified                                                                                                                          |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Buyer    | first load before `intra.sessionId` exists | `setUserId(sessionId)` on `app_opened` — opaque 32-hex, no PII                                                                      |
| Business | browsing `/supplier/onboard`               | `setUserId(businessId)` + `setGroup("business", businessId)` on onboarding completion and on every managed `/supplier/[slug]*` page |
| Operator | —                                          | **never** identified into Amplitude                                                                                                 |

The buyer session id is the through-line: it exists from the first interaction
and persists in `localStorage`, so the pre-auth → activation journey is
preserved with no identity break. `reset()` runs only on a genuine identity
change, so the next account never inherits the previous one's analytics
identity; Amplitude rotates the device id on reset.

---

## 7. Activation & retention definitions (§13, §15, §22, §23)

- **Buyer activated** — `intent_ready` **and** `results_shown` in the same
  session (expressed a real need _and_ reached a usable options state). Not
  "opened the app".
- **Business activated** — `business_ready` **and** `request_received` **and**
  `quote_sent` (onboarded, available, got a real request, responded). Not
  "account created".
- **Buyer retention** — a later session with another `intent_ready` →
  `workflow_completed`, within 1 / 7 / 30 days.
- **Business retention** — a later session with another `quote_sent` or
  `business_job_completed`, within 7 / 30 days.
- **First → second transaction** — two `workflow_completed` for one buyer id.
- **Notification effectiveness** — `attention_required` → `notification_opened`
  → `workflow_resumed` → `workflow_completed`/action.

---

## 8. Funnels (§11, §17, §19, §21)

**Conversational** — `app_opened` → `conversation_started` → `message_sent` →
`intent_detected` → `intent_ready` → `discovery_started` → `results_shown` →
`approval_viewed` → `approval_accepted` → `workflow_completed`.

**Business quote** — `request_received` → `request_opened` → `quote_started` →
`quote_sent` → `approval_accepted` → `business_job_completed`.

**Notification** — `attention_required` → `notification_created` /
`push_sent` → `notification_opened` → `workflow_resumed` → `workflow_completed`.

**PWA retention** — `pwa_install_prompted` → `pwa_install_accepted` →
(`app_opened` with `pwa_installed=true`, `returning=true`) → `workflow_resumed`
→ `workflow_completed`.

---

## 9. Privacy / redaction rules (§26, §42)

`sanitizeProps` drops any key that is: content (`message`, `comment`, `text`,
`reason`, …), a direct identifier (`email`, `phone`, `whatsapp`, `address`,
`name`, `contact`, …), auth (`token`, `manageToken`, `session`,
`authorization`, …), a secret (`code`, `salt`, `preimage`, `secret`, `apikey`,
`password`, `mnemonic`, …), or chain/wallet (`signature`, `txHash`, `wallet`,
`payoutAddress`, `attestationUid`). It also drops non-primitives, drops
non-finite numbers, and truncates strings over 200 chars. It **warns in dev and
never throws**. `reason_code` (a bucketed enum) is allowed; `reason` (free text)
is not.

Security tests (`properties.test.ts`, `forward.test.ts`, `journey.integration.test.ts`)
assert no token, secret, contact detail, name, address or raw conversation text
reaches an event. The browser key is the only `NEXT_PUBLIC_` analytics value;
`AMPLITUDE_API_KEY` and `ANTHROPIC_API_KEY` are server-only and never in the
client bundle.

---

## 10. Environment separation & test-user isolation (§30, §31, §43)

- One Amplitude project. `environment` (`development | staging | production`)
  from `NEXT_PUBLIC_APP_ENV`, stamped on every event.
- Local dev is **disabled** unless `NEXT_PUBLIC_AMPLITUDE_API_KEY` is set
  locally — dev never pollutes the project by default.
- `is_test = true` when: the viewer set `localStorage["intra.analytics.test"]`
  (or visited `?intra_test=1`); or, server-side, the business name is a
  `[DEMO SEED]` marker (`scopeForBusinessName`).
- Instrumentation tests use deterministic synthetic ids
  (`session-journey-1`, …), never real pilot data.

---

## 11. Amplitude integration (§3)

- `@amplitude/analytics-browser` v2, the only Amplitude package.
- Initialised by `AnalyticsProvider` **after mount**, once identity + page
  context exist. Autocapture: `attribution` + `sessions` on; everything else off.
- Server forwarding: `forward.ts` — a thin `fetch` to
  `https://api2.amplitude.com/2/httpapi` (EU: `api.eu.amplitude.com`), scheduled
  with `after()`, gated on `AMPLITUDE_API_KEY`.
- Env vars (both optional; the layer no-ops without them):

  ```bash
  NEXT_PUBLIC_AMPLITUDE_API_KEY=   # browser key (safe to expose, write-only)
  AMPLITUDE_API_KEY=               # SERVER-ONLY — forwards the 5 actor-less events
  # NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE=EU   # optional, default US
  # AMPLITUDE_SERVER_ZONE=EU               # optional, default US
  ```

---

## 12. Failure isolation (§4, §40, §41)

Every adapter export is wrapped. Proven by tests:

- `client.test.ts` — `track` no-ops when disabled; swallows a thrown SDK.
- `forward.test.ts` — no-ops without a key; never throws on network failure.
- `server.integration.test.ts` — **`submitTask` and `submitQuote` both still
  succeed when `forwardToAmplitude` throws**; audit rows still written.

---

## 13. Operator scorecard (§50)

`GET /api/pilot/funnel` (operator-gated) → `{ funnel, scorecard }`.
`buildPilotScorecard` ([`scorecard.ts`](../src/features/analytics/scorecard.ts))
composes `buildEvidenceReport` (real-scope, excludes `[DEMO SEED]`) +
`getPilotFunnel`. Every value a genuine `COUNT`; `0` never an estimate. Works
with no analytics key configured.

Fields: buyer (`conversationsStarted`, `meaningfulRequests`, `activatedBuyers`,
`successfulWorkflows`, `returningBuyers`); business (`onboarded`, `available`,
`requestsReceived`, `quotesSent`, `quotesAccepted`, `jobsCompleted`);
notifications (`attentionRequiredWorkflows`, `notificationsOpened`,
`workflowsResumed`, `actionsCompleted`); retention
(`firstWorkflowCompleted`, `secondWorkflowCompleted`).

---

## 14. Amplitude dashboards to build (§35, §48) — Victor

In Amplitude's UI (Claude cannot):

1. **Activation funnel** — `app_opened` → `intent_ready` → `results_shown`.
2. **Buyer conversion** — `intent_ready` → `results_shown` → `approval_viewed`
   → `approval_accepted` → `workflow_completed`.
3. **Business conversion** — `business_onboarding_completed` → `business_ready`
   → `request_received` → `quote_sent` → `approval_accepted` →
   `business_job_completed`.
4. **Notification effectiveness** — `attention_required` → `notification_opened`
   → `workflow_resumed` → `workflow_completed`.
5. **First → second workflow retention** — `workflow_completed` (n≥2), by buyer.
6. **Clarification friction** — distribution of `clarification_count` on
   `intent_ready`, segmented by `category`.

**Cohorts:** buyers {first-time, activated, completed-first, returned,
completed-second, notification-enabled, PWA-installed}; businesses {onboarded,
activated, received-request, quoted, completed-job, returned}.

Mark the core events/properties as the trusted source of truth (event
designations / tracking-plan governance) where available.

---

## 15. Synthetic journey verification (§44)

### Code-level (done — `journey.integration.test.ts`)

One real transaction through the deterministic services asserts the
server-forwarded events fire in order (`business_ready` → `request_received` →
`notification_created`), with opaque ids and no secrets.

### Amplitude-level (Victor)

With a real key on the deployed app:

- **Buyer:** open `/agent` (fresh browser) → send "I need 200 A5 flyers by
  Friday in Yaba" → let it reach a recommendation → accept. Expect:
  `app_opened`, `conversation_started`, `message_sent`, `intent_ready`,
  `discovery_started`, `results_shown`, `approval_viewed`, `approval_accepted`.
- **Business:** `/supplier/onboard` → complete → open the manage link → open a
  request → send a quote → mark ready → confirm handover. Expect:
  `business_onboarding_started/completed`, `business_ready`, `request_opened`,
  `quote_started`, `quote_sent`, `fulfillment_started`, `handover_started`,
  `handover_completed`.
- **Notification:** trigger an attention event, open the notification, resume.
  Expect `attention_required`, `notification_created`, `notification_opened`,
  `workflow_resumed`.

For each: confirm the event arrives in the right project with the expected
`event`, `user_id`, `role`, `environment`, properties, and timestamp — and that
**no** message text / contact detail / token appears.

---

## 16. Remaining instrumentation gaps (§24)

- `service_added` fires only via onboarding today; a dedicated
  "add another service" flow does not exist yet, so multi-service businesses
  are not distinguished. Add the event when that flow is built.
- `result_selected` is defined but only fired if/when the options UI gains an
  explicit per-option "select" affordance (today the recommendation is shown
  directly).
- `notification_action_completed` is derived in the scorecard rather than
  emitted as its own event — precise attribution of "the notification caused
  this action" needs a client correlation id, deferred.
- Push **delivery** is not measurable from browser APIs — `push_sent` is
  "dispatched", never `delivered=true` (§20).
- Consent gate deferred (pilot decision, ADR-021) — revisit for EU / non-pilot.

---

## 17. Handoff checklist (Victor)

Analytics is **not** "complete" because the SDK is installed. It is complete
when the key pilot questions can be answered with real, correctly-attributed
data in Amplitude.

- [ ] Create the Amplitude project.
- [ ] Set `NEXT_PUBLIC_AMPLITUDE_API_KEY` in Vercel + `.env.local`.
- [ ] (optional) Set `AMPLITUDE_API_KEY` in Vercel to complete the notification
      and request-received funnels in Amplitude.
- [ ] Redeploy.
- [ ] Run the buyer + business + notification synthetic journeys (§15) against
      the deployed app; confirm every event arrives correctly.
- [ ] Build the 6 core analyses and the cohorts (§14).
- [ ] Confirm no sensitive data in any event.
- [ ] `rm` the local `ATTESTATION_SIGNER_KEY=` line from `.env.local` if still
      present (unrelated M9 cleanup).

Only then is the M9.5 §53 checkpoint met and M10 (live pilot) unblocked.

---

## 18. Key pilot questions this setup answers (§36, §55)

Who came in · what they tried to do · did they understand it · where they got
stuck · did they complete the first workflow · did they return · did the
business receive a useful request · did the business respond · did the customer
approve · did a notification bring the person back · did they install the PWA ·
did they complete another workflow.

---

## 19. M10 status — production Amplitude project (2026-09-06)

Verified against the deployed app + the Amplitude MCP.

|                                  |                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org / project                    | `late-wildflower-209746` / **`Intra`** (`appId 860617`)                                                                                                           |
| Dashboard URL                    | `https://app.amplitude.com/analytics/late-wildflower-209746/dashboard/j0dkb6do` — "M10 · Intra Controlled Pilot"                                                  |
| Browser key                      | live, inlined into the client bundle, `environment: production`                                                                                                   |
| Server key (`AMPLITUDE_API_KEY`) | set in Vercel, armed by the 2026-09-06 redeploy; first-verified at Checkpoint 3                                                                                   |
| Governed tracking plan           | **58 events** (6 categories — M10.5 added the 11-event "Buyer order payment" category 2026-09-07), **30 event properties**, **3 user properties** (`role`, `environment`, `is_test`) — pushed via MCP, branch `main`, not protected |
| Data to date                     | `app_opened` × 4, `session_start` × 2 — **all `is_test = true`** (M9.5 verification). Zero real (non-test) production events.                                     |
| Identity                         | verified: `user_id` = opaque buyer session id, `role`, `is_test`, `environment` all correct; **no** message text / contact / token / secret in any event property |
| Amplitude autocapture            | IP address + city/region/country ON (kept — campus-pilot geo). Attribution + sessions ON. Element / form / page-view capture OFF.                                 |

**The 6 core funnels and 2 cohorts are NOT yet built** — Amplitude rejects a
funnel built on an event with zero data (`"Invalid intent_ready"`). They are
created at **Checkpoint 3** (first real buyer request), when the events first
fire. Exact definitions:

### Funnels (filter each to `environment = production` AND `is_test ≠ true`)

| #   | Name                       | Steps                                                                                                                         | Window                |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Buyer activation           | `app_opened → intent_ready → results_shown`                                                                                   | 7 days                |
| 2   | Buyer conversion           | `intent_ready → results_shown → approval_viewed → approval_accepted → workflow_completed`                                     | 7 days                |
| 3   | Business conversion        | `business_onboarding_completed → business_ready → request_received → quote_sent → approval_accepted → business_job_completed` | 30 days               |
| 4   | Notification effectiveness | `attention_required → notification_opened → workflow_resumed → workflow_completed`                                            | 3 days                |
| 5   | First → second workflow    | `workflow_completed` (retention, n ≥ 2), start `_new`, return `workflow_completed`                                            | 1 / 7 / 30 d brackets |
| 6   | Clarification friction     | histogram of `clarification_count` on `intent_ready`, group by `category`                                                     | —                     |
| 7   | MiniPay payment (M10.5)    | `approval_accepted → payment_method_viewed → minipay_selected → wallet_request_started → payment_submitted → payment_confirmed` | 1 day                 |

### Cohorts

- **Pilot buyers** — user property `role = buyer`, `is_test ≠ true`, performed
  `intent_ready` where `environment = production`.
- **Pilot businesses** — user property `role = business`, `is_test ≠ true`,
  performed `business_ready` where `environment = production`.

### Standing filter

Every pilot analysis excludes test traffic. The cleanest way: save a segment
**"Pilot (prod, not test)"** = `environment = production` (event) AND user
property `is_test` `is not` `true`, and apply it to every chart. Operator smoke
tests must set `?intra_test=1` first (sets `is_test = true` for that browser).
