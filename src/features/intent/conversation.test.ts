// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";

import { MockModelProvider } from "../agent/model/mock";
import type { ModelProvider, ModelPurpose } from "../agent/model/types";
import { handleConversationTurn } from "./conversation";

/**
 * The human experience, end to end through the conversational layer
 * (milestone 6 §32–§33; milestone 10.4). These drive the layer the way the
 * acceptance scenarios do — as a person talking — and check that a workflow
 * starts only on real, complete commercial intent, and never for a category
 * with no provider network. Conversation state is now durable (M10.4), so
 * this is an integration test against a fresh embedded database per test —
 * exactly what already isolates every other DB-backed test in this repo.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const NOW = new Date("2026-09-03T09:00:00Z"); // Thursday

function turn(
  sessionId: string,
  message: string,
  hasOpenTransaction = false,
  modelProvider?: ModelProvider | null,
) {
  return handleConversationTurn(db, {
    sessionId,
    message,
    hasOpenTransaction,
    now: NOW,
    modelProvider,
  });
}

describe("Scenario B — conversational entry into a print job", () => {
  it("greets, answers a question, then starts a run once the brief is complete", async () => {
    const hello = await turn("b", "Hi");
    expect(hello.intent).toBe("CONVERSATION");
    expect(hello.action.kind).toBe("NONE");

    const question = await turn("b", "Do you print flyers?");
    expect(question.intent).toBe("INFORMATIONAL");
    expect(question.action.kind).toBe("NONE");
    expect(question.message).toMatch(/flyer|printing/i);

    const partial = await turn("b", "I need 500 of them");
    expect(partial.action.kind).toBe("NEEDS_INFO");
    expect(partial.understood.quantity).toBe(500);

    // The layer visibly remembers earlier turns (§8): each new detail is added
    // to the accumulated brief, not treated as a fresh request.
    const details = await turn("b", "A5, full colour");
    expect(details.action.kind).toBe("NEEDS_INFO");
    expect(details.understood).toMatchObject({ quantity: 500, size: "A5", colour: "full colour" });

    const go = await turn("b", "by Friday, delivered to Yaba");
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

  it("forwards the accumulated optimization preference and budget into a print run", async () => {
    const go = await turn(
      "preference-bridge",
      "I need 500 A5 full colour flyers under ₦50k, fastest possible, by Friday, delivered to Yaba",
    );
    expect(go.action.kind).toBe("START_RUN");
    expect(go.action.brief).toMatchObject({
      optimization: "FASTEST",
      budget: { amount: 50_000, currency: "NGN" },
    });
  });
});

describe("Scenario C — cheapest dinner (intent represented, marketplace NOT built)", () => {
  it("carries context across turns and ends with an honest 'not available'", async () => {
    await turn("c", "I'm hungry");
    await turn("c", "somewhere cheap");
    const final = await turn("c", "in Yaba");

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
  it("reads condition and budget but does not invent a listing", async () => {
    const r = await turn("d", "I want to buy a clean used iPhone 12 under 200k in Ikeja");
    expect(r.understood).toMatchObject({ category: "electronics", condition: "used" });
    expect(r.understood.budget).toEqual({ amount: 200000, currency: "NGN" });
    expect(r.action.kind).toBe("UNAVAILABLE");
  });
});

describe("acting on an order never happens in chat (§6, §31)", () => {
  it("'accept the quote' with an open order points back to the order surface", async () => {
    const r = await turn("e", "accept the quote please", true);
    expect(r.intent).toBe("TRANSACTION");
    expect(r.action.kind).toBe("RESUME_ORDER");
    expect(r.message).toMatch(/won'?t|can'?t|your/i);
  });
});

describe("a fulfilment instruction is not a topic switch (§9)", () => {
  it("'deliver to Yaba' finishes a print brief, it does not start a delivery request", async () => {
    await turn("f", "I need 500 A5 full colour flyers");
    const go = await turn("f", "by Friday, deliver to Yaba");
    expect(go.action.kind).toBe("START_RUN");
    expect(go.understood).toMatchObject({ category: "printing", quantity: 500, location: "Yaba" });
  });
});

describe("starting over forgets the brief but not the person's orders (§9)", () => {
  it("resetConversation clears the accumulated intent", async () => {
    await turn("g", "I need 1000 flyers by Monday in Surulere");
    const { resetConversation } = await import("./conversation");
    await resetConversation(db, "g");
    const after = await turn("g", "hello");
    expect(after.understood).toEqual({});
    expect(after.action.kind).toBe("NONE");
  });
});

describe("conversation memory is per session (§30)", () => {
  it("does not leak one person's brief into another's conversation", async () => {
    await turn("p1", "I need 1000 flyers by Monday in Surulere");
    const other = await turn("p2", "hello");
    expect(other.understood).toEqual({});
  });
});

describe("multi-turn accumulation and correction (milestone 10.4)", () => {
  it("300 flyers -> A4 -> full colour -> Friday afternoon -> deliver to UNILAG retains every fact", async () => {
    await turn("h", "I need 300 flyers.");
    await turn("h", "A4.");
    await turn("h", "Full colour.");
    await turn("h", "Friday afternoon.");
    const go = await turn("h", "Deliver to UNILAG.");

    expect(go.understood).toMatchObject({
      category: "printing",
      quantity: 300,
      size: "A4",
      colour: "full colour",
      location: "UNILAG",
    });
    expect(go.action.kind).toBe("START_RUN");
  });

  it("a later correction overrides the earlier value and is reported as a correction", async () => {
    await turn("i", "I need 300 flyers");
    const corrected = await turn("i", "actually make it 500");

    expect(corrected.understood.quantity).toBe(500);
    expect(corrected.changed).toContain("quantity");
    expect(corrected.corrected).toContain("quantity");
  });

  it("a first-time fill is not reported as a correction", async () => {
    const first = await turn("j", "I need 300 flyers");
    expect(first.changed).toContain("quantity");
    expect(first.corrected).not.toContain("quantity");
  });

  it("repeating the same value again changes nothing and corrects nothing", async () => {
    await turn("k", "I need 300 flyers");
    const again = await turn("k", "300 flyers please");
    expect(again.changed).not.toContain("quantity");
    expect(again.corrected).not.toContain("quantity");
  });

  it("an irrelevant conversational aside mid-brief does not lose what was already known", async () => {
    await turn("l", "I need 300 flyers");
    await turn("l", "thanks for the help");
    const go = await turn("l", "A4, full colour, by Friday, deliver to Yaba");
    expect(go.understood).toMatchObject({ quantity: 300, size: "A4", colour: "full colour" });
  });

  it("state survives across separate handleConversationTurn calls against the same database", async () => {
    await turn("m", "I need 300 flyers");
    // A brand-new call, same shape as a fresh serverless invocation would make —
    // nothing but the database carries the state between them.
    const go = await turn("m", "A4, full colour, by Friday, deliver to Yaba");
    expect(go.understood.quantity).toBe(300);
  });
});

describe("assisted fallback for vocabulary the deterministic layer has no keyword for (milestone 10.4)", () => {
  it("with no model configured, an unrecognised word gets the same honest 'tell me more' as always", async () => {
    const r = await turn("n1", "I need a mechanic for my car", false, null);
    expect(r.action.kind).toBe("NONE");
    expect(r.understood.category).toBeUndefined();
  });

  it("routes an unrecognised word through the model to a known category, then the UNCHANGED domain rule decides availability", async () => {
    const provider = new MockModelProvider({
      scripts: {
        classify_conversation: {
          value: {
            category: "repair",
            service: "car repair",
            confidence: "high",
            clarificationQuestion: null,
          },
        },
      },
    });
    const r = await turn("n2", "I need a mechanic for my car", false, provider);
    expect(r.understood.category).toBe("repair");
    expect(r.action.kind).toBe("UNAVAILABLE");
    expect(r.message.toLowerCase()).toContain("repair");
    // The model only named a category — it never invented a price or a business.
    expect(r.message).not.toMatch(/₦\s?\d|\$\d/);
  });

  it("asks the model's clarification question rather than the generic loop when it cannot classify", async () => {
    const provider = new MockModelProvider({
      scripts: {
        classify_conversation: {
          value: {
            category: "unclear",
            service: null,
            confidence: "low",
            clarificationQuestion: "Could you say a bit more about what you're looking for?",
          },
        },
      },
    });
    const r = await turn("n3", "asdkfj random text", false, provider);
    expect(r.action.kind).toBe("NEEDS_INFO");
    expect(r.message).toBe("Could you say a bit more about what you're looking for?");
  });

  it("never reaches the model once a category is already known mid-brief", async () => {
    const calls: ModelPurpose[] = [];
    const provider = new MockModelProvider({ calls });
    await turn("n4", "I need 300 flyers", false, provider);
    await turn("n4", "asdkfj unrelated gibberish", false, provider);
    expect(calls).toEqual([]);
  });
});
