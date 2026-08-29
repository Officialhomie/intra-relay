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

Current state: onboarding UI + buyer request UI, and the **first persistent
backend** — PostgreSQL via Drizzle, with the `businesses`, `quote_routes`,
`tasks`, `quotes`, `recommendations`, `feedback`, `service_payments`, and
`audit_events` entities and their lifecycle invariants. See
[`docs/API.md`](docs/API.md). No payment settlement yet (x402 is `UNAVAILABLE`
until official access — ADR-004).

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

| Document                                                       | Purpose                                            |
| -------------------------------------------------------------- | -------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                       | Operating rules for AI agents working in this repo |
| [`docs/PRD.md`](docs/PRD.md)                                   | Product source of truth                            |
| [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md)             | Architecture and API contract                      |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)   | Phased delivery plan                               |
| [`docs/BUSINESS_ONBOARDING.md`](docs/BUSINESS_ONBOARDING.md)   | Supplier onboarding guide                          |
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Setup, gates, conventions, external blockers       |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                       | Architecture decision log                          |
| [`docs/API.md`](docs/API.md)                                   | MVP backend endpoints, headers, invariants         |

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

| Path                | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `/`                 | Placeholder landing page                          |
| `/request`          | Placeholder (buyer flyer brief — later phase)     |
| `/supplier/onboard` | Supplier onboarding form + reviewable draft route |
| `/operator`         | Placeholder (route verification — later phase)    |
| `/docs`             | Placeholder                                       |

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
