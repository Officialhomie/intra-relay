import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const NORMALIZED = {
  currency: "NGN",
  priceBasis: "fixed" as const,
  totalMin: 16500,
  totalMax: null,
  quantity: 200,
  unitPriceMin: 82.5,
  unitPriceMax: null,
  turnaround: { label: "Same day", businessDays: 0, hours: null },
  assumptions: [] as string[],
};

const RECOMMENDATION = {
  rationale: "One quote from the printer: NGN 15000 (fixed price).",
  orderMessage: "Hi Campus Prints, ... Please confirm",
  reasoning: ["Campus Prints is an operator-verified printer in Lagos, Nigeria."],
  uncertainties: ["Intra has not independently verified this quote."],
  verificationNote:
    "This quote was entered by the printer or an Intra operator and passed to you as-is.",
  quoteExpired: false,
  normalized: NORMALIZED,
};

const TASK_FIELDS = {
  id: "t1",
  structuredInput: { size: "A5", quantity: 200 },
  failureReason: null,
  submittedAt: new Date().toISOString(),
  quotedAt: new Date().toISOString(),
  buyerDecision: null,
  buyerDecidedAt: null,
  buyerDeclineReason: null,
  handoffConfirmedAt: null,
  closedAt: null,
  createdAt: new Date().toISOString(),
};

const QUOTE = {
  id: "q1",
  status: "RECEIVED",
  effectiveStatus: "RECEIVED",
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
};

const handoffView = {
  task: { ...TASK_FIELDS, status: "HANDOFF_READY", buyerDecision: "ACCEPTED" },
  route: {
    name: "Flyer printing quote",
    status: "ACTIVE",
    responseSlaMinutes: 30,
    priceUpdatedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
  },
  supplier: {
    name: "Campus Prints",
    city: "Lagos",
    country: "Nigeria",
    contactChannelType: "whatsapp",
    contactChannelValue: "+2348012345678",
  },
  quotes: [QUOTE],
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
  recommendation: RECOMMENDATION,
  feedback: [],
  timeline: [
    { id: "e1", type: "task.handoff_ready", createdAt: new Date().toISOString(), data: {} },
  ],
  handoffConfirmedAt: null,
  proofline: null,
  exception: null,
};

const PROOFLINE_READY = {
  disclaimer: "Operational evidence only. Not a cryptographic proof, not a payment settlement.",
  evidenceStatus: "MERCHANT_MARKED_READY",
  readyForPickupAt: new Date().toISOString(),
  pickupConfirmedAt: null,
  pickupConfirmedBy: null,
  events: [
    {
      type: "READY_FOR_PICKUP",
      actorRole: "merchant",
      confirmationMethod: "merchant_manage_token",
      evidenceStatus: "MERCHANT_MARKED_READY",
      at: new Date().toISOString(),
    },
  ],
};

const recommendedView = {
  ...handoffView,
  task: { ...TASK_FIELDS, status: "RECOMMENDED" },
  supplier: {
    name: "Campus Prints",
    city: "Lagos",
    country: "Nigeria",
    contactChannelType: null,
    contactChannelValue: null,
  },
  timeline: [
    { id: "e1", type: "quote.received", createdAt: new Date().toISOString(), data: {} },
    { id: "e2", type: "recommendation.created", createdAt: new Date().toISOString(), data: {} },
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
    expect(
      screen.getByText(/Celo x402 \/ cPay verification is not available/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Intra never fabricates a payment/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy message/i })).toBeInTheDocument();
    // Feedback is gated behind the buyer confirming they sent the handoff.
    expect(
      screen.getByRole("button", { name: /i've sent this to the printer/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send feedback/i })).toBeNull();
    // No "pay" / "checkout" / "place order" controls.
    expect(screen.queryByRole("button", { name: /pay|checkout|place order/i })).toBeNull();
  });

  it("at RECOMMENDED shows the choice, hides the supplier contact, and posts the decision", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce(recommendedView); // load
    apiRequest.mockResolvedValueOnce({ task: { status: "HANDOFF_READY" }, decision: "ACCEPTED" }); // POST
    apiRequest.mockResolvedValueOnce(handoffView); // reload

    render(<TaskPage taskId="t1" />);

    expect(
      await screen.findByRole("button", { name: /proceed with this printer/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Intra's read of this quote/i)).toBeInTheDocument();
    expect(screen.getByText(/what intra cannot confirm/i)).toBeInTheDocument();
    // supplier phone number is NOT shown before the buyer chooses
    expect(screen.queryByText(/\+2348012345678/)).toBeNull();
    // no handoff / feedback yet
    expect(screen.queryByRole("button", { name: /i've sent this to the printer/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /proceed with this printer/i }));

    const decisionCall = apiRequest.mock.calls.find((call) =>
      String(call[0]).includes("/decision"),
    );
    expect(decisionCall?.[1]).toMatchObject({ method: "POST", body: { decision: "ACCEPT" } });
    expect(await screen.findByText(/order handoff — you send this yourself/i)).toBeInTheDocument();
  });

  it("declines a quote with an optional reason", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce(recommendedView);
    apiRequest.mockResolvedValueOnce({ task: { status: "CANCELLED" }, decision: "DECLINED" });
    apiRequest.mockResolvedValueOnce({
      ...recommendedView,
      task: {
        ...recommendedView.task,
        status: "CANCELLED",
        buyerDecision: "DECLINED",
        buyerDeclineReason: "Too pricey",
      },
      exception: {
        reason: "BUYER_CANCELLED",
        origin: "buyer",
        headline: "You cancelled this request",
        whatHappened: "You chose not to go ahead with this request.",
        actionNeeded: null,
        whatNext: "The request is closed. You can start a new one any time.",
        moneyNote: "No money moved. Nothing was ordered.",
      },
    });

    render(<TaskPage taskId="t1" />);
    await user.click(await screen.findByRole("button", { name: /not this one/i }));
    await user.type(screen.getByLabelText(/why not/i), "Too pricey");
    await user.click(screen.getByRole("button", { name: /don't proceed/i }));

    const call = apiRequest.mock.calls.find((c) => String(c[0]).includes("/decision"));
    expect(call?.[1]).toMatchObject({ body: { decision: "DECLINE", reason: "Too pricey" } });
    expect(await screen.findByText(/you cancelled this request/i)).toBeInTheDocument();
    expect(screen.getByText(/Too pricey/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /send feedback/i })).toBeInTheDocument();
  });

  it("shows the Proofline pickup panel after handoff and confirms pickup", async () => {
    const user = userEvent.setup();
    const confirmedAt = new Date().toISOString();
    const handedOff = {
      ...handoffView,
      handoffConfirmedAt: confirmedAt,
      proofline: PROOFLINE_READY,
      timeline: [
        ...handoffView.timeline,
        { id: "e2", type: "task.handoff_confirmed", createdAt: confirmedAt, data: {} },
        { id: "e3", type: "proofline.ready_for_pickup", createdAt: confirmedAt, data: {} },
      ],
    };
    apiRequest.mockResolvedValueOnce(handedOff); // load
    apiRequest.mockResolvedValueOnce({ view: {}, method: "buyer_session" }); // POST confirm-pickup
    apiRequest.mockResolvedValueOnce({
      ...handedOff,
      proofline: {
        ...PROOFLINE_READY,
        evidenceStatus: "BUYER_CONFIRMED_PICKUP",
        pickupConfirmedAt: new Date().toISOString(),
        pickupConfirmedBy: "buyer_session",
      },
    }); // reload

    render(<TaskPage taskId="t1" />);

    expect(await screen.findByText(/fulfilment evidence \(proofline pilot\)/i)).toBeInTheDocument();
    expect(screen.getByText(/marked this order/i)).toBeInTheDocument();
    // it is explicit that this is not proof / not settlement
    expect(screen.getByText(/not a cryptographic proof/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm i've collected this order/i }));

    const call = apiRequest.mock.calls.find((c) => String(c[0]).includes("/confirm-pickup"));
    expect(call?.[1]).toMatchObject({ method: "POST", body: {} });
    expect(await screen.findByText(/you confirmed pickup/i)).toBeInTheDocument();
  });

  it("reveals the feedback form only after the buyer confirms the handoff", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce(handoffView); // initial load
    apiRequest.mockResolvedValueOnce({ handoffConfirmedAt: new Date().toISOString() }); // POST confirm
    apiRequest.mockResolvedValueOnce({
      ...handoffView,
      handoffConfirmedAt: new Date().toISOString(),
      timeline: [
        ...handoffView.timeline,
        { id: "e2", type: "task.handoff_confirmed", createdAt: new Date().toISOString(), data: {} },
      ],
    }); // reload

    render(<TaskPage taskId="t1" />);
    await user.click(await screen.findByRole("button", { name: /i've sent this to the printer/i }));

    expect(await screen.findByRole("button", { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.getByText(/you marked this as sent/i)).toBeInTheDocument();
    const confirmCall = apiRequest.mock.calls.find((call) =>
      String(call[0]).includes("/handoff-confirm"),
    );
    expect(confirmCall?.[1]).toMatchObject({ method: "POST" });
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

  it("a NOT_REQUIRED payment explains that no agent query fee applies (FR-PAY-004)", async () => {
    apiRequest.mockResolvedValueOnce({
      ...handoffView,
      payments: [{ ...handoffView.payments[0], status: "NOT_REQUIRED" }],
    });
    render(<TaskPage taskId="t1" />);
    expect(await screen.findByText(/agent service payment/i)).toBeInTheDocument();
    expect(screen.getByText(/no agent query fee applies/i)).toBeInTheDocument();
    expect(screen.queryByText(/celoscan/i)).toBeNull();
  });

  it("explains a declined request instead of showing a handoff", async () => {
    apiRequest.mockResolvedValueOnce({
      ...handoffView,
      task: { ...handoffView.task, status: "FAILED", failureReason: "SUPPLIER_DECLINED" },
      supplier: null,
      recommendation: null,
      quotes: [{ ...handoffView.quotes[0], status: "DECLINED", declineReason: "Outside our area" }],
      exception: {
        reason: "SUPPLIER_DECLINED",
        origin: "provider",
        headline: "The business turned this request down",
        whatHappened:
          "The business you asked said it can't take this job — usually because of the area, the timing or how busy it is.",
        actionNeeded: "Start a new request and I'll look for another business.",
        whatNext: "This request is closed. Your details were not shared any further.",
        moneyNote: "No money moved. Nothing was ordered.",
      },
    });
    render(<TaskPage taskId="t1" />);

    expect(await screen.findByText(/turned this request down/i)).toBeInTheDocument();
    expect(screen.queryByText(/order handoff/i)).toBeNull();
  });

  it("shows a session-scoped error when the task belongs to another device", async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "nope"));
    render(<TaskPage taskId="t1" />);
    expect(await screen.findByText(/belongs to another device/i)).toBeInTheDocument();
  });
});
