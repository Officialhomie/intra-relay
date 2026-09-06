# UX Architecture — user-facing complexity abstraction in Intra Relay

**Status:** Engineering analysis and proposals. Not a requirements document.
`docs/PRD.md` remains the source of truth. Items marked **NEEDS-ID** describe
behaviour that has no requirement ID yet and must not be built until Victor
issues one (`CLAUDE.md` §3).

**Companion rule:** `~/.claude/rules/ux-simplification.md` — the general
framework (map → classify → rebuild → compare → implement). This document
applies that framework to Intra's actual surfaces.

---

## 0. The principle, stated for this product

> Move complexity out of the user's mental model and into the system's
> implementation — except where the human staying in the loop _is the product_.

Intra Relay already **is** a complexity-abstraction layer: it turns a messy
human WhatsApp business into one structured call an agent can make. This
document applies the same discipline one level down — to Intra's own screens,
endpoints, and the way state passes between them.

Three personas, three different "shortest path to value":

| Persona            | Wants                               | Should reach it in             |
| ------------------ | ----------------------------------- | ------------------------------ |
| Merchant (printer) | "My business can take agent orders" | one session, one link saved    |
| Buyer (student)    | "I have a price and a way to order" | one form, one page, no account |
| Agent (machine)    | "A fresh, structured quote"         | one HTTP call                  |

Everything below measures the current build against those three sentences.

---

## 1. Verified findings

Each finding was confirmed by reading the code at the cited path. Severity is
about _whether the product works end to end without a human courier_, not about
code quality.

### F1 — Merchant onboarding is a dead end (CRITICAL)

`src/features/businesses/OnboardingForm.tsx:106` — `onSubmit` calls
`setDraft(buildOnboardingDraft(values))` and nothing else. There is no `POST`.
Four steps of typing persist **zero rows**.

`src/features/businesses/DraftRoutePreview.tsx:152` then tells the merchant:

> "Send these answers to your Intra operator."

…and offers the raw route JSON in a `<details>` block "for your operator".

**The merchant is the data bus.** They must find an operator out of band, hand
over a JSON payload, and wait. The operator must then re-key or paste it into
`POST /api/businesses` — and `src/features/operator/OperatorConsole.tsx` has
**no create UI at all** (it only lists, activates, and pauses). So the operator
needs a terminal and `curl`.

This is the single largest gap between the product's premise and its build. The
whole thesis is "the business doesn't need technical work" — and today the
business's first act is to email a JSON blob to a human who runs `curl`.

### F2 — Onboarding collects fields the API silently discards (HIGH)

The form collects `serviceSummary`, `serviceArea`, `operatingHours`,
`turnaround`, `quoteResponseTime`, `wantsPaidQueries`
(`OnboardingForm.tsx:48-65`). `createBusinessRequestSchema`
(`src/features/businesses/service.ts:22`) accepts **none** of them — its own
comment calls them "draft-only".

So the merchant answers "Where and when you work" and "What can this service
do?" — the entire substance of a Capability Card — and that data has no path
into the database.

### F3 — A "free queries" merchant produces an uncreatable draft (HIGH)

`OnboardingForm.tsx:341` makes `payoutAddress` conditional on
`wantsPaidQueries`. `createBusinessRequestSchema` requires a valid EVM address
**unconditionally** (`service.ts:30-36`).

A merchant who unticks the fee toggle reaches a preview screen for a business
that the API will reject. The failure surfaces to the _operator_, hours later,
in a `curl` response the merchant never sees.

### F4 — The manage token has no delivery path (HIGH)

`manageToken` is minted at insert. `toPublicBusiness`
(`src/features/routes/reads.ts:20`) strips it, and `listOperatorQueue` returns
`PublicBusiness` — so **the operator console cannot display the manage link
either**. The token exists only in the raw `POST /api/businesses` response body.

Consequences: the merchant cannot self-serve their own workspace link; the
operator must have copied it from a terminal at creation time and stored it
somewhere; if it is lost, the business is unreachable and there is no re-issue
path.

Every merchant-facing surface (`/supplier/:slug/requests?t=`, quote responses,
Proofline "mark ready") is gated on this token.

### F5 — No supplier notification exists (CRITICAL for the core loop)

A search across `src/features` and `src/lib` for any notification, send, or
messaging path returns nothing. When a buyer submits a brief, a row is written
and **the supplier is told nothing**.

`route.responseSlaMinutes` is displayed to the buyer as a promise ("replies
within 45 min") and to the supplier as a deadline — but it counts down against
a page nobody has any reason to open. The quote loop only closes if a human
operator phones the printer.

This is the highest-leverage abstraction in the product: the merchant should
never have to poll a web page to find out they have work.

### F6 — Agents cannot discover a business (MEDIUM, **NEEDS-ID**)

`/v1/[businessSlug]/capabilities` requires already knowing the slug. There is
no index, no `.well-known`, no listing endpoint. An agent must be told the slug
out of band — which reintroduces exactly the human-coordination step the
product exists to remove.

_Scope caution:_ `PRODUCT_VISION.md` §2 rules out a "public marketplace". An
index of active capability endpoints is not a consumer marketplace, but it is
adjacent enough to need an explicit decision before building.

### F7 — Buyer fan-out is one printer, so "recommendation" has one input (MEDIUM, **NEEDS-ID**)

`tasks.routeId` is a single nullable FK; `createTaskRequestSchema` takes one
`route` ref (`src/features/tasks/service.ts:46`); `RequestForm.tsx:145` renders
a radio group. One task → one route → one quote.

`src/features/quotes/recommendation.ts` therefore always evaluates a single
quote. The buyer's real question — "who is cheapest / fastest?" — cannot be
answered, and progressive disclosure of "other quotes" has nothing to disclose.
Fan-out would require a schema change (task legs, or a request group).

### F8 — Buyer identity is device-bound with no recovery (HIGH)

`getSessionId()` (`src/lib/session.ts`) reads `localStorage`. `TaskPage.tsx:167`
renders "This request belongs to another device."

On a shared campus phone, in a private window, after a cache clear, or on a
switch from phone to laptop, the buyer's task becomes **permanently
unreachable** — including the WhatsApp handoff message they were about to send.
There is no resume link and no recovery path.

### F9 — Landing page CTAs both lead somewhere unsatisfying (MEDIUM)

`src/app/page.tsx:52` offers two CTAs. "Make my business agent-ready" leads to
the F1 dead end. "Try a buyer request" leads to `RequestForm`, which shows
"No printers are live yet" (`RequestForm.tsx:113`) whenever no verified route
is active — likely the first-run state for any visitor.

Neither CTA reaches value. There is no demo/sandbox path that shows a working
loop to someone evaluating the product.

### F10 — Operator key re-entry (LOW — not a defect)

`OperatorConsole.tsx` holds the key in `sessionStorage`: survives reloads,
cleared on tab close, never sent to a server or logged. That is a deliberate and
correct security posture. Noted so it is not "simplified" away.

---

## 2. The abstraction boundary — what must NEVER be removed

Applying §1's fixes must not touch any of the following. These steps look like
friction and are in fact the product. Cross-referenced to `CLAUDE.md` §4.

| Must stay visible + manual                                   | Why                                               | Ref                              |
| ------------------------------------------------------------ | ------------------------------------------------- | -------------------------------- |
| Buyer sends the WhatsApp order themselves                    | Intra never places an order or custodies funds    | `BR-001`, `FR-REC-002/004`, §4.3 |
| Buyer explicitly accepts a quote before contact is revealed  | Consent gate on the handoff                       | `FR-REC-*`                       |
| `SETTLED` only after facilitator verification + real tx hash | No fabricated receipts, ever                      | `FR-PAY-003`, `BR-005`, §4.1     |
| `UNAVAILABLE` / `503` when no facilitator access             | Honest absence beats an optimistic spinner        | `FR-PAY-004`                     |
| Settle timeout renders indeterminate, never "paid"           | ADR-017 taxonomy                                  | ADR-017                          |
| Price-confirmation timestamp + stale→unavailable             | Freshness is information, not noise               | freshness NFRs                   |
| Merchant consent tick                                        | Never inferred, never bundled into another action | `FR-SUP-005`                     |
| Operator verification before ACTIVE                          | Cannot be defaulted or auto-approved              | `AC-SUP-*`                       |
| Public-address-only; no seed/key/BVN/NIN/card                | Prohibited data                                   | §4.2                             |
| Demo / non-persistent state labels                           | Honesty about what is real                        | §4.4                             |

**Rule of thumb for this repo:** automate _transport_ (moving data between
system components), never automate _judgement_ (a human deciding to spend money,
publish, or vouch for a business).

---

## 3. What to engineer under the hood

The user-visible fix in every case is "fewer steps". The engineering fix in
every case is **an orchestration function that owns the multi-step work**, plus
**a read model that hands each surface exactly the shape it renders**.

### 3.1 One merchant intent → one transaction

Today: 4 form steps → local draft → human courier → `curl` → manual token copy.

Target: the merchant presses **"Submit my service for review"** once.

```ts
// src/features/businesses/onboarding.ts  (new)
async function submitServiceForReview(db, input: BusinessOnboardingInput) {
  return db.transaction(async (tx) => {
    const business = await createBusiness(tx, input); // existing
    const template = getTemplateForCategory(input.category); // existing
    const route = await createRouteFromTemplate(tx, business.id, template, input);
    await appendAuditEvent(tx, { type: "business.submitted", businessId: business.id });
    return {
      status: "PENDING_VERIFICATION",
      manageUrl: `/supplier/${business.slug}/requests?t=${business.manageToken}`,
      reviewUrl: `/supplier/${business.slug}/review?t=${business.manageToken}`,
    };
  });
}
```

The merchant sees: _"Submitted. An operator will verify you within X. Save this
link — it is your workspace."_ They never see the words capability card JSON,
route slug, input schema, or manage token.

Prerequisites this unblocks/requires:

1. **Widen the create schema** so the service metadata from F2 (`serviceSummary`,
   `serviceArea`, `operatingHours`, `turnaround`, `quoteResponseTime`) persists —
   either onto `businesses` or, better, onto the `quote_routes` row it actually
   describes. Needs a migration.
2. **Make `payoutAddress` conditional** on `wantsPaidQueries`, resolving F3.
   A free route is a legitimate product state (`PRODUCT_VISION.md` §5: "the
   product remains useful without payment access") and the schema should say so.
3. **Derive `inputSchema` from the template**, never from merchant input.
   `src/features/routes/templates.ts` already holds this — it just is not wired
   into a create path.

Validation must stay at the point of entry (the address field already validates
inline via `zodResolver` + `mode: "onBlur"` — keep that; the F3 fix removes the
only case where a valid-looking form produces a server rejection).

### 3.2 Give the manage token a delivery path

- Return `manageUrl` from onboarding (above) and show it once, prominently, with
  a copy control.
- Add a **`manageUrl` field to the operator queue read model** — exposed only
  through the operator-key-authenticated `GET /api/operator/routes`, never
  through `toPublicBusiness` or any public read. This lets an operator re-issue a
  lost link without a database session.
- Keep `PublicBusiness` stripping the token exactly as it does today.

### 3.3 A notification adapter, mirroring the payment adapter

The repo already has the right pattern for "a capability we do not fully control
yet": `src/features/payments/adapter/` with a typed interface, a `noop`
implementation, and an honest `UNAVAILABLE` state. Reuse it verbatim.

```ts
// src/features/notifications/adapter/types.ts  (new)
interface NotificationAdapter {
  notifySupplier(event: SupplierRequestEvent): Promise<NotifyResult>;
  describe(): { channel: string; configured: boolean };
}
```

- Default implementation: `noop` — records the _intent to notify_ in the audit
  trail and reports `NOT_CONFIGURED`. It must never claim a delivery it cannot
  verify (same rule as §4.1 for payments).
- Second implementation: an operator-assisted WhatsApp deep link — the operator
  console surfaces "notify this supplier" with a pre-filled `wa.me` message the
  operator sends. Honest, useful for the demo, and consistent with the
  human-approval principle.
- The supplier workspace should additionally show a live "waiting for you" count
  so an open tab self-updates.

This is the highest-value single change after §3.1: it closes the loop without a
phone call.

### 3.4 Buyer session recovery without accounts

Keep `localStorage` as the convenience path. Add a task-scoped opaque resume key
issued at submit, so `/tasks/:id?k=…` works on any device:

- generate alongside the task, compare with `timingSafeEqual` exactly as
  `src/features/businesses/access.ts` already does for manage tokens;
- surface it as "Save this link to check your quote from any device";
- `TaskPage`'s "belongs to another device" state gains a real recovery
  instruction instead of a dead end.

No account, no wallet, no email — consistent with the current design.

### 3.5 One read model per surface

`getSupplierWorkspace` and `getTaskView` already do this well: one call returns
a view-shaped object, and the page renders it. Hold that line — no surface
should assemble its state from multiple client fetches, and no page should
receive raw DB rows and compute policy in JSX.

Add one shared helper so every surface agrees on what happens next:

```ts
// src/features/tasks/next-action.ts  (new)
function nextAction(
  view: TaskView,
): { actor: "buyer" | "supplier" | "operator"; label: string; href?: string } | null;
```

Buyer page, supplier workspace, and operator queue then render the _same_
sentence about the same task. Today each surface infers this independently from
status enums.

### 3.6 Progressive disclosure in the buyer brief

`RequestForm` already defaults A5 / 100 / full-colour — good. Consider leading
with **quantity + deadline** (the two a student actually knows) and folding
size/colour/area behind "More options", pre-filled. Cuts the visible form in
half without losing a field.

### 3.7 Deferred until a requirement exists

- **Multi-printer fan-out (F7)** — schema change (task legs or request group);
  makes `recommendation.ts` meaningful. **NEEDS-ID.**
- **Capability discovery index (F6)** — needs an explicit decision against the
  "no public marketplace" boundary. **NEEDS-ID.**
- **A seeded demo path (F9)** — a landing route that shows the working loop to
  an evaluator, clearly labelled demo data per §4.4. **NEEDS-ID.**

---

## 4. Suggested order of work

Sequenced by "does the product work end to end without a human courier".

| #   | Change                                            | Fixes       | Notes                                  |
| --- | ------------------------------------------------- | ----------- | -------------------------------------- |
| 1   | Persist onboarding in one transaction             | F1, F2, F3  | Needs a migration; largest single win  |
| 2   | Deliver + re-issue the manage link                | F4          | Small; depends on 1                    |
| 3   | Notification adapter (`noop` + operator-assisted) | F5          | Closes the quote loop                  |
| 4   | Buyer resume key                                  | F8          | Small, self-contained                  |
| 5   | `nextAction()` shared helper                      | consistency | Cheap; improves every surface          |
| 6   | Brief progressive disclosure                      | —           | Cosmetic, low risk                     |
| 7   | Fan-out / discovery / demo path                   | F6, F7, F9  | **NEEDS-ID** — do not start unprompted |

Items 1–3 are the difference between a demo that needs a human operator standing
beside it and one that runs on its own.

---

## 5. Definition of done for any change here

Per `CLAUDE.md` §6.3, plus:

- the abstraction boundary in §2 is re-checked, item by item, in the PR notes;
- no step from §2 was combined, defaulted, auto-confirmed, or hidden;
- the workflow was mapped and classified **before** implementation, and the
  before/after step count is stated;
- 360px behaviour verified;
- requirement IDs cited in commits and test names;
- `npm run lint`, `build`, `format:check`, `test` all pass, with actual results
  reported.
