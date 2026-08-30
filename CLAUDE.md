# CLAUDE.md — Operating rules for AI agents in this repository

This file tells any future Claude (or other AI) agent how to work in the Intra
repository safely and predictably. Read it fully before changing code. If a
request conflicts with anything here, stop and surface the conflict rather than
guessing.

---

## 1. What Intra is

Intra is a **mobile-first procurement assistant for Nigerian campus students and
small businesses**. A buyer describes one narrow purchasing need — the MVP is
**flyer printing** — and Intra turns it into a structured brief, obtains a quote
from a participating independent printer, and presents an understandable
recommendation with a **human-approved WhatsApp order handoff**.

Hackathon context: Celo "Agents at Work" — primary track **Real World Adoption**,
secondary **Best Stablecoin Adoption**, **AskBots CLI Growth**, **Judges'
Favorite**.

### MVP boundary (do not exceed without an explicit requirement)

**In scope:** one buyer flyer-printing flow; supplier onboarding with consent and
one quote route; the structured brief (`size`, `quantity`, `colour`, `deadline`,
`deliveryArea`); route lifecycle + operator verification; recommendation + a
pre-filled (never auto-sent) WhatsApp message; an agent activity/payment audit
timeline; a real x402/`buy` settlement **only** once official access exists.

**Out of scope:** general shopping agent or public marketplace; custody, escrow,
remittances, swaps, or automatic final payments; bank/KYC/off-ramp integrations;
requiring suppliers to run MCP/API infra; native mobile app or WhatsApp bot;
fake payment receipts or simulated x402 success.

---

## 2. Source-of-truth documents

Read these before implementing anything. They live in `docs/`.

| Document                                                       | Role                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`docs/PRD.md`](docs/PRD.md)                                   | **Product source of truth.** Requirements, acceptance criteria, business rules, data model, screens, NFRs. |
| [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md)             | Architecture, stack, module map, API contract, persistence invariants, test strategy.                      |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)   | Phased delivery plan, backlog IDs, definition of done.                                                     |
| [`docs/BUSINESS_ONBOARDING.md`](docs/BUSINESS_ONBOARDING.md)   | Operator-facing supplier onboarding guide and the flyer-printing route template.                           |
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Local setup, commands, branch/commit rules, quality gates, env policy, DoD, known external blockers.       |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                       | Architecture decision log (ADRs).                                                                          |
| [`README.md`](README.md)                                       | Human-facing setup / run / lint / build / test instructions.                                               |

### PRD is the source of truth

If code, another doc, a comment, or a user instruction conflicts with
`docs/PRD.md`, **the PRD wins**. Do not silently reinterpret a requirement.
Flag the conflict, propose options, and wait for a human decision. Promoting
anything out of "out of scope" requires an explicit instruction from Victor.

---

## 3. Requirement-ID convention

Every requirement in the PRD has an ID: `FR-*` (functional requirement),
`AC-*` (acceptance criterion), `BR-*` (business rule), `NFR-*`, `G-*`, plus
backlog IDs in the implementation plan (`SUP-001`, `TASK-001`, …).

- **Commits:** reference the IDs the commit implements, e.g.
  `feat(supplier): onboarding form and consent (FR-SUP-001..005, AC-SUP-001)`.
- **Tests:** name or comment each test with the ID it verifies, e.g.
  `it("blocks onboarding on an invalid payout address (AC-SUP-001)")`.
- **Implementation notes / PR descriptions:** list the IDs delivered and the IDs
  explicitly deferred.
- **New behaviour with no ID:** do not build it. Ask for the requirement first.

---

## 4. Hard safety rules (never violate)

### 4.1 Never fabricate

Do **not** invent, hard-code, mock as if real, or otherwise present as genuine:

- merchant / supplier data or prices;
- Celo payment success or "settled" state;
- transaction hashes;
- ERC-8004 Agent IDs, ERC-8021 attribution tags, or `buy` beta access;
- wallet credentials or addresses presented as belonging to a real business.

Demo/local state must be **clearly labelled non-persistent and not real**
(see §4.4). A payment is `SETTLED` only after real facilitator/beta verification
returns a valid mainnet transaction hash (`FR-PAY-003`, `BR-005`). With no
configured access, show `UNAVAILABLE` / return `503 PAYMENT_SERVICE_UNAVAILABLE`
(`FR-PAY-004`) — never a fake receipt.

### 4.2 Never collect or persist prohibited sensitive data

Do not request, accept, display, log, or store:

- seed phrases / mnemonics;
- private keys;
- passwords;
- BVN, NIN, or any government identity number;
- payment-card data (PAN, CVV, expiry);
- bank-login / online-banking credentials.

A **public** Celo/EVM address (`0x…`) is allowed and is the only wallet-related
value Intra handles. Ownership of that address is verified out-of-band by an
operator (small test transfer or approved signing flow) — never by collecting a
secret. See `FR-SUP-003`, `NFR-SEC-001`, `docs/BUSINESS_ONBOARDING.md`.

### 4.3 Preserve human approval

Intra never custodies funds and never signs or executes a buyer's **final**
supplier payment or order (`BR-001`, `FR-REC-002`, `FR-REC-004`). The final
purchase is always a buyer-controlled external action (a copied WhatsApp
message the buyer chooses to send). An agent may pay a _small service/query
fee_ over x402 — that is distinct from the order price (`BR-004`) and only when
real access exists.

### 4.4 Non-persistent demo state

Until a persistence phase is explicitly started, feature code must use clearly
isolated local/in-memory/demo state, and the UI must label it — e.g. a visible
notice: "Demo only — nothing here is saved." Do not add a database or ORM yet.

---

## 5. Engineering standards

- **TypeScript strict mode** everywhere. No `any`, no non-null-assertion abuse,
  no `@ts-ignore` without a comment explaining why.
- **Zod for all request/input validation**, with schemas shared between client
  and server. Types are inferred from schemas (`z.infer`), not hand-duplicated.
- **Accessible, mobile-first UI:** works at a **360px** viewport; real `<label>`s,
  keyboard navigation, visible focus, programmatically associated form errors
  (`NFR-A11Y-001`, `NFR-UX-001`). Use plain, non-crypto language for buyers and
  suppliers.
- **Every async surface has explicit loading, empty, validation-error, and
  network-error states** — not just the happy path (`NFR-UX-001`, PRD §7).
- Keep secrets server-side only. Never ship a secret to the client or commit one.
- Follow the module map in `docs/TECHNICAL_SPEC.md` §3 (`features/*`, `lib/*`).

---

## 6. Change-control rules

### 6.1 Do not silently overwrite scaffold / config

`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`,
`postcss.config.mjs`, `.eslintrc.json`, `.prettierrc.json`, `vitest.config.ts`,
`.github/workflows/*`, and the `src/styles/` design tokens are load-bearing.
If a change to one is necessary, state **why** in the commit body / notes and
keep the diff minimal. Replacing a placeholder route with its real feature
implementation is expected and does not need this justification.

### 6.2 Do not add blockchain / payment packages early

Do **not** install `viem`, any Celo SDK, x402 / `buy` client libraries, auth
providers, or AI SDKs until:

1. the corresponding phase in `docs/IMPLEMENTATION_PLAN.md` is explicitly
   started by Victor, **and**
2. official documentation and real credentials/access are available.

**Persistence phase is started** (`docs/DECISIONS.md` ADR-006). The database
stack is fixed: `drizzle-orm` + `drizzle-kit`, `@electric-sql/pglite` (embedded
Postgres for dev/test), and `pg` (production driver). Do not swap ORMs or add
another database/cache library without a new ADR. Schema changes go through
`npm run db:generate` (a committed migration), never a hand-edited migration or
`db:push` against a shared database.

**x402 payment phase is started** (ADR-011). Payments go through the
`PaymentAdapter` interface in `src/features/payments/adapter/` — only
`@x402/core` is allowed there, not `@x402/evm` / `viem`. Config and the exact
Celo facilitator values live in `docs/PAYMENTS.md` + `adapter/networks.ts`; do
not hard-code endpoints, chain ids, or token addresses elsewhere. Never
fabricate a 402 settlement, `X-PAYMENT` verification, receipt, or tx hash; never
log the authorisation payload; `service_payments` rows are insert-only.

### 6.3 Definition of done

A change is complete only when, for each requirement ID it touches:

- the acceptance criteria **and** the failure/edge states are covered by tests;
- mobile behaviour at 360px is checked;
- the requirement ID is cited in the commit and test names;
- there is no fabricated payment or merchant evidence;
- `npm run lint`, `npm run build`, `npm run format:check`, and `npm run test`
  all pass. Report the actual results — do not claim done on unrun gates.

---

## 7. When in doubt

Stop and ask. Prefer surfacing a blocker to Victor over inventing data,
loosening a safety rule, or expanding scope. Record non-obvious choices in
`docs/DECISIONS.md`.
