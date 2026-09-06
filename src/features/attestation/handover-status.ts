import { z } from "zod";

/**
 * Handover attestation lifecycle (ADR-018, milestone 9).
 *
 * Separate from `CommitmentStatus`: a commitment is Intra's own record that a
 * deal was approved. A handover attestation is the **merchant's own signed**
 * record that they physically completed it, relayed by Intra but never signed
 * by Intra (`src/features/attestation/handover.ts` — "2-of-2, with the server
 * as a non-signing referee").
 *
 *   PENDING_CODE       commitment exists; the buyer's code has not yet been
 *                       presented by the merchant.
 *   PENDING_SIGNATURE  the code matched; a signing request (EIP-712 typed
 *                       data, nonce, deadline) has been issued and is waiting
 *                       on the merchant's own wallet signature.
 *   ATTESTED           the merchant's delegated signature was verified and
 *                       relayed on-chain (or, in mock mode, simulated).
 *   ATTESTATION_FAILED the relay or the on-chain call failed. Retryable from
 *                       PENDING_SIGNATURE — never silently re-presents the code.
 */
export const HANDOVER_ATTESTATION_STATUSES = [
  "PENDING_CODE",
  "PENDING_SIGNATURE",
  "ATTESTED",
  "ATTESTATION_FAILED",
] as const;

export const handoverAttestationStatusSchema = z.enum(HANDOVER_ATTESTATION_STATUSES);
export type HandoverAttestationStatus = z.infer<typeof handoverAttestationStatusSchema>;

/**
 * How long a merchant has to sign once a signing request is issued. Short on
 * purpose: the EIP-712 `deadline` field is a real replay bound enforced by the
 * EAS contract itself, not just a UI courtesy.
 */
export const HANDOVER_SIGN_WINDOW_MS = 10 * 60 * 1000;
