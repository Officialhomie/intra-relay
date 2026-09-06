import { afterEach, describe, expect, it } from "vitest";

import { handleConversationTurn } from "./conversation";
import { __resetConversations } from "./memory";

/**
 * The human experience, end to end through the conversational layer
 * (milestone 6 §32–§33). These drive the layer the way the acceptance
 * scenarios do — as a person talking — and check that a workflow starts only
 * on real, complete commercial intent, and never for a category with no
 * provider network.
 */

afterEach(() => __resetConversations());

const NOW = new Date("2026-09-03T09:00:00Z"); // Thursday

function turn(sessionId: string, message: string, hasOpenTransaction = false) {
  return handleConversationTurn({ sessionId, message, hasOpenTransaction, now: NOW });
}

describe("Scenario B — conversational entry into a print job", () => {
  it("greets, answers a question, then starts a run once the brief is complete", () => {
    const hello = turn("b", "Hi");
    expect(hello.intent).toBe("CONVERSATION");
    expect(hello.action.kind).toBe("NONE");

    const question = turn("b", "Do you print flyers?");
    expect(question.intent).toBe("INFORMATIONAL");
    expect(question.action.kind).toBe("NONE");
    expect(question.message).toMatch(/flyer|printing/i);

    const partial = turn("b", "I need 500 of them");
    expect(partial.action.kind).toBe("NEEDS_INFO");
    expect(partial.understood.quantity).toBe(500);

    // The layer visibly remembers earlier turns (§8): each new detail is added
    // to the accumulated brief, not treated as a fresh request.
    const details = turn("b", "A5, full colour");
    expect(details.action.kind).toBe("NEEDS_INFO");
    expect(details.understood).toMatchObject({ quantity: 500, size: "A5", colour: "full colour" });

    const go = turn("b", "by Friday, delivered to Yaba");
    expect(go.action.kind).toBe("START_RUN");
    expect(go.understood).toMatchObject({
      category: "printing",
      quantity: 500,
      size: "A5",
      colour: "full colour",
      location: "Yaba",
    });
    // The whole brief is handed to the run, not just "by Friday, delivered to Yaba".
    expect(go.action.brief).toMatchObject({
      quantity: 500,
      size: "A5",
      colour: "full colour",
      deliveryArea: "Yaba",
    });
    expect(go.action.brief?.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Scenario C — cheapest dinner (intent represented, marketplace NOT built)", () => {
  it("carries context across turns and ends with an honest 'not available'", () => {
    turn("c", "I'm hungry");
    turn("c", "somewhere cheap");
    const final = turn("c", "in Yaba");

    expect(final.understood.category).toBe("food");
    expect(final.understood.location).toBe("Yaba");
    expect(final.optimization).toBe("CHEAPEST");
    expect(final.action.kind).toBe("UNAVAILABLE");
    // No fabricated businesses, prices or receipts (CLAUDE.md §4.1).
    expect(final.message).not.toMatch(/₦\s?\d|\$\d/);
    expect(final.message.toLowerCase()).toContain("food");
  });
});

describe("Scenario D — used phone (intent represented, marketplace NOT built)", () => {
  it("reads condition and budget but does not invent a listing", () => {
    const r = turn("d", "I want to buy a clean used iPhone 12 under 200k in Ikeja");
    expect(r.understood).toMatchObject({ category: "electronics", condition: "used" });
    expect(r.understood.budget).toEqual({ amount: 200000, currency: "NGN" });
    expect(r.action.kind).toBe("UNAVAILABLE");
  });
});

describe("acting on an order never happens in chat (§6, §31)", () => {
  it("'accept the quote' with an open order points back to the order surface", () => {
    const r = turn("e", "accept the quote please", true);
    expect(r.intent).toBe("TRANSACTION");
    expect(r.action.kind).toBe("RESUME_ORDER");
    expect(r.message).toMatch(/won'?t|can'?t|your/i);
  });
});

describe("a fulfilment instruction is not a topic switch (§9)", () => {
  it("'deliver to Yaba' finishes a print brief, it does not start a delivery request", () => {
    turn("f", "I need 500 A5 full colour flyers");
    const go = turn("f", "by Friday, deliver to Yaba");
    expect(go.action.kind).toBe("START_RUN");
    expect(go.understood).toMatchObject({ category: "printing", quantity: 500, location: "Yaba" });
  });
});

describe("starting over forgets the brief but not the person's orders (§9)", () => {
  it("resetConversation clears the accumulated intent", async () => {
    turn("g", "I need 1000 flyers by Monday in Surulere");
    const { resetConversation } = await import("./conversation");
    resetConversation("g");
    const after = turn("g", "hello");
    expect(after.understood).toEqual({});
    expect(after.action.kind).toBe("NONE");
  });
});

describe("conversation memory is per session (§30)", () => {
  it("does not leak one person's brief into another's conversation", () => {
    turn("p1", "I need 1000 flyers by Monday in Surulere");
    const other = turn("p2", "hello");
    expect(other.understood).toEqual({});
  });
});
