# Intra

Full-stack web application scaffold built with Next.js (App Router) and TypeScript.

This repository currently contains **scaffold only** — routing, layout, and a neutral
design system. No product features, business logic, or third-party integrations are
implemented yet.

## Tech stack

- [Next.js 15](https://nextjs.org/) with the App Router
- TypeScript (strict)
- Tailwind CSS 3
- ESLint + Prettier
- Design tokens as CSS variables (`src/styles/tokens.css`)

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

## Lint

```bash
npm run lint          # ESLint (next lint)
npm run format:check  # Prettier, check only
npm run format        # Prettier, write
```

## Build

```bash
npm run build   # production build
npm run start   # serve the production build (after build)
```

## Routes

| Path                | Purpose                  |
| ------------------- | ------------------------ |
| `/`                 | Placeholder landing page |
| `/request`          | Placeholder              |
| `/supplier/onboard` | Placeholder              |
| `/operator`         | Placeholder              |
| `/docs`             | Placeholder              |

## Project structure

```
src/
  app/         App Router routes, layouts, and route-level metadata
  components/  Reusable presentational components (Header, Footer, MainContainer, …)
  features/    Feature modules — one folder per feature (empty for now)
  lib/         Framework-agnostic helpers and shared constants
  types/       Cross-feature TypeScript types
  styles/      Global CSS and design tokens
```

## Continuous integration

`.github/workflows/ci.yml` runs `npm run lint` and `npm run build` on every pull
request targeting `main`.
