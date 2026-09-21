import { describe, expect, it } from "vitest";

import { LAGOS_AREA_VOCABULARY_VERSION, canonicalizeLegacyArea, normalizeLagosArea } from "./lagos";

describe("Lagos pilot vocabulary", () => {
  it("is versioned and resolves only reviewed exact aliases", () => {
    expect(normalizeLagosArea("Yaba")).toMatchObject({
      areaId: "lagos_yaba",
      vocabularyVersion: LAGOS_AREA_VOCABULARY_VERSION,
    });
    expect(normalizeLagosArea("around Yaba")?.areaId).toBe("lagos_yaba");
    expect(normalizeLagosArea("UNILAG main gate")).toBeNull();
  });

  it("does not silently upgrade ambiguous legacy free text", () => {
    expect(canonicalizeLegacyArea("Yaba and Akoka")).toBeNull();
    expect(canonicalizeLegacyArea("Yaba, Akoka")).toEqual(["lagos_yaba", "lagos_akoka"]);
  });
});
