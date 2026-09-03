import { describe, expect, it } from "vitest";

import { classifyMessage } from "./classify";
import type { UserIntent } from "./types";

/**
 * The natural-language test matrix (milestone 6 §29). Each case is a thing a
 * first-time Nigerian user might type; the layer must read it correctly without
 * a model.
 */

const NOW = new Date("2026-09-03T09:00:00Z"); // a Thursday

const read = (msg: string, ctx?: Parameters<typeof classifyMessage>[1]) =>
  classifyMessage(msg, { now: NOW, ...ctx });

describe("non-commercial messages stay conversational", () => {
  it("a greeting is CONVERSATION, not a workflow", () => {
    const r = read("Hey");
    expect(r.intent).toBe("CONVERSATION");
    expect(r.commercial).toBe(false);
  });

  it("thanks is CONVERSATION", () => {
    expect(read("thank you!").intent).toBe("CONVERSATION");
  });

  it("a bare acknowledgement is CONVERSATION", () => {
    expect(read("ok cool").intent).toBe("CONVERSATION");
  });
});

describe("questions about capability are INFORMATIONAL", () => {
  it("'Do you print flyers?' asks, it does not request", () => {
    const r = read("Do you print flyers?");
    expect(r.intent).toBe("INFORMATIONAL");
    expect(r.commercial).toBe(false);
    expect(r.extracted.category).toBe("printing");
  });

  it("'How does this work?' is INFORMATIONAL", () => {
    expect(read("How does this work?").intent).toBe("INFORMATIONAL");
  });
});

describe("commercial intent is detected", () => {
  it("'find someone who can print flyers near Yaba' is DISCOVERY", () => {
    const r = read("find someone who can print flyers near Yaba");
    expect(r.intent).toBe("DISCOVERY");
    expect(r.commercial).toBe(true);
    expect(r.extracted.category).toBe("printing");
    expect(r.extracted.location).toBe("Yaba");
  });

  it("'which one is cheapest?' is COMPARISON with a CHEAPEST preference", () => {
    const r = read("which one is cheapest?");
    expect(r.intent).toBe("COMPARISON");
    expect(r.optimization).toBe("CHEAPEST");
  });

  it("'I need 500 flyers by Friday' is a QUOTE_REQUEST", () => {
    const r = read("I need 500 flyers by Friday");
    expect(r.intent).toBe("QUOTE_REQUEST");
    expect(r.extracted.quantity).toBe(500);
    expect(r.extracted.deadline?.phrase).toBe("by friday");
    expect(r.extracted.deadline?.iso).not.toBeNull();
  });

  it("a deadline-only constraint still reads the deadline", () => {
    expect(read("can you get it done by tomorrow?").extracted.deadline?.phrase).toBe("tomorrow");
  });

  it("a combined constraint reads quantity, deadline and area", () => {
    const r = read("I want 250 A5 flyers in full colour by Monday, delivered to Akoka");
    expect(r.intent).toBe("QUOTE_REQUEST");
    expect(r.extracted.quantity).toBe(250);
    expect(r.extracted.location).toBe("Akoka");
    expect(r.extracted.fulfillmentPreference).toBe("delivery");
  });
});

describe("optimization phrases", () => {
  it("reads 'cheap' / 'nearest' / 'as fast as possible' / 'open now'", () => {
    expect(read("something cheap").optimization).toBe("CHEAPEST");
    expect(read("the nearest one").optimization).toBe("NEAREST");
    expect(read("as fast as possible please").optimization).toBe("FASTEST");
    expect(read("anywhere open now").optimization).toBe("AVAILABLE_NOW");
  });
});

describe("other categories are still classified (marketplace not built)", () => {
  it("'I'm hungry, somewhere cheap in Yaba' reads as a food QUOTE/DISCOVERY intent", () => {
    const r = read("I'm hungry, somewhere cheap to eat in Yaba");
    expect(r.commercial).toBe(true);
    expect(r.extracted.category).toBe("food");
    expect(r.extracted.location).toBe("Yaba");
    expect(r.optimization).toBe("CHEAPEST");
  });

  it("'looking for a clean used iPhone 12 under 200k' reads condition + budget", () => {
    const r = read("looking for a clean used iPhone 12 under 200k");
    expect(r.commercial).toBe(true);
    expect(r.extracted.category).toBe("electronics");
    expect(r.extracted.condition).toBe("used");
    expect(r.extracted.budget).toEqual({ amount: 200000, currency: "NGN" });
  });
});

describe("acting on an existing order", () => {
  it("'accept the quote' with an open transaction is TRANSACTION", () => {
    const r = read("accept the quote", { hasOpenTransaction: true });
    expect(r.intent).toBe("TRANSACTION");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("'I've picked it up' is FULFILLMENT", () => {
    expect(read("I've picked it up from the shop").intent).toBe("FULFILLMENT");
  });
});

describe("context carries across turns", () => {
  it("a bare '500' completes a printing brief already in progress", () => {
    const prior: UserIntent = { category: "printing", service: "flyers" };
    const r = read("500", { priorIntent: prior });
    expect(r.intent).toBe("QUOTE_REQUEST");
    expect(r.extracted.quantity).toBe(500);
  });

  it("a quantity that completes a brief is a QUOTE_REQUEST even when a deadline is already known", () => {
    // Regression: previously misread as DISCOVERY once prior had a deadline, so
    // the run started with only the last message and the agent rejected it.
    const prior: UserIntent = {
      category: "printing",
      service: "flyers",
      deadline: { phrase: "by friday", iso: "2026-09-04T22:59:59.000Z" },
      location: "Yaba",
      size: "A5",
      colour: "full colour",
    };
    const r = read("500", { priorIntent: prior });
    expect(r.intent).toBe("QUOTE_REQUEST");
    expect(r.extracted.quantity).toBe(500);
  });

  it("reads paper size and colour from plain language", () => {
    expect(read("A5 full colour").extracted).toMatchObject({ size: "A5", colour: "full colour" });
    expect(read("make them black and white").extracted.colour).toBe("black and white");
    expect(read("A4 please").extracted.size).toBe("A4");
  });

  it("reads a leading quantity when the brief is waiting on one", () => {
    const prior: UserIntent = { category: "printing", service: "flyers" };
    const r = read("500 A5 full colour", { priorIntent: prior });
    expect(r.extracted).toMatchObject({ quantity: 500, size: "A5", colour: "full colour" });
  });

  it("does not read a trailing model number as a quantity", () => {
    // No printing brief in progress, so "12" in "iPhone 12" is never a quantity.
    expect(read("looking for a used iPhone 12").extracted.quantity).toBeUndefined();
  });
});
