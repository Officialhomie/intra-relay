import { z } from "zod";

/**
 * Agent service-payment lifecycle (PRD §7, F-PAY).
 *
 * `SETTLED` is only reachable with a real facilitator verification result and a
 * mainnet transaction hash (FR-PAY-003, BR-005). With no configured access the
 * state is `UNAVAILABLE` and never a fabricated success (FR-PAY-004, ADR-004).
 */
export const PAYMENT_STATUSES = [
  "NOT_REQUIRED",
  "REQUESTED_402",
  "AUTHORISED",
  "SETTLED",
  "FAILED",
  "UNAVAILABLE",
] as const;

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
