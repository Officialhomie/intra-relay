import type { QuoteRow } from "@/lib/db/schema";

import type { QuoteStatus } from "./status";

/**
 * A quote's *effective* status (BR-003: "a quote is an estimate unless a supplier
 * marks it fixed with expiry").
 *
 * The stored `quotes.status` is only moved to `EXPIRED` when the buyer acts on
 * the task. Until then this pure helper reports what the buyer should see: a
 * `RECEIVED` quote whose `expiresAt` has passed reads as `EXPIRED`.
 */
export function quoteEffectiveStatus(
  quote: Pick<QuoteRow, "status" | "expiresAt">,
  now: Date = new Date(),
): QuoteStatus {
  if (
    quote.status === "RECEIVED" &&
    quote.expiresAt &&
    quote.expiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return quote.status;
}

export function quoteIsExpired(
  quote: Pick<QuoteRow, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  return quoteEffectiveStatus(quote, now) === "EXPIRED";
}
