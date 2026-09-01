import { describe, expect, it } from "vitest";

import {
  generatePickupCode,
  normalizePickupCode,
  PICKUP_CODE_LENGTH,
  pickupCodeMatches,
} from "./code";

describe("pickup code", () => {
  it("generates an unambiguous fixed-length uppercase code", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generatePickupCode();
      expect(code).toHaveLength(PICKUP_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/); // no 0,O,1,I,L
    }
    expect(new Set(Array.from({ length: 20 }, generatePickupCode)).size).toBeGreaterThan(1);
  });

  it("normalizes case and whitespace", () => {
    expect(normalizePickupCode("  ab c2 ")).toBe("ABC2");
  });

  it("matches case-insensitively and rejects wrong / empty codes", () => {
    expect(pickupCodeMatches("abc234", "ABC234")).toBe(true);
    expect(pickupCodeMatches("ABC234", "ABC235")).toBe(false);
    expect(pickupCodeMatches("", "ABC234")).toBe(false);
    expect(pickupCodeMatches("ABC2", "ABC234")).toBe(false);
  });
});
