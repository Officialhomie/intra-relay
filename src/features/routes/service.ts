import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow } from "@/lib/db/schema";
import type { Operator } from "@/lib/http/operator";
import { HttpError } from "@/lib/http/response";
import { forwardServerAnalyticsEvent } from "@/features/analytics/server";
import { appendAuditEvent } from "@/features/audit/repository";
import {
  findBusinessById,
  findBusinessBySlug,
  updateBusiness,
} from "@/features/businesses/repository";

import {
  ACTIVATION_CHECK_LABELS,
  activationChecklistSchema,
  type ActivationChecklist,
} from "./activation";
import { assertRouteActivation, assertRouteTransition } from "./lifecycle";
import { findRouteByBusinessAndSlug, findRouteById, insertRoute, updateRoute } from "./repository";
import { routeStatusSchema } from "./schema";
import { SERVICE_TEMPLATES, getTemplateForCategory } from "./templates";

export { ACTIVATION_CHECK_LABELS, activationChecklistSchema } from "./activation";
export type { ActivationChecklist } from "./activation";

/** `POST /api/businesses/:slug/routes` payload (FR-ROUTE-001, FR-ROUTE-002). */
export const createRouteRequestSchema = z.object({
  templateId: z
    .enum(SERVICE_TEMPLATES.map((template) => template.id) as [string, ...string[]])
    .optional(),
});
export type CreateRouteRequest = z.infer<typeof createRouteRequestSchema>;

export async function createRoute(
  db: Database,
  businessSlug: string,
  input: CreateRouteRequest,
): Promise<QuoteRouteRow> {
  const business = await findBusinessBySlug(db, businessSlug);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");

  const template = input.templateId
    ? (SERVICE_TEMPLATES.find((entry) => entry.id === input.templateId) ??
      getTemplateForCategory(business.category))
    : getTemplateForCategory(business.category);

  const existing = await findRouteByBusinessAndSlug(db, business.id, template.id);
  if (existing) {
    throw new HttpError(409, "ROUTE_EXISTS", `This business already has a "${template.id}" route.`);
  }

  const route = await insertRoute(db, {
    businessId: business.id,
    slug: template.id,
    name: template.name,
    description: template.description,
    inputSchema: [...template.inputFields],
    queryFeeUsd: template.queryFeeUsd.toFixed(4),
    responseSlaMinutes: template.responseSlaMinutes,
    quoteCurrency: business.quoteCurrency,
    pricingModel: template.defaultPricingModel,
    priceUnit: template.defaultPriceUnit,
    payoutAddress: business.payoutAddress,
    endpoint: `/v1/${business.slug}/${template.id}/quote`,
    status: "DRAFT",
  });

  await appendAuditEvent(db, {
    type: "route.created",
    businessId: business.id,
    routeId: route.id,
    data: { slug: route.slug, status: route.status },
  });

  return route;
}

/** `PATCH /api/routes/:id/status` payload. */
export const changeRouteStatusRequestSchema = z.object({
  status: routeStatusSchema,
  checklist: activationChecklistSchema.optional(),
});
export type ChangeRouteStatusRequest = z.infer<typeof changeRouteStatusRequestSchema>;

export interface ChangeActor {
  operator: Operator | null;
  /** True when a valid `x-manage-token` for the route's business was presented. */
  canManage?: boolean;
}

function routeHasRequiredFields(route: QuoteRouteRow): boolean {
  return (
    route.name.length > 0 &&
    route.description.length > 0 &&
    Array.isArray(route.inputSchema) &&
    route.inputSchema.length > 0 &&
    Number(route.queryFeeUsd) >= 0 &&
    route.responseSlaMinutes > 0 &&
    route.endpoint.length > 0 &&
    route.payoutAddress.length > 0
  );
}

export async function changeRouteStatus(
  db: Database,
  routeId: string,
  target: ChangeRouteStatusRequest["status"],
  actor: ChangeActor,
  checklist?: ActivationChecklist,
): Promise<QuoteRouteRow> {
  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");

  assertRouteTransition(route.status, target);

  const business = await findBusinessById(db, route.businessId);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Route has no business.");

  // A supplier (manage token) may pause their own route (fail-safe, BR-006) and
  // submit a draft for review. Every other transition is operator-only.
  const supplierAllowed =
    target === "PAUSED" || (route.status === "DRAFT" && target === "PENDING_VERIFICATION");
  if (!actor.operator && !(supplierAllowed && actor.canManage)) {
    throw new HttpError(
      401,
      "OPERATOR_REQUIRED",
      `Moving a route to ${target} requires an operator.`,
    );
  }

  const now = new Date();
  const routePatch: Partial<QuoteRouteRow> = { status: target };

  if (target === "ACTIVE") {
    if (!checklist || !Object.values(checklist).every(Boolean)) {
      throw new HttpError(
        409,
        "CHECKLIST_INCOMPLETE",
        "Every pre-activation check must be confirmed before a route goes live.",
        { labels: ACTIVATION_CHECK_LABELS },
      );
    }
    assertRouteActivation({
      byOperator: actor.operator !== null,
      businessHasConsent: business.consentAt !== null,
      businessVerifiedByOperator: business.verifiedByOperatorAt !== null,
      routeHasRequiredFields: routeHasRequiredFields(route),
    });
    routePatch.verifiedAt = now;
    routePatch.priceUpdatedAt = now;
    routePatch.activationChecklist = checklist;

    if (!business.verifiedByOperatorAt) {
      await updateBusiness(db, business.id, {
        verifiedByOperatorAt: now,
        verifiedByOperatorLabel: actor.operator?.label ?? null,
        status: "ACTIVE",
      });
    }
  }

  if (target === "PAUSED" && business.status === "ACTIVE") {
    await updateBusiness(db, business.id, { status: "PAUSED" });
  }

  const updated = await updateRoute(db, route.id, routePatch);

  await appendAuditEvent(db, {
    type: "route.status_changed",
    businessId: business.id,
    routeId: route.id,
    data: {
      from: route.status,
      to: target,
      by: actor.operator ? `operator:${actor.operator.label}` : "supplier",
      checklist: target === "ACTIVE" ? checklist : undefined,
    },
  });

  // Product analytics: the business became available. Activation is operator-
  // driven, so there is no consistent browser actor — forward server-side.
  if (target === "ACTIVE" && route.status !== "ACTIVE") {
    forwardServerAnalyticsEvent({
      event: "business_ready",
      actorKey: business.id,
      role: "business",
      props: { pricing_model: updated.pricingModel },
      insertId: `business_ready:${route.id}:${now.toISOString().slice(0, 10)}`,
    });
  }

  return updated;
}

/** Resolve a route for buyer/agent use; throws ROUTE_UNAVAILABLE unless ACTIVE. */
export async function loadUsableRoute(db: Database, routeId: string): Promise<QuoteRouteRow> {
  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");
  if (route.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "ROUTE_UNAVAILABLE",
      `This route is ${route.status} and cannot receive a task or payment request.`,
    );
  }
  return route;
}
