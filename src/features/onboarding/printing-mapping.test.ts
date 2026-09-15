import { describe, expect, it } from "vitest";

import type { NormalizedService } from "./normalize";
import { mapServicesToProductTypes, resolvePricingModel } from "./printing-mapping";

function service(
  label: string,
  pricingModel: NormalizedService["pricingModel"] = "FIXED",
): NormalizedService {
  return { label, pricingModel, priceText: null, notes: null };
}

describe("mapServicesToProductTypes", () => {
  it("maps every one of the 14 known labels to its canonical product type", () => {
    const services = [
      service("Business cards"),
      service("Flyers"),
      service("Posters"),
      service("Banners"),
      service("Stickers"),
      service("Brochures"),
      service("Booklets"),
      service("Invitations"),
      service("T-shirts / apparel printing"),
      service("Packaging"),
      service("Labels"),
      service("Large-format printing"),
      service("Signage"),
      service("Documents"),
    ];
    const { productTypes, unmapped } = mapServicesToProductTypes(services);
    expect(productTypes).toEqual([
      "business_cards",
      "flyers",
      "posters",
      "banners",
      "stickers",
      "brochures",
      "booklets",
      "invitations",
      "apparel",
      "packaging",
      "labels",
      "large_format",
      "signage",
      "documents",
    ]);
    expect(unmapped).toEqual([]);
  });

  it("flags a free-text 'Other' service label as unmapped rather than discarding or guessing it", () => {
    const { productTypes, unmapped } = mapServicesToProductTypes([service("Canvas printing")]);
    expect(productTypes).toEqual([]);
    expect(unmapped).toEqual(["Canvas printing"]);
  });

  it("a mix of known and unmapped services keeps both, never dropping the unmapped one", () => {
    const { productTypes, unmapped } = mapServicesToProductTypes([
      service("Flyers"),
      service("Canvas printing"),
    ]);
    expect(productTypes).toEqual(["flyers"]);
    expect(unmapped).toEqual(["Canvas printing"]);
  });

  it("duplicate product types normalize to one entry", () => {
    const { productTypes } = mapServicesToProductTypes([service("Flyers"), service("Flyers")]);
    expect(productTypes).toEqual(["flyers"]);
  });

  it("an empty service list maps to no product types and no unmapped labels", () => {
    expect(mapServicesToProductTypes([])).toEqual({ productTypes: [], unmapped: [] });
  });
});

describe("resolvePricingModel", () => {
  it("uses the shared model when every service agrees", () => {
    const result = resolvePricingModel([
      service("Flyers", "STARTING_FROM"),
      service("Posters", "STARTING_FROM"),
    ]);
    expect(result).toEqual({ model: "STARTING_FROM", mixed: false });
  });

  it("falls back to QUOTE_REQUIRED, and reports mixed, when services disagree", () => {
    const result = resolvePricingModel([
      service("Business cards", "FIXED"),
      service("Banners", "STARTING_FROM"),
    ]);
    expect(result).toEqual({ model: "QUOTE_REQUIRED", mixed: true });
  });

  it("never fabricates a model for an empty list", () => {
    // No services to agree or disagree — QUOTE_REQUIRED is the safe default,
    // not a guess.
    expect(resolvePricingModel([])).toEqual({ model: "QUOTE_REQUIRED", mixed: true });
  });

  it("a single service's model is used directly, not treated as mixed", () => {
    expect(resolvePricingModel([service("Flyers", "FIXED")])).toEqual({
      model: "FIXED",
      mixed: false,
    });
  });
});
