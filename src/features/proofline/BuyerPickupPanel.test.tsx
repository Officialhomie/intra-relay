import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProoflineView } from "./view";

/**
 * The buyer's own fulfilment-completion signal (M10 pilot funnel). Before this,
 * `fulfillment_started` (merchant marks ready) had no symmetric buyer-side
 * event — a real pilot transaction's Proofline completion was invisible to the
 * funnel. Mirrors `MerchantFulfilmentPanel`'s exact once-only tracking pattern.
 */

const apiRequest = vi.fn();
const track = vi.fn();

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

import { BuyerPickupPanel } from "./BuyerPickupPanel";

const READY: ProoflineView = {
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

const CONFIRMED: ProoflineView = {
  ...READY,
  evidenceStatus: "BUYER_CONFIRMED_PICKUP",
  pickupConfirmedAt: new Date().toISOString(),
  pickupConfirmedBy: "buyer_session",
};

beforeEach(() => {
  apiRequest.mockReset();
  track.mockReset();
});

describe("BuyerPickupPanel — fulfilment_completed", () => {
  it("does not fire while only ready for pickup", () => {
    render(<BuyerPickupPanel taskId="t1" proofline={READY} onChanged={() => {}} />);
    expect(track).not.toHaveBeenCalled();
  });

  it("fires exactly once, with the confirmation method, once the buyer confirms", () => {
    const { rerender } = render(
      <BuyerPickupPanel taskId="t1" proofline={READY} onChanged={() => {}} />,
    );
    expect(track).not.toHaveBeenCalled();

    rerender(<BuyerPickupPanel taskId="t1" proofline={CONFIRMED} onChanged={() => {}} />);
    expect(track).toHaveBeenCalledExactlyOnceWith("fulfilment_completed", {
      confirmation_method: "buyer_session",
    });

    // A further re-render at the same confirmed state must not double-fire.
    rerender(<BuyerPickupPanel taskId="t1" proofline={CONFIRMED} onChanged={() => {}} />);
    expect(track).toHaveBeenCalledOnce();
  });

  it("records the pickup-code confirmation method distinctly", () => {
    const viaCode: ProoflineView = { ...CONFIRMED, pickupConfirmedBy: "one_time_code" };
    render(<BuyerPickupPanel taskId="t1" proofline={viaCode} onChanged={() => {}} />);
    expect(track).toHaveBeenCalledExactlyOnceWith("fulfilment_completed", {
      confirmation_method: "one_time_code",
    });
  });

  it("clicking confirm calls the API and lets the parent refresh into the confirmed state", async () => {
    apiRequest.mockResolvedValue({});
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<BuyerPickupPanel taskId="t1" proofline={READY} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: /confirm i've collected this order/i }));

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/tasks/t1/proofline/confirm-pickup",
      expect.objectContaining({ method: "POST", sessionId: "sess-buyer-1" }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
    // The click alone (still rendered with the READY prop) never fires the
    // event — only the parent's re-render with the confirmed prop does.
    expect(track).not.toHaveBeenCalled();
  });
});
