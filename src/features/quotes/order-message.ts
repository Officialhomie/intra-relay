import type { BusinessRow, QuoteRow, TaskRow } from "@/lib/db/schema";
import { briefFieldLabel, briefFieldValue } from "@/features/tasks/brief-format";

/**
 * Build the pre-filled WhatsApp order message (FR-REC-002).
 *
 * This text is only ever shown to the buyer to copy. Intra never sends it and
 * never places the order (BR-001, FR-REC-004). Brief lines go through the same
 * plain-language helpers as the buyer's own task page (§22, frontend audit
 * Priority 5) — a business reads "Paper size: A5", never "size: A5".
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
    .map(([key, value]) => `- ${briefFieldLabel(key)}: ${briefFieldValue(key, value)}`);

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
