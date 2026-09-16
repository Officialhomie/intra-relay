import { describe, expect, it } from "vitest";

import { FLYER_PRINTING_ROUTE_SLUG } from "./flyer-printing";
import {
  SERVICE_TEMPLATES,
  defaultTemplateFor,
  getTemplateForCategory,
  getTemplatesForCategory,
} from "./templates";

/**
 * The template catalogue's category lookups (milestone 10.6 item 5): a
 * category may now hold several templates, and single-route callers
 * (quick-start, legacy onboarding) keep exactly the behaviour they had.
 */

describe("getTemplatesForCategory returns every matching template", () => {
  it("returns all templates for a category with more than one, in catalogue order", () => {
    // Today every category has exactly one template — this asserts the
    // CONTRACT (all matches, not just the first) rather than a specific count
    // that would need updating the moment a second printing template exists.
    for (const category of new Set(SERVICE_TEMPLATES.map((t) => t.category))) {
      const matches = getTemplatesForCategory(category);
      const expected = SERVICE_TEMPLATES.filter((t) => t.category === category);
      expect(matches).toEqual(expected);
    }
  });

  it("returns an empty array, never a fallback, for a category with none", () => {
    // No BusinessCategory in this codebase currently has zero templates, so
    // this exercises the branch directly rather than waiting for one to exist.
    expect(getTemplatesForCategory("does-not-exist" as never)).toEqual([]);
  });
});

describe("defaultTemplateFor preserves the legacy single-template behaviour", () => {
  it("returns the first (and today, only) template for a real category", () => {
    expect(defaultTemplateFor("printing").id).toBe(FLYER_PRINTING_ROUTE_SLUG);
  });

  it("falls back to the general 'other' template for a category with none", () => {
    expect(defaultTemplateFor("does-not-exist" as never).id).toBe("service-request-quote");
  });
});

describe("getTemplateForCategory is preserved as a working alias (not removed until callers migrate)", () => {
  it("behaves identically to defaultTemplateFor", () => {
    for (const category of SERVICE_TEMPLATES.map((t) => t.category)) {
      expect(getTemplateForCategory(category)).toEqual(defaultTemplateFor(category));
    }
  });
});
