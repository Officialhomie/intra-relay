// @vitest-environment node
import { describe, expect, it } from "vitest";

import { feeToCappedAtomic } from "./config";
import { NoopPaymentAdapter } from "./noop";
import { X402PaymentAdapter } from "./x402";
import {
  FakeFacilitator,
  SETTLE_SUCCESS,
  VERIFY_INVALID,
  X402_TEST_CONFIG,
  buildXPaymentHeader,
} from "./__fixtures__/fake-facilitator";

const PAY_TO = `0x${"a".repeat(40)}`;
const challenge = {
  resourceUrl: "https://intra.test/v1/biz/flyer-printing/quote",
  method: "POST",
  payTo: PAY_TO,
  requestedFeeUsd: 0.02,
};

describe("payment adapter — unavailable (NoopPaymentAdapter)", () => {
  const adapter = new NoopPaymentAdapter("not configured");

  it("reports unavailable and never fabricates a challenge or receipt", async () => {
    expect(adapter.isConfigured()).toBe(false);
    expect(adapter.buildChallenge()).toMatchObject({ status: "UNAVAILABLE" });
    expect(await adapter.settle()).toMatchObject({ status: "UNAVAILABLE", provider: "none" });
  });
});

describe("X402PaymentAdapter — server-side spending cap", () => {
  it("never advertises more than $0.05, whatever the route fee", () => {
    expect(feeToCappedAtomic(0.02, X402_TEST_CONFIG.asset)).toBe("20000");
    expect(feeToCappedAtomic(5, X402_TEST_CONFIG.asset)).toBe("50000");
    expect(feeToCappedAtomic(0.05, X402_TEST_CONFIG.asset)).toBe("50000");
  });

  it("builds a $0.02 challenge with the official Celo USDC config", () => {
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator());
    const built = adapter.buildChallenge(challenge);
    expect(built.status).toBe(402);
    const req = built.paymentRequired.accepts[0];
    expect(req).toMatchObject({
      scheme: "exact",
      network: "eip155:42220",
      asset: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
      amount: "20000",
      payTo: PAY_TO,
    });
    expect(req.extra).toMatchObject({ name: "USDC", version: "2" });
  });

  it("rejects a payment whose authorised amount exceeds the route requirements", async () => {
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator());
    const header = buildXPaymentHeader({ payTo: PAY_TO, amountAtomic: "500000" }); // $0.50
    const result = await adapter.settle({ xPaymentHeader: header, challenge });
    expect(result).toMatchObject({ status: "FAILED", code: "REQUIREMENTS_MISMATCH" });
  });
});

describe("X402PaymentAdapter — failed verification", () => {
  it("returns FAILED and never calls settle", async () => {
    const facilitator = new FakeFacilitator({ verify: VERIFY_INVALID });
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, facilitator);
    const header = buildXPaymentHeader({ payTo: PAY_TO });

    const result = await adapter.settle({ xPaymentHeader: header, challenge });
    expect(result).toMatchObject({
      status: "FAILED",
      code: "VERIFICATION_FAILED",
      provider: "x402",
    });
    expect(facilitator.verifyCalls).toBe(1);
    expect(facilitator.settleCalls).toBe(0);
    if (result.status === "FAILED") expect(result.authorizationKey).toBeTruthy();
  });

  it("returns FAILED (not a fabricated receipt) when settle fails", async () => {
    const facilitator = new FakeFacilitator({
      settle: { ...SETTLE_SUCCESS, success: false, transaction: "" },
    });
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, facilitator);
    const result = await adapter.settle({
      xPaymentHeader: buildXPaymentHeader({ payTo: PAY_TO }),
      challenge,
    });
    expect(result).toMatchObject({ status: "FAILED", code: "SETTLEMENT_FAILED" });
  });

  it("treats a facilitator exception as FAILED, never SETTLED", async () => {
    const adapter = new X402PaymentAdapter(
      X402_TEST_CONFIG,
      new FakeFacilitator({ settleThrows: true }),
    );
    const result = await adapter.settle({
      xPaymentHeader: buildXPaymentHeader({ payTo: PAY_TO }),
      challenge,
    });
    expect(result).toMatchObject({ status: "FAILED", code: "SETTLE_REQUEST_FAILED" });
  });
});

describe("X402PaymentAdapter — valid verified receipt", () => {
  it("returns SETTLED with the real tx hash, a Celoscan URL, and no auth payload", async () => {
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator());
    const result = await adapter.settle({
      xPaymentHeader: buildXPaymentHeader({ payTo: PAY_TO }),
      challenge,
    });

    expect(result.status).toBe("SETTLED");
    if (result.status !== "SETTLED") return;
    expect(result.txHash).toBe(SETTLE_SUCCESS.transaction);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.network).toBe("eip155:42220");
    expect(result.explorerUrl).toBe(`https://celoscan.io/tx/${SETTLE_SUCCESS.transaction}`);
    expect(result.responseHeader.name).toBe("X-PAYMENT-RESPONSE");

    const serialised = JSON.stringify(result.verification);
    expect(serialised).not.toMatch(/signature/i);
    expect(serialised).not.toMatch(/authorization/i);
    expect(serialised).not.toContain("1".repeat(130));
  });
});

describe("X402PaymentAdapter — duplicate / idempotency", () => {
  it("derives the same authorizationKey for the same X-PAYMENT header", () => {
    const adapter = new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator());
    const header = buildXPaymentHeader({ payTo: PAY_TO, nonce: `0x${"7".repeat(64)}` });
    expect(adapter.authorizationKey(header)).toBe(adapter.authorizationKey(header));
    expect(adapter.authorizationKey(header)).not.toBe(
      adapter.authorizationKey(
        buildXPaymentHeader({ payTo: PAY_TO, nonce: `0x${"8".repeat(64)}` }),
      ),
    );
    expect(adapter.authorizationKey("not-base64!!")).toBeNull();
  });
});
