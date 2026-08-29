import { z } from "zod";

/** Quote lifecycle (PRD §7). */
export const QUOTE_STATUSES = ["PENDING", "RECEIVED", "EXPIRED", "DECLINED"] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const QUOTE_CONFIDENCE = ["low", "medium", "high"] as const;
export const quoteConfidenceSchema = z.enum(QUOTE_CONFIDENCE);
export type QuoteConfidence = z.infer<typeof quoteConfidenceSchema>;
