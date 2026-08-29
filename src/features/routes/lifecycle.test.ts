import { describe, expect, it } from "vitest";

import { HttpError } from "@/lib/http/response";

import {
  assertRouteActivation,
  assertRouteTransition,
  assertRouteUsable,
  canTransitionRoute,
  routeIsUsable,
} from "./lifecycle";

describe("route lifecycle transitions (FR-ROUTE-003)", () => {
  it("allows the documented forward path", () => {
    expect(canTransitionRoute("DRAFT", "PENDING_VERIFICATION")).toBe(true);
    expect(canTransitionRoute("PENDING_VERIFICATION", "ACTIVE")).toBe(true);
    expect(canTransitionRoute("ACTIVE", "PAUSED")).toBe(true);
    expect(canTransitionRoute("PAUSED", "ACTIVE")).toBe(true);
  });

  it("forbids skipping verification and leaving ARCHIVED", () => {
    expect(canTransitionRoute("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionRoute("ARCHIVED", "ACTIVE")).toBe(false);
    expect(() => assertRouteTransition("DRAFT", "ACTIVE")).toThrow(HttpError);
    expect(() => assertRouteTransition("ACTIVE", "ACTIVE")).toThrow(/already/i);
  });
});

describe("assertRouteActivation (AC-SUP-003, BR-002)", () => {
  const base = {
    byOperator: true,
    businessHasConsent: true,
    businessVerifiedByOperator: true,
    routeHasRequiredFields: true,
  };

  it("passes for an operator activating a consenting, complete route", () => {
    expect(() => assertRouteActivation(base)).not.toThrow();
  });

  it("rejects a non-operator", () => {
    expect(() => assertRouteActivation({ ...base, byOperator: false })).toThrow(/operator/i);
  });

  it("rejects a business without consent", () => {
    expect(() => assertRouteActivation({ ...base, businessHasConsent: false })).toThrow(/consent/i);
  });

  it("rejects an incomplete route (AC-ROUTE-001)", () => {
    expect(() => assertRouteActivation({ ...base, routeHasRequiredFields: false })).toThrow(
      /missing required/i,
    );
  });
});

describe("assertRouteUsable (AC-ROUTE-002, FR-ROUTE-004)", () => {
  it("only an ACTIVE route is usable", () => {
    expect(routeIsUsable("ACTIVE")).toBe(true);
    for (const status of ["DRAFT", "PENDING_VERIFICATION", "PAUSED", "ARCHIVED"] as const) {
      expect(routeIsUsable(status)).toBe(false);
      expect(() => assertRouteUsable(status)).toThrow(/ROUTE_UNAVAILABLE|cannot receive/i);
    }
  });

  it("a PAUSED route reports ROUTE_UNAVAILABLE without asking for payment", () => {
    try {
      assertRouteUsable("PAUSED");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe("ROUTE_UNAVAILABLE");
      expect((error as HttpError).status).toBe(409);
    }
  });
});
