/**
 * Separating genuine activity from demonstration data.
 *
 * The dev seed (`npm run db:seed`, ADR-007) creates businesses whose name is
 * prefixed `[DEMO SEED]` and whose payout address is a burn address. Any row
 * that traces back to such a business is classified `demo`; everything else is
 * `real`. The evidence page renders the two scopes separately and never merges
 * them into a single headline number (no fabricated adoption — CLAUDE.md §4.1).
 */

export type DataScope = "real" | "demo";

const DEMO_NAME_MARKERS = ["[demo seed]", "[demo]", "[test]"];

/** True when a business name marks it as demonstration / test data, not a real merchant. */
export function isDemoBusinessName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return DEMO_NAME_MARKERS.some((marker) => lower.startsWith(marker));
}

export function scopeForBusinessName(name: string | null | undefined): DataScope {
  return isDemoBusinessName(name) ? "demo" : "real";
}
