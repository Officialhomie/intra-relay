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

  const bareWeekday = lower.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
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
  const match = text.match(/\b(?:to|at|in|deliver(?:ed)?\s+to)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/);
  return match ? match[1].trim() : null;
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
    // A caller can lower the budget but never raise it past the hard product cap.
    maxQueryFeeUsd: Math.min(requestedBudget, PAYMENT_MAX_FEE_USD),
  };
}

/** The structured brief posted to a provider's quote route. */
export function briefFromIntent(intent: BuyerIntent): Record<string, unknown> {
  const brief: Record<string, unknown> = {};
  if (intent.quantity !== null) brief.quantity = intent.quantity;
  if (intent.size) brief.size = intent.size;
  if (intent.colour) brief.colour = intent.colour;
  if (intent.deadline) brief.deadline = intent.deadline.slice(0, 10);
  if (intent.deliveryArea) brief.deliveryArea = intent.deliveryArea;
  return brief;
}

/** What the agent still needs before it can ask anyone for a price. */
export function missingBriefFields(intent: BuyerIntent): string[] {
  const missing: string[] = [];
  if (intent.quantity === null) missing.push("quantity");
  if (!intent.size) missing.push("size");
  if (!intent.colour) missing.push("colour");
  if (!intent.deadline) missing.push("deadline");
  return missing;
}
