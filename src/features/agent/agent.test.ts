import { describe, expect, it } from "vitest";

import { AgentHttpClient } from "./tools/client";
import { AGENT_TOOLS } from "./tools/registry";
import { runBuyerAgent, submitApproval } from "./runtime/loop";
import { briefFromIntent, missingBriefFields, parseBuyerIntent } from "./runtime/intent";
import { planCandidates } from "./policy/candidates";
import { selectOffer } from "./policy/offers";
import { evaluateApproval, buildApprovalCard, offerFingerprint } from "./policy/approval";
import { assertTransition, canTransition, isTerminal } from "./state";
import { AgentTrace, redact } from "./trace";
import type { ProviderCandidate, ProviderOffer } from "./types";

const NOW = new Date("2026-09-01T09:00:00.000Z");
const BASE = "https://intra.test";

// --- fake Intra ------------------------------------------------------------

interface FakeProvider {
  slug: string;
  name: string;
  available?: boolean;
  reason?: string;
  stale?: boolean;
  queryFeeUsd?: number;
  paymentAvailable?: boolean;
  sla?: number;
  priceConfirmedAt?: string;
  /** null = never answers. */
  quote?: Partial<ProviderOffer> | null;
  quoteAcceptError?: { status: number; code: string };
  capabilitiesError?: boolean;
}

function fakeIntra(providers: FakeProvider[], opts: { hang?: boolean; garbage?: boolean } = {}) {
  const decisions: { taskId: string; decision: string }[] = [];
  const taskFor = new Map<string, FakeProvider>();

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;

    // Real fetch rejects with AbortError when the signal fires; the fake must
    // too, otherwise the client's own timeout can never fire.
    if (opts.hang) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted) return abort();
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const okJson = (data: unknown, status = 200) => json({ success: true, data }, status);
    const errJson = (code: string, status: number) =>
      json({ success: false, error: { code, message: code } }, status);

    if (path === "/api/routes/active") {
      if (opts.garbage) return new Response("<html>not json</html>", { status: 200 });
      return okJson(
        providers.map((p) => ({
          routeSlug: "flyer-printing",
          routeName: "Flyer printing",
          responseSlaMinutes: p.sla ?? 60,
          priceUpdatedAt: p.priceConfirmedAt ?? "2026-08-31T09:00:00.000Z",
          quoteCurrency: "NGN",
          businessSlug: p.slug,
          businessName: p.name,
          city: "Lagos",
          country: "NG",
        })),
      );
    }

    const capMatch = path.match(/^\/v1\/([^/]+)\/capabilities$/);
    if (capMatch) {
      const p = providers.find((x) => x.slug === capMatch[1]);
      if (!p || p.capabilitiesError) return errJson("BUSINESS_NOT_FOUND", 404);
      const available = p.available !== false;
      return okJson({
        business: { name: p.name, city: "Lagos", country: "NG" },
        routes: [
          {
            slug: "flyer-printing",
            name: "Flyer printing",
            responseSlaMinutes: p.sla ?? 60,
            availability: {
              state: available ? "AVAILABLE" : "UNAVAILABLE",
              acceptingQuoteRequests: available,
              reason: p.reason ?? (available ? "OK" : "NOT_ACTIVE"),
              detail: available ? "Active and fresh." : "Route is paused.",
            },
            freshness: {
              priceConfirmedAt: p.priceConfirmedAt ?? "2026-08-31T09:00:00.000Z",
              staleAfter: "2026-09-14T09:00:00.000Z",
              stale: p.stale === true,
            },
            payment: {
              queryFeeUsd: p.queryFeeUsd ?? 0,
              available: p.paymentAvailable !== false,
              state: p.paymentAvailable === false ? "PAYMENT_SERVICE_UNAVAILABLE" : "AVAILABLE",
            },
          },
        ],
      });
    }

    const quoteMatch = path.match(/^\/v1\/([^/]+)\/([^/]+)\/quote$/);
    if (quoteMatch && init?.method === "POST") {
      const p = providers.find((x) => x.slug === quoteMatch[1])!;
      if (p.quoteAcceptError) return errJson(p.quoteAcceptError.code, p.quoteAcceptError.status);
      const taskId = `task_${p.slug}`;
      taskFor.set(taskId, p);
      return okJson({ outcome: "AWAITING_QUOTE", taskId, responseSlaMinutes: p.sla ?? 60 }, 202);
    }

    const decisionMatch = path.match(/^\/api\/tasks\/([^/]+)\/decision$/);
    if (decisionMatch && init?.method === "POST") {
      decisions.push({
        taskId: decisionMatch[1],
        decision: JSON.parse(String(init.body)).decision,
      });
      return okJson({ status: "HANDOFF_READY" });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const p = taskFor.get(taskMatch[1]);
      if (!p) return errJson("TASK_NOT_FOUND", 404);
      if (!p.quote) {
        return okJson({ task: { id: taskMatch[1], status: "AWAITING_QUOTE" }, quote: null });
      }
      return okJson({
        task: { id: taskMatch[1], status: "RECOMMENDED" },
        business: { name: p.name, slug: p.slug },
        route: { slug: "flyer-printing" },
        quote: {
          status: "RECEIVED",
          currency: "NGN",
          amountMin: 45_000,
          amountMax: null,
          deliveryCharge: 0,
          fixed: true,
          turnaround: "24 hours",
          confidence: "high",
          expiresAt: "2026-09-01T18:00:00.000Z",
          ...p.quote,
        },
      });
    }

    return errJson("NOT_FOUND", 404);
  }) as typeof fetch;

  return { fetchImpl, decisions };
}

function ctxFor(fetchImpl: typeof fetch) {
  return {
    http: new AgentHttpClient({ baseUrl: BASE, agentId: "agent-test", fetchImpl, timeoutMs: 50 }),
    agentId: "agent-test",
  };
}

const RUN_OPTS = {
  now: () => NOW,
  sleep: async () => {},
  quoteWaitMs: 30_000,
  pollIntervalMs: 1,
};

const REQUEST = "I need 500 A5 full colour flyers printed before Friday";

// --- intent ----------------------------------------------------------------

describe("intent parsing", () => {
  it("parses the canonical campus-printing request", () => {
    const intent = parseBuyerIntent(REQUEST, { now: NOW });
    expect(intent.quantity).toBe(500);
    expect(intent.size).toBe("A5");
    expect(intent.colour).toBe("full colour");
    expect(intent.deadline?.slice(0, 10)).toBe("2026-09-04"); // the coming Friday
    expect(missingBriefFields(intent)).toEqual([]);
    expect(briefFromIntent(intent)).toMatchObject({ quantity: 500, size: "A5" });
  });

  it("reports what is missing rather than guessing", () => {
    const intent = parseBuyerIntent("print some flyers", { now: NOW });
    expect(missingBriefFields(intent)).toContain("quantity");
    expect(missingBriefFields(intent)).toContain("deadline");
  });

  it("never lets a caller raise the fee budget past the hard cap", () => {
    expect(parseBuyerIntent(REQUEST, { now: NOW, maxQueryFeeUsd: 99 }).maxQueryFeeUsd).toBe(0.05);
  });
});

// --- candidate policy ------------------------------------------------------

function candidate(over: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    businessSlug: "a",
    businessName: "A Prints",
    routeSlug: "flyer-printing",
    routeName: "Flyer printing",
    city: "Lagos",
    country: "NG",
    responseSlaMinutes: 60,
    quoteCurrency: "NGN",
    priceUpdatedAt: "2026-08-31T09:00:00.000Z",
    availability: {
      state: "AVAILABLE",
      acceptingQuoteRequests: true,
      reason: "OK",
      detail: "ok",
    },
    freshness: {
      priceConfirmedAt: "2026-08-31T09:00:00.000Z",
      staleAfter: "2026-09-14T09:00:00.000Z",
      stale: false,
    },
    payment: { queryFeeUsd: 0, available: true, state: "AVAILABLE" },
    ...over,
  };
}

describe("candidate policy — is this worth querying?", () => {
  it("excludes an unavailable provider before spending anything", () => {
    const plan = planCandidates(
      [
        candidate({
          availability: {
            state: "UNAVAILABLE",
            acceptingQuoteRequests: false,
            reason: "NOT_VERIFIED",
            detail: "not verified",
          },
        }),
      ],
      { budgetUsd: 0.05, now: NOW },
    );
    expect(plan.toQuery).toHaveLength(0);
    expect(plan.skipped[0].disqualifiers[0].code).toBe("UNAVAILABLE_NOT_VERIFIED");
  });

  it("excludes a stale route", () => {
    const plan = planCandidates(
      [
        candidate({
          freshness: { priceConfirmedAt: "2026-01-01T00:00:00Z", staleAfter: "x", stale: true },
        }),
      ],
      { budgetUsd: 0.05, now: NOW },
    );
    expect(plan.toQuery).toHaveLength(0);
    expect(plan.skipped[0].disqualifiers.some((d) => d.code === "PRICE_STALE")).toBe(true);
  });

  it("stops querying when the run's fee budget is exhausted (AC: fee worth paying)", () => {
    const plan = planCandidates(
      [
        candidate({ businessSlug: "a", payment: { queryFeeUsd: 0.03, available: true, state: "AVAILABLE" } }),
        candidate({ businessSlug: "b", payment: { queryFeeUsd: 0.03, available: true, state: "AVAILABLE" } }),
      ],
      { budgetUsd: 0.05, now: NOW },
    );
    expect(plan.toQuery).toHaveLength(1);
    expect(plan.committedFeeUsd).toBeCloseTo(0.03);
    expect(plan.skipped[0].disqualifiers.some((d) => d.code === "OVER_RUN_BUDGET")).toBe(true);
  });

  it("refuses to pay a fee it cannot settle", () => {
    const plan = planCandidates(
      [candidate({ payment: { queryFeeUsd: 0.01, available: false, state: "PAYMENT_SERVICE_UNAVAILABLE" } })],
      { budgetUsd: 0.05, now: NOW },
    );
    expect(plan.toQuery).toHaveLength(0);
  });

  it("caps how many providers it queries", () => {
    const many = ["a", "b", "c", "d", "e"].map((s) => candidate({ businessSlug: s }));
    expect(planCandidates(many, { budgetUsd: 0.05, maxProviders: 3, now: NOW }).toQuery).toHaveLength(3);
  });
});

// --- offer policy ----------------------------------------------------------

function offer(over: Partial<ProviderOffer> = {}): ProviderOffer {
  return {
    businessSlug: "a",
    businessName: "A Prints",
    routeSlug: "flyer-printing",
    taskId: "task_a",
    status: "RECEIVED",
    currency: "NGN",
    amountMin: 45_000,
    amountMax: null,
    deliveryCharge: 0,
    fixed: true,
    turnaround: "24 hours",
    confidence: "high",
    expiresAt: "2026-09-01T18:00:00.000Z",
    availabilityNote: null,
    declineReason: null,
    ...over,
  };
}

const INTENT = parseBuyerIntent(REQUEST, { now: NOW });

describe("offer policy — comparison and selection", () => {
  it("disqualifies an expired quote", () => {
    const scored = selectOffer([offer({ expiresAt: "2026-09-01T08:00:00.000Z" })], INTENT, NOW);
    expect(scored.selected).toBeNull();
    expect(scored.ranked[0].disqualifiers.some((d) => d.code === "QUOTE_EXPIRED")).toBe(true);
  });

  it("disqualifies a quote that cannot meet the deadline", () => {
    const scored = selectOffer([offer({ turnaround: "2 weeks" })], INTENT, NOW);
    expect(scored.selected).toBeNull();
    expect(scored.ranked[0].disqualifiers.some((d) => d.code === "MISSES_DEADLINE")).toBe(true);
  });

  it("disqualifies a declined quote and says why", () => {
    const scored = selectOffer(
      [offer({ status: "DECLINED", declineReason: "out of card stock" })],
      INTENT,
      NOW,
    );
    expect(scored.selected).toBeNull();
    expect(scored.ranked[0].disqualifiers[0].statement).toContain("out of card stock");
  });

  it("prefers the cheaper of two otherwise equal quotes", () => {
    const scored = selectOffer(
      [offer({ businessSlug: "a", amountMin: 60_000 }), offer({ businessSlug: "b", businessName: "B Prints", taskId: "task_b", amountMin: 45_000 })],
      INTENT,
      NOW,
    );
    expect(scored.selected?.offer.businessSlug).toBe("b");
  });

  it("can justify paying more for a materially faster turnaround", () => {
    const scored = selectOffer(
      [
        offer({ businessSlug: "fast", businessName: "Fast", taskId: "t1", amountMin: 46_000, turnaround: "6 hours" }),
        offer({ businessSlug: "slow", businessName: "Slow", taskId: "t2", amountMin: 45_000, turnaround: "48 hours" }),
      ],
      INTENT,
      NOW,
    );
    expect(scored.selected?.offer.businessSlug).toBe("fast");
    expect(scored.selectionReason).toMatch(/faster|costing/);
  });

  it("always states what it cannot stand behind", () => {
    const scored = selectOffer([offer({ fixed: false })], INTENT, NOW);
    expect(scored.uncertainties.join(" ")).toContain("not independently verified");
    expect(scored.uncertainties.join(" ")).toContain("estimate");
  });
});

// --- approval gate ---------------------------------------------------------

describe("human approval gate (BR-001)", () => {
  const selection = selectOffer([offer()], INTENT, NOW);

  it("refuses to proceed without an approval", () => {
    const gate = evaluateApproval(selection, null);
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.code).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  it("refuses an approval given against a different offer", () => {
    const gate = evaluateApproval(selection, { granted: true, offerFingerprint: "stale" });
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.code).toBe("APPROVAL_STALE");
  });

  it("allows only an approval bound to the exact offer shown", () => {
    const card = buildApprovalCard(selection)!;
    expect(evaluateApproval(selection, { granted: true, offerFingerprint: card.offerFingerprint }).allowed).toBe(true);
  });

  it("changes the fingerprint when any priced term moves", () => {
    const base = { taskId: "t", businessSlug: "a", currency: "NGN", amountMin: 1, amountMax: null, deliveryCharge: null, turnaround: "24 hours", expiresAt: null };
    expect(offerFingerprint(base)).not.toBe(offerFingerprint({ ...base, amountMin: 2 }));
  });

  it("states plainly that Intra neither orders nor pays", () => {
    expect(buildApprovalCard(selection)!.finalOrderStatement).toMatch(/never moves your money/);
  });
});

// --- state machine ---------------------------------------------------------

describe("run state machine", () => {
  it("allows the happy path and forbids skipping the approval stop", () => {
    expect(canTransition("COMPARING", "AWAITING_APPROVAL")).toBe(true);
    expect(canTransition("COMPARING", "APPROVED")).toBe(false);
    expect(canTransition("CREATED", "APPROVED")).toBe(false);
  });

  it("allows adapting back to planning when quotes are unusable", () => {
    expect(canTransition("AWAITING_QUOTES", "PLANNING")).toBe(true);
    expect(canTransition("COMPARING", "PLANNING")).toBe(true);
  });

  it("treats approved/declined/failed as terminal", () => {
    expect(isTerminal("APPROVED")).toBe(true);
    expect(isTerminal("COMPARING")).toBe(false);
    expect(() => assertTransition("APPROVED", "COMPARING")).toThrow(/Illegal agent run transition/);
  });
});

// --- trace -----------------------------------------------------------------

describe("trace observability", () => {
  it("redacts secrets at any depth", () => {
    const out = redact({ ok: 1, apiKey: "sk-x", nested: { sessionId: "s", handoverCode: "ABCD" } }) as Record<string, unknown>;
    expect(out.ok).toBe(1);
    expect(out.apiKey).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).sessionId).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).handoverCode).toBe("[redacted]");
  });

  it("records structured decisions, not free-form model reasoning", () => {
    const trace = new AgentTrace("print flyers");
    trace.decision({ code: "OFFER_SELECTED", statement: "B was cheaper." });
    const entry = trace.entriesOfKind("decision")[0];
    expect(entry.label).toBe("OFFER_SELECTED");
    expect(entry.detail).toBe("B was cheaper.");
  });
});

// --- full loop -------------------------------------------------------------

describe("buyer agent loop (milestone 1)", () => {
  it("runs the canonical campus-printing flow end to end", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "tolu", name: "Tolu Prints", quote: { amountMin: 48_000, turnaround: "24 hours" } },
      { slug: "yaba", name: "Yaba Copy", quote: { amountMin: 45_000, turnaround: "48 hours" } },
      { slug: "gra", name: "GRA Digital", quote: { amountMin: 52_000, turnaround: "6 hours" } },
    ]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);

    expect(result.state).toBe("AWAITING_APPROVAL");
    expect(result.candidates).toHaveLength(3);
    expect(result.offers).toHaveLength(3);
    expect(result.selection?.selected).not.toBeNull();
    expect(result.approvalCard).not.toBeNull();
    expect(result.approvalCard!.selectionReason).toBeTruthy();
    // The trace is the demo artefact: tool calls AND a reason for the choice.
    expect(result.trace.entries.filter((e) => e.kind === "tool_called").length).toBeGreaterThan(5);
    expect(result.trace.entries.some((e) => e.label === "OFFER_SELECTED")).toBe(true);
  });

  it("handles zero providers without spending anything", async () => {
    const { fetchImpl } = fakeIntra([]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("NO_VIABLE_OFFER");
    expect(result.reasons.some((r) => r.code === "NO_PROVIDERS")).toBe(true);
  });

  it("handles a single provider", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("AWAITING_APPROVAL");
    expect(result.selection!.selectionReason).toContain("only usable quote");
  });

  it("continues when one provider's capability document is unreadable", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "broken", name: "Broken", capabilitiesError: true },
      { slug: "tolu", name: "Tolu Prints", quote: {} },
    ]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("AWAITING_APPROVAL");
    expect(result.reasons.some((r) => r.code === "CAPABILITIES_UNREADABLE")).toBe(true);
  });

  it("reports provider silence rather than inventing a quote", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "silent", name: "Silent Prints", quote: null },
      { slug: "tolu", name: "Tolu Prints", quote: {} },
    ]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.reasons.some((r) => r.code === "PROVIDER_SILENT")).toBe(true);
    expect(result.offers).toHaveLength(1);
  });

  it("ends cleanly when nobody answers", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "silent", name: "Silent", quote: null }]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("NO_VIABLE_OFFER");
    expect(result.reasons.some((r) => r.code === "NO_QUOTES_RETURNED")).toBe(true);
  });

  it("survives a provider timeout", async () => {
    const { fetchImpl } = fakeIntra([], { hang: true });
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("FAILED");
    expect(result.reasons.some((r) => r.code === "TOOL_TIMEOUT")).toBe(true);
  });

  it("survives an invalid (non-JSON) provider response", async () => {
    const { fetchImpl } = fakeIntra([], { garbage: true });
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(isTerminal(result.state)).toBe(true);
    expect(result.state).not.toBe("AWAITING_APPROVAL");
  });

  it("refuses to record a purchase decision without human approval", async () => {
    const { fetchImpl, decisions } = fakeIntra([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    const ctx = ctxFor(fetchImpl);
    const result = await runBuyerAgent(REQUEST, ctx, RUN_OPTS);

    const rejected = await submitApproval(
      result,
      { granted: true, offerFingerprint: "not-the-offer-shown" },
      ctx,
    );
    expect(rejected.state).toBe("AWAITING_APPROVAL");
    expect(decisions).toHaveLength(0); // nothing was recorded

    const approved = await submitApproval(
      result,
      { granted: true, offerFingerprint: result.approvalCard!.offerFingerprint },
      ctx,
    );
    expect(approved.state).toBe("APPROVED");
    expect(decisions).toEqual([{ taskId: "task_tolu", decision: "ACCEPT" }]);
  });

  it("records a human decline as a legitimate outcome", async () => {
    const { fetchImpl, decisions } = fakeIntra([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    const ctx = ctxFor(fetchImpl);
    const result = await runBuyerAgent(REQUEST, ctx, RUN_OPTS);
    const declined = await submitApproval(
      result,
      { granted: false, offerFingerprint: result.approvalCard!.offerFingerprint, reason: "too slow" },
      ctx,
    );
    expect(declined.state).toBe("DECLINED");
    expect(decisions[0].decision).toBe("DECLINE");
  });

  it("stops before any fee when every provider is unavailable", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "a", name: "A", available: false },
      { slug: "b", name: "B", stale: true },
    ]);
    const result = await runBuyerAgent(REQUEST, ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("NO_VIABLE_OFFER");
    expect(result.plan!.committedFeeUsd).toBe(0);
  });

  it("refuses an incomplete brief before contacting anyone", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "tolu", name: "Tolu", quote: {} }]);
    const result = await runBuyerAgent("print some flyers", ctxFor(fetchImpl), RUN_OPTS);
    expect(result.state).toBe("FAILED");
    expect(result.reasons[0].code).toBe("INCOMPLETE_BRIEF");
  });

  it("exposes no tool that could place an order or move money (BR-001)", () => {
    const names = Object.keys(AGENT_TOOLS);
    expect(names).not.toContain("placeOrder");
    expect(names).not.toContain("payProvider");
    expect(names.filter((n) => AGENT_TOOLS[n as keyof typeof AGENT_TOOLS].mutating).sort()).toEqual([
      "recordBuyerDecision",
      "requestQuote",
    ]);
  });
});
