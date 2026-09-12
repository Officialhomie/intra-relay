import { describeToolsForModel } from "../tools/registry";
import type { CandidatePlan } from "../policy/candidates";
import type { OfferSelection } from "../policy/offers";
import type { BuyerIntent, ProviderOffer, ScoredOffer } from "../types";

/**
 * System prompts and state serialisers for the model layer.
 *
 * Every prompt: return ONE JSON object, no prose, no markdown, no explanation of
 * reasoning. We store the JSON, never a chain of thought. Inputs are compact and
 * truncated by `clampUser`.
 */

const CORE_RULES = `You assist a buyer agent for campus flyer printing in Nigeria.
You NEVER place an order, pay a provider, or approve anything — a human does that.
You do not invent facts. If a value is not in the input, say it is missing.
Reply with exactly one JSON object matching the requested shape. No markdown, no commentary.`;

export function clampUser(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20)}\n…[truncated]`;
}

// --- #1 understand intent --------------------------------------------------

export function intentSystemPrompt(): string {
  return `${CORE_RULES}

TASK: Turn the buyer's message into a structured flyer-printing brief.
Required fields: quantity, size (A3/A4/A5/A6), colour (full-colour/black-and-white), a deadline phrase, deliveryArea.
- "quantity": a whole number of flyers, or null.
- "size": one of A3, A4, A5, A6, or null. "A6" is smallest. Do not guess.
- "colour": "full-colour" or "black-and-white", or null.
- "deadlineText": a SHORT phrase copied/normalised from the message ("this Friday", "in 3 days", "tomorrow"), NOT a date. null if none.
- "deliveryArea": the place the flyers go ("UNILAG main gate", "Yaba"), or null.
- "service": "print_flyers" if this is a flyer/poster/leaflet printing request, otherwise "other".
- "missing": names of the required fields still absent.
- If anything required is missing, set clarificationNeeded=true and write ONE plain-language clarificationQuestion asking for exactly those.
- "confidence": one of "low", "medium", or "high" — your confidence in the extraction.`;
}

export function intentUserPrompt(request: string): string {
  return `Buyer message:\n"""${request}"""`;
}

// --- #2 plan which providers to quote ------------------------------------

function candidateLine(item: CandidatePlan["toQuery"][number]): string {
  const c = item.candidate;
  const fresh = c.freshness?.priceConfirmedAt
    ? `price confirmed ${c.freshness.priceConfirmedAt}`
    : "price age unknown";
  return `- ${c.businessSlug} — ${c.businessName}, ${c.city ?? "?"}; SLA ${
    c.responseSlaMinutes ?? "?"
  } min; query fee $${item.feeUsd.toFixed(3)}; ${fresh}`;
}

export function planSystemPrompt(): string {
  const tools = describeToolsForModel();
  return `${CORE_RULES}

TASK: Choose which of the ALLOWED providers below to request a quote from, and in what order.
You may quote all of them, a subset, or reorder them. You may NOT add a provider that is not listed
(they were already filtered for availability, freshness and budget by policy).
Prefer fresher prices and faster stated response SLAs. Getting 2-3 comparable quotes is enough.
Return {"quote":[{businessSlug,reason}],"skip":[{businessSlug,reason}],"note"}.

The only tool this leads to is:
${JSON.stringify(
  tools.find((t) => t.name === "requestQuote"),
  null,
  0,
)}`;
}

export function planUserPrompt(intent: BuyerIntent, plan: CandidatePlan): string {
  const lines = plan.toQuery.map(candidateLine).join("\n");
  return `Brief: ${JSON.stringify({
    quantity: intent.quantity,
    size: intent.size,
    colour: intent.colour,
    deadline: intent.deadline,
    deliveryArea: intent.deliveryArea,
  })}
Run query-fee budget: $${plan.budgetUsd.toFixed(2)} (already committed $${plan.committedFeeUsd.toFixed(3)})

ALLOWED providers:
${lines || "(none)"}`;
}

// --- #3 select an offer --------------------------------------------------

function offerLine(scored: ScoredOffer): string {
  const o = scored.offer;
  const total =
    scored.totalMax != null && scored.totalMax !== scored.totalMin
      ? `${o.currency} ${scored.totalMin}-${scored.totalMax}`
      : `${o.currency} ${scored.totalMin}`;
  const valid =
    scored.validForMinutes == null
      ? "no expiry given"
      : `${Math.round(scored.validForMinutes)} min of validity left`;
  return `- ${o.businessSlug} — ${o.businessName}: total ${total} incl. delivery; turnaround "${
    o.turnaround
  }"; ${o.fixed ? "fixed price" : "estimate"}; confidence ${o.confidence ?? "unstated"}; ${valid}`;
}

export function selectSystemPrompt(): string {
  return `${CORE_RULES}

TASK: Recommend ONE of the ELIGIBLE offers below for the buyer to approve.
Every listed offer already meets the deadline and is not expired or declined — policy checked that.
Weigh total price, turnaround, fixed-vs-estimate, stated confidence and remaining validity.
You may NOT change any number. Pick by businessSlug.
Return {"selectedBusinessSlug","reason","tradeoffs":[...],"uncertainties":[...]}.
"reason": one or two plain sentences a buyer can read.
"uncertainties": what cannot be stood behind (unverified price, estimate not fixed, lapses soon, no expiry).`;
}

export function selectUserPrompt(intent: BuyerIntent, selection: OfferSelection): string {
  const lines = selection.eligible.map(offerLine).join("\n");
  return `Brief deadline: ${intent.deadline ?? "none stated"}

ELIGIBLE offers:
${lines}`;
}

// --- #4 replan ---------------------------------------------------------

export function replanSystemPrompt(): string {
  return `${CORE_RULES}

TASK: No offer is usable yet. Decide whether to request a fresh quote from a provider that has
NOT answered, or to stop. You may only name providers in the "available to re-quote" list.
Requoting costs a query fee against the remaining budget. One re-quote round only.
Return {"action":"requote"|"stop","requoteBusinessSlugs":[...],"reason"}.`;
}

export function replanUserPrompt(input: {
  reasonOffersUnusable: string;
  availableToRequote: { businessSlug: string; businessName: string; feeUsd: number }[];
  budgetRemainingUsd: number;
  answeredOffers: Pick<ProviderOffer, "businessSlug" | "status">[];
}): string {
  return `Why nothing is usable: ${input.reasonOffersUnusable}
Answers so far: ${JSON.stringify(input.answeredOffers)}
Budget remaining: $${input.budgetRemainingUsd.toFixed(3)}
Available to re-quote:
${
  input.availableToRequote
    .map((p) => `- ${p.businessSlug} — ${p.businessName}; query fee $${p.feeUsd.toFixed(3)}`)
    .join("\n") || "(none)"
}`;
}

/** Small helper: parse a JSON object out of possibly-fenced model text. */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return JSON.parse(body);
  }
  return JSON.parse(body.slice(start, end + 1));
}
