# Intra

Mobile-first procurement assistant for Nigerian campus students and small
businesses. The MVP does one narrow job: turn a flyer-printing need into a
structured brief, get a quote from a participating independent printer, and hand
the buyer a human-approved WhatsApp order message.

Intra never custodies funds, never asks for private keys or seed phrases, and
never executes a buyer's final supplier payment.

**Agents / contributors: read [`CLAUDE.md`](CLAUDE.md) and the documents in
[`docs/`](docs/) before changing code. [`docs/PRD.md`](docs/PRD.md) is the source
of truth.**

## What works today

The **end-to-end flyer-printing workflow** runs on a PostgreSQL (Drizzle)
backend:

supplier onboarding → operator verification & activation → buyer request →
printer selection → structured brief → genuine supplier quote or safe decline →
recommendation → buyer's human-controlled WhatsApp handoff → feedback.

- Eight persisted entities (`businesses`, `quote_routes`, `tasks`, `quotes`,
  `recommendations`, `feedback`, `service_payments`, `audit_events`) with
  enforced lifecycle invariants and an append-only audit trail
  ([`docs/API.md`](docs/API.md)).
- A public, agent-readable capability + quote API at `/v1`
  ([`docs/CAPABILITY_API.md`](docs/CAPABILITY_API.md)).
- Privacy-minimised experiment tracking and a public
  [`/evidence`](src/app/evidence/page.tsx) page (backlog MET-001) that keeps real
  results, demo data, and unavailable integrations strictly separate, with a
  CSV/JSON export.
- A provider-neutral **Celo x402** payment adapter for the small query fee
  ([`docs/PAYMENTS.md`](docs/PAYMENTS.md), ADR-011). Paid routes return an
  explicit `PAYMENT_SERVICE_UNAVAILABLE` state until `X402_API_KEY` is set in
  the server environment — a settlement is only ever shown after the official
  facilitator verifies a real transaction hash. Nothing is fabricated.

What is proven end-to-end versus what is conditional on external Celo / cPay
access is spelled out in
[`docs/CLAIMS.md`](docs/CLAIMS.md). The demo walkthrough is
[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). Visual system: ADR-009.

## Tech stack

- [Next.js 15](https://nextjs.org/) with the App Router
- TypeScript (strict)
- Tailwind CSS 3
- Zod validation, React Hook Form
- [Drizzle ORM](https://orm.drizzle.team/) — PostgreSQL; embedded
  [PGlite](https://pglite.dev/) for dev/tests, `pg` for production (ADR-006)
- ESLint + Prettier
- Vitest + React Testing Library
- Design tokens as CSS variables (`src/styles/tokens.css`)

## Documentation

| Document                                                       | Purpose                                               |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                       | Operating rules for AI agents working in this repo    |
| [`docs/PRD.md`](docs/PRD.md)                                   | Product source of truth                               |
| [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md)             | Architecture and API contract                         |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)   | Phased delivery plan                                  |
| [`docs/BUSINESS_ONBOARDING.md`](docs/BUSINESS_ONBOARDING.md)   | Supplier onboarding guide                             |
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Setup, gates, conventions, external blockers          |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                       | Architecture decision log                             |
| [`docs/API.md`](docs/API.md)                                   | Internal MVP backend endpoints, headers, invariants   |
| [`docs/CAPABILITY_API.md`](docs/CAPABILITY_API.md)             | Public agent-readable `/v1` capability + quote API    |
| [`docs/PAYMENTS.md`](docs/PAYMENTS.md)                         | Celo x402 payment adapter — config, flow, deployment  |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)                   | Step-by-step hackathon demo walkthrough               |
| [`docs/CLAIMS.md`](docs/CLAIMS.md)                             | Proven vs. conditional claims (be precise on stage)   |
| [`docs/FEEDBACK_CHANGELOG.md`](docs/FEEDBACK_CHANGELOG.md)     | "What changed from feedback" — AskBots review rounds  |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                     | Production deploy: env vars, database, x402 key       |
| [`docs/design/`](docs/design/)                                 | Supplied style references (ADR-009 picks Ease Health) |

## Requirements

- Node.js `>=20.9.0`
- npm `>=10`

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file from the template
cp .env.example .env.local

# 3. Set up the local database (embedded PostgreSQL — no server to install)
npm run db:migrate
npm run db:seed      # optional: synthetic demo data (local only)
```

`.env.example` contains non-secret placeholders only. Never commit `.env.local`.
Leave `DATABASE_URL` unset locally to use the embedded PGlite database in
`./.pglite`.

## Run

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Demo

Full walkthrough: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — supplier
onboarding → operator verification → buyer request → genuine quote → WhatsApp
handoff → post-handoff feedback, plus the optional verified Celo query-fee
receipt.

```bash
rm -rf .pglite && npm run db:migrate      # clean database
printf 'OPERATOR_API_KEYS=demo:demo-operator-key-01\n' >> .env.local
npm run db:seed                           # optional: one clearly-labelled [DEMO SEED] printer
npm run dev
```

Then open, in this order: `/supplier/onboard` (show the guided form) → create
the real business/route with the two `curl` calls in the demo script →
`/operator` (sign in with `demo-operator-key-01`, run the checklist, activate) →
`/request` (send a brief, pick the printer) → act as the supplier at
`/supplier/<slug>/requests?t=<manageToken>` to send a quote → back on
`/tasks/<id>`, copy the WhatsApp message, mark it sent, leave feedback →
`/evidence` shows the run as **real** results, the seed as **demo** data.

### Limitations

- **No live Celo settlement without `X402_API_KEY`.** Paid routes return
  `503 PAYMENT_SERVICE_UNAVAILABLE`; a receipt only ever renders `SETTLED` after
  the official facilitator verifies a transaction hash. See
  [`docs/CLAIMS.md`](docs/CLAIMS.md) for the full proven-vs-conditional split.
- **Supplier onboarding does not write to the backend from the UI.** The form
  produces a reviewable draft; an operator creates the real records
  (`POST /api/businesses`, `.../routes`) — this matches the guided-onboarding
  model (ADR-005/008).
- **Quotes are asynchronous.** A supplier replies out of band within the SLA;
  there is no synchronous quote.
- **Local/dev uses embedded PGlite.** A hosted deployment needs `DATABASE_URL`
  (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).
- **`/evidence` is only as populated as the database.** On a fresh clone the
  real scope is empty; that is the honest state, not a bug.
- ERC-8004 Agent ID, ERC-8021 attribution tag, cPay, and AskBots CLI review
  rounds are external and currently unavailable — the app never stands in for
  them.

### Test data policy

- **No fabricated users, businesses, prices, payments, transactions, or
  testimonials — anywhere, ever** (`CLAUDE.md` §4.1).
- The only synthetic data is `npm run db:seed`: a single business named
  `[DEMO SEED] …` with a burn payout address. Everything traceable to it is
  classified **demo** and is never added to the real metrics
  ([`src/features/metrics/classification.ts`](src/features/metrics/classification.ts)).
- `db:seed` refuses to run when `DATABASE_URL` looks like a real PostgreSQL
  server, and never runs in production.
- Experiment tracking is **privacy-minimised**: it aggregates on read from rows
  the product already stores. There is no analytics store and no new
  per-event tracking. Buyer sessions are opaque random ids with no account
  behind them; `/evidence` and the CSV/JSON export publish only counts and a
  bucketed distribution — never a raw id, task content, address, or contact
  detail.
- "What changed from feedback" ([`docs/FEEDBACK_CHANGELOG.md`](docs/FEEDBACK_CHANGELOG.md))
  lists only genuine shipped changes with a traceable artefact. AskBots review
  rounds are appended there when that CLI is connected — not simulated.

### Submission checklist

- [ ] `npm run lint && npm run format:check && npm run test && npm run build` all green.
- [ ] `rm -rf .pglite && npm run db:migrate` applies cleanly.
- [ ] Demo rehearsed end to end against a clean database.
- [ ] `/evidence` reviewed: real vs demo vs unavailable are clearly separated;
      numbers match reality; CSV and JSON export download.
- [ ] [`docs/CLAIMS.md`](docs/CLAIMS.md) current — every on-stage claim is either
      proven or flagged conditional.
- [ ] If Celo access was granted: `X402_NETWORK=eip155:42220`, a real settlement
      verified on Celoscan, `X402_ATTRIBUTION_TAG` set, the tx recorded in
      [`docs/FEEDBACK_CHANGELOG.md`](docs/FEEDBACK_CHANGELOG.md) / notes.
- [ ] If Celo access was not granted: the demo shows the honest `503` /
      `UNAVAILABLE` state and says so out loud.
- [ ] No secret in `.env.example`, the client bundle, or git history.
- [ ] README, [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md), and
      [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) match the current build.

## Lint & format

```bash
npm run lint          # ESLint (next lint)
npm run format:check  # Prettier, check only
npm run format        # Prettier, write
```

## Test

```bash
npm run test        # Vitest, single run
npm run test:watch  # Vitest, watch mode
```

## Database

```bash
npm run db:generate  # generate a SQL migration after editing src/lib/db/schema.ts
npm run db:migrate   # apply migrations (PGlite locally, or DATABASE_URL if set)
npm run db:seed      # synthetic demo data — local PGlite only, refuses in prod
npm run db:studio    # Drizzle Studio
```

Schema: `src/lib/db/schema.ts`. Migrations: `drizzle/` (committed). Production
runs `db:migrate` in the deploy pipeline — never at request time.

## Build

```bash
npm run build   # production build (also type-checks)
npm run start   # serve the production build (after build)
```

## Quality gates

Run all four before considering work done (CI runs the same set on every PR to
`main`):

```bash
npm run lint && npm run format:check && npm run test && npm run build
```

## Routes

| Path                          | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `/`                           | Landing page                                                                          |
| `/request`                    | Buyer: describe a flyer job → pick a printer → live task                              |
| `/tasks/:id`                  | Buyer: status, quote, freshness, audit timeline, WhatsApp handoff, feedback           |
| `/supplier/onboard`           | Supplier onboarding form + reviewable draft route                                     |
| `/supplier/:slug/review`      | Supplier: business details, route status/freshness, pause action (`?t=<manageToken>`) |
| `/supplier/:slug/requests`    | Supplier: incoming structured requests → send a quote or decline                      |
| `/operator`                   | Operator: verify + activate routes (pre-flight checklist), pause                      |
| `/docs`                       | Explainer: how a business capability maps to the agent route contract                 |
| `/evidence`                   | Public results: real vs demo vs unavailable, "what changed from feedback", exports    |
| `GET /v1/:slug/capabilities`  | Public agent capability document (see `docs/CAPABILITY_API.md`)                       |
| `POST /v1/:slug/:route/quote` | Public agent quote request                                                            |
| `GET /api/evidence`           | Privacy-safe evidence export — `?format=csv` or `?format=json`                        |

## Project structure

```
src/
  app/           App Router pages + `app/api/*` route handlers
  components/     Reusable presentational components + `ui/` primitives
  features/       Feature modules — each with schema / lifecycle / repository / service
                  (businesses, routes, tasks, quotes, feedback, payments, audit)
  lib/db/         Drizzle schema, client (driver selection), migrate/seed, test helper
  lib/http/       Response envelope, Zod body parsing, idempotency, operator auth
  lib/            Framework-agnostic helpers (address, slug, utils)
  test-support/   Test factories (not collected by Vitest)
  types/          Cross-feature TypeScript types
  styles/         Global CSS and design tokens
drizzle/         Generated SQL migrations (committed)
```

## Continuous integration

`.github/workflows/ci.yml` runs `lint`, `format:check`, `test`, and `build` on
every pull request targeting `main`.
