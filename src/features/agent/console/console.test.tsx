import { render, screen, waitFor, within } from "@testing-library/react";
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

import { buildStages } from "../run/stages";
import { AgentConsole } from "./AgentConsole";
import type { AgentRun } from "./types";

/**
 * The human experience (milestone 4).
 *
 * These assert what a person can see and do — not how the run is wired. The
 * recurring theme is the abstraction boundary: implementation stays hidden,
 * money and consequence stay visible.
 */

const REQUEST = "I need 500 A5 full-colour flyers before Friday, delivered to UNILAG main gate";

function makeRun(over: Partial<AgentRun> = {}): AgentRun {
  const status = over.status ?? "AWAITING_APPROVAL";
  const base: AgentRun = {
    runId: "run-1",
    status,
    mode: "assisted",
    model: { provider: "mock", model: "mock-model", configured: true, calls: 3 },
    request: REQUEST,
    notPersisted: true,
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:30.000Z",
    stages: buildStages({
      agentState: "AWAITING_APPROVAL",
      status,
      providersFound: 3,
      quotesRequested: 2,
      quotesReceived: 2,
      unusableQuotes: 0,
      ruledOutBeforeQuoting: 1,
      hasRecommendation: true,
      recommendedName: "Yaba Reprographics",
      clarificationNeeded: false,
      decision: null,
      commitmentRecorded: false,
      replanned: false,
    }),
    headline: "Your decision",
    activity: [
      {
        actor: "you",
        at: "2026-09-02T10:00:00.000Z",
        tone: "normal",
        text: `You asked: “${REQUEST}”`,
      },
      {
        actor: "printer",
        at: "2026-09-02T10:00:20.000Z",
        tone: "normal",
        text: "Yaba Reprographics answered with a quote.",
      },
    ],
    understanding: {
      quantity: 500,
      size: "A5",
      colour: "full colour",
      deadline: "2026-09-04T23:59:59.000Z",
      deliveryArea: "UNILAG main gate",
      summary: "500 A5 flyers, full colour, to UNILAG main gate",
    },
    clarification: null,
    recommendation: {
      businessSlug: "yaba",
      businessName: "Yaba Reprographics",
      price: "NGN 52,000",
      priceBasis: "fixed price",
      turnaround: "24 hours",
      issuedAt: "2026-09-02T09:24:00.000Z",
      expiresAt: "2026-09-02T16:00:00.000Z",
      selectionReason:
        "It costs NGN 2,500 more than the cheapest quote but finishes a day sooner, and the price is held.",
      uncertainties: ["Intra has not independently verified this price."],
      tradeoffs: ["Akoka Print Studio would be cheaper if the deadline were looser."],
      offerFingerprint: "fp-abc",
      finalOrderStatement:
        "Approving records your decision and reveals a pre-filled WhatsApp message. Intra does not send it, does not place the order, and never moves your money.",
      modelReasoned: true,
      taskId: "task-77",
      details: [
        { label: "Quote issued", value: "2026-09-02T09:24:00.000Z" },
        { label: "Agent query fee", value: "None — this printer answers for free" },
      ],
    },
    alternatives: [
      {
        businessSlug: "akoka",
        businessName: "Akoka Print Studio",
        price: "NGN 49,500",
        priceBasis: "fixed price",
        turnaround: "2 business days",
        expiresAt: null,
        comparedToPick: "NGN 2,500 cheaper, but 1 day slower",
      },
    ],
    ruledOut: [{ name: "Campus Prints", because: "Its payment service is unavailable." }],
    decision: null,
    commitment: null,
    outcome: null,
    taskId: "task-77",
    progress: { providersFound: 3, quotesRequested: 2, quotesReceived: 2 },
    requestedQuotes: [
      { taskId: "task-77", businessSlug: "yaba", businessName: "Yaba Reprographics" },
    ],
    reasons: [],
    summary: "Yaba Reprographics at NGN 52,000",
    trace: {
      entries: [
        { at: "2026-09-02T10:00:00.000Z", kind: "tool_called", label: "discoverProviders" },
      ],
    },
    error: null,
  };
  return { ...base, ...over };
}

async function runToDecision(view = makeRun()) {
  apiRequest.mockResolvedValueOnce(
    makeRun({
      status: "RUNNING",
      recommendation: null,
      headline: "Finding printers who can do this",
    }),
  );
  apiRequest.mockResolvedValue(view);
  const user = userEvent.setup();
  render(<AgentConsole />);
  await user.type(screen.getByLabelText(/what do you need/i), "flyers");
  await user.click(screen.getByRole("button", { name: /ask the agent/i }));
  await screen.findByText(/Recommended/);
  return user;
}

beforeEach(() => apiRequest.mockReset());

/** Everything a buyer can read without opening a disclosure. */
function primaryText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("details:not([open])").forEach((node) => node.remove());
  return clone.textContent ?? "";
}

// --- the primary experience -------------------------------------------------

describe("the agent console — intent in, decision out", () => {
  it("opens with one plain-language field, not a form", () => {
    render(<AgentConsole />);
    expect(screen.getByLabelText(/what do you need/i)).toBeInTheDocument();
    // No brief fields until the agent has read the request.
    expect(screen.queryByLabelText(/paper size/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/colour/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask the agent/i })).toBeDisabled();
  });

  it("shows semantic progress, never endpoints or internal state names", async () => {
    await runToDecision();
    expect(screen.getByText(/Found 3 printers who offer this/)).toBeInTheDocument();
    expect(screen.getByText(/2 quotes came back/)).toBeInTheDocument();

    // The primary experience is everything outside a collapsed disclosure.
    expect(primaryText()).not.toMatch(/AWAITING_QUOTES|READING_CAPABILITIES|NO_VIABLE_OFFER/);
    expect(primaryText()).not.toMatch(/\/api\/|\/v1\/|discoverProviders|getQuoteStatus/);

    // …and the implementation detail still exists, just behind one.
    expect(document.body.textContent).toMatch(/discoverProviders/);
  });

  it("restates what it understood, in the buyer's words", async () => {
    await runToDecision();
    // Shown once as the reading, and again as the service being approved.
    expect(screen.getAllByText("500 A5 flyers, full colour, to UNILAG main gate")).toHaveLength(2);
  });

  it("explains the recommendation without exposing a score", async () => {
    await runToDecision();
    expect(screen.getByText(/finishes a day sooner/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/score|weight|priceWeight|slaWeight/i);
  });

  it("shows the alternatives it was chosen over, with the trade-off", async () => {
    await runToDecision();
    expect(screen.getByText("Akoka Print Studio")).toBeInTheDocument();
    expect(screen.getByText("NGN 2,500 cheaper, but 1 day slower")).toBeInTheDocument();
  });

  it("shows what it ruled out — its reasoning, made visible", async () => {
    await runToDecision();
    expect(screen.getByText(/I ruled out 1 printer/)).toBeInTheDocument();
    expect(screen.getByText(/Campus Prints/)).toBeInTheDocument();
  });

  it("keeps technical facts available behind disclosure, not deleted", async () => {
    const user = await runToDecision();
    await user.click(screen.getByText("Details"));
    expect(screen.getByText("Agent query fee")).toBeInTheDocument();
    expect(screen.getByText(/never part of your order|answers for free/)).toBeInTheDocument();
  });
});

// --- the approval boundary (Parts 9, 13) ------------------------------------

describe("approval — the one thing that is not abstracted", () => {
  it("states the business, the money, the terms and who gets paid", async () => {
    await runToDecision();
    const panel = screen.getByText("Before we go ahead").closest("section")!;
    const q = within(panel);
    expect(q.getByText("Yaba Reprographics")).toBeInTheDocument();
    expect(q.getByText("NGN 52,000")).toBeInTheDocument();
    expect(q.getByText(/Within 24 hours/)).toBeInTheDocument();
    expect(q.getByText(/Intra never holds, sends or takes this money/)).toBeInTheDocument();
  });

  it("names the consequence in the button, never 'Continue' or 'Next'", async () => {
    await runToDecision();
    expect(
      screen.getByRole("button", { name: /Approve NGN 52,000 with Yaba Reprographics/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(continue|next|proceed)$/i })).toBeNull();
  });

  it("sends the fingerprint-bound approval and shows what happens next", async () => {
    const user = await runToDecision();
    apiRequest.mockResolvedValueOnce(
      makeRun({
        status: "APPROVED",
        decision: { outcome: "APPROVED", at: "2026-09-02T10:01:00.000Z" },
        commitment: {
          status: "ATTESTED",
          attestationUid: "0xabc",
          attestationTxHash: null,
          mode: "mock",
          simulated: true,
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: /Approve NGN 52,000/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/agent/run/run-1/approve",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ decision: "ACCEPT", offerFingerprint: "fp-abc" }),
        }),
      ),
    );
    expect(await screen.findByText(/Agreed with Yaba Reprographics/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open your order/i })).toHaveAttribute(
      "href",
      "/tasks/task-77",
    );
    expect(screen.getByText(/simulated — not on a public chain/)).toBeInTheDocument();
  });

  it("takes a decline with an optional reason and orders nothing", async () => {
    const user = await runToDecision();
    apiRequest.mockResolvedValueOnce(
      makeRun({
        status: "DECLINED",
        decision: { outcome: "DECLINED", at: "2026-09-02T10:01:00.000Z" },
      }),
    );

    await user.click(screen.getByRole("button", { name: /^Decline$/i }));
    await user.type(screen.getByLabelText(/why not/i), "too slow");
    await user.click(screen.getByRole("button", { name: /Decline — don't proceed/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/agent/run/run-1/approve",
        expect.objectContaining({
          body: expect.objectContaining({ decision: "DECLINE", reason: "too slow" }),
        }),
      ),
    );
    expect(await screen.findByText(/You didn't go ahead/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was ordered and no money moved/)).toBeInTheDocument();
  });
});

// --- clarification and correction (Parts 6, 7, 15) --------------------------

describe("clarification and correction", () => {
  const needsDetail = makeRun({
    status: "CLARIFICATION_NEEDED",
    headline: "I need a little more detail",
    recommendation: null,
    alternatives: [],
    ruledOut: [],
    taskId: null,
    clarification: {
      question: "I can find the right printer, but I need to know how many flyers you need.",
      missing: ["quantity"],
    },
    understanding: {
      quantity: null,
      size: "A5",
      colour: "full colour",
      deadline: "2026-09-04T23:59:59.000Z",
      deliveryArea: "UNILAG main gate",
      summary: "A5 flyers, full colour, to UNILAG main gate",
    },
    stages: buildStages({
      agentState: "CLARIFICATION_NEEDED",
      status: "CLARIFICATION_NEEDED",
      providersFound: 0,
      quotesRequested: 0,
      quotesReceived: 0,
      unusableQuotes: 0,
      ruledOutBeforeQuoting: 0,
      hasRecommendation: false,
      recommendedName: null,
      clarificationNeeded: true,
      decision: null,
      commitmentRecorded: false,
      replanned: false,
    }),
  });

  async function reachClarification() {
    apiRequest.mockResolvedValueOnce(needsDetail);
    apiRequest.mockResolvedValue(needsDetail);
    const user = userEvent.setup();
    render(<AgentConsole />);
    await user.type(screen.getByLabelText(/what do you need/i), "print some flyers");
    await user.click(screen.getByRole("button", { name: /ask the agent/i }));
    await screen.findByText(/I need to know how many flyers/);
    return user;
  }

  it("asks a plain question rather than listing missing fields", async () => {
    await reachClarification();
    expect(
      screen.getByText(
        "I can find the right printer, but I need to know how many flyers you need.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/deliveryArea|INCOMPLETE_BRIEF|required field/i);
  });

  it("opens the editor with what it already knows, so nothing is retyped", async () => {
    await reachClarification();
    expect(screen.getByLabelText(/paper size/i)).toHaveValue("A5");
    expect(screen.getByLabelText(/delivery or pick-up area/i)).toHaveValue("UNILAG main gate");
    expect(screen.getByLabelText(/how many/i)).toHaveValue(null);
  });

  it("continues with the correction, carrying the original request forward", async () => {
    const user = await reachClarification();
    apiRequest.mockResolvedValue(makeRun());

    await user.type(screen.getByLabelText(/how many/i), "500");
    await user.click(screen.getByRole("button", { name: /use these details/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/agent/run",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            request: REQUEST,
            correction: expect.objectContaining({ quantity: 500, size: "A5" }),
          }),
        }),
      ),
    );
  });

  it("lets a buyer correct a reading that was wrong but complete", async () => {
    const user = await runToDecision();
    await user.click(screen.getByRole("button", { name: /not quite right/i }));
    expect(screen.getByLabelText(/how many/i)).toHaveValue(500);
  });
});

// --- failure and recovery (Part 24) -----------------------------------------

describe("failure and recovery stay in the buyer's language", () => {
  it("explains an unsuccessful run and offers a way forward", async () => {
    apiRequest.mockResolvedValueOnce(makeRun({ status: "RUNNING", recommendation: null }));
    apiRequest.mockResolvedValue(
      makeRun({
        status: "NO_VIABLE_OFFER",
        recommendation: null,
        alternatives: [],
        ruledOut: [],
        decision: null,
        taskId: null,
        outcome: {
          title: "Nobody replied in time",
          body: "The printers were asked but none answered inside the waiting window.",
          recovery: "Run it again in a few minutes, or give a later deadline.",
          benign: true,
        },
      }),
    );
    const user = userEvent.setup();
    render(<AgentConsole />);
    await user.type(screen.getByLabelText(/what do you need/i), "flyers");
    await user.click(screen.getByRole("button", { name: /ask the agent/i }));

    expect(await screen.findByText("Nobody replied in time")).toBeInTheDocument();
    expect(screen.getByText(/Run it again in a few minutes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("treats a dropped connection as recoverable and keeps polling", async () => {
    apiRequest.mockResolvedValueOnce(makeRun({ status: "RUNNING", recommendation: null }));
    apiRequest.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Could not reach the server."));
    apiRequest.mockResolvedValue(makeRun());

    const user = userEvent.setup();
    render(<AgentConsole />);
    await user.type(screen.getByLabelText(/what do you need/i), "flyers");
    await user.click(screen.getByRole("button", { name: /ask the agent/i }));

    // It recovers on its own rather than dropping the run on the floor.
    expect(
      await screen.findByText(/Recommended/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("explains an expired run and offers a restart", async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(404, "RUN_NOT_FOUND", "No such run."));
    const user = userEvent.setup();
    render(<AgentConsole />);
    await user.type(screen.getByLabelText(/what do you need/i), "flyers");
    await user.click(screen.getByRole("button", { name: /ask the agent/i }));

    expect(await screen.findByText("This run has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start again/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/RUN_NOT_FOUND|404/);
  });

  it("explains a stale approval without jargon", async () => {
    const user = await runToDecision();
    apiRequest.mockRejectedValueOnce(new ApiError(409, "APPROVAL_STALE", "stale"));
    await user.click(screen.getByRole("button", { name: /Approve NGN 52,000/i }));

    expect(await screen.findByText("The quote changed")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/APPROVAL_STALE/);
  });
});

// --- accessibility (Part 18) ------------------------------------------------

describe("accessibility", () => {
  it("announces the current stage through a single polite live region", async () => {
    await runToDecision();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live).toHaveAttribute("role", "status");
    expect(live?.textContent).toBe("Your decision");
  });

  it("conveys stage status by text as well as icon", async () => {
    await runToDecision();
    expect(screen.getAllByText(/— done/, { selector: ".sr-only" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/— needs you/, { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("keeps the engineering trace out of the primary experience", async () => {
    await runToDecision();
    // Present in the DOM, but nested inside a collapsed disclosure.
    const summary = screen.getByText(/What happened, step by step/);
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("gives every control an accessible name", async () => {
    await runToDecision();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });
});
