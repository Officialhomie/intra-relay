import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { apiRequest: vi.fn(), ApiError };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ getSessionId: () => "session-xyz-1234" }));
vi.mock("@/lib/api", () => ({ apiRequest, ApiError }));

import { TaskPage } from "./TaskPage";

const handoffView = {
  task: {
    id: "t1",
    status: "HANDOFF_READY",
    structuredInput: { size: "A5", quantity: 200 },
    failureReason: null,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  route: {
    name: "Flyer printing quote",
    status: "ACTIVE",
    responseSlaMinutes: 30,
    priceUpdatedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
  },
  supplier: {
    name: "Campus Prints",
    contactChannelType: "whatsapp",
    contactChannelValue: "+2348012345678",
    city: "Lagos",
    country: "Nigeria",
  },
  quotes: [
    {
      id: "q1",
      status: "RECEIVED",
      amountMin: "15000.00",
      amountMax: null,
      deliveryCharge: "1500.00",
      currency: "NGN",
      turnaround: "same day",
      availabilityNote: "after 2pm",
      assumptions: null,
      confidence: "medium",
      fixed: true,
      expiresAt: null,
      declineReason: null,
    },
  ],
  payments: [
    {
      id: "p1",
      status: "UNAVAILABLE",
      maxFeeUsd: "0.0500",
      provider: null,
      network: null,
      assetSymbol: null,
      amountAtomic: null,
      txHash: null,
      errorCode: null,
      attributionTag: null,
      settledAt: null,
    },
  ],
  recommendation: {
    rationale: "Single verified quote.",
    orderMessage: "Hi Campus Prints, ... Please confirm",
  },
  feedback: [],
  timeline: [
    { id: "e1", type: "task.handoff_ready", createdAt: new Date().toISOString(), data: {} },
  ],
};

describe("TaskPage — principal buyer view (S-003)", () => {
  beforeEach(() => apiRequest.mockReset());

  it("shows the quote, the buyer-controlled handoff, and never an auto-payment", async () => {
    apiRequest.mockResolvedValueOnce(handoffView);
    render(<TaskPage taskId="t1" />);

    expect(await screen.findByText(/order handoff — you send this yourself/i)).toBeInTheDocument();
    expect(screen.getByText(/NGN 15,000/)).toBeInTheDocument();
    expect(screen.getByText(/NGN 1,500/)).toBeInTheDocument();
    expect(screen.getByText(/Fixed price/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Intra does not send this message and never pays a supplier/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Celo x402 \/ cPay access is not configured/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy message/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
    // No "pay" / "checkout" / "place order" controls.
    expect(screen.queryByRole("button", { name: /pay|checkout|place order/i })).toBeNull();
  });

  it("renders a settled x402 receipt with a Celoscan link (S-003 receipt timeline)", async () => {
    apiRequest.mockResolvedValueOnce({
      ...handoffView,
      payments: [
        {
          id: "p1",
          status: "SETTLED",
          maxFeeUsd: "0.0500",
          provider: "x402",
          network: "eip155:42220",
          assetSymbol: "USDC",
          amountAtomic: "20000",
          txHash: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          errorCode: null,
          attributionTag: "celo_demo_tag",
          settledAt: new Date().toISOString(),
        },
      ],
      timeline: [
        {
          id: "e1",
          type: "payment.challenge_issued",
          createdAt: new Date().toISOString(),
          data: {},
        },
        { id: "e2", type: "payment.settled", createdAt: new Date().toISOString(), data: {} },
        { id: "e3", type: "task.handoff_ready", createdAt: new Date().toISOString(), data: {} },
      ],
    });
    render(<TaskPage taskId="t1" />);

    expect(await screen.findByText(/agent service payment/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view on celoscan/i });
    expect(link).toHaveAttribute(
      "href",
      "https://celoscan.io/tx/0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    expect(screen.getByText(/query fee only — never the customer order/i)).toBeInTheDocument();
    expect(screen.getByText("celo_demo_tag")).toBeInTheDocument();
  });

  it("explains a declined request instead of showing a handoff", async () => {
    apiRequest.mockResolvedValueOnce({
      ...handoffView,
      task: { ...handoffView.task, status: "FAILED", failureReason: "SUPPLIER_DECLINED" },
      supplier: null,
      recommendation: null,
      quotes: [{ ...handoffView.quotes[0], status: "DECLINED", declineReason: "Outside our area" }],
    });
    render(<TaskPage taskId="t1" />);

    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Outside our area/)).toBeInTheDocument();
    expect(screen.queryByText(/order handoff/i)).toBeNull();
  });

  it("shows a session-scoped error when the task belongs to another device", async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "nope"));
    render(<TaskPage taskId="t1" />);
    expect(await screen.findByText(/belongs to another device/i)).toBeInTheDocument();
  });
});
