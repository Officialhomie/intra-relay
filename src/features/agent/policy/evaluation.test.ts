import { describe, expect, it } from "vitest";

import type { ProviderCandidate } from "../types";
import {
  evaluateCandidate,
  evaluateFulfillment,
  evaluateLocation,
  evaluateTurnaround,
} from "./evaluation";

function baseCandidate(over: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    businessSlug: "a",
    businessName: "A Prints",
    routeSlug: "flyer-printing",
    routeName: "Flyer printing",
    city: "Lagos",
    country: "NG",
    responseSlaMinutes: 60,
    quoteCurrency: "NGN",
    priceUpdatedAt: "2026-08-31T09:00:00.000Z",
    availability: {
      state: "AVAILABLE",
      acceptingQuoteRequests: true,
      reason: "OK",
      detail: "The route is active, operator-verified, and its price data is fresh.",
    },
    freshness: {
      priceConfirmedAt: "2026-08-31T09:00:00.000Z",
      staleAfter: "2026-09-14T09:00:00.000Z",
      stale: false,
    },
    payment: { queryFeeUsd: 0, available: true, state: "AVAILABLE" },
    serviceArea: null,
    fulfillment: null,
    typicalTurnaround: null,
    ...over,
  };
}

describe("evaluateLocation (M10.7 §9 conservative model)", () => {
  it("matches when the buyer's area is a substring of a declared area", () => {
    const result = evaluateLocation("Yaba, Akoka, Surulere", "Yaba");
    expect(result?.status).toBe("MATCH");
  });

  it("matches when a declared area is a substring of the buyer's phrase", () => {
    const result = evaluateLocation("Yaba", "near Yaba, by the market");
    expect(result?.status).toBe("MATCH");
  });

  it("is UNKNOWN, never NO_MATCH, when the declared areas share no overlap", () => {
    const result = evaluateLocation("Ikeja", "Yaba");
    expect(result?.status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when the supplier declared no service area at all", () => {
    const result = evaluateLocation(null, "Yaba");
    expect(result?.status).toBe("UNKNOWN");
  });

  it("is not evaluated at all when the buyer stated no location", () => {
    expect(evaluateLocation("Yaba", null)).toBeNull();
    expect(evaluateLocation("Yaba", undefined)).toBeNull();
  });

  it("never returns NO_MATCH for any input — the model has no gazetteer", () => {
    const combos: Array<[string | null, string]> = [
      ["Ikeja", "Yaba"],
      ["Lekki Phase 1", "Surulere"],
      ["Abuja", "Lagos"],
    ];
    for (const [serviceArea, location] of combos) {
      expect(evaluateLocation(serviceArea, location)?.status).not.toBe("NO_MATCH");
    }
  });
});

describe("evaluateFulfillment", () => {
  it("matches delivery when the supplier declared it available", () => {
    const result = evaluateFulfillment("delivery", {
      pickupAvailable: null,
      deliveryAvailable: true,
    });
    expect(result).toEqual({ status: "MATCH", detail: "Supplier offers delivery." });
  });

  it("excludes on a confirmed delivery mismatch", () => {
    const result = evaluateFulfillment("delivery", {
      pickupAvailable: null,
      deliveryAvailable: false,
    });
    expect(result?.status).toBe("NO_MATCH");
  });

  it("is UNKNOWN when delivery availability was never declared", () => {
    const result = evaluateFulfillment("delivery", {
      pickupAvailable: null,
      deliveryAvailable: null,
    });
    expect(result?.status).toBe("UNKNOWN");
  });

  it("matches pickup when the supplier declared it available", () => {
    const result = evaluateFulfillment("pickup", {
      pickupAvailable: true,
      deliveryAvailable: null,
    });
    expect(result?.status).toBe("MATCH");
  });

  it("excludes on a confirmed pickup mismatch", () => {
    const result = evaluateFulfillment("pickup", {
      pickupAvailable: false,
      deliveryAvailable: null,
    });
    expect(result?.status).toBe("NO_MATCH");
  });

  it("is UNKNOWN when pickup availability was never declared", () => {
    const result = evaluateFulfillment("pickup", {
      pickupAvailable: null,
      deliveryAvailable: null,
    });
    expect(result?.status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when the supplier declared neither flag at all (null object)", () => {
    expect(evaluateFulfillment("pickup", null)?.status).toBe("UNKNOWN");
  });

  it("is not evaluated when the buyer stated no fulfilment preference", () => {
    expect(
      evaluateFulfillment(null, { pickupAvailable: true, deliveryAvailable: true }),
    ).toBeNull();
  });
});

describe("evaluateTurnaround (M10.7 §11 tier 2 — never quote-level)", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  const deadlineInThreeDays = "2026-09-18T00:00:00.000Z"; // 72h away

  it("matches when the typical turnaround clearly fits the deadline", () => {
    const result = evaluateTurnaround("2 working days", deadlineInThreeDays, now);
    expect(result?.status).toBe("MATCH");
  });

  it("excludes when the typical turnaround clearly cannot fit the deadline", () => {
    const result = evaluateTurnaround("2 weeks", deadlineInThreeDays, now);
    expect(result?.status).toBe("NO_MATCH");
  });

  it("is UNKNOWN when no typical turnaround was declared", () => {
    expect(evaluateTurnaround(null, deadlineInThreeDays, now)?.status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when the declared turnaround text cannot be interpreted", () => {
    expect(evaluateTurnaround("depends on the job", deadlineInThreeDays, now)?.status).toBe(
      "UNKNOWN",
    );
  });

  it("is not evaluated when the buyer stated no deadline", () => {
    expect(evaluateTurnaround("2 working days", null, now)).toBeNull();
  });
});

describe("evaluateCandidate — overall status derivation", () => {
  it("is ELIGIBLE with HIGH confidence when every evaluated hard constraint matches", () => {
    const candidate = baseCandidate({
      serviceArea: "Yaba, Akoka",
      fulfillment: { pickupAvailable: true, deliveryAvailable: true },
      typicalTurnaround: "1 working day",
    });
    const result = evaluateCandidate(
      candidate,
      {
        location: "Yaba",
        fulfillmentPreference: "delivery",
        deadlineIso: "2026-09-20T00:00:00.000Z",
      },
      new Date("2026-09-15T00:00:00.000Z"),
    );
    expect(result.overall).toEqual({ status: "ELIGIBLE", confidence: "HIGH" });
  });

  it("excludes on a confirmed hard NO_MATCH (fulfilment)", () => {
    const candidate = baseCandidate({
      fulfillment: { pickupAvailable: null, deliveryAvailable: false },
    });
    const result = evaluateCandidate(candidate, { fulfillmentPreference: "delivery" });
    expect(result.overall.status).toBe("EXCLUDED");
    expect(result.constraints.fulfillment?.status).toBe("NO_MATCH");
  });

  it("does not silently exclude on UNKNOWN — it needs confirmation instead", () => {
    const candidate = baseCandidate({ serviceArea: null });
    const result = evaluateCandidate(candidate, { location: "Yaba" });
    expect(result.constraints.location?.status).toBe("UNKNOWN");
    expect(result.overall.status).toBe("NEEDS_CONFIRMATION");
    expect(result.overall.confidence).toBe("MEDIUM");
  });

  it("retains today's CAPABILITIES_NOT_READ behaviour: an unread capability document excludes", () => {
    const candidate = baseCandidate({ availability: null, freshness: null });
    const result = evaluateCandidate(candidate, { location: "Yaba" });
    expect(result.overall.status).toBe("EXCLUDED");
    expect(result.overall.confidence).toBe("LOW");
    expect(result.constraints.availability?.status).toBe("UNKNOWN");
  });

  it("omits a buyer-dependent constraint entirely when the buyer stated no criterion for it", () => {
    const candidate = baseCandidate();
    const result = evaluateCandidate(candidate, {});
    expect(result.constraints.location).toBeUndefined();
    expect(result.constraints.fulfillment).toBeUndefined();
    expect(result.constraints.turnaround).toBeUndefined();
    // Nothing to conflict with, and the always-on constraints are all fine.
    expect(result.overall.status).toBe("ELIGIBLE");
  });

  it("category and service are always MATCH — discovery already filtered on the route slug", () => {
    const result = evaluateCandidate(baseCandidate(), {});
    expect(result.constraints.category?.status).toBe("MATCH");
    expect(result.constraints.service?.status).toBe("MATCH");
  });

  it("marks verification UNKNOWN (not MATCH) when a prior check already short-circuited it", () => {
    const candidate = baseCandidate({
      availability: {
        state: "UNAVAILABLE",
        acceptingQuoteRequests: false,
        reason: "STALE",
        detail: "stale",
      },
      freshness: {
        priceConfirmedAt: "2026-08-01T00:00:00.000Z",
        staleAfter: "2026-08-15T00:00:00.000Z",
        stale: true,
      },
    });
    const result = evaluateCandidate(candidate, {});
    expect(result.constraints.verification?.status).toBe("UNKNOWN");
    expect(result.constraints.freshness?.status).toBe("NO_MATCH");
    expect(result.overall.status).toBe("EXCLUDED");
  });
});
