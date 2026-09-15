import { PAYMENT_MAX_FEE_USD } from "@/features/payments/adapter/config";

import type { BuyerIntent } from "../types";

/**
 * Turn a plain-language request into the flyer-printing brief (ADR-001).
 *
 * Deterministic on purpose. An LLM may later refine or ask follow-ups, but the
 * fields that drive money and deadlines are parsed by rules so the same
 * sentence always produces the same brief, and so the agent works in tests and
 * in CI without a model key.
 */

/** Default per-run cap on agent query fees. Never exceeds the hard per-call cap. */
export const DEFAULT_RUN_FEE_BUDGET_USD = PAYMENT_MAX_FEE_USD;

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Next occurrence of a named weekday, at end of that day. */
function nextWeekday(name: string, now: Date): string | null {
  const target = WEEKDAYS.indexOf(name.toLowerCase() as (typeof WEEKDAYS)[number]);
  if (target < 0) return null;
  const date = new Date(now);
  const delta = (target - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

function parseQuantity(text: string): number | null {
  // "500 flyers", "500 copies", or a bare leading number.
  const match =
    text.match(/(\d[\d,]*)\s*(?:flyer|flier|copie|copy|print|leaflet)/i) ??
    text.match(/\b(\d[\d,]{1,6})\b/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseDeadline(text: string, now: Date): string | null {
  const lower = text.toLowerCase();

  if (/\b(today|same[-\s]?day)\b/.test(lower)) {
    const d = new Date(now);
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }

  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }

  const weekday = lower.match(
    /\b(?:before|by|on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekday) return nextWeekday(weekday[1], now);

  const bareWeekday = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareWeekday) return nextWeekday(bareWeekday[1], now);

  return null;
}

function parseSize(text: string): string | null {
  const match = text.match(/\bA([3-7])\b/i);
  return match ? `A${match[1]}` : null;
}

function parseColour(text: string): string | null {
  if (/\b(full[-\s]?colou?r|colou?r)\b/i.test(text)) return "full colour";
  if (/\b(black\s*(?:and|&|\/)?\s*white|b\s*&\s*w|greyscale|grayscale|mono)\b/i.test(text)) {
    return "black and white";
  }
  return null;
}

function parseDeliveryArea(text: string): string | null {
  const match = text.match(
    /\b(?:to|at|in|deliver(?:ed)?\s+to)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/,
  );
  return match ? match[1].trim() : null;
}

/**
 * Mirrors `intent/extract.ts`'s private `readFulfillment` regex exactly
 * (M10.9). Duplicated rather than imported: `agent/` and `intent/` are
 * deliberately independent layers (M10.7 §16.1) — `BuyerIntent`'s parser must
 * keep working standalone, with no model key and no conversation layer, per
 * ADR-019. This is a 2-line pure classifier, not a second intent system.
 */
function parseFulfillmentPreference(text: string): "pickup" | "delivery" | null {
  if (/\b(deliver(?:ed|y)?|bring it|send it|dispatch)\b/i.test(text)) return "delivery";
  if (/\b(pick\s?up|collect|come and get|i'?ll come)\b/i.test(text)) return "pickup";
  return null;
}

export function parseBuyerIntent(
  raw: string,
  options: { now?: Date; maxQueryFeeUsd?: number } = {},
): BuyerIntent {
  const now = options.now ?? new Date();
  const requestedBudget = options.maxQueryFeeUsd ?? DEFAULT_RUN_FEE_BUDGET_USD;

  return {
    raw: raw.trim(),
    quantity: parseQuantity(raw),
    deadline: parseDeadline(raw, now),
    size: parseSize(raw),
    colour: parseColour(raw),
    deliveryArea: parseDeliveryArea(raw),
    fulfillmentPreference: parseFulfillmentPreference(raw),
    // A caller can lower the budget but never raise it past the hard product cap.
    maxQueryFeeUsd: Math.min(requestedBudget, PAYMENT_MAX_FEE_USD),
  };
}

/**
 * A human's correction to the agent's reading of their request.
 *
 * This is the highest-precedence source of truth for the brief: the buyer
 * looked at what the agent understood and fixed it. It outranks both the
 * deterministic parse and the model's interpretation.
 */
export interface BriefCorrection {
  quantity?: number | null;
  size?: string | null;
  colour?: string | null;
  /** A calendar date (`YYYY-MM-DD`) from a date input, not a phrase. */
  deadline?: string | null;
  deliveryArea?: string | null;
  fulfillmentPreference?: "pickup" | "delivery" | null;
}

/** End of the given calendar day, in the server's local zone (as `parseDeadline` does). */
function endOfDay(isoDate: string): string | null {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Apply a buyer's correction to the parsed brief. Returns the corrected intent
 * plus the field names that actually changed, so the run can say what the human
 * fixed rather than silently swapping values.
 */
export function applyBriefCorrection(
  intent: BuyerIntent,
  correction: BriefCorrection,
): { intent: BuyerIntent; changed: string[] } {
  const changed: string[] = [];
  const next: BuyerIntent = { ...intent };

  const set = <K extends keyof BuyerIntent>(key: K, value: BuyerIntent[K], label: string): void => {
    if (value !== next[key]) {
      next[key] = value;
      changed.push(label);
    }
  };

  if (correction.quantity !== undefined) {
    const q =
      typeof correction.quantity === "number" &&
      Number.isInteger(correction.quantity) &&
      correction.quantity > 0
        ? correction.quantity
        : null;
    set("quantity", q, "quantity");
  }
  if (correction.size !== undefined) set("size", correction.size?.trim() || null, "size");
  if (correction.colour !== undefined) set("colour", correction.colour?.trim() || null, "colour");
  if (correction.deliveryArea !== undefined) {
    set("deliveryArea", correction.deliveryArea?.trim() || null, "delivery area");
  }
  if (correction.deadline !== undefined) {
    set("deadline", correction.deadline ? endOfDay(correction.deadline) : null, "deadline");
  }
  if (correction.fulfillmentPreference !== undefined) {
    set("fulfillmentPreference", correction.fulfillmentPreference ?? null, "fulfilment preference");
  }

  return { intent: next, changed };
}

/**
 * Map the parsed colour phrasing to the flyer-printing route's enum values
 * (`flyerPrintingInputSchema`). "full colour" -> "full-colour". The route
 * rejects anything else, so this mapping is part of the tool contract.
 */
function colourForRoute(colour: string | null): string | null {
  if (colour === "full colour") return "full-colour";
  if (colour === "black and white") return "black-and-white";
  return colour;
}

/** The structured brief posted to a provider's quote route. */
export function briefFromIntent(intent: BuyerIntent): Record<string, unknown> {
  const brief: Record<string, unknown> = {};
  if (intent.quantity !== null) brief.quantity = intent.quantity;
  if (intent.size) brief.size = intent.size;
  const colour = colourForRoute(intent.colour);
  if (colour) brief.colour = colour;
  if (intent.deadline) brief.deadline = intent.deadline.slice(0, 10);
  if (intent.deliveryArea) brief.deliveryArea = intent.deliveryArea;
  return brief;
}

/**
 * What the agent still needs before it can ask anyone for a price.
 *
 * These are exactly the required inputs of the flyer-printing quote route
 * (`flyerPrintingInputSchema`): a brief missing any of them is rejected 422 by
 * the real `/v1/:slug/:route/quote` endpoint, so the agent must not spend a fee
 * or a human's time on it. `deliveryArea` is included for that reason — the
 * deterministic parser only finds it when the sentence is explicit ("to Yaba"),
 * which is one of the cases the LLM layer earns its place on.
 */
const FIELD_LABELS: Record<string, string> = {
  quantity: "how many flyers you need",
  size: "the paper size",
  colour: "full colour or black and white",
  deadline: "when you need them by",
  deliveryArea: "where they should go",
};

/**
 * The fallback question when no model is available to phrase one. Reads as a
 * continuation of the buyer's request, not a validation failure (milestone 4).
 */
export function describeMissingFields(missing: string[]): string {
  const parts = missing.map((field) => FIELD_LABELS[field] ?? field);
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return parts.length === 1
    ? `I can find the right printer — I just need to know ${list}.`
    : `I can find the right printer, but I need a couple of details first: ${list}.`;
}

/**
 * Whether a model-phrased question is fit to show a buyer.
 *
 * The model may word the question — it must not leak the identifiers the brief
 * happens to use internally. A question naming `deliveryArea` or `amountMin` is
 * a form validation error wearing a sentence, so it is replaced with our own
 * phrasing rather than shown (milestone 4, Part 6).
 */
export function isBuyerReadableQuestion(question: string): boolean {
  const text = question.trim();
  if (text.length < 8) return false;
  // camelCase or SCREAMING_SNAKE identifiers.
  return !/\b[a-z]+[A-Z][a-zA-Z]*\b|\b[A-Z]{2,}_[A-Z]+\b/.test(text);
}

export function missingBriefFields(intent: BuyerIntent): string[] {
  const missing: string[] = [];
  if (intent.quantity === null) missing.push("quantity");
  if (!intent.size) missing.push("size");
  if (!intent.colour) missing.push("colour");
  if (!intent.deadline) missing.push("deadline");
  if (!intent.deliveryArea) missing.push("deliveryArea");
  return missing;
}
