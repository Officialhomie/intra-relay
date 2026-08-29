import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const apiRequest = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ getSessionId: () => "buyer-session-1234" }));
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

import { RequestForm } from "./RequestForm";

async function fillBrief(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByRole("spinbutton", { name: /number of copies/i }));
  await user.type(screen.getByRole("spinbutton", { name: /number of copies/i }), "150");
  await user.type(screen.getByRole("textbox", { name: /needed by/i }), "Friday 3pm");
  await user.type(
    screen.getByRole("textbox", { name: /delivery or pick-up area/i }),
    "UNILAG gate",
  );
}

describe("RequestForm — principal buyer flow (F-TASK)", () => {
  beforeEach(() => {
    push.mockReset();
    apiRequest.mockReset();
  });

  it("takes a brief, lists printers, and submits to the chosen route then routes to the task", async () => {
    apiRequest
      .mockResolvedValueOnce([
        {
          routeId: "route-1",
          businessName: "Campus Prints",
          city: "Lagos",
          country: "Nigeria",
          responseSlaMinutes: 30,
          priceUpdatedAt: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce({ id: "task-9" })
      .mockResolvedValueOnce({});

    const user = userEvent.setup();
    render(<RequestForm />);

    await fillBrief(user);
    await user.click(screen.getByRole("button", { name: /find a printing quote/i }));

    expect(await screen.findByText("Campus Prints")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/tasks/task-9"));
    expect(apiRequest).toHaveBeenCalledWith("/api/routes/active");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ method: "POST", sessionId: "buyer-session-1234" }),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/tasks/task-9/submit",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an empty state when no printer route is live", async () => {
    apiRequest.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<RequestForm />);

    await fillBrief(user);
    await user.click(screen.getByRole("button", { name: /find a printing quote/i }));

    expect(await screen.findByText(/no printers are live yet/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("never offers to send an order or pay a supplier", async () => {
    apiRequest.mockResolvedValueOnce([
      {
        routeId: "r1",
        businessName: "P",
        city: "L",
        country: "NG",
        responseSlaMinutes: 30,
        priceUpdatedAt: null,
      },
    ]);
    const user = userEvent.setup();
    render(<RequestForm />);
    await fillBrief(user);
    await user.click(screen.getByRole("button", { name: /find a printing quote/i }));
    await screen.findByText("P");
    expect(screen.getByText(/never sends an order or pays a printer/i)).toBeInTheDocument();
  });
});
