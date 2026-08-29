import { expect, it } from "vitest";

import { slugify } from "./slug";

it("generates readable url-safe slugs (FR-SUP-004)", () => {
  expect(slugify("Campus Prints NG")).toBe("campus-prints-ng");
  expect(slugify("  Ada's  Print & Copy!! ")).toBe("ada-s-print-copy");
  expect(slugify("Café Lagos")).toBe("cafe-lagos");
  expect(slugify("")).toBe("");
});

it("caps the slug length", () => {
  expect(slugify("a".repeat(120)).length).toBeLessThanOrEqual(60);
});
