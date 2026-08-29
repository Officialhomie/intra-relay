import { z } from "zod";

/**
 * The operator's recorded pre-activation checks (PRD: "requires recorded
 * consent, tested contact channel, verified public address, genuine dated price
 * source, agreed SLA, and sample request test before activation").
 *
 * Client-safe: no database imports.
 */
export const activationChecklistSchema = z.object({
  consentRecorded: z.boolean(),
  contactChannelTested: z.boolean(),
  publicAddressVerified: z.boolean(),
  priceSourceDated: z.boolean(),
  slaAgreed: z.boolean(),
  sampleRequestTested: z.boolean(),
});
export type ActivationChecklist = z.infer<typeof activationChecklistSchema>;

export const ACTIVATION_CHECKS = [
  "consentRecorded",
  "contactChannelTested",
  "publicAddressVerified",
  "priceSourceDated",
  "slaAgreed",
  "sampleRequestTested",
] as const;

export const ACTIVATION_CHECK_LABELS: Record<keyof ActivationChecklist, string> = {
  consentRecorded: "Quote-display consent is recorded",
  contactChannelTested: "Order channel tested and reachable",
  publicAddressVerified: "Public payout address verified (ownership confirmed off-chain)",
  priceSourceDated: "Genuine, dated price source seen",
  slaAgreed: "Response SLA agreed with the supplier",
  sampleRequestTested: "Sample request run through the route",
};
