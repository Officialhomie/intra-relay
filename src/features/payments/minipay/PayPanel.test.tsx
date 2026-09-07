import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicOrderPayment } from "@/features/payments/order/service";

/**
 * The buyer's order-payment surface (M10.5 §6, §7, §24, §34). It renders only
 * from server-authoritative data — it never computes an amount or a recipient —
 * and a wallet rejection reads as "cancelled", with the order left intact for
 * the WhatsApp handoff.
 */

const apiRequest = vi.fn();
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
vi.mock("./detect", () => ({
  hasInjectedWallet: vi.fn(() => true),
  isMiniPay: vi.fn(() => true),
  paymentMethod: vi.fn(() => "minipay"),
  paymentEnvironment: vi.fn(() => "minipay"),
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

import { PayPanel } from "./PayPanel";
import { WalletPayError } from "./wallet-adapter";

const USDC = "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C";
const RECIPIENT = `0x${"b".repeat(40)}`;

const base: PublicOrderPayment = {
  status: null,
  offered: true,
  paid: false,
  network: "eip155:42220",
  chainId: 42220,
  asset: "USDC",
  assetAddress: USDC,
  recipientAddress: RECIPIENT,
  recipientShort: "0xbbbb…bbbb",
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

const startedIntent: PublicOrderPayment = {
  ...base,
  status: "CREATED",
  amountAtomic: "30000000",
  amountUsdcDisplay: "30.00",
  ngnUsdRate: "1500",
  rateSource: "rate.test",
  rateLockedAt: new Date("2026-09-06T12:00:00Z").toISOString(),
};

function renderPanel(initial: PublicOrderPayment) {
  return render(
    <PayPanel
      taskId="t1"
      businessName="Campus Prints"
      orderSummary="Flyer printing"
      initial={initial}
    />,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  payOrder.mockReset();
  apiRequest.mockResolvedValue(base); // the mount refresh (GET)
});
afterEach(() => vi.clearAllMocks());

describe("the pre-transaction card is built from server data only", () => {
  it("shows the business, the agreed naira amount, and the MiniPay action", async () => {
    renderPanel(base);

    expect(await screen.findByText(/pay for your order/i)).toBeInTheDocument();
    expect(screen.getByText("Campus Prints")).toBeInTheDocument();
    expect(screen.getByText(/NGN\s?45,000/)).toBeInTheDocument();
    expect(screen.getByText("0xbbbb…bbbb")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay with minipay/i })).toBeInTheDocument();
    // Never a self-computed value — no USDC line until the server locks a rate.
    expect(screen.queryByText(/USDC/)).toBeNull();
  });

  it("shows the locked USDC amount + rate provenance once the server provides it", async () => {
    apiRequest.mockResolvedValue(startedIntent);
    renderPanel(startedIntent);

    expect(await screen.findByText(/30\.00 USDC/)).toBeInTheDocument();
    expect(screen.getByText(/reference rate from rate\.test/i)).toBeInTheDocument();
  });
});

describe("unavailable", () => {
  it("explains the app payment is off and points to the WhatsApp handoff", async () => {
    const off: PublicOrderPayment = {
      ...base,
      offered: false,
      reason: "NETWORK_ENV is not production. On-chain buyer payment through MiniPay is disabled.",
    };
    apiRequest.mockResolvedValue(off);
    renderPanel(off);

    expect(await screen.findByText(/isn't available for this order/i)).toBeInTheDocument();
    expect(screen.getByText(/not production/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay with minipay/i })).toBeNull();
  });
});

describe("confirmed receipt", () => {
  it("renders a receipt with the transaction link", async () => {
    const confirmed: PublicOrderPayment = {
      ...startedIntent,
      status: "CONFIRMED",
      paid: true,
      txHash: `0x${"a".repeat(64)}`,
      explorerUrl: `https://celoscan.io/tx/0x${"a".repeat(64)}`,
    };
    apiRequest.mockResolvedValue(confirmed);
    renderPanel(confirmed);

    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/30\.00 USDC/)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view transaction/i });
    expect(link).toHaveAttribute("href", `https://celoscan.io/tx/0x${"a".repeat(64)}`);
  });
});

describe("the buyer stays in control of the wallet", () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (url: string, opts?: { method?: string }) => {
      const method = opts?.method ?? "GET";
      if (method !== "POST") return base;
      if (url.endsWith("/order-payment")) return startedIntent;
      if (url.endsWith("/submit")) return { ...startedIntent, status: "CONFIRMING" };
      if (url.endsWith("/cancel")) return { ...startedIntent, status: "CANCELLED" };
      return base;
    });
  });

  it("a wallet rejection reads as 'cancelled' and calls the cancel route", async () => {
    payOrder.mockRejectedValue(new WalletPayError("USER_REJECTED", "Payment cancelled."));
    const user = userEvent.setup();
    renderPanel(base);

    await user.click(await screen.findByRole("button", { name: /pay with minipay/i }));

    expect(
      await screen.findByText(/payment cancelled\. nothing was confirmed/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          ([url, opts]) => String(url).endsWith("/cancel") && opts?.method === "POST",
        ),
      ).toBe(true),
    );
    expect(screen.queryByText(/payment confirmed/i)).toBeNull();
  });

  it("any other wallet failure reads as 'didn't go through', order intact", async () => {
    payOrder.mockRejectedValue(new WalletPayError("SEND_FAILED", "insufficient funds for gas"));
    const user = userEvent.setup();
    renderPanel(base);

    await user.click(await screen.findByRole("button", { name: /pay with minipay/i }));

    expect(await screen.findByText(/didn't go through/i)).toBeInTheDocument();
  });

  it("a successful wallet round-trip submits the hash and moves to 'submitted'", async () => {
    payOrder.mockResolvedValue({ txHash: `0x${"c".repeat(64)}` });
    const user = userEvent.setup();
    renderPanel(base);

    await user.click(await screen.findByRole("button", { name: /pay with minipay/i }));

    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          ([url, opts]) =>
            String(url).endsWith("/submit") &&
            opts?.method === "POST" &&
            opts?.body?.txHash === `0x${"c".repeat(64)}`,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/waiting for the network to confirm it/i)).toBeInTheDocument();
  });
});
