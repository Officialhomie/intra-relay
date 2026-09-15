/**
 * Buyer-agent domain types.
 *
 * The agent is a *consumer* of Intra's public surface. It reads the same
 * capability documents and posts to the same `/v1` and `/api` endpoints an
 * external agent would, and never touches the database directly — that
 * separation is what makes the demo honest (PRODUCT_VISION §3.1 "channel-neutral").
 */

/** What the human asked for, parsed into the flyer-printing brief (ADR-001). */
export interface BuyerIntent {
  raw: string;
  quantity: number | null;
  /** ISO date the buyer needs it by, when one was given. */
  deadline: string | null;
  size: string | null;
  colour: string | null;
  deliveryArea: string | null;
  /**
   * How the buyer wants to receive it, when they said (M10.9). Feeds the
   * candidate-evaluation foundation's fulfilment constraint
   * (`agent/policy/evaluation.ts`) — advisory only, does not affect quote
   * eligibility yet.
   */
  fulfillmentPreference: "pickup" | "delivery" | null;
  /** Hard cap on agent query-fee spend for this run, in USD. */
  maxQueryFeeUsd: number;
}

/** A provider the agent found and may query. Pre-quote — no price yet. */
export interface ProviderCandidate {
  businessSlug: string;
  businessName: string;
  routeSlug: string;
  routeName: string;
  city: string | null;
  country: string | null;
  responseSlaMinutes: number | null;
  quoteCurrency: string | null;
  priceUpdatedAt: string | null;
  /** From the capability document, when the agent has fetched it. */
  availability: {
    state: "AVAILABLE" | "UNAVAILABLE";
    acceptingQuoteRequests: boolean;
    reason: string;
    detail: string;
  } | null;
  freshness: {
    priceConfirmedAt: string | null;
    staleAfter: string | null;
    stale: boolean;
  } | null;
  payment: {
    queryFeeUsd: number;
    available: boolean;
    state: string;
  } | null;
  /**
   * Discovery-relevant fulfilment/location facts (M10.8). `null` until the
   * capability document has been read (same convention as `availability` /
   * `freshness` / `payment` above) — never inferred, never defaulted.
   */
  serviceArea: string | null;
  fulfillment: { pickupAvailable: boolean | null; deliveryAvailable: boolean | null } | null;
  /** How fast this business typically COMPLETES a job — not `responseSlaMinutes`. */
  typicalTurnaround: string | null;
}

/** A quote that actually came back from a human. Post-quote. */
export interface ProviderOffer {
  businessSlug: string;
  businessName: string;
  routeSlug: string;
  taskId: string;
  status: "RECEIVED" | "DECLINED" | "EXPIRED";
  currency: string;
  amountMin: number;
  amountMax: number | null;
  deliveryCharge: number | null;
  fixed: boolean;
  turnaround: string;
  confidence: "low" | "medium" | "high" | null;
  /** When the printer issued this quote. */
  issuedAt: string | null;
  expiresAt: string | null;
  availabilityNote: string | null;
  declineReason: string | null;
}

/** Why the agent did something. Structured, never model chain-of-thought. */
export interface DecisionReason {
  code: string;
  /** One sentence a human can read in the trace and the approval card. */
  statement: string;
}

export interface ScoredOffer {
  offer: ProviderOffer;
  /** Higher is better. Comparable only within one run. */
  score: number;
  eligible: boolean;
  reasons: DecisionReason[];
  disqualifiers: DecisionReason[];
  totalMin: number;
  totalMax: number | null;
  turnaroundHours: number | null;
  /** Minutes of validity left on the quote, null when no expiry was given. */
  validForMinutes: number | null;
}
