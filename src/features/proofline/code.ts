import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * One-time pickup code. The merchant reads it to the buyer at the counter; the
 * buyer types it back to confirm collection. It is a low-stakes, single-order
 * confirmation nonce — not a credential (NFR-SEC-001).
 *
 * Uppercase, no ambiguous characters (0/O, 1/I/L), so it is easy to say aloud.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PICKUP_CODE_LENGTH = 6;

export function generatePickupCode(): string {
  let code = "";
  for (let i = 0; i < PICKUP_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function normalizePickupCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Constant-time comparison of a candidate code against the stored code. */
export function pickupCodeMatches(candidate: string, stored: string): boolean {
  const a = Buffer.from(normalizePickupCode(candidate));
  const b = Buffer.from(normalizePickupCode(stored));
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
