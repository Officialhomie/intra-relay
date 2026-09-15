import { render, screen, waitFor } from "@testing-library/react";
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
 * Priority 7 (Agent Workspace, with Direction C's compact status line): a
 * calm empty state (one quiet heading, composer, secondary links), the
 * composer ahead of the trust caption, the caption itself reduced to one
 * quiet fact (no icon, no wash/banner), and — once a run exists — a
 * persistent, collapsed-by-default work-status row above the thread.
 */
describe("ConversationView", () => {
  beforeEach(() => apiRequest.mockReset());

  it("shows a calm empty state: quiet heading, intro message, composer ahead of the trust caption", () => {
    render(<ConversationView />);

    expect(
      screen.getByRole("heading", { name: /what are you trying to get done/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/hi — tell me what you need/i, { exact: false })).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: /message/i });
    const caption = screen.getByText("This conversation isn't saved.");
    expect(
      composer.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Not a Callout banner — no heading/title element wrapping it, just a caption.
    expect(caption.closest("[class*='wash']")).toBeNull();
  });

  it("offers a quiet link to existing requests in the empty state, alongside 'Prefer a form?'", () => {
    render(<ConversationView />);
    expect(screen.getByRole("link", { name: /view your requests/i })).toHaveAttribute(
      "href",
      "/requests",
    );
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
      expect(screen.queryByRole("link", { name: /view your requests/i })).toBeNull();
    });
  });

  describe("workspace header — persistent agent-work status (Priority 7)", () => {
    function runFixture(over: Record<string, unknown> = {}) {
      return {
        runId: "run-1",
        status: "RUNNING",
        mode: "assisted",
        model: { provider: "mock", model: "mock-model", configured: true, calls: 1 },
        request: "I need 500 A5 flyers by Friday",
        notPersisted: true,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:05.000Z",
        stages: [
          { key: "understand", status: "done", label: "Understood your request", detail: null },
          {
            key: "discover",
            status: "active",
            label: "Finding printers who can do this",
            detail: null,
          },
        ],
        headline: "Finding printers who can do this",
        activity: [],
        understanding: {
          quantity: 500,
          size: "A5",
          colour: null,
          deadline: null,
          deliveryArea: null,
          summary: "500 A5 flyers",
        },
        clarification: null,
        recommendation: null,
        alternatives: [],
        ruledOut: [],
        decision: null,
        commitment: null,
        outcome: null,
        taskId: null,
        progress: { providersFound: 0, quotesRequested: 0, quotesReceived: 0 },
        requestedQuotes: [],
        reasons: [],
        summary: "Finding printers who can do this",
        trace: { entries: [] },
        error: null,
        ...over,
      };
    }

    async function sendWithRun(run: ReturnType<typeof runFixture>) {
      const user = userEvent.setup();
      apiRequest.mockResolvedValueOnce({
        message: "Got it — one moment.",
        intent: "COMMERCIAL",
        understood: {},
        optimizationNote: null,
        action: { kind: "START_RUN" },
        run,
      });
      render(<ConversationView />);
      await user.type(screen.getByRole("textbox", { name: /message/i }), "500 flyers");
      await user.click(screen.getByRole("button", { name: /send/i }));
      await screen.findByText("Got it — one moment.");
      return user;
    }

    it("shows a collapsed, single-line status once a run starts — not the full stage list", async () => {
      await sendWithRun(runFixture());

      expect(screen.getByRole("button", { name: /500 A5 flyers/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /finding printers/i })).toBeInTheDocument();
      // Collapsed by default: the stage list's own detail text is not yet shown.
      expect(screen.queryByText("Understood your request")).toBeNull();
    });

    it("expands to the full stage list on demand", async () => {
      const user = await sendWithRun(runFixture());
      await user.click(screen.getByRole("button", { name: /500 A5 flyers/i }));
      expect(screen.getByText("Understood your request")).toBeInTheDocument();
    });

    it("shows an accurate quote-progress phrase once quotes are in flight", async () => {
      await sendWithRun(
        runFixture({
          progress: { providersFound: 3, quotesRequested: 2, quotesReceived: 1 },
        }),
      );
      expect(screen.getByText(/1 quote received · waiting for 1/i)).toBeInTheDocument();
    });

    it("mentions the request is saved only once a real quote has been requested", async () => {
      const user = await sendWithRun(
        runFixture({
          requestedQuotes: [{ taskId: "task-1", businessSlug: "yaba", businessName: "Yaba" }],
        }),
      );
      await user.click(screen.getByRole("button", { name: /500 A5 flyers/i }));
      expect(screen.getByText(/this request is saved/i)).toBeInTheDocument();
    });

    it("does not claim the request is saved before any quote has been requested", async () => {
      const user = await sendWithRun(runFixture({ requestedQuotes: [] }));
      await user.click(screen.getByRole("button", { name: /500 A5 flyers/i }));
      expect(screen.queryByText(/this request is saved/i)).toBeNull();
    });

    it("REGRESSION: follows the embedded console's own polling instead of freezing at the first snapshot", async () => {
      // The bug this guards against: ConversationView captured `run` once,
      // from the conversation turn's response, and never saw the updates
      // AgentConsole's own poll loop applies to its internal state — so the
      // header looked permanently stuck while the thread below it visibly
      // progressed.
      const user = userEvent.setup();
      const initialRun = runFixture({
        progress: { providersFound: 0, quotesRequested: 0, quotesReceived: 0 },
      });
      // Still RUNNING — one quote is in, one is still outstanding. The
      // console's own poll loop naturally continues after this (correctly:
      // the run has not settled yet), so the mock must keep serving it
      // rather than only expecting to be called once.
      const polledRun = runFixture({
        progress: { providersFound: 3, quotesRequested: 2, quotesReceived: 1 },
      });

      apiRequest.mockImplementation((url?: string) => {
        if (url === "/api/conversation") {
          return Promise.resolve({
            message: "Got it — one moment.",
            intent: "COMMERCIAL",
            understood: {},
            optimizationNote: null,
            action: { kind: "START_RUN" },
            run: initialRun,
          });
        }
        return Promise.resolve(polledRun);
      });

      render(<ConversationView />);
      await user.type(screen.getByRole("textbox", { name: /message/i }), "500 flyers");
      await user.click(screen.getByRole("button", { name: /send/i }));
      await screen.findByText("Got it — one moment.");

      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /1 quote received · waiting for 1/i }),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });
});
