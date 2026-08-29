import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("@/lib/api", () => ({
  apiRequest: (...a: unknown[]) => apiRequest(...a),
  ApiError: class ApiError extends Error {},
}));

import { QuoteResponseForm } from "./QuoteResponseForm";

const props = { routeId: "r1", taskId: "t1", manageToken: "manage-token-abc", currency: "NGN" };

describe("QuoteResponseForm — principal supplier flow (F-REC)", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    refresh.mockReset();
  });

  it("blocks an empty quote and names the missing fields", async () => {
    const user = userEvent.setup();
    render(<QuoteResponseForm {...props} />);

    await user.click(screen.getByRole("button", { name: /send quote to buyer/i }));

    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument();
    expect(screen.getByText(/how soon can you deliver/i)).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("submits a fixed-price quote with delivery charge", async () => {
    apiRequest.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<QuoteResponseForm {...props} />);

    await user.type(screen.getByRole("textbox", { name: /price \(ngn\)/i }), "15000");
    await user.type(screen.getByRole("textbox", { name: /delivery charge/i }), "1500");
    await user.type(screen.getByRole("textbox", { name: /^turnaround/i }), "same day");
    await user.click(screen.getByRole("button", { name: /send quote to buyer/i }));

    expect(await screen.findByText(/quote sent/i)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/routes/r1/quotes",
      expect.objectContaining({
        method: "POST",
        manageToken: "manage-token-abc",
        body: expect.objectContaining({
          taskId: "t1",
          amountMin: 15000,
          deliveryCharge: 1500,
          fixed: true,
        }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("declines safely with a required reason", async () => {
    apiRequest.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<QuoteResponseForm {...props} />);

    await user.click(screen.getByRole("button", { name: /^decline$/i }));
    await user.click(screen.getByRole("button", { name: /decline this request/i }));
    expect(await screen.findByText(/tell the buyer why/i)).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: /reason for declining/i }),
      "Outside our delivery area",
    );
    await user.click(screen.getByRole("button", { name: /decline this request/i }));

    expect(await screen.findByText(/request declined/i)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/routes/r1/quotes",
      expect.objectContaining({
        body: expect.objectContaining({ decline: true, reason: "Outside our delivery area" }),
      }),
    );
  });
});
