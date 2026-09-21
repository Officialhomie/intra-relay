import { normalizeTurnaround } from "@/features/quotes/normalize";

import type { BuyerIntent, DecisionReason, ProviderOffer, ScoredOffer } from "../types";

/**
 * Post-quote reasoning: rank the offers that actually came back from humans and
 * pick one to put in front of the buyer.
 *
 * Deterministic and explainable by construction — every point of score has a
 * sentence attached, because the approval card and the audit trail both show
 * *why*, not just *which* (observability requirement).
 *
 * This never accepts anything. Selection is a recommendation; the human decides
 * (BR-001, FR-REC-002).
 */

/** A quote expiring sooner than this is usable but flagged. */
export const EXPIRY_COMFORT_MINUTES = 60;

function turnaroundHours(raw: string): number | null {
  const t = normalizeTurnaround(raw);
  if (t.hours !== null) return t.hours;
  if (t.businessDays !== null) return t.businessDays * 24;
  return null;
}

function minutesUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return (at - now.getTime()) / 60_000;
}

function hoursUntil(iso: string | null, now: Date): number | null {
  const minutes = minutesUntil(iso, now);
  return minutes === null ? null : minutes / 60;
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function sameComparableCurrency(a: ScoredOffer, b: ScoredOffer): boolean {
  return a.offer.currency === b.offer.currency;
}

function preferenceComparator(
  intent: BuyerIntent,
): ((a: ScoredOffer, b: ScoredOffer) => number) | null {
  switch (intent.optimization) {
    case "CHEAPEST":
      return (a, b) => (sameComparableCurrency(a, b) ? a.totalMin - b.totalMin : 0);
    case "FASTEST":
    case "EARLIEST":
      return (a, b) => {
        if (a.turnaroundHours === null || b.turnaroundHours === null) return 0;
        return a.turnaroundHours - b.turnaroundHours;
      };
    case "WITHIN_BUDGET":
      return (a, b) => {
        const budget = intent.budget;
        if (!budget || a.offer.currency !== budget.currency || b.offer.currency !== budget.currency)
          return 0;
        const aWithin = a.totalMin <= budget.amount;
        const bWithin = b.totalMin <= budget.amount;
        if (aWithin !== bWithin) return aWithin ? -1 : 1;
        return aWithin ? a.totalMin - b.totalMin : 0;
      };
    // BEST_VALUE intentionally keeps the balanced score. AVAILABLE_NOW has no
    // offer-level immediate-availability fact, and NEAREST has no trustworthy
    // distance signal. Both must retain the default rather than invent one.
    case "BEST_VALUE":
    case "AVAILABLE_NOW":
    case "NEAREST":
    default:
      return null;
  }
}

function preferenceExplanation(intent: BuyerIntent, selected: ScoredOffer): string | null {
  switch (intent.optimization) {
    case "CHEAPEST":
      return "Chosen because it has the lowest comparable total price.";
    case "FASTEST":
      return "Chosen because it has the fastest stated turnaround.";
    case "EARLIEST":
      return "Chosen because it has the earliest stated completion time.";
    case "WITHIN_BUDGET":
      return intent.budget &&
        selected.offer.currency === intent.budget.currency &&
        selected.totalMin <= intent.budget.amount
        ? "Chosen because it is within the stated budget."
        : "No comparable offer could be confirmed within the stated budget, so the balanced ranking was retained.";
    case "BEST_VALUE":
      return "Ranked using Intra's balanced best-value comparison.";
    case "AVAILABLE_NOW":
      return "Immediate availability is not stated on comparable offers, so the balanced ranking was retained.";
    case "NEAREST":
      return "Distance is not available from the declared areas, so the balanced ranking was retained.";
    default:
      return null;
  }
}

export function scoreOffer(
  offer: ProviderOffer,
  intent: BuyerIntent,
  now: Date = new Date(),
): ScoredOffer {
  const reasons: DecisionReason[] = [];
  const disqualifiers: DecisionReason[] = [];

  const delivery = offer.deliveryCharge ?? 0;
  const totalMin = offer.amountMin + delivery;
  const totalMax = offer.amountMax != null ? offer.amountMax + delivery : null;
  const hours = turnaroundHours(offer.turnaround);
  const validForMinutes = minutesUntil(offer.expiresAt, now);

  if (offer.status === "DECLINED") {
    disqualifiers.push({
      code: "DECLINED",
      statement: `${offer.businessName} declined${offer.declineReason ? `: ${offer.declineReason}` : "."}`,
    });
  }
  if (offer.status === "EXPIRED" || (validForMinutes !== null && validForMinutes <= 0)) {
    disqualifiers.push({
      code: "QUOTE_EXPIRED",
      statement: `${offer.businessName}'s quote has expired and must be re-requested before it can be used.`,
    });
  }

  // Deadline feasibility — the reason the buyer gave a "before Friday" at all.
  const deadlineHours = hoursUntil(intent.deadline, now);
  if (deadlineHours !== null && hours !== null) {
    if (hours > deadlineHours) {
      disqualifiers.push({
        code: "MISSES_DEADLINE",
        statement:
          `${offer.businessName}'s stated turnaround of ${offer.turnaround} does not fit the ` +
          `${Math.round(deadlineHours)}h left before the deadline.`,
      });
    } else {
      reasons.push({
        code: "MEETS_DEADLINE",
        statement: `${offer.businessName} can deliver in ${offer.turnaround}, inside the ${Math.round(deadlineHours)}h available.`,
      });
    }
  }

  let score = 0;

  // Cheaper is better, but price is only one term — a cheap quote that misses
  // the deadline is already disqualified above.
  if (totalMin > 0) {
    score += 10_000 / totalMin;
    reasons.push({
      code: "PRICE",
      statement: `Total ${money(offer.currency, totalMin)}${
        totalMax != null ? `–${money(offer.currency, totalMax)}` : ""
      } including delivery.`,
    });
  }

  if (hours !== null) {
    score += Math.max(0, 120 - hours);
    reasons.push({
      code: "TURNAROUND",
      statement: `Stated turnaround ${offer.turnaround}.`,
    });
  }

  if (offer.fixed) {
    score += 40;
    reasons.push({
      code: "FIXED_PRICE",
      statement: `${offer.businessName} marked this a fixed price rather than an estimate.`,
    });
  } else {
    reasons.push({
      code: "ESTIMATE_ONLY",
      statement: `${offer.businessName} marked this an estimate, so the final price can still move.`,
    });
  }

  const confidenceBonus = { high: 30, medium: 15, low: 0 } as const;
  if (offer.confidence) {
    score += confidenceBonus[offer.confidence];
    reasons.push({
      code: "CONFIDENCE",
      statement: `The printer's stated confidence is ${offer.confidence}.`,
    });
  }

  // A quote with more validity left is worth more, because the buyer needs time
  // to actually approve it before it lapses.
  if (validForMinutes !== null && validForMinutes > 0) {
    score += Math.min(60, validForMinutes / 10);
    if (validForMinutes < EXPIRY_COMFORT_MINUTES) {
      reasons.push({
        code: "EXPIRES_SOON",
        statement: `This quote lapses in about ${Math.round(validForMinutes)} minutes — approve promptly or it must be re-requested.`,
      });
    } else {
      reasons.push({
        code: "VALIDITY",
        statement: `Valid for about ${Math.round(validForMinutes / 60)}h more.`,
      });
    }
  } else if (offer.expiresAt === null) {
    reasons.push({
      code: "NO_EXPIRY",
      statement: `${offer.businessName} gave no expiry, so treat the price as indicative only.`,
    });
  }

  return {
    offer,
    score: Math.round(score * 100) / 100,
    eligible: disqualifiers.length === 0,
    reasons,
    disqualifiers,
    totalMin,
    totalMax,
    turnaroundHours: hours,
    validForMinutes,
  };
}

export interface OfferSelection {
  ranked: ScoredOffer[];
  eligible: ScoredOffer[];
  selected: ScoredOffer | null;
  /** The sentence shown on the approval card and stored on the decision. */
  selectionReason: string;
  /** What the agent could not stand behind. Never omitted. */
  uncertainties: string[];
}

export function selectOffer(
  offers: ProviderOffer[],
  intent: BuyerIntent,
  now: Date = new Date(),
): OfferSelection {
  const comparator = preferenceComparator(intent);
  const ranked = offers
    .map((offer) => scoreOffer(offer, intent, now))
    .sort((a, b) => {
      const preferred = comparator?.(a, b) ?? 0;
      return preferred !== 0 ? preferred : b.score - a.score;
    });
  const eligible = ranked.filter((item) => item.eligible);
  const selected = eligible[0] ?? null;

  if (!selected) {
    return {
      ranked,
      eligible,
      selected: null,
      selectionReason:
        ranked.length === 0
          ? "No printer returned a quote, so there is nothing to recommend."
          : `No quote is usable. ${ranked
              .flatMap((item) => item.disqualifiers.map((d) => d.statement))
              .join(" ")}`,
      uncertainties: [],
    };
  }

  const runnerUp = eligible[1] ?? null;
  const parts = [
    `${selected.offer.businessName} at ${money(selected.offer.currency, selected.totalMin)}` +
      (selected.turnaroundHours !== null
        ? `, turnaround ${selected.offer.turnaround}`
        : ` (turnaround "${selected.offer.turnaround}")`),
  ];

  if (runnerUp) {
    const diff = selected.totalMin - runnerUp.totalMin;
    const pct = runnerUp.totalMin > 0 ? Math.abs((diff / runnerUp.totalMin) * 100) : 0;
    if (diff > 0) {
      parts.push(
        `chosen over ${runnerUp.offer.businessName} despite costing ${pct.toFixed(0)}% more, because ` +
          (selected.turnaroundHours !== null &&
          runnerUp.turnaroundHours !== null &&
          selected.turnaroundHours < runnerUp.turnaroundHours
            ? `it is ${Math.round(runnerUp.turnaroundHours - selected.turnaroundHours)}h faster`
            : `it scored higher on price basis, confidence and remaining validity`),
      );
    } else {
      parts.push(
        `chosen over ${runnerUp.offer.businessName}, which quoted ${money(runnerUp.offer.currency, runnerUp.totalMin)}`,
      );
    }
  } else {
    parts.push("the only usable quote received");
  }

  const uncertainties = [
    "Intra has not independently verified this price, availability or turnaround.",
    ...(selected.offer.fixed ? [] : ["This is an estimate, not a committed price."]),
    ...(selected.validForMinutes !== null && selected.validForMinutes < EXPIRY_COMFORT_MINUTES
      ? ["The quote lapses within the hour."]
      : []),
    ...(selected.offer.expiresAt === null ? ["No expiry was given with this quote."] : []),
  ];

  const preference = preferenceExplanation(intent, selected);
  if (preference) {
    selected.reasons.push({ code: "BUYER_PREFERENCE", statement: preference });
  }

  return {
    ranked,
    eligible,
    selected,
    selectionReason: `${parts.join(" — ")}.${preference ? ` ${preference}` : ""}`,
    uncertainties,
  };
}
