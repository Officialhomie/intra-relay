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

Current state: the **end-to-end flyer-printing workflow** on a PostgreSQL
(Drizzle) backend — buyer request → printer selection → structured request →
supplier quote or decline → operator-verified activation → buyer's
human-controlled WhatsApp handoff → feedback. Eight persisted entities
(`businesses`, `quote_routes`, `tasks`, `quotes`, `recommendations`, `feedback`,
`service_payments`, `audit_events`) with enforced lifecycle invariants
([`docs/API.md`](docs/API.md)). No payment settlement yet — x402 is `UNAVAILABLE`
until official access (ADR-004). Visual system: ADR-009.

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
| `/docs`                       | Placeholder                                                                           |
| `GET /v1/:slug/capabilities`  | Public agent capability document (see `docs/CAPABILITY_API.md`)                       |
| `POST /v1/:slug/:route/quote` | Public agent quote request                                                            |

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
