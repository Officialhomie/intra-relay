/**
 * NGN → USD reference rate for MiniPay settlement (M10.5 §16, ADR-023).
 *
 * SMEs quote in naira; MiniPay settles USD stablecoins. This fetches a real,
 * public reference rate, and the rate + source + timestamp are ALWAYS shown to
 * the buyer and locked into the payment intent. It is a *reference* rate, not a
 * guaranteed one — if the buyer disagrees they use the WhatsApp handoff.
 *
 * On any failure the caller must treat the MiniPay path as unavailable. A
 * guessed or stale-beyond-tolerance rate is never returned (§8, §15, §16).
 */
import { DEFAULT_NGN_USD_RATE_URL } from "./config";

export interface NgnUsdRate {
  /** NGN per 1 USD. */
  rate: number;
  /** Human-readable provenance, shown to the buyer. */
  source: string;
  fetchedAt: Date;
}

export class RateUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`NGN/USD reference rate unavailable: ${reason}`);
    this.name = "RateUnavailableError";
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { value: NgnUsdRate; at: number; url: string } | null = null;

interface FetchDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * open.er-api.com response shape (the pieces we use):
 *   { result: "success", base_code: "USD",
 *     time_last_update_utc: "Sat, 06 Sep 2026 00:00:01 +0000",
 *     rates: { NGN: 1601.5, ... } }
 */
function parseRate(body: unknown): { rate: number; asOf: string | null } {
  if (typeof body !== "object" || body === null) throw new RateUnavailableError("non-object body");
  const b = body as Record<string, unknown>;
  if (b.result && b.result !== "success") {
    throw new RateUnavailableError(`provider result "${String(b.result)}"`);
  }
  const rates = b.rates;
  if (typeof rates !== "object" || rates === null) throw new RateUnavailableError("no rates map");
  const ngn = (rates as Record<string, unknown>).NGN;
  if (typeof ngn !== "number" || !Number.isFinite(ngn) || ngn <= 0) {
    throw new RateUnavailableError("NGN rate missing or not a positive number");
  }
  const asOf = typeof b.time_last_update_utc === "string" ? b.time_last_update_utc : null;
  return { rate: ngn, asOf };
}

export async function fetchNgnUsdRate(
  url: string = DEFAULT_NGN_USD_RATE_URL,
  deps: FetchDeps = {},
): Promise<NgnUsdRate> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;

  if (cache && cache.url === url && now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let json: unknown;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new RateUnavailableError(`HTTP ${res.status}`);
    json = await res.json();
  } catch (error) {
    if (error instanceof RateUnavailableError) throw error;
    throw new RateUnavailableError(error instanceof Error ? error.message : "fetch failed");
  }

  const { rate, asOf } = parseRate(json);
  const host = safeHost(url);
  const value: NgnUsdRate = {
    rate,
    source: asOf ? `${host} (updated ${asOf})` : host,
    fetchedAt: new Date(now()),
  };
  cache = { value, at: now(), url };
  return value;
}

/** For tests. */
export function __clearRateCache(): void {
  cache = null;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "reference rate provider";
  }
}

/**
 * NGN minor units (kobo) → USDC atomic units (6 decimals) at the given rate.
 * Integer-first to avoid money drift:
 *   usdcAtomic = round( ngnMinor * 1e4 / ngnPerUsd )
 *   (ngnMinor / 100 = NGN; NGN / rate = USD; USD * 1e6 = atomic)
 */
export function convertNgnMinorToUsdcAtomic(ngnMinor: bigint, ngnPerUsd: number): bigint {
  if (!(ngnPerUsd > 0) || !Number.isFinite(ngnPerUsd)) {
    throw new RateUnavailableError("rate must be a positive finite number");
  }
  if (ngnMinor <= 0n) throw new Error("NGN amount must be positive");
  const scaled = Number(ngnMinor) * 1e4;
  if (!Number.isSafeInteger(scaled)) {
    // ~₦90 trillion — far beyond any pilot quote; refuse rather than lose precision.
    throw new Error("amount too large for safe conversion");
  }
  const atomic = Math.round(scaled / ngnPerUsd);
  if (atomic <= 0) throw new Error("converted amount rounds to zero");
  return BigInt(atomic);
}

/** "33.90" — USDC atomic (6dp) as a human string, for display only. */
export function formatUsdcAtomic(atomic: bigint): string {
  const s = atomic.toString().padStart(7, "0");
  const whole = s.slice(0, -6);
  const frac = s.slice(-6).replace(/0+$/, "").slice(0, 2).padEnd(2, "0");
  return `${whole}.${frac}`;
}
