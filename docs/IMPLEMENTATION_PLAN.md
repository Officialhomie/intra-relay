# Intra — Implementation Plan

## Phase 0 — Registration and dependency checks

1. Create/confirm public GitHub repository.
2. Register through the official Celo Builders process with: Intra project name, repo URL, Telegram handle, Nigeria, Real World Adoption primary track, ERC-8004 Agent ID, agent wallet(s), and `buy` beta opt-in.
3. Record the returned ERC-8021 attribution tag before any claimed mainnet activity.
4. Recruit two printers and ten buyer testers from the existing community. Do not fund/create wallet activity for leaderboard purposes.

**Exit criterion:** repository, registration evidence, Agent ID, attribution tag, and `buy` status are documented.

## Phase 1 — Supplier onboarding (Days 1–2)

- Define database models and Zod schemas.
- Implement supplier form, consent, EVM-address validation, route template, and operator verification.
- Add printing route API documentation.

**Exit criterion:** one printer can be onboarded and activated without code.

## Phase 2 — Buyer flow and real quote operation (Days 3–4)

- Build `/`, `/request`, task-status page, supplier review, and operator view.
- Implement brief validation, quote response, recommendation, WhatsApp handoff, and feedback.

**Exit criterion:** a buyer requests, receives, and approves a real printer quote.

## Phase 3 — Agent/payment proof (Days 5–7)

- Implement bounded agent tools and a $0.05 server-enforced cap.
- Integrate official x402/`buy` implementation only after credentials/access.
- Add verified receipt timeline and attribution-tag helper.

**Exit criterion:** genuine low-value mainnet settlement with receipt, or a correct explicit unavailable state.

## Phase 4 — Real-user iteration (Days 8–11)

- Recruit community users, record feedback, and keep supplier prices current.
- Run AskBots round one, turn feedback into requirements-linked issues, fix them, then run round two.

**Exit criterion:** 10 tests, two active suppliers, documented product changes, and returning user evidence where possible.

## Phase 5 — Submission (Days 12–15)

- Verify transaction legitimacy/mainnet/attribution before claiming it.
- Record demo: request → agent activity/payment receipt → quote → human-controlled handoff.
- Finalise README, architecture/evidence table, and limitations.

## Initial backlog

| Priority | ID | Deliverable |
|---|---|---|
| P0 | INF-001 | project config, CI, environment documentation |
| P0 | SUP-001 | onboarding/consent/address validation |
| P0 | ROUTE-001 | quote route schema/lifecycle |
| P0 | TASK-001 | buyer flyer brief |
| P0 | QUOTE-001 | manual quote and recommendation |
| P0 | HANDOFF-001 | WhatsApp handoff |
| P0 | SAFE-001 | secrets/data safety controls |
| P1 | PAY-001 | verified x402 integration |
| P1 | CHAIN-001 | Agent ID/attribution integration |
| P1 | MET-001 | adoption metrics export |
| P1 | REV-001 | AskBots iteration |
| P2 | MCP-001 | MCP adapter for active routes |

## Definition of done

A feature is complete only when its PRD acceptance and failure states are tested, its mobile behavior is checked, its requirement ID is referenced in implementation notes, and it contains no fabricated payment or merchant evidence.
