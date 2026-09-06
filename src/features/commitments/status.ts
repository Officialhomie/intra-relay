import { z } from "zod";

import { CELO_X402_NETWORKS, X402_DEFAULT_NETWORK } from "@/features/payments/adapter/networks";

/**
 * Commitment lifecycle (ADR-018, milestone 2).
 *
 * A commitment is what a *quote* becomes once a human has approved it. The
 * quote is an offer; the commitment is the approved, expiring, attestable
 * record of that offer. Nothing here moves money — Intra is the evaluator,
 * never the custodian (BR-001).
 */
export const COMMITMENT_STATUSES = [
  "PENDING_ATTESTATION",
  "ATTESTED",
  "ATTESTATION_FAILED",
] as const;

export const commitmentStatusSchema = z.enum(COMMITMENT_STATUSES);
export type CommitmentStatus = z.infer<typeof commitmentStatusSchema>;

/** Where `validUntil` came from. Recorded so the window is never unexplained. */
export const COMMITMENT_EXPIRY_SOURCES = ["QUOTE_EXPIRY", "DEFAULT_WINDOW"] as const;
export const commitmentExpirySourceSchema = z.enum(COMMITMENT_EXPIRY_SOURCES);
export type CommitmentExpirySource = z.infer<typeof commitmentExpirySourceSchema>;

/**
 * Applied when the printer gave no expiry. A commitment with no expiry is not a
 * commitment, so one is always assigned and its source is always recorded.
 */
export const DEFAULT_COMMITMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The zero address, meaning "this amount is denominated off-chain". The order
 * price is paid by the buyer directly to the printer (BR-001) and for a fiat
 * quote there is no token involved — claiming one would be fabrication.
 */
export const OFF_CHAIN_ASSET = "0x0000000000000000000000000000000000000000" as const;

/**
 * Maps a quote currency to a Celo mainnet token address, and ONLY where that
 * address has been verified against the facilitator's `GET /supported`
 * (`payments/adapter/networks.ts`).
 *
 * `NGN`, `USD` and `USDm` are fiat / off-chain units. `cUSD` and `cNGN` are real
 * Celo assets but their addresses are not verified in this repository yet, so
 * they resolve to the off-chain asset rather than to a guessed address — a
 * wrong token address does not throw, it silently mislabels money.
 */
export function assetAddressForCurrency(currency: string): {
  address: string;
  onChain: boolean;
  note: string;
} {
  const assets = CELO_X402_NETWORKS[X402_DEFAULT_NETWORK]?.assets ?? {};
  const match = assets[currency];
  if (match) {
    return {
      address: match.address,
      onChain: true,
      note: `${currency} on Celo mainnet.`,
    };
  }
  return {
    address: OFF_CHAIN_ASSET,
    onChain: false,
    note:
      `${currency} has no verified Celo mainnet token address in this repository, so the ` +
      `amount is recorded as off-chain denominated. The currency code lives in the ` +
      `off-chain job record referenced by jobRef.`,
  };
}

/** Quote amounts are decimal (numeric(14,2)). On-chain amounts are integers. */
export function toMinorUnits(amount: number, decimals = 2): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function resolveValidUntil(
  quoteExpiresAt: Date | null,
  approvedAt: Date,
): { validUntil: Date; source: CommitmentExpirySource } {
  if (quoteExpiresAt && quoteExpiresAt.getTime() > approvedAt.getTime()) {
    return { validUntil: quoteExpiresAt, source: "QUOTE_EXPIRY" };
  }
  return {
    validUntil: new Date(approvedAt.getTime() + DEFAULT_COMMITMENT_WINDOW_MS),
    source: "DEFAULT_WINDOW",
  };
}

export function commitmentIsExpired(validUntil: Date, now: Date = new Date()): boolean {
  return validUntil.getTime() <= now.getTime();
}
