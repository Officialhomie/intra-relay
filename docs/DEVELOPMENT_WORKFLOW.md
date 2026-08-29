# Intra — Development Workflow

Companion to [`../CLAUDE.md`](../CLAUDE.md). Read the CLAUDE file first; this
document is the operational "how", the CLAUDE file is the "rules".

---

## 1. Local setup

Requirements: Node.js `>=20.9.0`, npm `>=10`.

```bash
npm install
cp .env.example .env.local   # non-secret placeholders only
```

### Commands

| Command                | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Dev server at http://localhost:3000              |
| `npm run build`        | Production build (also type-checks)              |
| `npm run start`        | Serve a production build                         |
| `npm run lint`         | ESLint (`next lint`)                             |
| `npm run format`       | Prettier — write                                 |
| `npm run format:check` | Prettier — check only                            |
| `npm run test`         | Vitest — single run                              |
| `npm run test:watch`   | Vitest — watch mode                              |
| `npm run db:generate`  | Generate a SQL migration from the Drizzle schema |
| `npm run db:migrate`   | Apply migrations to the configured database      |
| `npm run db:seed`      | Load synthetic dev seed data (local PGlite only) |
| `npm run db:studio`    | Open Drizzle Studio                              |

### Database

Local dev and tests use an **embedded PostgreSQL (PGlite)** — there is no
server to install. With `DATABASE_URL` unset, the app and the `db:*` scripts
target `./.pglite` (git-ignored). Set `DATABASE_URL` to a real PostgreSQL
server for staging/production and run `npm run db:migrate` in the deploy
pipeline; migrations never run at request time. Schema lives in
`src/lib/db/schema.ts`; change it, then `npm run db:generate` and commit the new
file in `drizzle/`. See `docs/DECISIONS.md` ADR-006.

---

## 2. Branching and commits

- Work on a branch off `main`: `feat/<area>-<short-slug>`, `fix/…`, `docs/…`,
  `chore/…`, `test/…`.
- Never commit directly to `main`; open a pull request. CI (lint + build + test)
  must be green before merge.
- **Conventional Commits**, and every commit body cites the requirement IDs it
  implements or defers:

  ```
  feat(supplier): onboarding form, consent, address validation

  Implements FR-SUP-001..FR-SUP-005, AC-SUP-001, AC-SUP-002.
  Defers AC-SUP-003 (operator verification) to the operator phase.
  ```

- Small, focused commits. Keep unrelated refactors out.
- Do not commit secrets, `.env.local`, real merchant data, or real wallet keys
  (there should never be a private key anywhere — see CLAUDE §4.2).

---

## 3. Quality gates

Run **all four** before declaring any work complete, and paste the real output:

```bash
npm run lint
npm run build
npm run format:check
npm run test
```

CI runs the same set on every pull request to `main`
(`.github/workflows/ci.yml`). A gate you did not run is not a passing gate.

---

## 4. Environment-variable policy

- `.env.example` is the committed template. It contains **names and non-secret
  placeholder values only** — never a real secret, key, token, RPC URL with an
  API key, or credential.
- Real values live in `.env.local` (git-ignored) for local dev, and in the
  deployment platform's environment settings for hosted environments.
- Client-exposed variables must be prefixed `NEXT_PUBLIC_` and must be
  non-sensitive by definition. Everything else is server-only.
- Secrets for later phases (database URL, session secret, Celo RPC URL, operator
  allowlist, agent-wallet reference, facilitator URL/credential, attribution
  tag) are **not** added to `.env.example` with placeholder values until that
  phase starts — list the name in the relevant ADR / phase notes instead, so we
  never imply access we do not have.
- If code needs a variable that is absent, it must fail loudly on the server
  (throw at startup / render a clear unavailable state) — never silently
  fall back to a fake value.

---

## 5. Using requirement IDs

1. Before coding, list the PRD IDs the task covers and the IDs it explicitly
   does **not** cover.
2. Cite those IDs in: the branch description, each commit body, each test name
   or a leading comment, and the PR description.
3. In code, put a short `// FR-SUP-002:` style comment on the block that
   satisfies a non-obvious requirement.
4. If you find behaviour with no requirement ID, do not build it — request the
   requirement.
5. If two IDs conflict, follow CLAUDE §2 ("PRD is the source of truth") and
   raise it.

---

## 6. Definition of done

A feature / change is done when, for every requirement ID it touches:

- [ ] Acceptance criteria are implemented **and** covered by tests.
- [ ] Failure, empty, loading, and validation-error states are implemented and
      tested (PRD §7 UI states).
- [ ] It behaves correctly at a **360px** viewport (checked manually; note it).
- [ ] Accessibility basics hold: labels, keyboard nav, focus visibility,
      associated error messages.
- [ ] No fabricated merchant data, payment success, or transaction hashes.
- [ ] No prohibited sensitive data is requested, logged, or stored (CLAUDE §4.2).
- [ ] Human approval is preserved for any final supplier order/payment.
- [ ] Requirement IDs are cited in commits and tests.
- [ ] `lint`, `build`, `format:check`, `test` all pass — output reported.
- [ ] Any non-obvious decision is recorded in `docs/DECISIONS.md`.

---

## 7. Testing expectations

Stack: **Vitest** + **React Testing Library** + **jsdom** +
`@testing-library/jest-dom` + `@testing-library/user-event`.

- **Location:** co-locate as `*.test.ts` / `*.test.tsx` next to the unit under
  test, under `src/`.
- **Unit tests** for: every Zod schema (valid + each failure branch), pure
  helpers (address validation, slug generation, message formatters), and
  lifecycle/state transition logic.
- **Component/interaction tests** for forms and stateful UI: render, submit
  empty → assert associated errors, submit valid → assert the resulting state,
  and assert prohibited fields are absent from the DOM.
- **Every test names the requirement ID** it verifies.
- Test the **failure path**, not only the happy path — this is a DoD item, not
  optional.
- Integration/contract/E2E and mainnet-settlement tests arrive with their
  phases (see `docs/TECHNICAL_SPEC.md` §7); do not stub a fake facilitator to
  make a green test.
- Do not weaken an assertion to get a pass. Fix the code or raise the conflict.

---

## 8. Deployment & mainnet safety rules

- **Celo mainnet only** counts for the hackathon; testnet activity is for
  development and counts for nothing. Never present testnet data as mainnet.
- No claimed mainnet transaction may be made or displayed until the ERC-8004
  Agent ID and ERC-8021 attribution tag are obtained and recorded, and the tag
  is attached to the transaction (`BR-007`).
- A payment renders as paid **only** in `SETTLED` state, which requires a real
  facilitator/beta verification result and a stored, unique tx hash
  (`FR-PAY-003`, `BR-005`). No manual receipt entry.
- Server enforces the agent spend cap ($0.05 per task default); the browser
  never controls budget (`FR-PAY-005`, `TECHNICAL_SPEC` §6).
- Payment/attribution secrets live only in deployment environment variables.
- Before claiming any settlement in the submission: verify chain = mainnet,
  verify the tx exists and carries the attribution tag, then document it.
- Production deploys go from `main` after CI is green. Preview deploys per PR
  are fine and are always non-authoritative.

---

## 9. Known external blockers

These are outside our control and gate specific phases. Track status here; do
not build past a blocker with fabricated stand-ins.

| Blocker                                 | Needed for                                                                | Status                              | Rule while blocked                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **ERC-8004 Agent ID**                   | Celo Builders registration; any claimed onchain agent identity            | Not obtained                        | No registration-dependent claims; no hard-coded Agent ID.                                                                     |
| **Celo ERC-8021 attribution tag**       | Crediting any mainnet transaction on the hackathon leaderboard (`BR-007`) | Not issued (issued at registration) | Keep an attribution helper behind a config value; no tag literal in code; no claimed tagged tx.                               |
| **x402 facilitator access / config**    | Real paid service settlement (`FR-PAY-002/003`)                           | Not configured                      | Return `503 PAYMENT_SERVICE_UNAVAILABLE`; payment state `UNAVAILABLE`; never a fake `X-PAYMENT` verify or receipt.            |
| **`buy` private beta**                  | Buyer-side agent-service marketplace path                                 | Applied / not granted               | Keep x402/`buy` behind an adapter interface; the free request→quote→handoff flow must work without it.                        |
| **AskBots CLI / access**                | Secondary track (AskBots CLI Growth), external agent reviews              | Not set up                          | Do not stub reviews; wire the review cycle only once the CLI and account exist.                                               |
| **Managed PostgreSQL (`DATABASE_URL`)** | Any hosted/preview deployment (dev + tests use embedded PGlite)           | Not provisioned                     | Provision Postgres (Neon/RDS/etc.), set `DATABASE_URL`, run `npm run db:migrate` in the deploy step. Local work is unblocked. |
| **`OPERATOR_API_KEYS`**                 | Verifying/activating a route and recording quotes in a hosted env         | Not set (per-env)                   | Set `label:secret` pairs in the deployment environment. With none set, no request can act as an operator.                     |

When a blocker clears: start the phase, add its real credentials to the
deployment environment (not `.env.example`), record an ADR, and remove the
corresponding unavailable-state shortcuts behind tests.
