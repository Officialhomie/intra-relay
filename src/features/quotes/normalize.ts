import type { QuoteRow } from "@/lib/db/schema";

/**
 * Read-time normalisation of an operator/printer-entered flyer quote.
 *
 * Nothing here is stored — the raw operator input on `quotes` stays
 * authoritative. This turns free text into comparable numbers for the buyer
 * (FR-REC-001), scoped to flyer printing only (ADR-001). It never throws.
 */

export interface NormalizedTurnaround {
  raw: string;
  /** Whole working days, when the text maps cleanly. */
  businessDays: number | null;
  /** Hours, when the text is given in hours. */
  hours: number | null;
  /** Human label, e.g. "Same day", "2 working days", or the raw text. */
  label: string;
}

export interface NormalizedQuote {
  currency: string;
  priceBasis: "fixed" | "estimate";
  amountMin: number;
  amountMax: number | null;
  deliveryCharge: number | null;
  /** Price + delivery charge. */
  totalMin: number;
  totalMax: number | null;
  /** Copies in the brief, when it is a positive integer. */
  quantity: number | null;
  /** Per-flyer price, only when `quantity` is known. */
  unitPriceMin: number | null;
  unitPriceMax: number | null;
  turnaround: NormalizedTurnaround;
  assumptions: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeTurnaround(raw: string): NormalizedTurnaround {
  const text = raw.trim().toLowerCase();

  if (/\b(same[-\s]?day|today)\b/.test(text)) {
    return { raw, businessDays: 0, hours: null, label: "Same day" };
  }
  if (/\bnext[-\s]?(working|business)?\s?day\b/.test(text)) {
    return { raw, businessDays: 1, hours: null, label: "1 working day" };
  }

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)\b/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    return { raw, businessDays: null, hours, label: `${hours} hour${hours === 1 ? "" : "s"}` };
  }

  const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*(working|business)?\s*weeks?\b/);
  if (weekMatch) {
    const weeks = Number(weekMatch[1]);
    return {
      raw,
      businessDays: Math.round(weeks * 5),
      hours: null,
      label: `${weeks} week${weeks === 1 ? "" : "s"}`,
    };
  }

  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(working|business)?\s*days?\b/);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    return {
      raw,
      businessDays: days,
      hours: null,
      label: `${days} working day${days === 1 ? "" : "s"}`,
    };
  }

  return { raw, businessDays: null, hours: null, label: raw.trim() };
}

export function normalizeAssumptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n;•]+/)
    .map((part) => part.trim().replace(/^[-*]\s*/, ""))
    .filter((part) => part.length > 0);
}

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizeQuote(
  quote: Pick<
    QuoteRow,
    | "amountMin"
    | "amountMax"
    | "deliveryCharge"
    | "currency"
    | "turnaround"
    | "assumptions"
    | "fixed"
  >,
  brief: Record<string, unknown> | null | undefined,
): NormalizedQuote {
  const amountMin = Number(quote.amountMin);
  const amountMax =
    quote.amountMax != null && Number(quote.amountMax) !== amountMin
      ? Number(quote.amountMax)
      : null;
  const deliveryCharge = quote.deliveryCharge != null ? Number(quote.deliveryCharge) : null;
  const delivery = deliveryCharge ?? 0;

  const quantity = parsePositiveInt((brief ?? {}).quantity);

  return {
    currency: quote.currency,
    priceBasis: quote.fixed ? "fixed" : "estimate",
    amountMin,
    amountMax,
    deliveryCharge,
    totalMin: round2(amountMin + delivery),
    totalMax: amountMax != null ? round2(amountMax + delivery) : null,
    quantity,
    unitPriceMin: quantity ? round2(amountMin / quantity) : null,
    unitPriceMax: quantity && amountMax != null ? round2(amountMax / quantity) : null,
    turnaround: normalizeTurnaround(quote.turnaround),
    assumptions: normalizeAssumptions(quote.assumptions),
  };
}
