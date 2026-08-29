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

Current state: scaffold plus **Phase 1 supplier-onboarding foundations**
(`/supplier/onboard`). No database, no payment flow.

## Tech stack

- [Next.js 15](https://nextjs.org/) with the App Router
- TypeScript (strict)
- Tailwind CSS 3
- Zod validation, React Hook Form
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

## Requirements

- Node.js `>=20.9.0`
- npm `>=10`

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file from the template
cp .env.example .env.local
```

`.env.example` contains non-secret placeholders only. Never commit `.env.local`.

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
  app/         App Router routes, layouts, and route-level metadata
  components/  Reusable presentational components + `ui/` primitives
  features/    Feature modules — `businesses/`, `routes/`
  lib/         Framework-agnostic helpers (address, slug, utils) and constants
  types/       Cross-feature TypeScript types
  styles/      Global CSS and design tokens
```

## Continuous integration

`.github/workflows/ci.yml` runs `lint`, `format:check`, `test`, and `build` on
every pull request targeting `main`.
