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

vi.mock("@/lib/session", () => ({ getSessionId: () => "browser-session-1234" }));
vi.mock("@/lib/api", () => ({ apiRequest, ApiError }));

import { ConversationView } from "./ConversationView";

/**
 * The mobile hierarchy fix (frontend audit #3): the composer comes before the
 * trust caption in document order, the caption is never a heavy banner, and
 * nothing here changes the actual conversation behaviour.
 */
describe("ConversationView", () => {
  beforeEach(() => apiRequest.mockReset());

  it("puts the composer ahead of the trust caption, and shows the intro message", () => {
    render(<ConversationView />);

    expect(screen.getByText(/hi — tell me what you need/i, { exact: false })).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: /message/i });
    const caption = screen.getByText(/this conversation isn't saved/i);
    expect(
      composer.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Not a Callout banner — no heading/title element wrapping it, just a caption.
    expect(caption.closest("[class*='wash']")).toBeNull();
  });

  it("does not show 'Start a new request' until a message has been sent", () => {
    render(<ConversationView />);
    expect(screen.queryByRole("button", { name: /start a new request/i })).toBeNull();
  });

  it("sends a message, shows the reply, and reveals 'Start a new request'", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({
      message: "Got it — tell me more.",
      intent: "DISCOVERY",
      understood: {},
      optimizationNote: null,
      action: { kind: "NEEDS_INFO" },
    });

    render(<ConversationView />);
    await user.type(screen.getByRole("textbox", { name: /message/i }), "200 flyers by Friday");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("200 flyers by Friday")).toBeInTheDocument();
    expect(await screen.findByText("Got it — tell me more.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start a new request/i })).toBeInTheDocument();
  });

  it("shows an understandable error and keeps the draft when the send fails", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValueOnce(new ApiError(500, "SERVER_ERROR", "Something broke"));

    render(<ConversationView />);
    const composer = screen.getByRole("textbox", { name: /message/i });
    await user.type(composer, "200 flyers by Friday");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something broke");
    expect(composer).toHaveValue("200 flyers by Friday");
  });

  describe("'Prefer a form?' secondary mode (frontend audit D6 / Priority 4)", () => {
    it("swaps the composer for the structured form, and back again", async () => {
      const user = userEvent.setup();
      render(<ConversationView />);

      await user.click(screen.getByRole("button", { name: /prefer a form/i }));
      expect(screen.queryByRole("textbox", { name: /^message$/i })).toBeNull();
      expect(screen.getByRole("button", { name: /send this request/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /back to typing/i }));
      expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    });

    it("sends the composed sentence through the same conversation endpoint", async () => {
      const user = userEvent.setup();
      apiRequest.mockResolvedValueOnce({
        message: "Got it — one moment.",
        intent: "DISCOVERY",
        understood: {},
        optimizationNote: null,
        action: { kind: "START_RUN" },
      });

      render(<ConversationView />);
      await user.click(screen.getByRole("button", { name: /prefer a form/i }));
      await user.clear(screen.getByRole("spinbutton", { name: /number of copies/i }));
      await user.type(screen.getByRole("spinbutton", { name: /number of copies/i }), "200");
      await user.type(screen.getByRole("textbox", { name: /needed by/i }), "Friday 3pm");
      await user.type(screen.getByRole("textbox", { name: /delivery or pick-up area/i }), "Yaba");
      await user.click(screen.getByRole("button", { name: /send this request/i }));

      expect(
        await screen.findByText(
          "I need 200 A5 full-colour flyers by Friday 3pm, delivered to Yaba.",
        ),
      ).toBeInTheDocument();
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/conversation",
        expect.objectContaining({
          method: "POST",
          body: { message: "I need 200 A5 full-colour flyers by Friday 3pm, delivered to Yaba." },
        }),
      );
      // Collapsed back to the composer, not left stuck in form mode.
      expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    });

    it("hides the toggle once a conversation is underway", async () => {
      const user = userEvent.setup();
      apiRequest.mockResolvedValueOnce({
        message: "Got it.",
        intent: "DISCOVERY",
        understood: {},
        optimizationNote: null,
        action: { kind: "NEEDS_INFO" },
      });

      render(<ConversationView />);
      await user.type(screen.getByRole("textbox", { name: /message/i }), "200 flyers");
      await user.click(screen.getByRole("button", { name: /send/i }));

      await screen.findByText("Got it.");
      expect(screen.queryByRole("button", { name: /prefer a form/i })).toBeNull();
    });
  });
});
