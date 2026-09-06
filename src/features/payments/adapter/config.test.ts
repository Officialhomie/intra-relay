// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { ATTRIBUTION_TAG_RE, feeToCappedAtomic, readPaymentConfig } from "./config";
import { X402_TEST_CONFIG } from "./__fixtures__/fake-facilitator";

const KEYS = ["X402_API_KEY", "X402_NETWORK", "X402_ASSET", "X402_ATTRIBUTION_TAG"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

function env(over: Partial<Record<(typeof KEYS)[number], string>>) {
  return { ...over } as NodeJS.ProcessEnv;
}

describe("readPaymentConfig (FR-PAY-004)", () => {
  it("is 'none' with NOT_CONFIGURED when the key is unset", () => {
    const c = readPaymentConfig(env({}));
    expect(c).toMatchObject({ provider: "none", code: "NOT_CONFIGURED" });
  });

  it("throws (the deploy-check surface) on an unknown network or asset", () => {
    expect(() => readPaymentConfig(env({ X402_API_KEY: "k", X402_NETWORK: "eip155:1" }))).toThrow(
      /not a supported Celo x402 network/i,
    );
    expect(() => readPaymentConfig(env({ X402_API_KEY: "k", X402_ASSET: "DAI" }))).toThrow(
      /not settleable/i,
    );
  });

  it("resolves the official mainnet USDC config by default", () => {
    const c = readPaymentConfig(env({ X402_API_KEY: "k" }));
    expect(c).toMatchObject({
      provider: "x402",
      network: "eip155:42220",
      facilitatorUrl: "https://api.x402.celo.org",
    });
    if (c.provider === "x402") expect(c.asset.address).toBe(X402_TEST_CONFIG.asset.address);
  });
});

describe("X402_ATTRIBUTION_TAG validation (BR-007)", () => {
  it("accepts a well-formed celo_ tag", () => {
    expect(ATTRIBUTION_TAG_RE.test("celo_intra_hackathon_2026")).toBe(true);
    const c = readPaymentConfig(
      env({ X402_API_KEY: "k", X402_ATTRIBUTION_TAG: "celo_intra_2026" }),
    );
    expect(c).toMatchObject({ provider: "x402", attributionTag: "celo_intra_2026" });
    if (c.provider === "x402") expect(c.configWarning).toBeUndefined();
  });

  it("drops a malformed tag (never recorded) and sets a configWarning — does not throw", () => {
    for (const bad of ["intra_2026", "celo-2026", "CELO_x", "celo_", "celo_a b", "x".repeat(80)]) {
      const c = readPaymentConfig(env({ X402_API_KEY: "k", X402_ATTRIBUTION_TAG: bad }));
      expect(c).toMatchObject({ provider: "x402", attributionTag: null });
      if (c.provider === "x402") expect(c.configWarning).toMatch(/attribution/i);
    }
  });
});

describe("feeToCappedAtomic (FR-PAY-005 — server cap)", () => {
  it("never exceeds $0.05 and rounds to whole atomic units", () => {
    expect(feeToCappedAtomic(0.02, X402_TEST_CONFIG.asset)).toBe("20000");
    expect(feeToCappedAtomic(5, X402_TEST_CONFIG.asset)).toBe("50000");
    expect(feeToCappedAtomic(-1, X402_TEST_CONFIG.asset)).toBe("0");
    expect(feeToCappedAtomic(0.029, X402_TEST_CONFIG.asset)).toBe("29000");
  });
});
