import type { OptimizationPreference } from "./types";

/**
 * Reading how someone wants options weighed, and explaining it back in words
 * (milestone 6 §8). The internal ranking is never exposed as a formula or an
 * enum — the person hears a sentence about what was prioritised.
 */

const PATTERNS: ReadonlyArray<{ re: RegExp; pref: OptimizationPreference }> = [
  {
    re: /\b(cheapest|cheap|lowest price|least expensive|most affordable|affordable|budget option|save money)\b/i,
    pref: "CHEAPEST",
  },
  { re: /\b(nearest|closest|near me|nearby|around here|walking distance)\b/i, pref: "NEAREST" },
  { re: /\b(fastest|quickest|express|rush|as fast as possible|asap)\b/i, pref: "FASTEST" },
  { re: /\b(earliest|soonest|first available)\b/i, pref: "EARLIEST" },
  {
    re: /\b(open now|available now|right now|currently open|can do it today)\b/i,
    pref: "AVAILABLE_NOW",
  },
  { re: /\b(best value|value for money|best deal|worth it|bang for)\b/i, pref: "BEST_VALUE" },
  {
    re: /\b(within|under|below|less than|max(?:imum)?|no more than)\b.*\b(budget|₦|\$|naira|k\b|\d)/i,
    pref: "WITHIN_BUDGET",
  },
];

export function readOptimization(text: string): OptimizationPreference | null {
  for (const { re, pref } of PATTERNS) {
    if (re.test(text)) return pref;
  }
  return null;
}

/** A plain-language description of what a preference prioritises. */
const PRIORITY_PHRASE: Record<OptimizationPreference, string> = {
  CHEAPEST: "the lowest price",
  NEAREST: "how close each business is to you",
  FASTEST: "the shortest turnaround",
  EARLIEST: "the earliest they can start",
  AVAILABLE_NOW: "businesses that can take the job right now",
  BEST_VALUE: "the balance of price, speed and how well they fit the job",
  WITHIN_BUDGET: "staying inside your budget, then the best of what's left",
};

/**
 * How the layer explains a completed comparison. Names what was prioritised and
 * the secondary tiebreak, so the person can see the reasoning without a table
 * of scores (milestone 6 §8: "I prioritized places that are open now and within
 * your requested area, then compared price").
 */
export function explainOptimization(
  pref: OptimizationPreference,
  context: { location?: string; budget?: string } = {},
): string {
  switch (pref) {
    case "CHEAPEST":
      return "I compared on price and put the lowest first.";
    case "NEAREST":
      return context.location
        ? `I ranked by how close each business is to ${context.location}.`
        : "I ranked by how close each business is to you.";
    case "FASTEST":
      return "I ranked by turnaround, fastest first, then by price.";
    case "EARLIEST":
      return "I ranked by who can start soonest, then by price.";
    case "AVAILABLE_NOW":
      return "I kept only businesses that can take the job now, then compared price.";
    case "BEST_VALUE":
      return "I weighed price against speed and how well each business fits the job.";
    case "WITHIN_BUDGET":
      return context.budget
        ? `I kept only quotes at or under ${context.budget}, then compared the rest on price.`
        : "I kept only quotes inside your budget, then compared the rest on price.";
    default:
      return `I prioritised ${PRIORITY_PHRASE[pref]}.`;
  }
}
