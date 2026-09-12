import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicOrderPayment } from "@/features/payments/order/service";

/**
 * The order-payment hook is the ONE place the MiniPay client flow is
 * sequenced (M10.5, M10 pilot funnel). This locks the exact event order a
 * buyer's happy-path payment fires, including `payment_intent_created` — the
 * new funnel step marking the server minted an intent (recipient/amount/asset
 * resolved) before the wallet was ever invoked.
 */

const apiRequest = vi.fn();
const track = vi.fn();
const payOrder = vi.fn();

vi.mock("@/lib/session", () => ({ getSessionId: () => "sess-buyer-1" }));
vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/features/analytics/useAnalytics", () => ({
  useAnalytics: () => ({
    track,
    identifyBuyer: vi.fn(),
    identifyBusiness: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("./detect", () => ({
  paymentEnvironment: vi.fn(() => "minipay"),
  paymentMethod: vi.fn(() => "minipay"),
}));
vi.mock("./wallet-adapter", () => ({
  payOrder: (...args: unknown[]) => payOrder(...args),
  WalletPayError: class WalletPayError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { useOrderPayment } from "./useOrderPayment";

const base: PublicOrderPayment = {
  status: null,
  offered: true,
  paid: false,
  network: "eip155:42220",
  chainId: 42220,
  asset: "USDC",
  assetAddress: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  recipientAddress: `0x${"b".repeat(40)}`,
  recipientShort: "0xbbbb…bbbb",
  attributionTag: null,
  amountAtomic: null,
  amountUsdcDisplay: null,
  amountNgnMinor: "4500000",
  ngnUsdRate: null,
  rateSource: null,
  rateLockedAt: null,
  txHash: null,
  explorerUrl: null,
  reason: null,
  expiresAt: null,
};

const intent: PublicOrderPayment = {
  ...base,
  status: "CREATED",
  amountAtomic: "30000000",
  amountUsdcDisplay: "30.00",
};

beforeEach(() => {
  apiRequest.mockReset();
  track.mockReset();
  payOrder.mockReset();
  apiRequest.mockResolvedValue(base); // the mount refresh (GET)
});

describe("useOrderPayment — start() fires the funnel in order", () => {
  it("minipay_selected -> payment_intent_created -> wallet_request_started -> wallet_approved -> payment_submitted", async () => {
    apiRequest.mockImplementation(async (url: string, opts?: { method?: string }) => {
      const method = opts?.method ?? "GET";
      if (method !== "POST") return base;
      if (url.endsWith("/order-payment")) return intent;
      if (url.endsWith("/submit")) return { ...intent, status: "CONFIRMING" };
      return base;
    });
    payOrder.mockResolvedValue({ txHash: `0x${"c".repeat(64)}` });

    const { result } = renderHook(() => useOrderPayment("t1", base));
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    await act(async () => {
      await result.current.start();
    });

    const names = track.mock.calls.map((c) => c[0]);
    expect(names).toEqual([
      "minipay_selected",
      "payment_intent_created",
      "wallet_request_started",
      "wallet_approved",
      "payment_submitted",
    ]);

    // The new event carries the server-resolved network/asset, not a guess.
    const createdCall = track.mock.calls.find((c) => c[0] === "payment_intent_created");
    expect(createdCall?.[1]).toEqual({ payment_method: "minipay", network: 42220, asset: "USDC" });
  });

  it("stops at payment_intent_created when the intent has no usable wallet target", async () => {
    apiRequest.mockImplementation(async (url: string, opts?: { method?: string }) => {
      const method = opts?.method ?? "GET";
      if (method !== "POST") return base;
      // Intent created, but missing an amount (e.g. rate not yet locked) — no wallet call should follow.
      if (url.endsWith("/order-payment")) return { ...intent, amountAtomic: null };
      return base;
    });

    const { result } = renderHook(() => useOrderPayment("t1", base));
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    await act(async () => {
      await result.current.start();
    });

    expect(track.mock.calls.map((c) => c[0])).toEqual([
      "minipay_selected",
      "payment_intent_created",
    ]);
    expect(payOrder).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("failed");
  });
});
