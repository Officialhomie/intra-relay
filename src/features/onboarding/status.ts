import { z } from "zod";

/**
 * Remote onboarding submission lifecycle (M10.1, ADR-024).
 *
 * This tracks ONE thing only: did we successfully turn a Tally webhook
 * delivery into a real Intra business — nothing about the business's own
 * commercial lifecycle lives here. Once a business exists, its readiness
 * (operator-verified, route ACTIVE / "pilot ready") is the existing
 * `businesses.status` / `quote_routes.status` — reused, not duplicated
 * (`docs/M10.1-TALLY-INTRA-ONBOARDING.md` §10 explains the split).
 *
 *   RECEIVED      signature + shape verified; not yet normalized/validated
 *   NEEDS_REVIEW  normalized data is incomplete, ambiguous, or a likely
 *                 duplicate — no business was created (never an invalid one)
 *   PROCESSED     a business (+ one route + its published pricing) now exists
 *   REJECTED      the delivery itself was invalid (bad signature, unknown
 *                 form, malformed payload) — never reached normalization
 */
export const ONBOARDING_STATUSES = ["RECEIVED", "NEEDS_REVIEW", "PROCESSED", "REJECTED"] as const;
export const onboardingStatusSchema = z.enum(ONBOARDING_STATUSES);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const ONBOARDING_STATUS_TERMINAL: readonly OnboardingStatus[] = [
  "NEEDS_REVIEW",
  "PROCESSED",
  "REJECTED",
];

/** One field-level problem found while normalizing or validating a submission. */
export interface OnboardingIssue {
  field: string;
  message: string;
}
