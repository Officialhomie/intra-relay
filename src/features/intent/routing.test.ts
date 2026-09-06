import { describe, expect, it } from "vitest";

import { classifyMessage } from "./classify";
import { routeReading } from "./routing";
import type { UserIntent } from "./types";

/**
 * Routing a reading into the existing workflows (milestone 6 §14), and the
 * boundary the layer must not cross (§6, §31): it never accepts, pays, or marks
 * anything complete — it points the person back to the deterministic surface.
 */

const NOW = new Date("2026-09-03T09:00:00Z");

function route(message: string, intent: UserIntent = {}, hasOpenTransaction = false) {
  const reading = classifyMessage(message, { now: NOW, priorIntent: intent, hasOpenTransaction });
  return routeReading({
    reading,
    intent: { ...intent, ...reading.extracted },
    message,
    hasOpenTransaction,
  });
}

describe("conversational and informational messages get a reply, no workflow", () => {
  it("a greeting is answered in words", () => {
    const a = route("hey");
    expect(a.kind).toBe("REPLY");
  });

  it("a capability question explains what Intra can do", () => {
    const a = route("what can you do?");
    expect(a.kind).toBe("REPLY");
    if (a.kind === "REPLY") expect(a.message).toMatch(/printing/i);
  });
});

describe("progressive collection — ask only for what's needed", () => {
  it("a printing request with no quantity asks for the quantity, nothing else", () => {
    const a = route("I need flyers printed in Yaba");
    expect(a.kind).toBe("ASK");
    if (a.kind === "ASK") {
      expect(a.missing).toContain("quantity");
      expect(a.missing).not.toContain("location");
    }
  });

  it("a complete printing brief starts a quote against the real route", () => {
    const a = route("I need 500 A5 full-colour flyers by Friday, delivered to Yaba");
    expect(a.kind).toBe("START_QUOTE");
    if (a.kind === "START_QUOTE") {
      expect(a.category).toBe("printing");
      expect(a.routeSlug).toBeTruthy();
      // The whole accumulated brief is forwarded, not just the last message.
      expect(a.intent).toMatchObject({ quantity: 500, size: "A5", colour: "full colour" });
    }
  });

  it("a printing brief missing colour asks for colour before starting", () => {
    const a = route("I need 500 A5 flyers by Friday, delivered to Yaba");
    expect(a.kind).toBe("ASK");
    if (a.kind === "ASK") expect(a.missing).toContain("colour");
  });
});

describe("categories with no provider network are honest, not faked", () => {
  it("a food request explains there are no food businesses yet", () => {
    const a = route("I'm hungry, find me somewhere cheap to eat in Yaba");
    expect(a.kind).toBe("EXPLAIN_UNAVAILABLE");
    if (a.kind === "EXPLAIN_UNAVAILABLE") {
      expect(a.category).toBe("food");
      expect(a.message).not.toMatch(/₦|\$\d/); // no invented prices
    }
  });

  it("a used-phone request explains there are no electronics sellers yet", () => {
    const a = route("looking for a clean used iPhone 12 under 200k");
    expect(a.kind).toBe("EXPLAIN_UNAVAILABLE");
  });
});

describe("acting on an existing order never happens through chat", () => {
  it("'accept the quote' points back to the order, does not accept", () => {
    const a = route("accept the quote", {}, true);
    expect(a.kind).toBe("RESUME_TRANSACTION");
    if (a.kind === "RESUME_TRANSACTION") expect(a.message).toMatch(/won'?t|can'?t/i);
  });

  it("'I've picked it up' points back to the order for confirmation", () => {
    const a = route("I've picked it up");
    expect(a.kind).toBe("RESUME_FULFILLMENT");
  });
});
