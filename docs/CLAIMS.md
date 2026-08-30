# Intra — proven vs. conditional claims

Be precise on stage. This is the line between "we built and tested this" and
"this depends on access we don't control yet". If asked, answer from this table.

Legend:

- **Proven** — implemented, covered by automated tests, demonstrable end-to-end
  on `npm run dev` against the persistent database with no external services.
- **Conditional** — implemented and tested against fixtures / a fake facilitator,
  but a live demonstration needs an external credential or approval that is not
  in the repo.
- **Not built** — out of scope for the MVP. Do not imply otherwise.

---

## Proven (safe to demo and claim)

| Capability                                                                                                   | Evidence                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Guided supplier onboarding: 3-step form, plain language, public-address-only, explicit quote-display consent | `/supplier/onboard`, `OnboardingForm.test.tsx`, `businesses/schema.ts` (no prohibited fields)     |
| Business + quote-route creation with slug/consent/lifecycle invariants                                       | `POST /api/businesses`, `POST /api/businesses/:slug/routes`, `service.integration.test.ts`        |
| Operator verification: 6-point pre-activation checklist enforced **server-side**; browser cannot bypass it   | `/operator`, `changeRouteStatus` `CHECKLIST_INCOMPLETE`, `workflow.integration.test.ts`           |
| Route lifecycle DRAFT → PENDING_VERIFICATION → ACTIVE → PAUSED → ARCHIVED with guarded transitions           | `routes/lifecycle.ts`, `routes/service.integration.test.ts`                                       |
| A PAUSED / unverified / stale route refuses quote requests and never triggers payment                        | `loadUsableRoute`, `quote-request.ts` `ROUTE_UNAVAILABLE`, `v1.contract.test.ts`                  |
| Buyer request flow: structured brief, field-level validation, printer selection, live task page              | `/request`, `RequestForm.tsx`, `flow.integration.test.ts`                                         |
| Genuine supplier quote or safe decline: fixed price or range, currency, turnaround, assumptions, expiry      | `/supplier/:slug/requests`, `quotes/service.ts`, `submitQuoteRequestSchema`                       |
| Recommendation + pre-filled WhatsApp message that Intra **never sends**; human sends and pays directly       | `TaskPage.tsx` `HandoffCard` (opens `wa.me` in the buyer's own client), `quotes/order-message.ts` |
| Append-only audit trail for every state change, including failed and unavailable payment events              | `audit_events`, `appendAuditEvent`, timeline on `/tasks/:id`                                      |
| Public, agent-readable capability + quote API at `/v1` (no MCP)                                              | `docs/CAPABILITY_API.md`, `v1.contract.test.ts`                                                   |
| Idempotency on every write; a repeated `Idempotency-Key` replays the first outcome                           | `lib/http/idempotency.ts`, `api.integration.test.ts`                                              |
| No prohibited data (seed phrase, private key, BVN/NIN, card, bank login) is requested, logged, or stored     | `businesses/schema.ts`, `CLAUDE.md` §4.2, schema has no such columns                              |
| x402 payment **adapter**: 402 challenge, $0.05 server-side cap, immutable receipts, idempotent `X-PAYMENT`   | `features/payments/adapter/`, `x402.test.ts`, `v1.payment.contract.test.ts` (fake facilitator)    |
| Honest unavailable state: a paid route with no facilitator key returns `503 PAYMENT_SERVICE_UNAVAILABLE`     | `quote-request.ts`, `v1.payment.contract.test.ts` "unconfigured adapter"                          |
| Privacy-minimised experiment tracking: on-read aggregates, no session ids exposed, real vs demo kept apart   | `features/metrics/`, `report.test.ts`, `evidence.contract.test.ts`; rendered at `/evidence`       |
| Buyer confirms the handoff was sent → unlocks post-handoff feedback (genuine action, not inferred)           | `POST /api/tasks/:id/handoff-confirm`, `TaskPage.test.tsx`, `report.test.ts`                      |

## Conditional (needs external Celo access — state the dependency out loud)

| Claim                                                                        | Depends on                                                    | Honest fallback shown in the demo                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| A live x402 402 → verify → settle against the **official Celo facilitator**  | `X402_API_KEY` from the Celo x402 dashboard (`x402.celo.org`) | `503 PAYMENT_SERVICE_UNAVAILABLE`; no receipt, no hash             |
| A **SETTLED** query-fee receipt with a real transaction hash + Celoscan link | A verified mainnet transaction from the facilitator           | Receipt only ever renders `SETTLED` after facilitator verification |
| ERC-8021 attribution tag credited on the hackathon leaderboard               | Tag issued at hackathon registration → `X402_ATTRIBUTION_TAG` | Tag is absent everywhere until set; never a hard-coded literal     |
| ERC-8004 Agent ID / any claimed on-chain agent identity                      | Celo Builders registration                                    | No registration-dependent claims are made in the UI                |
| cPay (closed-beta agent marketplace) settlement                              | cPay SDK + access (no public docs yet)                        | `getPaymentAdapter()` falls back to the unavailable adapter        |
| Hosted / preview deployment                                                  | Managed Postgres `DATABASE_URL` + platform env vars           | Runs fully locally on embedded PGlite; see `docs/DEPLOYMENT.md`    |

## Not built (do not imply)

- General shopping agent, marketplace, or multi-category catalogue (MVP is
  flyer printing only — ADR-001).
- Any custody, escrow, swap, remittance, or automatic final-order payment
  (`CLAUDE.md` §4.3).
- Suppliers running their own MCP/API infrastructure (ADR-002/ADR-005).
- Native mobile app or a WhatsApp bot that sends on the buyer's behalf.
- Synchronous quotes — a supplier responds out of band within the SLA.

---

## One-line answers for judges

- **"Is the payment real?"** — The adapter, cap, receipt immutability, and 402
  flow are real and tested. Live settlement needs the official facilitator key;
  without it we return an explicit unavailable state and never fake a receipt.
- **"Did the agent actually pay on Celo in this demo?"** — Only if `X402_API_KEY`
  is set and you saw a Celoscan link. Otherwise: no, and the app said so.
- **"Can Intra place the order?"** — No, by design. The buyer sends the WhatsApp
  message and pays the printer directly.
