import type { BusinessRow, QuoteRow, TaskRow } from "@/lib/db/schema";

/**
 * Build the pre-filled WhatsApp order message (FR-REC-002).
 *
 * This text is only ever shown to the buyer to copy. Intra never sends it and
 * never places the order (BR-001, FR-REC-004).
 */
export function buildOrderMessage(business: BusinessRow, task: TaskRow, quote: QuoteRow): string {
  const input = (task.structuredInput ?? {}) as Record<string, unknown>;
  const briefLines = Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `- ${key}: ${String(value)}`);

  const price =
    quote.amountMax && quote.amountMax !== quote.amountMin
      ? `${quote.currency} ${quote.amountMin}–${quote.amountMax}`
      : `${quote.currency} ${quote.amountMin}`;

  return [
    `Hi ${business.name}, I'd like to order flyer printing.`,
    "",
    ...(briefLines.length > 0 ? ["My request:", ...briefLines, ""] : []),
    `Your quote: ${price} (${quote.turnaround})${quote.fixed ? " — fixed price" : " — estimate"}.`,
    quote.assumptions ? `Assumptions: ${quote.assumptions}` : null,
    "",
    "Please confirm availability and the final price so I can approve the order.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildRationale(quote: QuoteRow): string {
  const confidence = quote.confidence ?? "unstated";
  return `Single verified quote from the printer: ${quote.currency} ${quote.amountMin}${
    quote.amountMax && quote.amountMax !== quote.amountMin ? `–${quote.amountMax}` : ""
  }, turnaround ${quote.turnaround}. Confidence: ${confidence}. Confirm the final price directly before paying.`;
}
