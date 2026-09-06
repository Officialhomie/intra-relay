import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { keccak256, encodePacked, type Hex } from "viem";

/**
 * Two-party handover secret — the anti-fabrication mechanism behind a physical
 * fulfilment attestation (ADR-018).
 *
 * Direction matters, and it is the opposite of the Proofline pickup code:
 *
 *   Proofline pickup code   merchant -> buyer   (UX: "your job is ready")
 *   Handover code           buyer -> merchant   (evidence: "I was there")
 *
 * At commitment time we publish `commit = keccak256(code, salt)` on-chain and
 * give **only the buyer** the code. `salt` is withheld server-side until a
 * correct code is presented, so a merchant holding the commit cannot brute-force
 * the (deliberately short, speakable) code offline.
 *
 * At handover the buyer reads the code aloud; the merchant submits it; the
 * server releases the salt; the merchant signs the attestation. Therefore:
 *
 *   - the merchant cannot attest alone  — they never learn `code` until the
 *     buyer says it in person;
 *   - the buyer cannot attest alone     — the attestation is merchant-signed;
 *   - the server cannot attest at all   — it holds no signing key.
 *
 * 2-of-2, with the server as a non-signing referee.
 *
 * What this proves: the named parties completed the handover protocol at a
 * time. What it does NOT prove: quantity, quality, timeliness or satisfaction
 * (ADR-018 honesty bound). Never describe those as proven.
 */

/**
 * Uppercase, no ambiguous glyphs (0/O, 1/I/L) — this gets read aloud across a
 * counter in a noisy shop. Same alphabet as the Proofline pickup code.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 8 chars over a 31-char alphabet ~= 2^39.6. The 32-byte salt carries the real work. */
export const HANDOVER_CODE_LENGTH = 8;

export interface HandoverSecret {
  /** Given to the buyer only. Spoken aloud at collection. */
  code: string;
  /** Withheld until a correct code is presented, then published in the attestation. */
  salt: Hex;
  /** Published at commitment time. Safe to put on-chain. */
  commit: Hex;
}

/** `keccak256(abi.encodePacked(string code, bytes32 salt))`. */
export function computeHandoverCommit(code: string, salt: Hex): Hex {
  return keccak256(encodePacked(["string", "bytes32"], [normalizeHandoverCode(code), salt]));
}

export function issueHandoverSecret(): HandoverSecret {
  let code = "";
  for (let i = 0; i < HANDOVER_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  const salt = `0x${randomBytes(32).toString("hex")}` as Hex;
  return { code, salt, commit: computeHandoverCommit(code, salt) };
}

export function normalizeHandoverCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

/** Constant-time comparison of a presented code against the stored code. */
export function handoverCodeMatches(candidate: string, stored: string): boolean {
  const a = Buffer.from(normalizeHandoverCode(candidate));
  const b = Buffer.from(normalizeHandoverCode(stored));
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Third-party verification: does this revealed (code, salt) pair actually open
 * the commit that was published before the job? Anyone can run this against the
 * chain without trusting Intra — that is the entire point.
 */
export function verifyHandoverReveal(commit: Hex, code: string, salt: Hex): boolean {
  const expected = computeHandoverCommit(code, salt).toLowerCase();
  return expected === commit.toLowerCase();
}
