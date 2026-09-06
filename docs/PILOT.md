# M10 — Controlled Live Pilot Runbook

Operator's guide for running the M10 pilot: real SMEs, real buyers, real
workflows. **Not a public launch. Not feature expansion. Not permission to
fabricate activity.**

The purpose: put a small number of real people through the product, observe what
actually happens, fix only what reality exposes, and produce the evidence to
decide whether Intra should keep expanding.

Companion docs: [`ANALYTICS.md`](ANALYTICS.md) (tracking plan, funnels),
[`CLAUDE.md`](../CLAUDE.md) §4 (safety rules — still apply), the M10 brief.

---

## 0. Operating principle (§1)

**Reality is now the primary specification.** The test suite (608 tests) is not
human validation. Optimise for one thing:

> Can real people get value from the product with minimal assistance?

Not: event count, feature count, screen count, notification count.

---

## 1. Production baseline (§2) — verified 2026-09-06

|                |                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production URL | `https://intra-relay.vercel.app`                                                                                                                                   |
| Deployment     | `intra-relay-my6hzswl1` (target: production), from local commit `0c29000` (M9.5) via `vercel deploy --prod`                                                        |
| Branch         | `feat/milestone-7-human-operating-layer` (PR #1), HEAD `0c29000`, tree clean                                                                                       |
| Database       | Neon Postgres (`DATABASE_URL` set) — **0 real tasks, 0 demo tasks** (clean pilot start)                                                                            |
| Model          | `ANTHROPIC_API_KEY` + `AGENT_MODEL` set; live-verified in Phase D (`claude-haiku-4-5-20251001`, real call, deterministic fallback on schema-mismatch works)        |
| PWA            | manifest + service worker + icons deployed; install / push prompts contextual                                                                                      |
| Web push       | VAPID configured (`/api/push/config` → `configured: true`), prod pair live                                                                                         |
| Analytics      | Amplitude `Intra` (860617): browser key live (`environment: production`), server key armed, tracking plan governed (47 events). **Only `is_test` traffic so far.** |
| Celo / EAS     | `NETWORK_ENV=production` + `ATTESTATION_SIGNER_KEY` live; both schemas registered on Celo mainnet; `RealEasWriter` active; relayer `0xb7bA9Dac…74E61` ~4 CELO      |
| ERC-8004       | **unavailable** — `providerAgentId = "0"`, no registration path (deferred per M9 §9)                                                                               |
| x402           | **unavailable** — no `X402_API_KEY`; paid routes return honest `503`                                                                                               |
| Operator       | `OPERATOR_API_KEYS` set (rotated real value); `/api/pilot/funnel` → `401` without the key                                                                          |
| Gates          | tsc ✅ · lint ✅ · build ✅ · format ✅ · **608 tests / 70 files / 0 fail** ✅                                                                                     |

**Baseline is green. Pilot may begin.**

---

## 2. What the pilot can and cannot prove

| Can prove now                                                                                        | Needs the pilot                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| The deterministic commerce workflow, notifications, PWA, resumability (608 tests + Phase D live run) | Whether real people _understand_ and _value_ it                                 |
| The buyer identity → `app_opened` → `is_test` analytics pipeline (live-verified)                     | The deeper funnel events firing correctly against real workflows                |
| EAS attestation infra is real and armed                                                              | One real end-to-end economic + trust record                                     |
| A real Anthropic model call in production                                                            | Whether businesses respond fast enough; whether buyers trust the recommendation |

---

## 3. SME recruitment (§5, §7)

**Three** SMEs, deliberately spanning three commercial models:

|       | Pricing model                                    | Example                                     |
| ----- | ------------------------------------------------ | ------------------------------------------- |
| SME A | **Fixed** (`FIXED`)                              | "₦15,000 for 500 A5 flyers, flat"           |
| SME B | **Starting-from / contextual** (`STARTING_FROM`) | "From ₦12,000 — depends on stock, quantity" |
| SME C | **Quote-required / custom** (`QUOTE_REQUIRED`)   | "Send me the job, I'll price it"            |

Do **not** onboard three near-identical printers. The point is to test the
commerce primitive across different commercial behaviours.

Each SME should genuinely: provide the service · respond reasonably fast · be
comfortable on a phone · have a real operator · be willing to test a new
workflow · **control the wallet used as their payout address** (needed for the
real handover signature) · be available during the pilot window.

Do not pick an SME only because it is a convenient test environment.

---

## 4. Buyer recruitment (§6)

**5–10** real buyers. Small on purpose. The goal is to find: confusion,
friction, trust problems, pricing objections, notification failures,
business-side friction, abandoned workflows, unexpected behaviour.

---

## 5. SME onboarding rehearsal (§8) — observe, don't coach

For each SME, watch and record (do **not** tell them where to click unless
genuinely blocked):

- **First impression** — do they understand _why my business should be here_?
- **Setup** — can they, without developer intervention: create the business ·
  add a service · set pricing · understand the pricing model · become available?
- **Time it.** Onboarding start → route ACTIVE.

Route activation still requires an **operator** (`OPERATOR_API_KEYS`) — that step
is manual by design (BR-002). Everything before it the SME does themselves.

### Business value interview (§9, §37) — ask _before_ explaining anything

1. "What do you think this product does for your business?"
2. "Why would you use this instead of your current process?"
3. (later) "Would you keep using this if it kept working this way?"
4. "What was **worse** about this than your current process?"

Do not coach answers. Record their exact words and objections. This is product
evidence, not a satisfaction survey.

---

## 6. Buyer first-use test (§10, §11) — observe silently

Instruction to the buyer, roughly: _"Use the app to find a business that can
solve something you need."_ Nothing about architecture. Do not rescue them at
the first hesitation.

Record: time to first action · first request wording · clarification count ·
confusion points · accidental actions · abandonment · trust concern · pricing
concern · whether they understood the recommendation.

Encourage natural phrasing ("I need 500 flyers by Friday", "find the cheapest
option around Yaba"). Never point them at a form.

### Buyer value interview (§36)

- "What did this save you from doing?" (searching manually / asking multiple
  businesses / waiting for replies / comparing prices / repeating requirements /
  coordinating fulfilment)
- "Did you understand what you were approving? Whether the price could change?
  What happens next?"

---

## 7. Checkpoints (§45) — assess evidence, fix blockers, then continue

| #     | Gate                                   | Evidence to capture                                                                                                                                                                                        |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Pilot infrastructure verified          | This doc §1 + `ANALYTICS.md` §19. **DONE 2026-09-06.**                                                                                                                                                     |
| **2** | First SME onboarded                    | onboarding time · could they self-serve · first-impression quote                                                                                                                                           |
| **3** | First buyer completes first request    | conversation transcript notes · clarification count · **confirm the buyer funnel events landed in Amplitude** (`app_opened → … → results_shown`) · build funnels 1–2 + the Pilot-buyers cohort             |
| **4** | First real async notification + resume | real device · left the app · got the push · tapped · resumed · acted · confirm `attention_required → notification_opened → workflow_resumed`                                                               |
| **5** | First real economic transaction        | full evidence pack (§9 below) · `GET /api/operator/evidence/[taskId]` · both EAS UIDs resolve on `celo.easscan.org` · confirm `approval_accepted`, `handover_completed`, `workflow_completed` in Amplitude |
| **6** | Three-SME comparison                   | per-SME table (§10 below)                                                                                                                                                                                  |
| **7** | Pilot analysis                         | the M10 final report (§11 below) — then **STOP**                                                                                                                                                           |

### First-transaction gate (§46)

Do **not** scale past the first real transaction until _all_ of: buyer flow
works · business flow works · notification works · human approval works ·
fulfilment works · handover works · evidence works · **no P0/P1 open**.

### Three-SME gate (§47)

Do not expand past the controlled cohort until all three SMEs can operate,
pricing differences work, the notification path works, ≥1 successful workflow
per relevant model, and no serious auth/payment issue remains.

---

## 8. Daily operator log (§31)

Keep it lightweight. One row per meaningful incident. **No unnecessary personal
data.** Suggested table (a spreadsheet or a running note is fine):

| time | role | workflow | what happened | expected | severity | workaround | permanent fix | analytics captured it? |
| ---- | ---- | -------- | ------------- | -------- | -------- | ---------- | ------------- | ---------------------- |

### Bug prioritisation (§32)

|        | Meaning                                                                            | Action                                                       |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **P0** | security / financial integrity / authorization / false completion / wrong identity | **STOP the pilot.** Fix before any further activity.         |
| **P1** | blocks a core user workflow                                                        | Fix first, before P2/P3.                                     |
| **P2** | substantial confusion / friction                                                   | Fix during the pilot if it recurs.                           |
| **P3** | cosmetic / low-impact                                                              | Record for later. **Do not** polish P3 while P0/P1 are open. |

### No feature creep (§33)

For every user suggestion, ask: _is this preventing the product from delivering
its core outcome?_ If not — record it, don't build it.

### Fix loop (§44)

`observe → reproduce → classify → fix if necessary → verify (gates) → deploy →
observe again`. Never patch blindly.

---

## 9. Evidence pack — per real transaction (§41)

Collect and keep (personal data **out** of anything judge-facing):

- application task reference (`taskId`)
- quote record (amount, turnaround, validity)
- buyer approval (timestamp, `offerFingerprint`)
- Celo transaction hash(es)
- EAS commitment UID + `celo.easscan.org` link
- EAS handover UID + link
- provider identity (payout address; `providerAgentId` — currently `"0"`,
  documented, not hidden)
- buyer identity where applicable (opaque session prefix only)
- timestamps for each step
- handover completion (who signed, when)
- outcome

Cross-check against the DB via `GET /api/operator/evidence/[taskId]` (operator
key). **Do not** hand-edit records to make them match (§26).

### The adoption story we want to be able to tell (§43)

> A real person had a real need. They expressed it naturally. Intra understood
> the request. A real SME responded. The customer chose. The business fulfilled.
> The participants completed the handover. The system recorded the outcome.
> The participants understood the value.

That matters more than a feature list.

---

## 10. Three-SME comparison table (§34) — fill at Checkpoint 6

|                                                | SME A (fixed) | SME B (starting-from) | SME C (quote-required) |
| ---------------------------------------------- | ------------- | --------------------- | ---------------------- |
| Onboarding time                                |               |                       |                        |
| Request quality (vs their WhatsApp/IG inbound) |               |                       |                        |
| Response time to quote                         |               |                       |                        |
| Quote → acceptance                             |               |                       |                        |
| Completion                                     |               |                       |                        |
| Operational friction                           |               |                       |                        |
| Repeat participation                           |               |                       |                        |

Question: does one commercial model perform dramatically better or worse?

---

## 11. M10 final report (§49) — structure

Return a complete report (no unnecessary PII):

- **Production** — deployment, env, DB, model, analytics, PWA, push
- **Buyers** — recruited / active / requests / completions / cancellations /
  repeat / qualitative feedback
- **Businesses** — 3 SME identities, model, onboarding, requests, quotes,
  acceptance, fulfilment, completion, repeat, qualitative feedback
- **Notifications** — created / opened / workflows resumed / actions completed /
  push failures
- **Analytics** — activation, conversion, notification funnel, PWA funnel,
  retention, drop-off (from the Amplitude "M10 · Intra Controlled Pilot"
  dashboard)
- **Economic** — real transactions, payment results, Celo tx hashes, EAS
  commitment + handover UIDs, identity, outcome
- **Reliability** — P0 / P1 / P2 / P3 counts
- **Security** — auth tests, payment controls, secret handling, identity
  verification
- **Product learning** — biggest source of value · biggest friction · biggest
  trust concern · biggest business objection · biggest buyer objection
- **Decision** (§48):
  - **A — Promising** — real people succeed and there is repeat/useful behaviour
  - **B — Usable but needs work** — core works, important problems found
  - **C — Not validated** — insufficient real usage/evidence
  - **D — Blocked** — a security / economic / identity / reliability issue
    prevents safe continuation
  - Give the **truthful** classification. Do not optimise for morale.
- **Recommendation** — exactly what should happen next, and why.

Then **STOP** (§50). Do not auto-start another feature milestone. Return the
evidence first.

---

## 12. Standing safety rules during the pilot

All of `CLAUDE.md` §4 still applies. In particular:

- Never fabricate a user, transaction, quote, settlement, tx hash, attestation,
  or feedback (§42).
- The handover secret never goes into analytics or a push payload (§24).
- Do not manually mark a job complete to move the demo forward (§24).
- A payment is `SETTLED` only on real facilitator verification with a real
  mainnet tx hash — there is no `X402_API_KEY`, so today every buyer sees the
  honest unavailable state (that is correct, not a bug to hide).
- The first real transaction is deliberately **small and low-risk** (§25).

---

## 13. Payment / EAS failure coverage (§27, §28)

These stay **deterministic tests only** — do not endanger real funds or spend
real gas to force a failure:

- Payment failure → `src/features/payments/adapter/**` tests (fake facilitator).
  Verified: no false success, honest `503`, indeterminate settlement never
  re-settled.
- EAS write failure / timeout / bad config → `handover-service.integration.test`
  - `commitments/service.integration.test` (broken `EasWriter`). Verified: the
    row goes `ATTESTATION_FAILED`, never a fabricated success.
