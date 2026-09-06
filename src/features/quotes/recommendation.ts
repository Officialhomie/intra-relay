import type { BusinessRow, QuoteRouteRow, QuoteRow } from "@/lib/db/schema";

import { quoteIsExpired } from "./expiry";
import { normalizeQuote, type NormalizedQuote } from "./normalize";

/**
 * The buyer-facing comparison / recommendation (FR-REC-001).
 *
 * The MVP has one verified printer per route, so this is not a multi-supplier
 * ranking — it is an explained read of the single quote plus what Intra does
 * *not* know. It never claims the operator-entered figures are verified.
 */

export const VERIFICATION_NOTE =
  "This quote was entered by the printer or an Intra operator and passed to you as-is. " +
  "Intra has not independently checked the price, availability, or turnaround — confirm them " +
  "directly with the printer before you pay.";

export interface RecommendationDetail {
  /** One-line summary (also stored on `recommendations.rationale`). */
  summary: string;
  /** Why this quote looks the way it does. */
  reasoning: string[];
  /** What Intra cannot stand behind — stated plainly (FR-REC-001 "confidence"). */
  uncertainties: string[];
  verificationNote: string;
  normalized: NormalizedQuote;
  quoteExpired: boolean;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function priceLabel(n: NormalizedQuote): string {
  return n.totalMax != null
    ? `${money(n.currency, n.totalMin)}–${money(n.currency, n.totalMax)}`
    : money(n.currency, n.totalMin);
}

export function buildRecommendationSummary(
  quote: Pick<
    QuoteRow,
    "currency" | "amountMin" | "amountMax" | "turnaround" | "fixed" | "confidence"
  >,
): string {
  const range =
    quote.amountMax && quote.amountMax !== quote.amountMin
      ? `${quote.currency} ${quote.amountMin}–${quote.amountMax}`
      : `${quote.currency} ${quote.amountMin}`;
  const basis = quote.fixed ? "fixed price" : "estimate";
  const confidence = quote.confidence ? `, ${quote.confidence} confidence` : "";
  return `One quote from the printer: ${range} (${basis}), turnaround ${quote.turnaround}${confidence}. Not independently verified — confirm before paying.`;
}

export function buildRecommendationDetail(input: {
  quote: QuoteRow;
  route: Pick<QuoteRouteRow, "priceUpdatedAt">;
  business: Pick<BusinessRow, "name" | "city" | "country">;
  brief: Record<string, unknown> | null | undefined;
  now?: Date;
}): RecommendationDetail {
  const { quote, route, business, brief } = input;
  const now = input.now ?? new Date();
  const normalized = normalizeQuote(quote, brief);
  const expired = quoteIsExpired(quote, now);

  const reasoning: string[] = [
    `${business.name} is an operator-verified printer in ${business.city}, ${business.country}. Operator verification covers the business and its route — not the figures in this quote.`,
    normalized.priceBasis === "fixed"
      ? "The printer marked this a fixed price."
      : "The printer marked this an estimate, so the final price can still change.",
    `Total is about ${priceLabel(normalized)} including any delivery charge.`,
  ];

  if (normalized.unitPriceMin != null && normalized.quantity != null) {
    const unit =
      normalized.unitPriceMax != null
        ? `${money(normalized.currency, normalized.unitPriceMin)}–${money(normalized.currency, normalized.unitPriceMax)}`
        : money(normalized.currency, normalized.unitPriceMin);
    reasoning.push(`That is roughly ${unit} per flyer for ${normalized.quantity} copies.`);
  }

  reasoning.push(`Stated turnaround: ${normalized.turnaround.label}.`);

  if (quote.confidence) {
    reasoning.push(`The printer's stated confidence in this quote is ${quote.confidence}.`);
  }
  if (quote.availabilityNote) {
    reasoning.push(`Availability note from the printer: "${quote.availabilityNote}".`);
  }
  if (route.priceUpdatedAt) {
    reasoning.push(
      `This route's price list was last confirmed on ${isoDate(route.priceUpdatedAt)}.`,
    );
  }

  const uncertainties: string[] = ["Intra has not independently verified this quote."];
  if (normalized.priceBasis === "estimate") {
    uncertainties.push("This is an estimate, not a committed price.");
  }
  if (expired) {
    uncertainties.push(
      "This quote has EXPIRED — reconfirm the current price and turnaround with the printer before paying.",
    );
  } else if (quote.expiresAt) {
    uncertainties.push(
      `The printer said this quote is valid until ${isoDate(quote.expiresAt)}; after that you must ask again.`,
    );
  } else {
    uncertainties.push("No expiry was given, so treat the price as indicative only.");
  }
  if (quote.confidence === "low") {
    uncertainties.push("The printer flagged low confidence in this quote.");
  }
  uncertainties.push(
    "Intra cannot see your WhatsApp conversation and cannot confirm the order was placed or paid.",
  );

  return {
    summary: buildRecommendationSummary(quote),
    reasoning,
    uncertainties,
    verificationNote: VERIFICATION_NOTE,
    normalized,
    quoteExpired: expired,
  };
}
