import { describe, expect, it } from "vitest";

import { briefFieldLabel, briefFieldValue } from "./brief-format";

/**
 * The one place a structured brief's raw keys/values become plain language
 * (frontend audit Priority 5, Target 3) — reused by the buyer's task page,
 * the WhatsApp order message, and the supplier's incoming-request view, so a
 * fix here fixes all three instead of three divergent copies.
 */
describe("briefFieldLabel", () => {
  it("maps the known flyer-brief keys to plain labels", () => {
    expect(briefFieldLabel("size")).toBe("Paper size");
    expect(briefFieldLabel("quantity")).toBe("How many");
    expect(briefFieldLabel("colour")).toBe("Colour");
    expect(briefFieldLabel("deadline")).toBe("Needed by");
    expect(briefFieldLabel("deliveryArea")).toBe("Delivery / pick-up");
  });

  it("titleises an unmapped camelCase key rather than showing it raw", () => {
    expect(briefFieldLabel("preferredPaperWeight")).toBe("Preferred paper weight");
    expect(briefFieldLabel("notes")).toBe("Notes");
  });
});

describe("briefFieldValue", () => {
  it("turns the hyphenated colour enum into plain language", () => {
    expect(briefFieldValue("colour", "full-colour")).toBe("Full colour");
    expect(briefFieldValue("colour", "black-and-white")).toBe("Black and white");
  });

  it("preserves every other value exactly, just as a string", () => {
    expect(briefFieldValue("size", "A5")).toBe("A5");
    expect(briefFieldValue("quantity", 200)).toBe("200");
    expect(briefFieldValue("deliveryArea", "Yaba")).toBe("Yaba");
  });

  it("trims incidental whitespace without altering the underlying value", () => {
    expect(briefFieldValue("deadline", "  Friday 3pm  ")).toBe("Friday 3pm");
  });
});
