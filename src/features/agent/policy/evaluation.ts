import { normalizeTurnaround } from "@/features/quotes/normalize";

import type { ProviderCandidate } from "../types";

/**
 * Candidate evaluation foundation (M10.8, design from M10.7 §5).
 *
 * This is deliberately ADDITIVE, not a replacement for
 * `agent/policy/candidates.ts`'s `CandidateAssessment`/`planCandidates` — that
 * remains the sole thing that currently decides which candidates the agent
 * actually queries (`toQuery`/`skipped`). This module's job is narrower and
 * new: carry an explicit MATCH/NO_MATCH/UNKNOWN verdict, per constraint,
 * through to whatever eventually consumes it — a future milestone's
 * discovery loop, a trace, or a buyer-facing explanation — instead of a
 * constraint with no data simply being invisible (M10.7 §17, G-10.7-6).
 *
 * UNKNOWN is a first-class result, never silently collapsed into MATCH or
 * NO_MATCH (M10.7 §2). Only two things ever exclude a candidate outright:
 * a confirmed hard NO_MATCH, or the capability document never having been
 * read at all (mirrors `agent/policy/candidates.ts`'s existing
 * `CAPABILITIES_NOT_READ` precedent). Everything else that is merely unknown
 * downgrades confidence to `NEEDS_CONFIRMATION` rather than excluding —
 * excluding on missing DATA (as opposed to a confirmed mismatch) would punish
 * suppliers for Intra's own gaps, which is worse than asking.
 *
 * Only the constraints for which real supplier data exists today are wired:
 * category/service (trivially true — already the discovery match key),
 * availability, verification, freshness (all three already computed by
 * `routeIsQuoteReady`/`buildBusinessCapabilities`), location/service area,
 * fulfilment (pickup/delivery), and typical turnaround (all three promoted
 * from Tally onboarding in this same milestone — see `onboarding/service.ts`).
 * Minimum order, product subtype matching, and any soft/budget ranking are
 * explicitly deferred (M10.8 Part H) — there is no supplier data for the
 * first two yet, and the third needs a scoring design this milestone does
 * not attempt.
 */

export type ConstraintStatus = "MATCH" | "NO_MATCH" | "UNKNOWN";

export interface ConstraintResult {
  status: ConstraintStatus;
  /** Human-readable reason, built only from real fields — never invented. */
  detail: string;
}

export type ConstraintKey =
  | "category"
  | "service"
  | "availability"
  | "verification"
  | "freshness"
  | "location"
  | "fulfillment"
  | "turnaround"
  | "productType"
  | "minimumOrder";

export interface CandidateEvaluation {
  candidate: ProviderCandidate;
  /**
   * Only the constraints actually evaluated. A buyer-dependent constraint
   * (location, fulfillment, turnaround) is omitted entirely — not set to
   * UNKNOWN — when the buyer never stated a criterion for it, since there is
   * nothing to check against and forcing an UNKNOWN would misrepresent "not
   * asked" as "asked and unresolved."
   */
  constraints: Partial<Record<ConstraintKey, ConstraintResult>>;
  overall: {
    status: "ELIGIBLE" | "EXCLUDED" | "NEEDS_CONFIRMATION";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };
}

/**
 * The deliberately narrow M10.11 pre-quote authority boundary. Availability,
 * freshness and verification are already hard gates in CandidateAssessment;
 * this evaluator contributes only the additional fact CandidateAssessment
 * cannot know: an explicitly declared requested fulfilment method is false.
 * Location and turnaround are intentionally excluded even if their overall
 * evaluation happens to be EXCLUDED, because their evidence is not reliable
 * enough to suppress a quote request.
 */
export function authoritativeExclusion(evaluation: CandidateEvaluation): ConstraintResult | null {
  for (const key of ["fulfillment", "productType", "minimumOrder"] as const) {
    const result = evaluation.constraints[key];
    if (result?.status === "NO_MATCH") return result;
  }
  return null;
}

/** What the buyer actually stated, when they stated it. Every field is
 * optional by design (M10.7 §7) — an absent field means "not evaluated,"
 * never "evaluated and passed." */
export interface DiscoveryCriteria {
  /** The buyer's stated delivery/pickup area, free text (e.g. "Yaba"). */
  location?: string | null;
  fulfillmentPreference?: "pickup" | "delivery" | null;
  /** The buyer's stated deadline, ISO, when resolvable. */
  deadlineIso?: string | null;
  productType?: string | null;
  quantity?: number | null;
}

export function evaluateProductType(
  productType: string | null | undefined,
  supported: string[] | null | undefined,
): ConstraintResult | null {
  if (!productType) return null;
  if (!supported)
    return { status: "UNKNOWN", detail: "Supplier's supported product types are not specified." };
  const readable = productType.replace(/_/g, " ");
  return supported.includes(productType)
    ? { status: "MATCH", detail: `Supplier offers ${readable}.` }
    : { status: "NO_MATCH", detail: `Supplier does not offer ${readable}.` };
}

export function evaluateMinimumOrder(
  quantity: number | null | undefined,
  productType: string | null | undefined,
  minimumOrders: Record<string, number> | null | undefined,
): ConstraintResult | null {
  if (quantity == null || !productType) return null;
  const minimum = minimumOrders?.[productType];
  if (minimum === undefined)
    return { status: "UNKNOWN", detail: "Supplier minimum order was not specified." };
  return quantity >= minimum
    ? {
        status: "MATCH",
        detail: `Supplier accepts orders of ${minimum} or more; buyer requested ${quantity}.`,
      }
    : {
        status: "NO_MATCH",
        detail: `Supplier minimum order is ${minimum}; buyer requested ${quantity}.`,
      };
}

function normalizeAreaText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Location — M10.7 §9's conservative model. A `MATCH` requires an actual
 * substring/contains overlap between the buyer's stated location and one of
 * the supplier's declared areas. A `NO_MATCH` is never produced: two
 * free-text area names that share no overlap cannot be safely proven
 * non-overlapping without a gazetteer (explicitly out of scope — no
 * geocoding, no lat/long, no radius search), so "Ikeja" declared against a
 * buyer asking for "Yaba" reads as UNKNOWN, not excluded. A false NO_MATCH
 * (hiding a supplier who might genuinely serve the area) is worse than an
 * UNKNOWN the buyer or a human can still resolve (M10.8 Part I).
 */
export function evaluateLocation(
  serviceArea: string | null | undefined,
  buyerLocation: string | null | undefined,
): ConstraintResult | null {
  if (!buyerLocation || !buyerLocation.trim()) return null;
  if (!serviceArea || !serviceArea.trim()) {
    return { status: "UNKNOWN", detail: "Supplier has not declared a service area." };
  }

  const buyer = normalizeAreaText(buyerLocation);
  const declaredAreas = serviceArea
    .split(",")
    .map((area) => normalizeAreaText(area))
    .filter((area) => area.length > 0);
  const matchedArea = declaredAreas.find((area) => area.includes(buyer) || buyer.includes(area));

  if (matchedArea) {
    return {
      status: "MATCH",
      detail: `Supplier's declared service area ("${serviceArea}") covers "${buyerLocation}".`,
    };
  }
  return {
    status: "UNKNOWN",
    detail:
      `Supplier's declared service area ("${serviceArea}") does not mention "${buyerLocation}", ` +
      "but two area names cannot be safely proven not to overlap without a gazetteer.",
  };
}

/** Fulfilment — a real hard NO_MATCH is possible here, unlike location,
 * because a boolean flag is unambiguous once declared (M10.8 Part J). */
export function evaluateFulfillment(
  preference: "pickup" | "delivery" | null | undefined,
  fulfillment:
    { pickupAvailable: boolean | null; deliveryAvailable: boolean | null } | null | undefined,
): ConstraintResult | null {
  if (!preference) return null;
  if (!fulfillment) {
    return { status: "UNKNOWN", detail: "Supplier has not declared pickup/delivery availability." };
  }
  const flag =
    preference === "pickup" ? fulfillment.pickupAvailable : fulfillment.deliveryAvailable;
  if (flag === true) return { status: "MATCH", detail: `Supplier offers ${preference}.` };
  if (flag === false)
    return { status: "NO_MATCH", detail: `Supplier does not offer ${preference}.` };
  return {
    status: "UNKNOWN",
    detail: `Supplier has not declared whether it offers ${preference}.`,
  };
}

/**
 * Turnaround — M10.7 §11's tier 2 (a route-level "typical" figure), used only
 * as evidence before a quote exists. This never touches or replaces the
 * quote-level deadline check in `agent/policy/offers.ts`'s `scoreOffer`,
 * which stays the final authority once an actual quote's own stated
 * turnaround is known (M10.8 Part K). `route.responseSlaMinutes` (how fast a
 * supplier REPLIES with a quote) is never read here — only `typicalTurnaround`
 * (how fast they COMPLETE the job) is a legitimate input to this check.
 */
export function evaluateTurnaround(
  typicalTurnaround: string | null | undefined,
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): ConstraintResult | null {
  if (!deadlineIso) return null;
  if (!typicalTurnaround || !typicalTurnaround.trim()) {
    return { status: "UNKNOWN", detail: "Supplier has not declared a typical turnaround." };
  }

  const normalized = normalizeTurnaround(typicalTurnaround);
  const hours =
    normalized.hours ?? (normalized.businessDays !== null ? normalized.businessDays * 24 : null);
  if (hours === null) {
    return {
      status: "UNKNOWN",
      detail: `Supplier's stated turnaround ("${typicalTurnaround}") could not be interpreted.`,
    };
  }

  const deadlineMs = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineMs)) {
    return { status: "UNKNOWN", detail: "Buyer's deadline could not be interpreted." };
  }

  const hoursUntilDeadline = (deadlineMs - now.getTime()) / 3_600_000;
  if (hours > hoursUntilDeadline) {
    return {
      status: "NO_MATCH",
      detail:
        `Supplier's typical turnaround ("${typicalTurnaround}") does not clearly fit inside the ` +
        `${Math.max(0, Math.round(hoursUntilDeadline))}h left before the deadline.`,
    };
  }
  return {
    status: "MATCH",
    detail: `Supplier's typical turnaround ("${typicalTurnaround}") fits before the deadline.`,
  };
}

function evaluateAvailability(candidate: ProviderCandidate): ConstraintResult {
  if (candidate.availability === null) {
    return { status: "UNKNOWN", detail: "Capability document has not been read yet." };
  }
  return candidate.availability.acceptingQuoteRequests
    ? { status: "MATCH", detail: "Route is accepting quote requests." }
    : { status: "NO_MATCH", detail: candidate.availability.detail };
}

/** Derived from the same `RouteReadyReason` the capability document already
 * exposes (`routes/freshness.ts`). `NOT_ACTIVE`/`STALE` short-circuit before
 * `routeIsQuoteReady` ever reaches its own verification check, so those two
 * reasons read as UNKNOWN here, not MATCH — verification genuinely was not
 * checked, which is a different fact from "checked and fine." */
function evaluateVerification(candidate: ProviderCandidate): ConstraintResult {
  if (candidate.availability === null) {
    return { status: "UNKNOWN", detail: "Capability document has not been read yet." };
  }
  const { reason } = candidate.availability;
  if (reason === "NOT_VERIFIED") {
    return { status: "NO_MATCH", detail: "Route or business is not operator-verified." };
  }
  if (reason === "OK") {
    return { status: "MATCH", detail: "Route and business are operator-verified." };
  }
  return {
    status: "UNKNOWN",
    detail: "Verification was not reached before another check already failed.",
  };
}

function evaluateFreshness(candidate: ProviderCandidate): ConstraintResult {
  if (candidate.freshness === null) {
    return { status: "UNKNOWN", detail: "Capability document has not been read yet." };
  }
  return candidate.freshness.stale
    ? {
        status: "NO_MATCH",
        detail: "Price/availability data has not been reconfirmed recently enough.",
      }
    : { status: "MATCH", detail: "Price/availability data is fresh." };
}

/**
 * Evaluate one candidate against whatever criteria the buyer actually stated.
 *
 * `overall.status`:
 * - `EXCLUDED` — the capability document could not be read at all (nothing
 *   can be evaluated safely), or a hard constraint the buyer actually stated
 *   a criterion for came back a confirmed `NO_MATCH`.
 * - `NEEDS_CONFIRMATION` — no confirmed `NO_MATCH`, but at least one
 *   evaluated hard constraint is `UNKNOWN`. The honest next step for a
 *   candidate in this state is to ask the specific supplier via
 *   `requestQuote()` (M10.7 §2, §13), not to hold it back or drop it.
 * - `ELIGIBLE` — every evaluated hard constraint is `MATCH`.
 */
export function evaluateCandidate(
  candidate: ProviderCandidate,
  criteria: DiscoveryCriteria = {},
  now: Date = new Date(),
): CandidateEvaluation {
  const constraints: Partial<Record<ConstraintKey, ConstraintResult>> = {
    // Always MATCH: discovery already filtered on routeSlug (= category and
    // service, together) before a candidate ever reaches evaluation.
    category: { status: "MATCH", detail: "Category already matched during candidate retrieval." },
    service: { status: "MATCH", detail: "Route already matched during candidate retrieval." },
    availability: evaluateAvailability(candidate),
    verification: evaluateVerification(candidate),
    freshness: evaluateFreshness(candidate),
  };

  const location = evaluateLocation(candidate.serviceArea, criteria.location);
  if (location) constraints.location = location;

  const fulfillment = evaluateFulfillment(criteria.fulfillmentPreference, candidate.fulfillment);
  if (fulfillment) constraints.fulfillment = fulfillment;

  const turnaround = evaluateTurnaround(candidate.typicalTurnaround, criteria.deadlineIso, now);
  if (turnaround) constraints.turnaround = turnaround;
  const productType = evaluateProductType(criteria.productType, candidate.productTypes);
  if (productType) constraints.productType = productType;
  const minimumOrder = evaluateMinimumOrder(
    criteria.quantity,
    criteria.productType,
    candidate.minimumOrders,
  );
  if (minimumOrder) constraints.minimumOrder = minimumOrder;

  const capabilityUnread = candidate.availability === null;
  const results = Object.values(constraints);
  const hasNoMatch = results.some((result) => result.status === "NO_MATCH");
  const hasUnknown = results.some((result) => result.status === "UNKNOWN");

  const status: CandidateEvaluation["overall"]["status"] =
    capabilityUnread || hasNoMatch ? "EXCLUDED" : hasUnknown ? "NEEDS_CONFIRMATION" : "ELIGIBLE";

  // Confidence answers "how sure are we in this verdict", not "how good a
  // match is this" — an unread capability document gives no information at
  // all (LOW), while a confirmed NO_MATCH is a confident exclusion (HIGH).
  const confidence: CandidateEvaluation["overall"]["confidence"] = capabilityUnread
    ? "LOW"
    : hasNoMatch
      ? "HIGH"
      : hasUnknown
        ? "MEDIUM"
        : "HIGH";

  return { candidate, constraints, overall: { status, confidence } };
}

/**
 * A trace-safe, compact summary of one evaluation (M10.9 Part 4) — never the
 * full `CandidateEvaluation` object, which nests the entire `ProviderCandidate`
 * (freshness timestamps, payment config, etc.) that a trace has no reason to
 * repeat. Only identifiers, per-constraint status, the overall verdict, and a
 * short reason for anything short of a clean MATCH. Contains no manage
 * tokens, wallet addresses, raw Tally data, or personal information — none of
 * that exists on `ProviderCandidate` in the first place.
 */
export interface CandidateEvaluationSummary {
  businessSlug: string;
  routeSlug: string;
  constraints: Partial<Record<ConstraintKey, ConstraintStatus>>;
  overall: CandidateEvaluation["overall"];
  /** One line per constraint that is not a clean MATCH — the interesting cases. */
  reasons: string[];
}

export function summarizeForTrace(evaluation: CandidateEvaluation): CandidateEvaluationSummary {
  const constraints: Partial<Record<ConstraintKey, ConstraintStatus>> = {};
  const reasons: string[] = [];
  for (const [key, result] of Object.entries(evaluation.constraints) as Array<
    [ConstraintKey, ConstraintResult]
  >) {
    constraints[key] = result.status;
    if (result.status !== "MATCH") reasons.push(`${key}: ${result.detail}`);
  }
  return {
    businessSlug: evaluation.candidate.businessSlug,
    routeSlug: evaluation.candidate.routeSlug,
    constraints,
    overall: evaluation.overall,
    reasons,
  };
}
