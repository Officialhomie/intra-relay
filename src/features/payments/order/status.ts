import { z } from "zod";

/**
 * Buyer order-payment lifecycle (M10.5, ADR-023).
 *
 * This is the buyer paying the BUSINESS for the order, on-chain, through
 * MiniPay — distinct from the x402 *agent query fee* in `../status.ts`. Intra
 * never holds the funds: the wallet transfers straight to the business payout
 * address. `CONFIRMED` is only ever reached by `verify.ts` after a real Celo
 * transaction receipt is read server-side (M10.5 §17–§19).
 *
 *   CREATED         intent minted from the accepted commitment; nothing on-chain
 *   AWAITING_WALLET  the buyer opened their wallet
 *   SUBMITTED        a tx hash was reported; not yet verified
 *   CONFIRMING       server verification in progress / retrying
 *   CONFIRMED        receipt read: chain, recipient, asset, amount all match
 *   FAILED           the tx reverted, or the receipt does not match the intent
 *   EXPIRED          the intent window passed, or the commercial terms changed
 *   CANCELLED        the buyer dismissed the wallet — the order is untouched
 */
export const ORDER_PAYMENT_STATUSES = [
  "CREATED",
  "AWAITING_WALLET",
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const orderPaymentStatusSchema = z.enum(ORDER_PAYMENT_STATUSES);
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>;

/** Statuses from which no further transition happens. */
export const ORDER_PAYMENT_TERMINAL: readonly OrderPaymentStatus[] = [
  "CONFIRMED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
];

export function isOrderPaymentTerminal(status: OrderPaymentStatus): boolean {
  return ORDER_PAYMENT_TERMINAL.includes(status);
}

/** A payment is "in flight" once a hash exists but confirmation is pending. */
export const ORDER_PAYMENT_IN_FLIGHT: readonly OrderPaymentStatus[] = ["SUBMITTED", "CONFIRMING"];

/** How long a buyer has to complete the wallet step before the intent expires. */
export const ORDER_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

/** Max server-side verification attempts before a pending payment is left for a manual/later check. */
export const ORDER_PAYMENT_MAX_VERIFY_ATTEMPTS = 8;
