// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __setPaymentAdapter, getPaymentAdapter } from "./index";

const KEYS = ["X402_API_KEY", "X402_NETWORK", "X402_ASSET", "X402_ATTRIBUTION_TAG"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => __setPaymentAdapter(null));
afterEach(() => {
  __setPaymentAdapter(null);
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getPaymentAdapter — config tolerance (do not block the quote workflow)", () => {
  it("no key ⇒ unavailable adapter, NOT_CONFIGURED, never throws", () => {
    delete process.env.X402_API_KEY;
    const a = getPaymentAdapter();
    expect(a.isConfigured()).toBe(false);
    expect(a.describe()).toMatchObject({ available: false, code: "NOT_CONFIGURED" });
  });

  it("a malformed X402_NETWORK degrades to an unavailable adapter (CONFIG_ERROR), never throws", () => {
    process.env.X402_API_KEY = "metering-key";
    process.env.X402_NETWORK = "eip155:1";
    let adapter;
    expect(() => {
      adapter = getPaymentAdapter();
    }).not.toThrow();
    expect(adapter!.isConfigured()).toBe(false);
    expect(adapter!.describe()).toMatchObject({ available: false, code: "CONFIG_ERROR" });
    expect(adapter!.buildChallenge({} as never)).toMatchObject({ status: "UNAVAILABLE" });
  });

  it("a valid key builds the real x402 adapter", () => {
    process.env.X402_API_KEY = "metering-key";
    delete process.env.X402_NETWORK;
    const a = getPaymentAdapter();
    expect(a.provider).toBe("x402");
    expect(a.isConfigured()).toBe(true);
    expect(a.describe()).toMatchObject({ available: true, network: "eip155:42220" });
  });

  it("never surfaces the API key in describe()", () => {
    process.env.X402_API_KEY = "super-secret-metering-key";
    const described = JSON.stringify(getPaymentAdapter().describe());
    expect(described).not.toContain("super-secret-metering-key");
  });
});
