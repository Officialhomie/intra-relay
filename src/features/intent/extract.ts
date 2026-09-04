import { readOptimization } from "./optimization";
import type { UserIntent } from "./types";

/**
 * Pulling structured wants out of plain language (milestone 6 §7).
 *
 * Deterministic on purpose: the same sentence always yields the same fields, so
 * the layer behaves identically in tests and with no model key. A model may
 * later enrich this, but the money-and-deadline fields are parsed by rule
 * (CLAUDE.md §4.1, milestone 6 §6).
 *
 * Nothing here invents a value. A field is set only when the text says it.
 */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function nextWeekdayIso(name: string, now: Date): string | null {
  const target = WEEKDAYS.indexOf(name.toLowerCase() as (typeof WEEKDAYS)[number]);
  if (target < 0) return null;
  const date = new Date(now);
  const delta = (target - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

function readDeadline(text: string, now: Date): UserIntent["deadline"] | undefined {
  const lower = text.toLowerCase();

  if (/\b(today|same[-\s]?day|by end of day|eod)\b/.test(lower)) {
    const d = new Date(now);
    d.setHours(23, 59, 59, 0);
    return { phrase: "today", iso: d.toISOString() };
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 0);
    return { phrase: "tomorrow", iso: d.toISOString() };
  }
  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    d.setHours(23, 59, 59, 0);
    return { phrase: `in ${inDays[1]} days`, iso: d.toISOString() };
  }
  const weekday = lower.match(
    /\b(?:before|by|on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekday) {
    return { phrase: `by ${weekday[1]}`, iso: nextWeekdayIso(weekday[1], now) };
  }
  const bareWeekday = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareWeekday) {
    return { phrase: bareWeekday[1], iso: nextWeekdayIso(bareWeekday[1], now) };
  }
  if (/\bnext week\b/.test(lower)) return { phrase: "next week", iso: null };
  return undefined;
}

function readQuantity(text: string, quantityExpected = false): number | undefined {
  // A number attached to a countable noun, "500 of them", or a message that is
  // just a number (completing a brief). Deliberately NOT any bare number — that
  // catches model names and years ("iPhone 12", "in 2026").
  const match =
    text.match(
      /\b(\d[\d,]*)\s+(?:[a-z][\w-]*\s+){0,4}(?:flyer|flier|copie|copy|print|leaflet|poster|page|unit|piece|pcs|guest|plate|portion)/i,
    ) ??
    text.match(
      /\b(\d[\d,]*)(?:flyer|flier|copie|copy|print|leaflet|poster|page|unit|piece|pcs)/i,
    ) ??
    text.match(/\b(\d[\d,]*)\s*(?:of (?:them|these|those)|copies)\b/i) ??
    text.match(
      /\b(?:make it|change (?:it )?to|now|just|only|quantity(?:\s+is)?)\s+(\d[\d,]*)\b/i,
    ) ??
    text.trim().match(/^(?:about |around |roughly )?(\d[\d,]*)$/) ??
    // In a brief that is waiting on the quantity, a message that opens with a
    // number is that quantity ("500 A5 full colour"). Only when the caller says
    // a quantity is expected, so "iPhone 12" is never read as 12.
    (quantityExpected
      ? text
          .trim()
          .match(/^(?:about |around |roughly |like )?(\d[\d,]*)\b(?!\s*(?:st|nd|rd|th)\b)/i)
      : null);
  if (!match) return undefined;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = { "₦": "NGN", $: "USD", "£": "GBP", "€": "EUR" };

function readBudget(text: string): UserIntent["budget"] | undefined {
  // "under ₦20,000", "less than 20k", "$150 max", "budget is 50000", "1.5m"
  const m = text.match(
    /(?:under|below|less than|max(?:imum)?|no more than|budget(?:\s+is|\s+of)?|around|about|up to)\s*([₦$£€])?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|000|thousand|million)?/i,
  );
  if (!m) return undefined;
  let amount = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = m[3]?.toLowerCase();
  if (suffix === "k" || suffix === "000" || suffix === "thousand") amount *= 1000;
  if (suffix === "m" || suffix === "million") amount *= 1_000_000;
  const currency = m[1] ? (CURRENCY_BY_SYMBOL[m[1]] ?? "NGN") : "NGN";
  return { amount, currency };
}

// Words that can stand alone as a short capitalised message but are never
// themselves a place ("Hey", "Thanks", "Ok") — the bare-location fallback
// below must not mistake them for one.
const NON_LOCATION_BARE =
  /^(?:hi|hey+|hello|yo|sup|howdy|good\s+(?:morning|afternoon|evening)|thanks|thank\s*you|thx|cheers|ok(?:ay)?|yes|no|sure|please|maybe|got\s+it|alright|cool|nice)$/i;

function readLocation(text: string, now: Date): string | undefined {
  const m = text.match(
    /\b(?:in|at|near|around|to|from)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2})\b/,
  );
  if (m) return m[1].trim();
  const trimmed = text.trim();
  // A bare capitalised place at the end of a short message ("Yaba") — but not
  // a deadline phrase that happens to be capitalised ("By Friday") or a
  // greeting/affirmation ("Hey", "Thanks"), both common at this same length.
  if (readDeadline(trimmed, now)) return undefined;
  const bare = trimmed.match(/^([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?)[.!?]?$/);
  if (!bare || NON_LOCATION_BARE.test(bare[1].trim())) return undefined;
  return bare[1].trim();
}

const CATEGORY_KEYWORDS: ReadonlyArray<{ re: RegExp; category: string; service?: string }> = [
  { re: /\b(flyer|flier|leaflet|handbill)s?\b/i, category: "printing", service: "flyers" },
  {
    re: /\b(print|printer|printers|printing|photocopy|copies|copy centre|lamination)\b/i,
    category: "printing",
  },
  { re: /\b(poster|banner|business card)s?\b/i, category: "printing" },
  { re: /\b(design|graphic|logo|artwork)\b/i, category: "design" },
  { re: /\b(food|dinner|lunch|eat|hungry|restaurant|jollof|catering|meal)\b/i, category: "food" },
  // "deliver to X" / "delivered to X" is a fulfilment instruction on another
  // brief, not a request for a delivery service — match only the service sense.
  {
    re: /\b(courier|dispatch\s+rider|errand)\b|\b(?:need|want|arrange|book|get)\s+(?:a\s+)?deliver(?:y|ed)?\b/i,
    category: "delivery",
  },
  { re: /\b(phone|iphone|samsung|laptop|device)\b/i, category: "electronics" },
  { re: /\b(repair|fix|broken screen|not charging)\b/i, category: "repair" },
];

function readCategory(text: string): { category?: string; service?: string } {
  for (const { re, category, service } of CATEGORY_KEYWORDS) {
    if (re.test(text)) return service ? { category, service } : { category };
  }
  return {};
}

function readCondition(text: string): string | undefined {
  const m = text.match(
    /\b(brand[-\s]?new|new|used|second[-\s]?hand|pre[-\s]?owned|refurbished|uk[-\s]?used)\b/i,
  );
  return m ? m[1].toLowerCase().replace(/\s+/g, "-") : undefined;
}

/** A paper size (A3–A6), for a print job. */
function readSize(text: string): string | undefined {
  const m = text.match(/\bA([3-6])\b/i);
  return m ? `A${m[1]}` : undefined;
}

/**
 * Colour preference for a print job, in the words a printer uses. Deliberately
 * narrow: a bare "colour" is not enough — "full colour", "in colour" or a
 * black-and-white phrase.
 */
function readColour(text: string): string | undefined {
  if (/\b(full[-\s]?colou?r|in colou?r|colou?red)\b/i.test(text)) return "full colour";
  if (
    /\b(black[-\s]*(?:and|&|\/)?[-\s]*white|b\s*[&/]\s*w|b\/w|grey?scale|monochrome)\b/i.test(text)
  ) {
    return "black and white";
  }
  return undefined;
}

function readFulfillment(text: string): string | undefined {
  if (/\b(deliver(?:ed|y)?|bring it|send it|dispatch)\b/i.test(text)) return "delivery";
  if (/\b(pick\s?up|collect|come and get|i'?ll come)\b/i.test(text)) return "pickup";
  return undefined;
}

/**
 * Read every UserIntent field this message states. `now` is injectable so
 * deadline resolution is deterministic in tests. `quantityExpected` lets the
 * caller say the conversation is waiting on a quantity, so a message that opens
 * with a number ("500 A5 full colour") is read as that quantity.
 */
export function extractUserIntent(
  text: string,
  now: Date = new Date(),
  options: { quantityExpected?: boolean } = {},
): Partial<UserIntent> {
  const out: Partial<UserIntent> = {};

  const { category, service } = readCategory(text);
  if (category) out.category = category;
  if (service) out.service = service;

  const quantity = readQuantity(text, options.quantityExpected);
  if (quantity !== undefined) out.quantity = quantity;

  const size = readSize(text);
  if (size) out.size = size;

  const colour = readColour(text);
  if (colour) out.colour = colour;

  const budget = readBudget(text);
  if (budget) out.budget = budget;

  const location = readLocation(text, now);
  if (location) out.location = location;

  const deadline = readDeadline(text, now);
  if (deadline) out.deadline = deadline;

  const condition = readCondition(text);
  if (condition) out.condition = condition;

  const fulfillmentPreference = readFulfillment(text);
  if (fulfillmentPreference) out.fulfillmentPreference = fulfillmentPreference;

  if (/\b(open now|available now|right now|currently open|can do (?:it )?today)\b/i.test(text)) {
    out.availabilityRequired = true;
  }

  const optimization = readOptimization(text);
  if (optimization) out.optimization = optimization;

  return out;
}
