/**
 * Plain-language helpers for the operator/judge evidence trace (frontend
 * audit Priority 5). Mirrors the `taskStatusLabel` / `routeStatusLabel`
 * convention in `@/components/ui/StatusPill` — same shape, same rule: never
 * show a raw internal value where a human explanation exists, and never let
 * that explanation claim more than the system actually guarantees.
 */

/**
 * `attestationMode` is "mock" (simulated locally, never touches a chain) or
 * "onchain" (a real EAS attestation on Celo mainnet). The label must never
 * blur that line — a mock attestation stays labelled as one.
 */
export function attestationModeLabel(mode: string | null): string {
  switch (mode) {
    case "mock":
      return "Demo attestation (simulated, not on-chain)";
    case "onchain":
      return "On-chain attestation";
    default:
      return "—";
  }
}

/** A tri-state consistency check: true / false / not applicable. */
export function consistencyLabel(value: boolean | null, whenFalse: string): string {
  if (value === null) return "Not applicable";
  return value ? "Yes" : whenFalse;
}
