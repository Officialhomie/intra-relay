import { describe, expect, it } from "vitest";

import { MODEL_TOOLS } from "../tools/registry";
import { MockModelProvider, type MockScript } from "../model/mock";
import { ctxFor, fakeIntra, runOpts } from "../testing/fake-intra";
import { runBuyerAgentAssisted, type AssistedRunOptions } from "./assisted";
import { submitApproval } from "./loop";

const REQUEST =
  "I need 500 A5 full colour flyers printed before Friday, delivered to UNILAG main gate";

function assisted(scripts: MockScript = {}, calls: string[] = []) {
  return { modelProvider: new MockModelProvider({ scripts, calls: calls as never }) };
}

/** Scenario 1 — a simple request runs to a recommendation. */
describe("assisted agent — scenario 1: simple request", () => {
  it("understands, quotes, compares and stops at the human", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "tolu", name: "Tolu Prints", quote: { amountMin: 48_000 } },
      { slug: "yaba", name: "Yaba Copy", quote: { amountMin: 45_000, turnaround: "48 hours" } },
    ]);
    const calls: string[] = [];
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({}, calls),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard).not.toBeNull();
    expect(out.model.calls).toBeGreaterThan(0);
    // model was asked to understand, plan and select
    expect(calls).toContain("understand_intent");
    expect(calls).toContain("select_offer");
    expect(out.result.trace.entries.some((e) => e.kind === "model_response")).toBe(true);
  });
});

/** Scenario 2 — an ambiguous request asks for clarification instead of guessing. */
describe("assisted agent — scenario 2: clarification", () => {
  it("stops in CLARIFICATION_NEEDED with a question, contacting nobody", async () => {
    const { fetchImpl, quoteRequests } = fakeIntra([
      { slug: "tolu", name: "Tolu Prints", quote: {} },
    ]);
    const out = await runBuyerAgentAssisted("I need some flyers printed soon", ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted(),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("CLARIFICATION_NEEDED");
    expect(out.clarification?.question).toBeTruthy();
    expect(out.clarification?.missing.length).toBeGreaterThan(0);
    expect(quoteRequests).toHaveLength(0);
  });
});

/** Scenario 3 — multiple offers; the model picks one and authors the rationale. */
describe("assisted agent — scenario 3: multiple offers", () => {
  it("lets the model choose among eligible offers and explain it", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "fast", name: "Fast Prints", quote: { amountMin: 52_000, turnaround: "6 hours" } },
      { slug: "cheap", name: "Cheap Prints", quote: { amountMin: 44_000, turnaround: "48 hours" } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        select_offer: {
          value: {
            selectedBusinessSlug: "cheap",
            reason: "Cheap Prints is ₦8,000 less and still finishes before Friday.",
            tradeoffs: ["Fast Prints would be a day quicker."],
            uncertainties: ["This is an estimate, not a fixed price."],
          },
        },
      }),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard?.businessSlug).toBe("cheap");
    expect(out.result.reasons.some((r) => r.code === "MODEL_OFFER_SELECTED")).toBe(true);
    expect(out.result.reasons.some((r) => r.code === "MODEL_TRADEOFF")).toBe(true);
    expect(out.result.approvalCard?.selectionReason).toContain("₦8,000 less");
  });

  it("ignores a model pick that is not an eligible offer and keeps the deterministic one", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "a", name: "A Prints", quote: { amountMin: 45_000 } },
      { slug: "b", name: "B Prints", quote: { amountMin: 60_000 } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        select_offer: {
          value: {
            selectedBusinessSlug: "ghost-printer",
            reason: "x",
            tradeoffs: [],
            uncertainties: [],
          },
        },
      }),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard?.businessSlug).toBe("a"); // cheaper deterministic pick
    expect(out.result.trace.entries.some((e) => e.kind === "model_fallback")).toBe(true);
  });
});

describe("assisted agent — the caveats a buyer reads", () => {
  it("keeps every deterministic caveat and drops the model's restatement of one", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "a", name: "A Prints", quote: { fixed: false } }]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        select_offer: {
          value: {
            selectedBusinessSlug: "a",
            reason: "The only usable quote.",
            tradeoffs: [],
            uncertainties: [
              // A restatement of a caveat the deterministic layer already makes.
              "Intra has not independently verified this price or turnaround.",
              // Something genuinely new.
              "The printer did not say whether delivery is included.",
            ],
          },
        },
      }),
    } as AssistedRunOptions);

    const caveats = out.result.approvalCard!.uncertainties;
    expect(caveats.some((c) => c.includes("not independently verified"))).toBe(true);
    expect(caveats.filter((c) => c.includes("not independently verified"))).toHaveLength(1);
    expect(caveats.some((c) => c.includes("whether delivery is included"))).toBe(true);
    // The deterministic estimate caveat survives the merge.
    expect(caveats.some((c) => /estimate/i.test(c))).toBe(true);
  });
});

/** Scenario 4 — an expired quote triggers model-driven replanning. */
describe("assisted agent — scenario 4: replan after an expired quote", () => {
  it("re-quotes a provider that was not asked, then compares again", async () => {
    const { fetchImpl, quoteRequests } = fakeIntra([
      { slug: "a", name: "A Prints", quote: { expiresAt: "2026-09-01T08:00:00.000Z" } }, // already expired
      { slug: "b", name: "B Prints", quote: { amountMin: 47_000 } },
      { slug: "c", name: "C Prints", quote: { amountMin: 46_000 } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        plan_quotes: {
          value: {
            quote: [{ businessSlug: "a", reason: "freshest listed" }],
            skip: [],
            note: "start narrow",
          },
        },
        replan: {
          value: {
            action: "requote",
            requoteBusinessSlugs: ["b"],
            reason: "A's quote is stale; ask B.",
          },
        },
      }),
    } as AssistedRunOptions);

    expect(quoteRequests).toEqual(["a", "b"]); // a first, then the replan target
    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard?.businessSlug).toBe("b");
    expect(out.result.reasons.some((r) => r.code === "MODEL_REPLAN")).toBe(true);
  });
});

/** Scenario 5 — a silent provider; the model picks another viable one. */
describe("assisted agent — scenario 5: provider silence", () => {
  it("replans onto a provider that will answer", async () => {
    const { fetchImpl, quoteRequests } = fakeIntra([
      { slug: "silent", name: "Silent Prints", quote: null },
      { slug: "backup", name: "Backup Prints", quote: { amountMin: 45_000 } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        plan_quotes: {
          value: { quote: [{ businessSlug: "silent", reason: "fastest SLA" }], skip: [], note: "" },
        },
        replan: {
          value: {
            action: "requote",
            requoteBusinessSlugs: ["backup"],
            reason: "Silent Prints never answered.",
          },
        },
      }),
    } as AssistedRunOptions);

    expect(quoteRequests).toEqual(["silent", "backup"]);
    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard?.businessSlug).toBe("backup");
  });

  it("stops cleanly when the model decides no re-quote is worthwhile", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "silent", name: "Silent Prints", quote: null }]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        replan: {
          value: {
            action: "stop",
            requoteBusinessSlugs: [],
            reason: "no other provider is worth a fee",
          },
        },
      }),
    } as AssistedRunOptions);
    expect(out.result.state).toBe("NO_VIABLE_OFFER");
  });
});

/** Scenario 6 — the model fails; the deterministic path carries the run. */
describe("assisted agent — scenario 6: model failure → deterministic fallback", () => {
  it("still reaches a recommendation when every model call errors", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "a", name: "A Prints", quote: { amountMin: 45_000 } },
      { slug: "b", name: "B Prints", quote: { amountMin: 60_000 } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        understand_intent: { error: "PROVIDER_ERROR" },
        plan_quotes: { error: "TIMEOUT" },
        select_offer: { raw: "the model is confused" },
      }),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.result.approvalCard?.businessSlug).toBe("a");
    expect(
      out.result.trace.entries.filter((e) => e.kind === "model_fallback").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("with the model disabled entirely, behaves exactly like the deterministic loop", async () => {
    const { fetchImpl } = fakeIntra([{ slug: "a", name: "A Prints", quote: {} }]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      modelProvider: null,
    } as AssistedRunOptions);
    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(out.model.configured).toBe(false);
    expect(out.model.calls).toBe(0);
    expect(out.result.trace.entries.some((e) => e.kind.startsWith("model_"))).toBe(false);
  });
});

/** Scenario 7 — the model can never reach the approval / ACCEPT path. */
describe("assisted agent — scenario 7: no model bypass of approval (BR-001)", () => {
  it("reaching a recommendation records no decision; only submitApproval can", async () => {
    const { fetchImpl, decisions, attestations } = fakeIntra([
      { slug: "tolu", name: "Tolu Prints", quote: {} },
    ]);
    const ctx = ctxFor(fetchImpl);
    const out = await runBuyerAgentAssisted(REQUEST, ctx, {
      ...runOpts(),
      ...assisted(),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(decisions).toHaveLength(0);
    expect(attestations).toHaveLength(0);

    // The model is not in this path at all — a human fingerprint is.
    const approved = await submitApproval(
      out.result,
      { granted: true, offerFingerprint: out.result.approvalCard!.offerFingerprint },
      ctx,
    );
    expect(approved.state).toBe("APPROVED");
    expect(decisions).toEqual([{ taskId: "task_tolu", decision: "ACCEPT", reason: undefined }]);
  });

  it("never exposes recordBuyerDecision (or any mutating final action) to the model", () => {
    const names = Object.keys(MODEL_TOOLS);
    expect(names).not.toContain("recordBuyerDecision");
    expect(names).not.toContain("placeOrder");
    expect(names).not.toContain("payProvider");
    expect(
      Object.values(MODEL_TOOLS).every((t) => t.mode === "read" || t.name === "requestQuote"),
    ).toBe(true);
  });
});

/** Scenario 8 — malformed / invalid model tool arguments fail safely. */
describe("assisted agent — scenario 8: malformed model output", () => {
  it("drops a plan that names providers policy never allowed, uses the deterministic plan", async () => {
    const { fetchImpl, quoteRequests } = fakeIntra([
      { slug: "a", name: "A Prints", quote: { amountMin: 45_000 } },
      { slug: "b", name: "B Prints", quote: { amountMin: 46_000 } },
    ]);
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      ...assisted({
        plan_quotes: {
          value: {
            quote: [
              { businessSlug: "not-a-real-provider", reason: "hallucinated" },
              { businessSlug: "also-fake", reason: "hallucinated" },
            ],
            skip: [],
            note: "",
          },
        },
      }),
    } as AssistedRunOptions);

    expect(out.result.state).toBe("AWAITING_APPROVAL");
    expect(quoteRequests.sort()).toEqual(["a", "b"]); // deterministic plan, not the hallucination
    expect(out.result.trace.entries.some((e) => e.kind === "model_fallback")).toBe(true);
  });

  it("caps model calls per run", async () => {
    const { fetchImpl } = fakeIntra([
      { slug: "a", name: "A Prints", quote: { expiresAt: "2026-09-01T08:00:00.000Z" } },
      { slug: "b", name: "B Prints", quote: { amountMin: 46_000 } },
    ]);
    const calls: string[] = [];
    const out = await runBuyerAgentAssisted(REQUEST, ctxFor(fetchImpl), {
      ...runOpts(),
      modelProvider: new MockModelProvider({
        calls: calls as never,
        scripts: {
          replan: { value: { action: "requote", requoteBusinessSlugs: ["b"], reason: "again" } },
        },
      }),
      limits: { maxCallsPerRun: 2 },
    } as AssistedRunOptions);

    expect(calls.length).toBeLessThanOrEqual(2);
    expect(out.result.trace.entries.some((e) => e.detail?.includes("CALL_BUDGET_EXCEEDED"))).toBe(
      true,
    );
    expect(out.result.state).toBe("AWAITING_APPROVAL");
  });
});
