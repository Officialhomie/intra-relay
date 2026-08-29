import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { findBusinessBySlug } from "@/features/businesses/repository";
import { facilitatorConfigured } from "@/features/payments/lifecycle";
import { recordServicePaymentIntent } from "@/features/payments/service";
import { assertTaskTransition } from "@/features/tasks/lifecycle";
import { insertTask, updateTask } from "@/features/tasks/repository";

import { FLYER_PRINTING_ROUTE_SLUG, flyerPrintingInputSchema } from "./flyer-printing";
import { routeIsQuoteReady } from "./freshness";
import { findRouteByBusinessAndSlug } from "./repository";
import type { RouteInputField } from "./schema";

export const quoteRequestBodySchema = z.object({
  /** Optional agent identifier (e.g. an ERC-8004 id). Stored, never trusted for auth. */
  requester: z.string().trim().max(120).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type QuoteRequestBody = z.infer<typeof quoteRequestBodySchema>;

type FieldErrors = Record<string, string[]>;

function validateGeneric(fields: RouteInputField[], raw: Record<string, unknown>) {
  const fieldErrors: FieldErrors = {};
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.key];
    const present =
      typeof value === "string"
        ? value.trim().length > 0
        : typeof value === "number" || typeof value === "boolean";
    if (field.required && !present) {
      fieldErrors[field.key] = [`${field.label} is required.`];
    } else if (present) {
      data[field.key] = typeof value === "string" ? value.trim() : value;
    }
  }
  return Object.keys(fieldErrors).length > 0
    ? ({ ok: false, fieldErrors } as const)
    : ({ ok: true, data } as const);
}

function validateRouteInput(route: QuoteRouteRow, raw: Record<string, unknown>) {
  if (route.slug === FLYER_PRINTING_ROUTE_SLUG) {
    const parsed = flyerPrintingInputSchema.safeParse(raw);
    if (parsed.success) return { ok: true as const, data: parsed.data as Record<string, unknown> };
    return { ok: false as const, fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors };
  }
  return validateGeneric(Array.isArray(route.inputSchema) ? route.inputSchema : [], raw);
}

export interface QuoteRequestAccepted {
  outcome: "AWAITING_QUOTE";
  taskId: string;
  status: "AWAITING_QUOTE";
  responseSlaMinutes: number;
  note: string;
}

/**
 * The public, agent-facing quote request (TECHNICAL_SPEC §4 — `/v1/:business/:route/quote`).
 * Throws structured `HttpError`s for the unavailable / validation / payment paths.
 */
export async function requestQuoteViaCapabilityApi(
  db: Database,
  businessSlug: string,
  routeSlug: string,
  body: QuoteRequestBody,
): Promise<QuoteRequestAccepted> {
  const business = await findBusinessBySlug(db, businessSlug);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");

  const route = await findRouteByBusinessAndSlug(db, business.id, routeSlug);
  if (!route)
    throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that slug for this business.");

  // Only active + verified + fresh routes proceed. No payment request is issued
  // for an unavailable route (AC-ROUTE-002).
  const readiness = routeIsQuoteReady(route, business.verifiedByOperatorAt !== null);
  if (!readiness.ready) {
    throw new HttpError(
      409,
      "ROUTE_UNAVAILABLE",
      "This route cannot take a quote request right now.",
      {
        route: {
          slug: route.slug,
          status: route.status,
          verified: route.verifiedAt !== null && business.verifiedByOperatorAt !== null,
          stale: readiness.reason === "STALE",
          reason: readiness.reason,
        },
        payment: { requested: false },
      },
    );
  }

  const validation = validateRouteInput(route, body.input);
  if (!validation.ok) {
    throw new HttpError(
      422,
      "VALIDATION_FAILED",
      "One or more required inputs are missing or invalid.",
      {
        fieldErrors: validation.fieldErrors,
      },
    );
  }

  const sessionId = body.requester
    ? `agent:${body.requester.replace(/[^\w.:-]/g, "").slice(0, 100)}`
    : `agent:${randomUUID()}`;

  const draft = await insertTask(db, {
    sessionId,
    routeId: route.id,
    structuredInput: validation.data,
    status: "DRAFT",
  });
  await appendAuditEvent(db, {
    type: "capability.quote_requested",
    taskId: draft.id,
    businessId: business.id,
    routeId: route.id,
    data: { requester: sessionId, via: "v1-capability-api" },
  });

  assertTaskTransition("DRAFT", "SUBMITTED");
  await updateTask(db, draft.id, { status: "SUBMITTED", submittedAt: new Date() });
  await appendAuditEvent(db, { type: "task.submitted", taskId: draft.id, routeId: route.id });

  assertTaskTransition("SUBMITTED", "AWAITING_QUOTE");
  const task = await updateTask(db, draft.id, { status: "AWAITING_QUOTE" });
  await appendAuditEvent(db, { type: "task.awaiting_quote", taskId: draft.id, routeId: route.id });

  // Honest payment state — never a fabricated 402 / receipt (FR-PAY-004, ADR-004).
  const payment = await recordServicePaymentIntent(db, task, route);
  const fee = Number(route.queryFeeUsd);

  if (fee > 0) {
    if (facilitatorConfigured()) {
      throw new HttpError(
        501,
        "PAYMENT_FLOW_NOT_IMPLEMENTED",
        "An x402 facilitator is configured but the 402 challenge flow is not built yet.",
        { taskId: task.id },
      );
    }
    throw new HttpError(
      503,
      "PAYMENT_SERVICE_UNAVAILABLE",
      "This is a paid route and no x402 / cPay facilitator is configured. No 402 was issued, no receipt or transaction exists.",
      {
        taskId: task.id,
        taskStatus: task.status,
        payment: {
          status: payment.status,
          queryFeeUsd: fee,
          facilitator: null,
          settlement: null,
          txHash: null,
        },
      },
    );
  }

  return {
    outcome: "AWAITING_QUOTE",
    taskId: task.id,
    status: "AWAITING_QUOTE",
    responseSlaMinutes: route.responseSlaMinutes,
    note: "Request recorded. A supplier will respond within the SLA; there is no synchronous quote in the MVP.",
  };
}
