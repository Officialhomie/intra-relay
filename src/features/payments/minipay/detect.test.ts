// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { hasInjectedWallet, isMiniPay, paymentEnvironment, paymentMethod } from "./detect";

/**
 * Capability detection is based on the ACTUAL injected provider, never a
 * user-agent string (M10.5 §4). It is cosmetic only — it never gates whether a
 * payment is allowed; the session-scoped server routes do that.
 */

afterEach(() => {
  delete (window as { ethereum?: unknown }).ethereum;
});

describe("no injected wallet", () => {
  it("reports 'none' / 'whatsapp' and both flags false", () => {
    expect(isMiniPay()).toBe(false);
    expect(hasInjectedWallet()).toBe(false);
    expect(paymentEnvironment()).toBe("none");
    expect(paymentMethod()).toBe("whatsapp");
  });
});

describe("a generic injected wallet (desktop extension)", () => {
  it("reports 'injected' but not MiniPay", () => {
    (window as { ethereum?: unknown }).ethereum = { request: async () => undefined };
    expect(hasInjectedWallet()).toBe(true);
    expect(isMiniPay()).toBe(false);
    expect(paymentEnvironment()).toBe("injected");
    expect(paymentMethod()).toBe("injected");
  });
});

describe("the MiniPay in-app browser", () => {
  it("reports 'minipay' from the isMiniPay marker", () => {
    (window as { ethereum?: unknown }).ethereum = {
      request: async () => undefined,
      isMiniPay: true,
    };
    expect(isMiniPay()).toBe(true);
    expect(hasInjectedWallet()).toBe(true);
    expect(paymentEnvironment()).toBe("minipay");
    expect(paymentMethod()).toBe("minipay");
  });
});
