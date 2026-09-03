import { describe, expect, it } from "vitest";

import { buildActivity } from "./activity";
import { looksTechnical, outcomeCopy, requestErrorCopy } from "./copy";
import { buildStages, currentStageLine, type StageInput } from "./stages";
import { describeMissingFields, isBuyerReadableQuestion } from "../runtime/intent";
import type { TraceEntry } from "../trace";

/**
 * The buyer-facing presentation layer (milestone 4).
 *
 * These tests exist to hold one line: a person must never be shown the
 * mechanism. Internal state names, tool names, HTTP codes and model plumbing
 * belong in the engineering trace, not in the primary experience.
 */

const BASE: StageInput = {
  agentState: null,
  status: "RUNNING",
  providersFound: 0,
  quotesRequested: 0,
  quotesReceived: 0,
  unusableQuotes: 0,
  ruledOutBeforeQuoting: 0,
  hasRecommendation: false,
  recommendedName: null,
  clarificationNeeded: false,
  decision: null,
  commitmentRecorded: false,
  replanned: false,
};

const stage = (stages: ReturnType<typeof buildStages>, key: string) =>
  stages.find((s) => s.key === key)!;

// --- semantic stages (Parts 4, 5, 10) --------------------------------------

describe("stages — internal states become human sentences", () => {
  it("never leaks an internal state name or an enum into a label", () => {
    const states: StageInput["agentState"][] = [
      "CREATED",
      "DISCOVERING",
      "READING_CAPABILITIES",
      "PLANNING",
      "REQUESTING_QUOTES",
      "AWAITING_QUOTES",
      "COMPARING",
      "AWAITING_APPROVAL",
      "APPROVED",
    ];
    for (const agentState of states) {
      for (const s of buildStages({ ...BASE, agentState })) {
        expect(s.label).not.toMatch(/[A-Z]{3,}_[A-Z]/);
        expect(s.label).not.toMatch(/READING_CAPABILITIES|AWAITING|COMPARING|discoverProviders/);
        expect(s.label).not.toMatch(/http|HTTP|\/api\/|\/v1\//);
      }
    }
  });

  it("describes discovery by its result once it has one", () => {
    const s = buildStages({ ...BASE, agentState: "READING_CAPABILITIES", providersFound: 3 });
    expect(stage(s, "discover").label).toBe("Found 3 printers who offer this");
    expect(stage(s, "discover").status).toBe("done");
    expect(stage(s, "check").status).toBe("active");
  });

  it("uses singular wording for one printer", () => {
    const s = buildStages({ ...BASE, agentState: "READING_CAPABILITIES", providersFound: 1 });
    expect(stage(s, "discover").label).toBe("Found 1 printer who offers this");
  });

  it("says who it is waiting for, rather than spinning", () => {
    const s = buildStages({
      ...BASE,
      agentState: "AWAITING_QUOTES",
      providersFound: 3,
      quotesRequested: 2,
      quotesReceived: 0,
    });
    expect(stage(s, "quote").status).toBe("waiting");
    expect(stage(s, "quote").label).toBe("Waiting for 2 printers to reply");
    expect(stage(s, "quote").detail).toMatch(/asynchronous/);
  });

  it("marks the decision as needing the human, and says nothing is ordered yet", () => {
    const s = buildStages({
      ...BASE,
      agentState: "AWAITING_APPROVAL",
      status: "AWAITING_APPROVAL",
      providersFound: 3,
      quotesRequested: 2,
      quotesReceived: 2,
      hasRecommendation: true,
      recommendedName: "Yaba Prints",
    });
    expect(stage(s, "decide").status).toBe("needs-you");
    expect(stage(s, "decide").detail).toMatch(/nothing is ordered/i);
    expect(currentStageLine(s)).toBe("Your decision");
  });

  it("blocks at 'nobody replied' when no quote came back, not at 'compare'", () => {
    const s = buildStages({
      ...BASE,
      agentState: "NO_VIABLE_OFFER",
      status: "NO_VIABLE_OFFER",
      failureCode: "NO_QUOTES_RETURNED",
      providersFound: 3,
      quotesRequested: 2,
      quotesReceived: 0,
    });
    expect(stage(s, "quote").status).toBe("blocked");
    expect(stage(s, "quote").label).toBe("No printer replied in time");
    expect(stage(s, "compare").status).toBe("skipped");
    // A stage that never ran must not read as though it is running.
    expect(stage(s, "compare").label).toBe("Compare the options");
  });

  it("blocks at understanding when the request was out of scope", () => {
    const s = buildStages({
      ...BASE,
      agentState: "FAILED",
      status: "FAILED",
      failureCode: "OUT_OF_SCOPE",
    });
    expect(stage(s, "understand").status).toBe("blocked");
    expect(stage(s, "understand").label).toBe("I can't take this one on");
    expect(stage(s, "discover").status).toBe("skipped");
  });

  it("blocks at discovery when no printer offers the service", () => {
    const s = buildStages({
      ...BASE,
      agentState: "NO_VIABLE_OFFER",
      status: "NO_VIABLE_OFFER",
      failureCode: "NO_PROVIDERS",
    });
    expect(stage(s, "understand").status).toBe("done");
    expect(stage(s, "discover").status).toBe("blocked");
  });

  it("blocks at the stage the run actually reached, not at the state's name", () => {
    const s = buildStages({
      ...BASE,
      agentState: "NO_VIABLE_OFFER",
      status: "NO_VIABLE_OFFER",
      failureCode: "NO_USABLE_QUOTE",
      providersFound: 2,
      quotesRequested: 2,
      quotesReceived: 2,
      unusableQuotes: 2,
    });
    expect(stage(s, "discover").status).toBe("done");
    expect(stage(s, "quote").status).toBe("done");
    expect(stage(s, "compare").status).toBe("blocked");
    expect(stage(s, "compare").label).toBe("None of the quotes work for this order");
    expect(stage(s, "decide").status).toBe("skipped");
  });

  it("turns a missing detail into a question stage, not a failure", () => {
    const s = buildStages({
      ...BASE,
      agentState: "CLARIFICATION_NEEDED",
      status: "CLARIFICATION_NEEDED",
      clarificationNeeded: true,
    });
    expect(stage(s, "understand").status).toBe("needs-you");
    expect(stage(s, "understand").label).toBe("I need a little more detail");
    expect(stage(s, "discover").status).toBe("skipped");
  });

  it("completes the record stage only once the commitment exists", () => {
    const approved: StageInput = {
      ...BASE,
      agentState: "APPROVED",
      status: "APPROVED",
      providersFound: 2,
      quotesRequested: 2,
      quotesReceived: 2,
      hasRecommendation: true,
      recommendedName: "Yaba Prints",
      decision: "APPROVED",
    };
    expect(stage(buildStages(approved), "record").status).toBe("active");
    expect(stage(buildStages({ ...approved, commitmentRecorded: true }), "record").status).toBe(
      "done",
    );
    expect(stage(buildStages(approved), "decide").label).toBe("You approved Yaba Prints");
  });

  it("skips recording when the buyer declined", () => {
    const s = buildStages({
      ...BASE,
      agentState: "DECLINED",
      status: "DECLINED",
      providersFound: 1,
      quotesRequested: 1,
      quotesReceived: 1,
      hasRecommendation: true,
      decision: "DECLINED",
    });
    expect(stage(s, "decide").label).toBe("You declined");
    expect(stage(s, "record").status).toBe("skipped");
  });

  it("mentions that ruled-out printers cost nothing", () => {
    const s = buildStages({
      ...BASE,
      agentState: "REQUESTING_QUOTES",
      providersFound: 3,
      quotesRequested: 2,
      ruledOutBeforeQuoting: 1,
    });
    expect(stage(s, "check").label).toBe("2 of 3 can take it on today");
    expect(stage(s, "check").detail).toMatch(/no fee was spent/);
  });
});

// --- error copy (Part 11) ---------------------------------------------------

describe("outcome copy — no engineering vocabulary reaches the buyer", () => {
  it("maps known outcomes to a cause and a way forward", () => {
    const copy = outcomeCopy("NO_QUOTES_RETURNED");
    expect(copy.title).toBe("Nobody replied in time");
    expect(copy.recovery).toBeTruthy();
    expect(copy.benign).toBe(true);
  });

  it("never surfaces a raw technical summary", () => {
    const copy = outcomeCopy("SOMETHING_NEW", "TOOL_TIMEOUT: No response within 15000ms.");
    expect(copy.body).not.toMatch(/TOOL_TIMEOUT/);
    expect(copy.title).toBe("That did not go through");
  });

  it("keeps a readable summary when the code is unknown but the sentence is fine", () => {
    const copy = outcomeCopy(null, "Every printer was busy this afternoon.");
    expect(copy.body).toBe("Every printer was busy this afternoon.");
  });

  it("recognises technical text", () => {
    expect(looksTechnical("HTTP_503 from upstream")).toBe(true);
    expect(looksTechnical("AbortError")).toBe(true);
    expect(looksTechnical("<html>not json</html>")).toBe(true);
    // Any SCREAMING_SNAKE code, not just a hard-coded list.
    expect(looksTechnical("its payment service reports PAYMENT_SERVICE_UNAVAILABLE")).toBe(true);
    expect(looksTechnical("GET /api/routes/active returned 200")).toBe(true);
    expect(looksTechnical("The printer did not reply.")).toBe(false);
    expect(looksTechnical("Yaba Reprographics answered with a quote for NGN 52,000.")).toBe(false);
  });

  it("explains an expired run and offers a restart", () => {
    const copy = requestErrorCopy("RUN_NOT_FOUND");
    expect(copy.offerRestart).toBe(true);
    expect(copy.body).toMatch(/30 minutes/);
  });

  it("treats a dropped connection as recoverable, not as a failure", () => {
    expect(requestErrorCopy("NETWORK").offerRestart).toBe(false);
    expect(requestErrorCopy("NETWORK").body).toMatch(/keeps working/);
  });
});

// --- clarification phrasing (Part 6) ----------------------------------------

describe("clarification questions are vetted before a buyer sees them", () => {
  it("rejects a model question that leaks internal field identifiers", () => {
    expect(
      isBuyerReadableQuestion("Could you confirm the quantity, size, deliveryArea for the flyers?"),
    ).toBe(false);
    expect(isBuyerReadableQuestion("Missing INCOMPLETE_BRIEF fields")).toBe(false);
    expect(isBuyerReadableQuestion("hi")).toBe(false);
  });

  it("accepts a question written the way a person would ask it", () => {
    expect(isBuyerReadableQuestion("How many flyers do you need, and where should they go?")).toBe(
      true,
    );
  });

  it("writes its own question as a continuation of the request", () => {
    const one = describeMissingFields(["quantity"]);
    expect(one).toBe(
      "I can find the right printer — I just need to know how many flyers you need.",
    );
    const two = describeMissingFields(["quantity", "deliveryArea"]);
    expect(two).toContain("how many flyers you need and where they should go");
    expect(two).not.toMatch(/deliveryArea/);
    expect(isBuyerReadableQuestion(two)).toBe(true);
  });
});

// --- the assembled view (Part 12) -------------------------------------------

describe("the run view keeps identifiers out of buyer-facing copy", () => {
  it("names the service, not its slug", async () => {
    const { toAgentRunView } = await import("./view");
    const { fakeIntra, ctxFor, runOpts } = await import("../testing/fake-intra");
    const { runBuyerAgent } = await import("../runtime/loop");

    const { fetchImpl } = fakeIntra([{ slug: "a", name: "A Prints", quote: {} }]);
    const result = await runBuyerAgent(
      "I need 500 A5 full colour flyers before Friday, delivered to UNILAG main gate",
      ctxFor(fetchImpl),
      runOpts(),
    );
    const view = toAgentRunView({
      runId: "r",
      buyerSessionId: "s",
      agentSessionId: "agent:x",
      agentId: "x",
      origin: "https://intra.test",
      request: result.intent.raw,
      mode: "deterministic",
      status: "AWAITING_APPROVAL",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      result,
      progress: null,
      model: { provider: "none", model: "-", configured: false, calls: 0 },
      clarification: null,
      decidedAt: null,
      error: null,
    });

    const service = view.recommendation!.details.find((d) => d.label === "Service");
    expect(service?.value).toBe("Flyer printing");
    // Nor may the buyer-facing surface carry the agent's own session.
    expect(JSON.stringify(view)).not.toContain("agent:x");
    expect(JSON.stringify(view)).not.toContain("buyerSessionId");
  });
});

// --- activity feed (Parts 14, 20) -------------------------------------------

const trace = (entries: Partial<TraceEntry>[]): TraceEntry[] =>
  entries.map((e, i) => ({
    at: `2026-09-02T10:0${i}:00.000Z`,
    kind: "decision",
    label: "X",
    ...e,
  })) as TraceEntry[];

describe("activity feed — who did what", () => {
  const input = {
    request: "I need 500 A5 flyers by Friday",
    decision: null,
    recommendedName: "Yaba Prints",
  };

  it("attributes each step to the right actor", () => {
    const items = buildActivity({
      ...input,
      entries: trace([
        { kind: "run_started", label: "run" },
        { kind: "model_response", label: "understand_intent" },
        { label: "PROVIDERS_FOUND", detail: "Found 3 printers offering flyer-printing." },
        { label: "QUOTE_RECEIVED", detail: "Yaba Prints answered with a received quote." },
        { kind: "approval_requested", label: "human_approval" },
        { kind: "approval_recorded", label: "approved" },
        { kind: "commitment", label: "COMMITMENT_ATTESTED" },
      ]),
    });

    expect(items.map((i) => i.actor)).toEqual([
      "you",
      "agent",
      "agent",
      "printer",
      "agent",
      "you",
      "system",
    ]);
    expect(items[0].text).toContain("I need 500 A5 flyers by Friday");
    expect(items[5].text).toBe("You approved it.");
  });

  it("drops every tool call, state change and model-plumbing event", () => {
    const items = buildActivity({
      ...input,
      entries: trace([
        { kind: "tool_called", label: "discoverProviders" },
        { kind: "tool_result", label: "discoverProviders" },
        { kind: "tool_failed", label: "getQuoteStatus", detail: "TOOL_TIMEOUT: no response" },
        { kind: "state_changed", label: "COMPARING" },
        { kind: "model_request", label: "select_offer" },
        { kind: "model_tool_selection", label: "requestQuote" },
      ]),
    });
    expect(items).toHaveLength(0);
  });

  it("refuses to print a decision whose text is technical", () => {
    const items = buildActivity({
      ...input,
      entries: trace([{ label: "DISCOVERY_FAILED", detail: "Could not list providers: HTTP_500" }]),
    });
    expect(items).toHaveLength(0);
  });

  it("shows adaptation as recovery, and a printer's silence as the printer's", () => {
    const items = buildActivity({
      ...input,
      entries: trace([
        { label: "PROVIDER_SILENT", detail: "Tolu Prints had not answered in time." },
        { label: "MODEL_REPLAN", detail: "Asked another printer instead." },
      ]),
    });
    expect(items[0]).toMatchObject({ actor: "printer", tone: "blocked" });
    expect(items[1]).toMatchObject({ actor: "agent", tone: "recovery" });
  });

  it("does not repeat the recommendation sentence it already has a card for", () => {
    const items = buildActivity({
      ...input,
      entries: trace([
        { label: "OFFER_SELECTED", detail: "Yaba Prints at NGN 52,000 — chosen over…" },
        { label: "MODEL_OFFER_SELECTED", detail: "Yaba Prints at NGN 52,000 — chosen over…" },
      ]),
    });
    expect(items).toHaveLength(0);
  });

  it("keeps a long run readable", () => {
    const many = trace(
      Array.from({ length: 60 }, (_, i) => ({
        label: "QUOTE_RECEIVED",
        detail: `Printer ${i} answered.`,
      })),
    );
    expect(buildActivity({ ...input, entries: many }, 10)).toHaveLength(10);
  });
});
