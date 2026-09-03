import { z } from "zod";

import { FLYER_COLOURS, FLYER_SIZES } from "@/features/routes/flyer-printing";

/**
 * The JSON contracts the model must return. Anything that does not parse against
 * these falls the run back to the deterministic path.
 *
 * The model proposes; the deterministic layer disposes. None of these schemas
 * lets the model set a price, a provider id, a validity time, or a wallet
 * address — only interpret them.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** #1 — understand a plain-language request. */
export const intentInterpretationSchema = z.object({
  /** Only "print_flyers" is handled; "other" ends the run cleanly. */
  service: z.enum(["print_flyers", "other"]),
  quantity: z.number().int().positive().max(1_000_000).nullable(),
  size: z.enum(FLYER_SIZES).nullable(),
  colour: z.enum(FLYER_COLOURS).nullable(),
  /** A short phrase, NOT a date — the deterministic parser turns it into a date. */
  deadlineText: trimmed(120).nullable(),
  deliveryArea: trimmed(120).nullable(),
  clarificationNeeded: z.boolean(),
  clarificationQuestion: trimmed(300).nullable(),
  missing: z.array(trimmed(40)).max(8),
  confidence: z.enum(["low", "medium", "high"]),
});
export type IntentInterpretation = z.infer<typeof intentInterpretationSchema>;

/** #2 — decide which of the ALLOWED providers to actually quote, and in what order. */
export const quotePlanSchema = z.object({
  quote: z.array(z.object({ businessSlug: trimmed(120), reason: trimmed(300) })).max(8),
  skip: z
    .array(z.object({ businessSlug: trimmed(120), reason: trimmed(300) }))
    .max(16)
    .default([]),
  note: trimmed(400).default(""),
});
export type QuotePlan = z.infer<typeof quotePlanSchema>;

/** #3 — pick one of the ELIGIBLE offers and explain it. */
export const offerReasoningSchema = z.object({
  selectedBusinessSlug: trimmed(120),
  reason: trimmed(600),
  tradeoffs: z.array(trimmed(300)).max(6).default([]),
  uncertainties: z.array(trimmed(300)).max(6).default([]),
});
export type OfferReasoning = z.infer<typeof offerReasoningSchema>;

/** #4 — the run has no usable offer yet; adapt or stop. */
export const replanDecisionSchema = z.object({
  action: z.enum(["requote", "stop"]),
  requoteBusinessSlugs: z.array(trimmed(120)).max(8).default([]),
  reason: trimmed(400),
});
export type ReplanDecision = z.infer<typeof replanDecisionSchema>;
