/**
 * Public EVM / Celo address handling.
 *
 * Scope for Phase 1 (FR-SUP-002, AC-SUP-001): *format* validation only —
 * `0x` followed by 40 hexadecimal characters. EIP-55 checksum verification and
 * proof-of-ownership checks require keccak256 / a chain client and are deferred
 * to the Celo integration phase (see docs/DECISIONS.md ADR-005). Ownership is
 * confirmed out-of-band by an operator; no secret is ever collected.
 */

export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/** True when `value` is a syntactically valid public EVM/Celo address. */
export function isEvmAddressFormat(value: string): boolean {
  return EVM_ADDRESS_REGEX.test(value.trim());
}

/** Lower-cased, trimmed form for storage/comparison. Not a checksum address. */
export function normalizeEvmAddress(value: string): string {
  return value.trim().toLowerCase();
}

/** `0x1234…abcd` for display. Returns the input unchanged if it is not an address. */
export function shortenEvmAddress(value: string): string {
  const trimmed = value.trim();
  if (!isEvmAddressFormat(trimmed)) return value;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
