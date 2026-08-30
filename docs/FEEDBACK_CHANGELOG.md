# What changed from feedback

The running record of product changes made in response to review feedback,
kept for the **AskBots review rounds** track (PRD §3: "AskBots review score —
positive delta across two rounds").

## Rules

- Only **genuine, already-shipped** changes with a traceable artefact (an ADR, a
  commit, or a file path) are listed. No invented feedback, scores, or reviewers
  (`CLAUDE.md` §4.1).
- The machine-readable copy is
  [`src/features/metrics/feedback-changelog.ts`](../src/features/metrics/feedback-changelog.ts);
  it is rendered on the public [`/evidence`](../src/app/evidence/page.tsx) page
  and included in the JSON/CSV export. Keep the two in sync.
- When the AskBots CLI is connected, each review round appends entries with
  `source: "askbots-round-N"` and a one-line note on the score delta.

## Log

| Date       | Source           | Feedback → change                                                                                                                                                   | Evidence                                                 |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-08-29 | design-review    | Dark, high-contrast visual directions felt wrong for a trust-first tool for non-crypto users → adopted the calm, light "Ease Health" system, no dark mode.          | ADR-009; `src/styles/tokens.css`                         |
| 2026-08-29 | product-owner    | "Do not implement MCP yet — prove the REST route contract first" → shipped `/v1` as REST only; MCP documented as a later, non-blocking step.                        | ADR-010; `docs/CAPABILITY_API.md`                        |
| 2026-08-30 | safety-review    | "Never show a payment as settled without a real on-chain transaction" → SETTLED requires facilitator-verified tx hash; no key ⇒ explicit 503; receipts insert-only. | ADR-004, ADR-011; `src/features/payments/adapter/`       |
| 2026-08-30 | internal-dogfood | Onboarding draft said "Demo only — not stored anywhere", reading as if the whole product were fake → reworded; removed scaffold/placeholder language app-wide.      | ADR-012; `src/features/businesses/DraftRoutePreview.tsx` |
| 2026-08-30 | product-owner    | "Suppliers should not self-publish routes" → onboarding produces a DRAFT only; activation needs an operator key + a six-point server-enforced checklist.            | ADR-005, ADR-008; `src/features/routes/service.ts`       |

## AskBots review rounds

_None yet — the AskBots CLI and account are not set up
(`docs/DEVELOPMENT_WORKFLOW.md` §9). Rounds are appended here and to the TS copy
once that track is live._
