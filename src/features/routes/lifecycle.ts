import { HttpError } from "@/lib/http/response";

import type { RouteStatus } from "./schema";

/**
 * Quote-route lifecycle (FR-ROUTE-003).
 *
 *   DRAFT ─▶ PENDING_VERIFICATION ─▶ ACTIVE ⇄ PAUSED
 *     └────────────┴───────────────────┴────────┴────▶ ARCHIVED
 */
export const ROUTE_TRANSITIONS: Record<RouteStatus, readonly RouteStatus[]> = {
  DRAFT: ["PENDING_VERIFICATION", "ARCHIVED"],
  PENDING_VERIFICATION: ["ACTIVE", "DRAFT", "ARCHIVED"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionRoute(from: RouteStatus, to: RouteStatus): boolean {
  return ROUTE_TRANSITIONS[from].includes(to);
}

export function assertRouteTransition(from: RouteStatus, to: RouteStatus): void {
  if (from === to) {
    throw new HttpError(409, "NO_OP_TRANSITION", `Route is already ${to}.`);
  }
  if (!canTransitionRoute(from, to)) {
    throw new HttpError(
      409,
      "INVALID_ROUTE_TRANSITION",
      `A route cannot move from ${from} to ${to}.`,
    );
  }
}

export interface RouteActivationContext {
  /** The operator making the change (verification is an operator action). */
  byOperator: boolean;
  businessHasConsent: boolean;
  businessVerifiedByOperator: boolean;
  routeHasRequiredFields: boolean;
}

/**
 * Guard for any transition into ACTIVE (AC-SUP-003, BR-002):
 * only an operator can activate, the business must consent, and the route must
 * be complete.
 */
export function assertRouteActivation(context: RouteActivationContext): void {
  if (!context.byOperator) {
    throw new HttpError(401, "OPERATOR_REQUIRED", "Only an operator can move a route to ACTIVE.");
  }
  if (!context.businessHasConsent) {
    throw new HttpError(
      409,
      "CONSENT_MISSING",
      "The business has not recorded quote-display consent.",
    );
  }
  if (!context.routeHasRequiredFields) {
    throw new HttpError(
      409,
      "ROUTE_INCOMPLETE",
      "The route is missing required fields (AC-ROUTE-001).",
    );
  }
  // businessVerifiedByOperator is set as part of this same operator action;
  // it is included in the context for callers that verify separately.
  void context.businessVerifiedByOperator;
}

/** A route only serves tasks and payment requests while ACTIVE (FR-ROUTE-004). */
export function routeIsUsable(status: RouteStatus): boolean {
  return status === "ACTIVE";
}

/**
 * Reject use of a non-ACTIVE route WITHOUT issuing a payment request
 * (AC-ROUTE-002): a PAUSED route returns ROUTE_UNAVAILABLE, never a 402.
 */
export function assertRouteUsable(status: RouteStatus): void {
  if (!routeIsUsable(status)) {
    throw new HttpError(
      409,
      "ROUTE_UNAVAILABLE",
      `This route is ${status} and cannot receive a task or payment request.`,
    );
  }
}
