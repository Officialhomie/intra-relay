// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hasInjectedWallet, isMiniPay, paymentEnvironment, paymentMethod } from "./detect";

/**
 * SSR safety (M10.5 §4): with no `window` (the server render), every detector
 * returns a stable value and nothing throws. The `PayPanel` renders on the
 * server before hydration, so this must hold.
 */

describe("detect.ts on the server (no window)", () => {
  it("never throws and reports the no-wallet state", () => {
    expect(typeof window).toBe("undefined");
    expect(isMiniPay()).toBe(false);
    expect(hasInjectedWallet()).toBe(false);
    expect(paymentEnvironment()).toBe("none");
    expect(paymentMethod()).toBe("whatsapp");
  });
});
