# Intra — deployment

Intra is a standard Next.js 15 App Router app. It needs a PostgreSQL database in
any hosted environment; everything else is optional and degrades to an explicit
unavailable state when unset (`CLAUDE.md` §4, `DEVELOPMENT_WORKFLOW.md` §9).

## 1. Build & runtime

| Item    | Value                                                                     |
| ------- | ------------------------------------------------------------------------- |
| Node    | `>=20.9.0`                                                                |
| Build   | `npm run build` (also type-checks)                                        |
| Start   | `npm run start`                                                           |
| Migrate | `npm run db:migrate` — **in the deploy step**, never at request time      |
| Output  | Standard Next.js server (Fluid Compute / Node runtime; do not force edge) |

CI (`.github/workflows/ci.yml`) runs `lint`, `format:check`, `test`, `build` on
every PR to `main`. Deploy from `main` after CI is green.

## 2. Environment variables

`.env.example` is the committed template — **names and non-secret placeholders
only**. Real values go in the hosting platform's environment settings. Anything
not prefixed `NEXT_PUBLIC_` is server-only.

| Variable               | Required?                   | Purpose / notes                                                                                                                                             |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | **Yes** (hosted)            | PostgreSQL connection string (Neon / RDS / Supabase / …). Unset ⇒ embedded PGlite at `./.pglite` (local only).                                              |
| `NEXT_PUBLIC_APP_URL`  | Recommended                 | Canonical origin, e.g. `https://intra.example`. Used for `metadataBase`, Open Graph URLs, and agent `resource` URLs.                                        |
| `OPERATOR_API_KEYS`    | **Yes** to verify routes    | Comma-separated `label:secret` pairs. With none set, no request can act as an operator. Rotate by editing the list.                                         |
| `X402_API_KEY`         | Only to enable paid queries | Official Celo x402 facilitator key from `x402.celo.org`. Unset ⇒ paid routes return `503 PAYMENT_SERVICE_UNAVAILABLE`. Never `NEXT_PUBLIC_*`, never logged. |
| `X402_NETWORK`         | No (default `eip155:42220`) | `eip155:42220` (Celo mainnet) or `eip155:11142220` (Sepolia). Unknown value throws at startup.                                                              |
| `X402_ASSET`           | No (default `USDC`)         | `USDC` or `USDT` (USDT mainnet-only).                                                                                                                       |
| `X402_FACILITATOR_URL` | No                          | Override the per-network facilitator URL (testing only).                                                                                                    |
| `X402_ATTRIBUTION_TAG` | No                          | ERC-8021 `celo_...` tag from hackathon registration. Absent ⇒ no tag recorded anywhere.                                                                     |

The **$0.05 per-task spend cap** is a code constant (`PAYMENT_MAX_FEE_USD`), not
an env var, and cannot be raised from configuration.

Example (Vercel):

```bash
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add OPERATOR_API_KEYS production
# when official Celo access is granted:
vercel env add X402_API_KEY production
vercel env add X402_ATTRIBUTION_TAG production
```

## 3. Database provisioning

1. Create a PostgreSQL database and copy its connection string to `DATABASE_URL`.
2. Add `npm run db:migrate` to the deploy pipeline **before** the app serves
   traffic. Migrations live in `drizzle/` (committed); they are applied with the
   `pg` driver when `DATABASE_URL` is set.
3. Never run `npm run db:seed` against a hosted database — it refuses when
   `DATABASE_URL` looks like Postgres, and the seed data is clearly synthetic
   (`[DEMO SEED]`, burn address) by design (ADR-007).

## 4. Enabling Celo x402 payments (when access is granted)

Full detail in [`PAYMENTS.md`](PAYMENTS.md). Short version:

1. On `x402.celo.org`, connect the payout wallet and **Create API key** (an
   off-chain signature, no gas). Copy it once.
2. Set `X402_API_KEY` (+ `X402_NETWORK`, `X402_ASSET` if not the defaults) in the
   server environment.
3. When hackathon registration returns the ERC-8021 tag, set
   `X402_ATTRIBUTION_TAG`.
4. Redeploy. Verify: `GET /v1/<business>/capabilities` shows
   `payment.state: "AVAILABLE"`; a `POST …/quote` with no `X-PAYMENT` returns
   `402` with `accepts`.
5. Fund settlement credits with USDC on the dashboard beyond the free tier
   ($0.001 per settlement).

## 5. Pre-launch checklist

- [ ] `lint`, `format:check`, `test`, `build` green on `main`.
- [ ] `DATABASE_URL` set; `db:migrate` runs in the deploy step.
- [ ] `NEXT_PUBLIC_APP_URL` set to the real origin.
- [ ] `OPERATOR_API_KEYS` set; test operator sign-in on `/operator`.
- [ ] No secret is present in `.env.example`, the client bundle, or logs.
- [ ] Payments: either `X402_API_KEY` is set **and** a test `/v1` quote returns
      `402`, or it is unset **and** a paid route returns `503` — never a
      fabricated receipt.
- [ ] Open Graph preview renders (`/opengraph-image`).
