import type { BusinessRow, QuoteRow, TaskRow } from "@/lib/db/schema";

/**
 * Build the pre-filled WhatsApp order message (FR-REC-002).
 *
 * This text is only ever shown to the buyer to copy. Intra never sends it and
 * never places the order (BR-001, FR-REC-004).
 */
export function buildOrderMessage(
  business: BusinessRow,
  task: TaskRow,
  quote: QuoteRow,
  options: { expired?: boolean } = {},
): string {
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
    options.expired
      ? "Note: the quote you sent has passed its stated expiry — please reconfirm the current price and turnaround."
      : null,
    "",
    "Please confirm availability and the final price so I can approve the order.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
