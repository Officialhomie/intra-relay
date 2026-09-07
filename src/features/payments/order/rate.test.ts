// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __clearRateCache,
  convertNgnMinorToUsdcAtomic,
  fetchNgnUsdRate,
  formatUsdcAtomic,
  RateUnavailableError,
} from "./rate";

/**
 * NGN → USD reference rate for MiniPay settlement (M10.5 §16, ADR-023).
 *
 * The rate is always a real, fetched *reference* rate. On any failure the
 * caller must be able to treat the whole MiniPay path as unavailable — a
 * guessed rate is never returned (§8, §15, §16).
 */

const URL = "https://rate.test/v6/latest/USD";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const GOOD_BODY = {
  result: "success",
  base_code: "USD",
  time_last_update_utc: "Sat, 06 Sep 2026 00:00:01 +0000",
  rates: { NGN: 1601.5, EUR: 0.9 },
};

afterEach(() => {
  __clearRateCache();
  vi.restoreAllMocks();
});

describe("fetchNgnUsdRate — parsing a real FX response (§16)", () => {
  it("returns the NGN-per-USD rate with a human-readable, timestamped source", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(GOOD_BODY));
    const rate = await fetchNgnUsdRate(URL, { fetchImpl, now: () => 1_700_000_000_000 });

    expect(rate.rate).toBe(1601.5);
    expect(rate.source).toContain("rate.test");
    expect(rate.source).toContain("06 Sep 2026");
    expect(rate.fetchedAt).toEqual(new Date(1_700_000_000_000));
  });

  it("falls back to the bare host when the provider gives no update time", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ rates: { NGN: 1500 } }));
    const rate = await fetchNgnUsdRate(URL, { fetchImpl });
    expect(rate.source).toBe("rate.test");
  });
});

describe("fetchNgnUsdRate — never returns a guessed rate (§8, §15)", () => {
  it("throws RateUnavailableError on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));
    await expect(fetchNgnUsdRate(URL, { fetchImpl })).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it("throws when the provider reports a non-success result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ result: "error", "error-type": "unsupported-code" }));
    await expect(fetchNgnUsdRate(URL, { fetchImpl })).rejects.toThrow(/provider result/i);
  });

  it("throws when the NGN rate is missing or not a positive number", async () => {
    for (const rates of [{}, { NGN: 0 }, { NGN: -3 }, { NGN: "1500" }]) {
      __clearRateCache();
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ rates }));
      await expect(fetchNgnUsdRate(URL, { fetchImpl })).rejects.toBeInstanceOf(
        RateUnavailableError,
      );
    }
  });

  it("wraps a thrown fetch (DNS / timeout / offline) as RateUnavailableError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    await expect(fetchNgnUsdRate(URL, { fetchImpl })).rejects.toBeInstanceOf(RateUnavailableError);
  });
});

describe("fetchNgnUsdRate — short-lived cache", () => {
  it("serves a cached value within the TTL without a second fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(GOOD_BODY));
    let t = 0;
    const now = () => t;

    await fetchNgnUsdRate(URL, { fetchImpl, now });
    t = 5 * 60 * 1000; // 5 min — inside the 10-min TTL
    await fetchNgnUsdRate(URL, { fetchImpl, now });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has passed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(GOOD_BODY));
    let t = 0;
    const now = () => t;

    await fetchNgnUsdRate(URL, { fetchImpl, now });
    t = 11 * 60 * 1000;
    await fetchNgnUsdRate(URL, { fetchImpl, now });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not serve one URL's rate for a different URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ rates: { NGN: 1000 } }))
      .mockResolvedValueOnce(jsonResponse({ rates: { NGN: 2000 } }));

    const a = await fetchNgnUsdRate("https://a.test/USD", { fetchImpl, now: () => 0 });
    const b = await fetchNgnUsdRate("https://b.test/USD", { fetchImpl, now: () => 0 });

    expect(a.rate).toBe(1000);
    expect(b.rate).toBe(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("convertNgnMinorToUsdcAtomic — integer-first money conversion", () => {
  it("₦45,000 at ₦1,500/USD = 30.000000 USDC", () => {
    // 4_500_000 kobo / 100 = ₦45,000 ; / 1500 = $30 ; * 1e6 = 30_000_000 atomic
    expect(convertNgnMinorToUsdcAtomic(4_500_000n, 1500)).toBe(30_000_000n);
  });

  it("rounds to the nearest atomic unit", () => {
    // ₦50,000 / 1500 = $33.3333… → 33_333_333 atomic
    expect(convertNgnMinorToUsdcAtomic(5_000_000n, 1500)).toBe(33_333_333n);
  });

  it("refuses a non-positive amount or a non-positive / non-finite rate", () => {
    expect(() => convertNgnMinorToUsdcAtomic(0n, 1500)).toThrow();
    expect(() => convertNgnMinorToUsdcAtomic(-1n, 1500)).toThrow();
    expect(() => convertNgnMinorToUsdcAtomic(4_500_000n, 0)).toThrow(RateUnavailableError);
    expect(() => convertNgnMinorToUsdcAtomic(4_500_000n, Number.NaN)).toThrow(RateUnavailableError);
    expect(() => convertNgnMinorToUsdcAtomic(4_500_000n, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("refuses an amount too large to convert without precision loss", () => {
    expect(() => convertNgnMinorToUsdcAtomic(10n ** 18n, 1500)).toThrow(/too large/i);
  });
});

describe("formatUsdcAtomic — display only", () => {
  it("renders atomic 6-dp values as a two-decimal string", () => {
    expect(formatUsdcAtomic(30_000_000n)).toBe("30.00");
    expect(formatUsdcAtomic(33_900_000n)).toBe("33.90");
    expect(formatUsdcAtomic(1_234_567n)).toBe("1.23");
    expect(formatUsdcAtomic(500_000n)).toBe("0.50");
  });
});
