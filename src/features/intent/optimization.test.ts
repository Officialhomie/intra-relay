import { describe, expect, it } from "vitest";

import { explainOptimization, readOptimization } from "./optimization";
import { OPTIMIZATION_PREFERENCES } from "./types";

/**
 * Optimization intent (milestone 6 §8): read from plain language, explained back
 * in plain language, never shown as an enum or a scoring formula.
 */

describe("reading a preference", () => {
  it("maps common phrasings", () => {
    expect(readOptimization("the cheapest one")).toBe("CHEAPEST");
    expect(readOptimization("whichever is closest to me")).toBe("NEAREST");
    expect(readOptimization("I need it as fast as possible")).toBe("FASTEST");
    expect(readOptimization("somewhere open now")).toBe("AVAILABLE_NOW");
    expect(readOptimization("best value for money")).toBe("BEST_VALUE");
    expect(readOptimization("the earliest you can do")).toBe("EARLIEST");
  });

  it("returns null when no preference is stated", () => {
    expect(readOptimization("I need 500 flyers by Friday")).toBeNull();
  });
});

describe("explaining a completed comparison", () => {
  it("every preference has a plain-language, enum-free explanation", () => {
    for (const pref of OPTIMIZATION_PREFERENCES) {
      const text = explainOptimization(pref);
      expect(text.length).toBeGreaterThan(15);
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });

  it("uses the person's own context in the explanation", () => {
    expect(explainOptimization("NEAREST", { location: "Yaba" })).toContain("Yaba");
    expect(explainOptimization("WITHIN_BUDGET", { budget: "NGN 20,000" })).toContain("NGN 20,000");
  });
});
