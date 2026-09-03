import { z } from "zod";

/**
 * Quote lifecycle (PRD §7, extended for quote integrity in milestone 5).
 *
 *   PENDING    ─ placeholder for a request with no answer yet
 *   RECEIVED   ─ a real offer from the business
 *   PROPOSED   ─ a price change the business wants to make to an ACCEPTED
 *                offer. It is NOT in force: the accepted offer still stands
 *                until the buyer explicitly decides on the change.
 *   SUPERSEDED ─ replaced by a newer offer the buyer has seen
 *   WITHDRAWN  ─ a PROPOSED change the buyer refused, or the business pulled
 *   EXPIRED    ─ the business no longer guarantees this price
 *   DECLINED   ─ the business turned the job down
 *
 * The integrity rule the whole module exists to hold: once a buyer has accepted
 * an offer, that row is immutable. A business that needs a different price
 * creates a PROPOSED one; it never edits the agreed terms.
 */
export const QUOTE_STATUSES = [
  "PENDING",
  "RECEIVED",
  "PROPOSED",
  "SUPERSEDED",
  "WITHDRAWN",
  "EXPIRED",
  "DECLINED",
] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

/** Statuses that represent an offer a buyer could act on right now. */
export const LIVE_QUOTE_STATUSES: readonly QuoteStatus[] = ["RECEIVED"];

/** Statuses that are finished — no further movement. */
export const CLOSED_QUOTE_STATUSES: readonly QuoteStatus[] = [
  "SUPERSEDED",
  "WITHDRAWN",
  "DECLINED",
];

export function isLiveQuote(status: QuoteStatus): boolean {
  return LIVE_QUOTE_STATUSES.includes(status);
}

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

/** Plain-language status, for a buyer. Never shows the enum. */
export const QUOTE_STATUS_COPY: Record<QuoteStatus, string> = {
  PENDING: "Waiting for a price",
  RECEIVED: "Current offer",
  PROPOSED: "Change proposed — needs your decision",
  SUPERSEDED: "Replaced by a newer price",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired — the business no longer guarantees this price",
  DECLINED: "The business turned this job down",
};
