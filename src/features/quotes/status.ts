import { z } from "zod";

/** Quote lifecycle (PRD §7). */
export const QUOTE_STATUSES = ["PENDING", "RECEIVED", "EXPIRED", "DECLINED"] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const QUOTE_CONFIDENCE = ["low", "medium", "high"] as const;
export const quoteConfidenceSchema = z.enum(QUOTE_CONFIDENCE);
export type QuoteConfidence = z.infer<typeof quoteConfidenceSchema>;

/**
 * The buyer's explicit choice once a real quote is in front of them (PRD §8).
 * This is distinct from the quote existing and from the buyer sending the
 * WhatsApp handoff — three separately recorded events.
 */
export const BUYER_DECISIONS = ["ACCEPTED", "DECLINED"] as const;
export const buyerDecisionSchema = z.enum(BUYER_DECISIONS);
export type BuyerDecision = z.infer<typeof buyerDecisionSchema>;
