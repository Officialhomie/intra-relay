import { describe, expect, it } from "vitest";

import { BUSINESS_CATEGORIES } from "@/features/businesses/schema";

import {
  KNOWN_CATEGORIES,
  describeCategoriesForModel,
  resolveDomain,
  serviceableCategories,
} from "./domain";

/**
 * The shared category vocabulary (milestone 10.6): demand (`intent/domain.ts`)
 * and supply (`businesses/schema.ts`) must use the same canonical identifiers,
 * with buyer-facing terms kept as aliases/slugs rather than manufactured into
 * marketplace categories that don't exist.
 */

describe("every domain's canonical category is a real BusinessCategory", () => {
  it("resolveDomain never returns a category outside BUSINESS_CATEGORIES", () => {
    for (const slug of KNOWN_CATEGORIES) {
      const domain = resolveDomain(slug);
      expect(domain).not.toBeNull();
      expect(BUSINESS_CATEGORIES).toContain(domain!.category);
    }
  });
});

describe("the explicit food -> catering mapping", () => {
  it("'food' is a buyer-facing slug/alias, not a marketplace category", () => {
    const domain = resolveDomain("food");
    expect(domain?.slug).toBe("food");
    expect(domain?.category).toBe("catering");
    expect(BUSINESS_CATEGORIES).not.toContain("food" as never);
  });

  it("the alias 'catering' also resolves to the same entry", () => {
    expect(resolveDomain("catering")?.slug).toBe("food");
  });
});

describe("unsupported buyer concepts collapse to the real catch-all, never a fabricated category", () => {
  it("electronics and repair both map to the real 'other' category, not invented ones", () => {
    expect(resolveDomain("electronics")?.category).toBe("other");
    expect(resolveDomain("repair")?.category).toBe("other");
    expect(BUSINESS_CATEGORIES).not.toContain("electronics" as never);
    expect(BUSINESS_CATEGORIES).not.toContain("repair" as never);
  });

  it("electronics and repair keep their own specific messaging despite sharing a category", () => {
    const electronics = resolveDomain("electronics")!;
    const repair = resolveDomain("repair")!;
    expect(electronics.unavailableNote).toMatch(/electronics/i);
    expect(repair.unavailableNote).toMatch(/repair/i);
    expect(electronics.unavailableNote).not.toBe(repair.unavailableNote);
  });
});

describe("an invalid/unmatched category cannot silently pass", () => {
  it("resolveDomain returns null for a string that matches nothing", () => {
    expect(resolveDomain("nonexistent-category")).toBeNull();
  });

  it("resolveDomain returns null for undefined", () => {
    expect(resolveDomain(undefined)).toBeNull();
  });
});

describe("liveness is derived from the template catalogue, not hand-duplicated (M10.6 item 4)", () => {
  it("only printing is serviceable, matching the only 'mvp' template", () => {
    const live = serviceableCategories();
    expect(live).toHaveLength(1);
    expect(live[0].slug).toBe("printing");
  });

  it("a category with no routeSlug can never be serviceable", () => {
    for (const domain of ["food", "electronics", "design", "delivery", "repair"]) {
      expect(resolveDomain(domain)?.serviceable).toBe(false);
    }
  });
});

describe("the model-facing description exposes the fine-grained slug, not the canonical category", () => {
  it("food's model-facing 'category' is still 'food', not 'catering'", () => {
    const described = describeCategoriesForModel().find((d) => d.label === "food and catering");
    expect(described?.category).toBe("food");
  });

  it("every model-facing entry is unique (no canonical-category collisions leak into classification)", () => {
    const categories = describeCategoriesForModel().map((d) => d.category);
    expect(new Set(categories).size).toBe(categories.length);
  });
});
