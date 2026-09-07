// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CELO_MAINNET_CHAIN_ID } from "@/features/attestation/chain";
import { DEFAULT_CELO_RPC_URL } from "@/features/attestation/config";

import { DEFAULT_NGN_USD_RATE_URL, readOrderPaymentConfig } from "./config";

/**
 * Buyer order-payment config (M10.5, ADR-023). The MiniPay path is only live in
 * `NETWORK_ENV=production` — the same gate the attestation layer uses — and
 * carries no secret.
 */

const env = (overrides: Record<string, string> = {}) => overrides as unknown as NodeJS.ProcessEnv;

describe("readOrderPaymentConfig", () => {
  it("is disabled outside production, with a reason that says so", () => {
    const config = readOrderPaymentConfig(env({}));
    expect(config.enabled).toBe(false);
    expect(config.reason).toMatch(/not production/i);
  });

  it("stays disabled for staging", () => {
    expect(readOrderPaymentConfig(env({ NETWORK_ENV: "staging" })).enabled).toBe(false);
  });

  it("is enabled in production and resolves the verified Celo mainnet USDC", () => {
    const config = readOrderPaymentConfig(env({ NETWORK_ENV: "production" }));
    expect(config.enabled).toBe(true);
    expect(config.chainId).toBe(CELO_MAINNET_CHAIN_ID);
    expect(config.asset).toBe("USDC");
    expect(config.assetAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.assetDecimals).toBe(6);
  });

  it("normalises the NETWORK_ENV casing", () => {
    expect(readOrderPaymentConfig(env({ NETWORK_ENV: "PRODUCTION" })).enabled).toBe(true);
  });

  it("defaults the RPC and rate URLs, and lets env override them", () => {
    const def = readOrderPaymentConfig(env({ NETWORK_ENV: "production" }));
    expect(def.rpcUrl).toBe(DEFAULT_CELO_RPC_URL);
    expect(def.rateUrl).toBe(DEFAULT_NGN_USD_RATE_URL);

    const overridden = readOrderPaymentConfig(
      env({
        NETWORK_ENV: "production",
        RPC_URL: "https://my-node.example/celo",
        NGN_USD_RATE_URL: "https://fx.example/USD",
      }),
    );
    expect(overridden.rpcUrl).toBe("https://my-node.example/celo");
    expect(overridden.rateUrl).toBe("https://fx.example/USD");
  });

  it("never carries a secret — only public addresses and URLs", () => {
    const config = readOrderPaymentConfig(env({ NETWORK_ENV: "production" }));
    const serialized = JSON.stringify(config).toLowerCase();
    expect(serialized).not.toContain("key");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private");
  });
});
