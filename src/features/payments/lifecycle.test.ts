import { afterEach, describe, expect, it } from "vitest";

import { HttpError } from "@/lib/http/response";

import {
  assertPaymentTransition,
  assertSettlement,
  canTransitionPayment,
  facilitatorConfigured,
} from "./lifecycle";

describe("payment lifecycle (F-PAY, ADR-004)", () => {
  it("allows the verified settlement path", () => {
    expect(canTransitionPayment("NOT_REQUIRED", "REQUESTED_402")).toBe(true);
    expect(canTransitionPayment("REQUESTED_402", "AUTHORISED")).toBe(true);
    expect(canTransitionPayment("AUTHORISED", "SETTLED")).toBe(true);
  });

  it("forbids jumping straight to SETTLED and leaving it", () => {
    expect(canTransitionPayment("NOT_REQUIRED", "SETTLED")).toBe(false);
    expect(canTransitionPayment("REQUESTED_402", "SETTLED")).toBe(false);
    expect(canTransitionPayment("SETTLED", "FAILED")).toBe(false);
    expect(() => assertPaymentTransition("NOT_REQUIRED", "SETTLED")).toThrow(HttpError);
  });

  it("allows recovering from UNAVAILABLE", () => {
    expect(canTransitionPayment("UNAVAILABLE", "REQUESTED_402")).toBe(true);
  });
});

describe("assertSettlement (FR-PAY-003, BR-005)", () => {
  const verification = { verifiedBy: "facilitator", chain: "celo-mainnet" };
  const txHash = `0x${"a".repeat(64)}`;

  it("passes only with a mainnet tx hash AND a verification result", () => {
    expect(() => assertSettlement({ txHash, verification })).not.toThrow();
  });

  it("rejects a missing or malformed tx hash", () => {
    expect(() => assertSettlement({ verification })).toThrow(/SETTLEMENT_UNVERIFIED|verified/i);
    expect(() => assertSettlement({ txHash: "0x123", verification })).toThrow(HttpError);
  });

  it("rejects a missing verification result (no manual receipts)", () => {
    expect(() => assertSettlement({ txHash })).toThrow(HttpError);
    expect(() => assertSettlement({ txHash, verification: {} })).toThrow(HttpError);
  });
});

describe("facilitatorConfigured (FR-PAY-004)", () => {
  const keys = ["X402_API_KEY", "X402_NETWORK", "X402_ASSET"] as const;
  const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("is false without X402_API_KEY, true once it (and a valid network/asset) are set", () => {
    delete process.env.X402_API_KEY;
    expect(facilitatorConfigured()).toBe(false);

    process.env.X402_API_KEY = "x402-metering-key";
    expect(facilitatorConfigured()).toBe(true); // defaults to eip155:42220 / USDC
  });

  it("throws loudly on an unknown network", () => {
    process.env.X402_API_KEY = "x402-metering-key";
    process.env.X402_NETWORK = "eip155:1";
    expect(() => facilitatorConfigured()).toThrow(/not a supported Celo x402 network/i);
  });
});
