/**
 * "What changed from feedback" — the running log for AskBots review rounds
 * (PRD §3 "AskBots review score: positive delta across two rounds").
 *
 * ONLY genuine, already-shipped changes with a traceable source belong here.
 * Each entry names the feedback that triggered it and the artefact that proves
 * it landed (an ADR, a commit, or a file). When the AskBots CLI is connected,
 * each review round appends its own entries with `source: "askbots-round-N"`.
 * Do not invent review feedback or scores (CLAUDE.md §4.1).
 *
 * The human-readable version is docs/FEEDBACK_CHANGELOG.md; this file is the
 * copy rendered on /evidence and served in the JSON/CSV export.
 */

export type FeedbackSource =
  | "product-owner"
  | "design-review"
  | "safety-review"
  | "internal-dogfood"
  | `askbots-round-${number}`;

export interface FeedbackChangeEntry {
  /** ISO date (YYYY-MM-DD) the change landed. */
  date: string;
  source: FeedbackSource;
  /** The observation or request that prompted the change. */
  feedback: string;
  /** What actually changed in the product. */
  change: string;
  /** Where to verify it: an ADR id, a commit subject, or a path. */
  evidence: string;
}

export const FEEDBACK_CHANGELOG: FeedbackChangeEntry[] = [
  {
    date: "2026-08-29",
    source: "design-review",
    feedback:
      "Reviewed several supplied visual directions; the dark, high-contrast options felt wrong for a trust-first tool aimed at non-crypto users.",
    change:
      "Adopted the calm, light 'Ease Health' system: warm off-white canvas, one forest-green action colour, hairline borders, status always paired with an icon and label. No dark mode.",
    evidence: "ADR-009; src/styles/tokens.css",
  },
  {
    date: "2026-08-29",
    source: "product-owner",
    feedback: "Do not implement MCP yet — prove the REST route contract with real buyers first.",
    change:
      "Shipped the public agent-readable capability + quote API at /v1 as REST only; documented the MCP adapter as a later, non-blocking step.",
    evidence: "ADR-010; docs/CAPABILITY_API.md",
  },
  {
    date: "2026-08-30",
    source: "safety-review",
    feedback:
      "A demo must never show a payment as settled without a real on-chain transaction behind it.",
    change:
      "Payments render as SETTLED only after the official facilitator verifies a transaction hash; with no facilitator key a paid route returns an explicit 503 unavailable state. Receipts are insert-only.",
    evidence: "ADR-004, ADR-011; src/features/payments/adapter/",
  },
  {
    date: "2026-08-30",
    source: "internal-dogfood",
    feedback:
      "The onboarding draft preview said 'Demo only — not stored anywhere', which read as if the whole product were fake.",
    change:
      "Reworded to explain the draft is unsaved until submitted and still needs operator verification; removed leftover scaffold and placeholder language across the app.",
    evidence: "ADR-012; src/features/businesses/DraftRoutePreview.tsx",
  },
  {
    date: "2026-08-30",
    source: "product-owner",
    feedback:
      "Suppliers should not self-publish routes; an operator has to verify consent, contact, and the payout address first.",
    change:
      "Onboarding produces a reviewable DRAFT only. Activation requires an operator key and a six-point pre-activation checklist enforced server-side.",
    evidence: "ADR-005, ADR-008; src/features/routes/service.ts",
  },
];
