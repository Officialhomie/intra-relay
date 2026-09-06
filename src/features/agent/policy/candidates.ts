import { PAYMENT_MAX_FEE_USD } from "@/features/payments/adapter/config";

import type { DecisionReason, ProviderCandidate } from "../types";

/**
 * Pre-quote reasoning: of the providers we discovered, which are worth actually
 * querying, and is a solicitation fee worth paying?
 *
 * This is deliberately pure and deterministic. The LLM plans *which tools to
 * call*; it does not get to decide whether a stale route is trustworthy or
 * whether we are over budget. Those are policy, they must be auditable, and
 * they must produce the same answer twice (NFR-REL-001).
 */

/** Below this much remaining price-freshness, prefer a fresh quote. */
export const FRESHNESS_PREFERRED_MAX_AGE_HOURS = 48;

export interface CandidateAssessment {
  candidate: ProviderCandidate;
  queryable: boolean;
  /** Query-fee cost in USD, 0 for a free route. */
  feeUsd: number;
  priority: number;
  reasons: DecisionReason[];
  disqualifiers: DecisionReason[];
}

export interface CandidatePlan {
  assessed: CandidateAssessment[];
  /** In the order the agent should query them. */
  toQuery: CandidateAssessment[];
  skipped: CandidateAssessment[];
  budgetUsd: number;
  committedFeeUsd: number;
  notes: DecisionReason[];
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

function assess(candidate: ProviderCandidate, now: Date): CandidateAssessment {
  const reasons: DecisionReason[] = [];
  const disqualifiers: DecisionReason[] = [];

  // Unknown availability is not the same as unavailable — it means the agent
  // has not read the capability document yet and must do so before deciding.
  if (candidate.availability === null) {
    disqualifiers.push({
      code: "CAPABILITIES_NOT_READ",
      statement: `We could not check whether ${candidate.businessName} is available, so it was left out.`,
    });
  } else if (!candidate.availability.acceptingQuoteRequests) {
    disqualifiers.push({
      code: `UNAVAILABLE_${candidate.availability.reason}`,
      statement: `${candidate.businessName} is not accepting quote requests: ${candidate.availability.detail}`,
    });
  } else {
    reasons.push({
      code: "AVAILABLE",
      statement: `${candidate.businessName} is verified and taking requests.`,
    });
  }

  if (candidate.freshness?.stale) {
    disqualifiers.push({
      code: "PRICE_STALE",
      statement: `${candidate.businessName} has not confirmed its prices recently enough to quote from, so it was left out.`,
    });
  }

  const ageHours = hoursSince(candidate.freshness?.priceConfirmedAt ?? null, now);
  if (ageHours !== null) {
    reasons.push({
      code: "PRICE_AGE",
      statement: `${candidate.businessName} last confirmed its prices ${Math.round(ageHours)} hours ago.`,
    });
  }

  const feeUsd = candidate.payment?.queryFeeUsd ?? 0;
  if (feeUsd > 0 && candidate.payment && !candidate.payment.available) {
    disqualifiers.push({
      code: "PAYMENT_UNAVAILABLE",
      statement: `${candidate.businessName} charges a small fee to answer, and that fee cannot be paid right now — so it was left out and nothing was spent.`,
    });
  }
  if (feeUsd > PAYMENT_MAX_FEE_USD) {
    disqualifiers.push({
      code: "FEE_ABOVE_HARD_CAP",
      statement: `${candidate.businessName} asks $${feeUsd.toFixed(3)} to answer, more than the $${PAYMENT_MAX_FEE_USD.toFixed(2)} this agent is ever allowed to spend.`,
    });
  }

  // Prefer fresher prices, then a faster stated response SLA. Both are things
  // the agent can actually observe before spending anything.
  const freshnessScore = ageHours === null ? 0 : Math.max(0, 100 - ageHours);
  const slaScore =
    candidate.responseSlaMinutes === null ? 0 : Math.max(0, 100 - candidate.responseSlaMinutes / 5);

  return {
    candidate,
    queryable: disqualifiers.length === 0,
    feeUsd,
    priority: Math.round(freshnessScore * 2 + slaScore),
    reasons,
    disqualifiers,
  };
}

/**
 * Decide who to query, in what order, and stop when the run's fee budget is
 * exhausted. `budgetUsd` is the run's cap; the per-query hard cap
 * (`PAYMENT_MAX_FEE_USD`) is enforced separately and cannot be raised.
 */
export function planCandidates(
  candidates: ProviderCandidate[],
  options: { budgetUsd: number; maxProviders?: number; now?: Date },
): CandidatePlan {
  const now = options.now ?? new Date();
  const maxProviders = options.maxProviders ?? 3;
  const notes: DecisionReason[] = [];

  const assessed = candidates
    .map((candidate) => assess(candidate, now))
    .sort((a, b) => b.priority - a.priority);

  if (assessed.length === 0) {
    notes.push({
      code: "NO_PROVIDERS",
      statement: "No printers offer this service right now.",
    });
  }

  const toQuery: CandidateAssessment[] = [];
  const skipped: CandidateAssessment[] = [];
  let committedFeeUsd = 0;

  for (const item of assessed) {
    if (!item.queryable) {
      skipped.push(item);
      continue;
    }
    if (toQuery.length >= maxProviders) {
      skipped.push(item);
      item.disqualifiers.push({
        code: "ENOUGH_QUOTES",
        statement: `Left out ${item.candidate.businessName}: ${maxProviders} printers is already enough to compare.`,
      });
      continue;
    }
    // "Is this solicitation fee worth paying?" — a real economic decision, made
    // against a budget rather than assumed away.
    if (committedFeeUsd + item.feeUsd > options.budgetUsd) {
      skipped.push(item);
      item.disqualifiers.push({
        code: "OVER_RUN_BUDGET",
        statement:
          `Left out ${item.candidate.businessName}: its $${item.feeUsd.toFixed(3)} fee to answer would take this run ` +
          `over its $${options.budgetUsd.toFixed(2)} budget.`,
      });
      continue;
    }
    committedFeeUsd += item.feeUsd;
    toQuery.push(item);
  }

  if (toQuery.length > 0) {
    notes.push({
      code: "QUERY_PLAN",
      statement:
        committedFeeUsd > 0
          ? `Asking ${toQuery.length} of ${assessed.length} printers for a price, for $${committedFeeUsd.toFixed(3)} of a $${options.budgetUsd.toFixed(2)} budget.`
          : `Asking ${toQuery.length} of ${assessed.length} printers for a price. None of them charge to answer.`,
    });
  } else if (assessed.length > 0) {
    notes.push({
      code: "NO_QUERYABLE_PROVIDERS",
      statement: "Every printer was ruled out before anything was spent.",
    });
  }

  return { assessed, toQuery, skipped, budgetUsd: options.budgetUsd, committedFeeUsd, notes };
}
