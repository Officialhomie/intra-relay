import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow, ServicePaymentRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { findBusinessBySlug } from "@/features/businesses/repository";
import { getPaymentAdapter } from "@/features/payments/adapter";
import { explorerTxUrl } from "@/features/payments/adapter/networks";
import type { SettledResult } from "@/features/payments/adapter/types";
import { findPaymentByAuthorizationKey } from "@/features/payments/repository";
import { recordServicePaymentIntent } from "@/features/payments/service";
import {
  recordChallengeIssued,
  recordFailedPayment,
  recordIndeterminatePayment,
  recordSettledReceipt,
  recordUnavailablePayment,
} from "@/features/payments/settlement";
import { assertTaskTransition } from "@/features/tasks/lifecycle";
import { insertTask, updateTask } from "@/features/tasks/repository";

import { FLYER_PRINTING_ROUTE_SLUG, flyerPrintingInputSchema } from "./flyer-printing";
import { routeIsQuoteReady } from "./freshness";
import { findRouteByBusinessAndSlug } from "./repository";
import type { RouteInputField } from "./schema";

export const quoteRequestBodySchema = z.object({
  /** Optional agent identifier (e.g. an ERC-8004 id). Stored, never trusted for auth. */
  requester: z.string().trim().max(120).optional(),
  /**
   * The human buyer session an agent is acting for (milestone 6 §17). Stamped
   * onto the new task as its buyer claim so the human can act on their own
   * agent-created order. Only ever settable here, at creation.
   */
  buyerClaim: z.string().trim().max(200).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type QuoteRequestBody = z.infer<typeof quoteRequestBodySchema>;

export interface QuoteRequestContext {
  /** Raw `X-PAYMENT` header value, or null. */
  xPaymentHeader: string | null;
  /** Absolute URL of this quote endpoint (for the x402 `resource` field). */
  resourceUrl: string;
}

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

function agentSessionId(requester: string | undefined): string {
  return requester
    ? `agent:${requester.replace(/[^\w.:-]/g, "").slice(0, 100)}`
    : `agent:${randomUUID()}`;
}

async function createAwaitingTask(
  db: Database,
  route: QuoteRouteRow,
  businessId: string,
  sessionId: string,
  structuredInput: Record<string, unknown>,
  buyerClaimSession: string | null,
) {
  const draft = await insertTask(db, {
    sessionId,
    buyerClaimSession,
    routeId: route.id,
    structuredInput,
    status: "DRAFT",
  });
  await appendAuditEvent(db, {
    type: "capability.quote_requested",
    taskId: draft.id,
    businessId,
    routeId: route.id,
    data: { requester: sessionId, via: "v1-capability-api" },
  });

  assertTaskTransition("DRAFT", "SUBMITTED");
  await updateTask(db, draft.id, { status: "SUBMITTED", submittedAt: new Date() });
  await appendAuditEvent(db, { type: "task.submitted", taskId: draft.id, routeId: route.id });

  assertTaskTransition("SUBMITTED", "AWAITING_QUOTE");
  const task = await updateTask(db, draft.id, { status: "AWAITING_QUOTE" });
  await appendAuditEvent(db, { type: "task.awaiting_quote", taskId: draft.id, routeId: route.id });
  return task;
}

export type QuoteRequestOutcome =
  | {
      kind: "AWAITING_QUOTE";
      httpStatus: 202;
      body: {
        outcome: "AWAITING_QUOTE";
        taskId: string;
        status: "AWAITING_QUOTE";
        responseSlaMinutes: number;
        note: string;
      };
    }
  | {
      kind: "SETTLED";
      httpStatus: 200;
      responseHeader?: { name: string; value: string };
      body: {
        outcome: "QUOTE_PENDING";
        taskId: string;
        status: "AWAITING_QUOTE";
        responseSlaMinutes: number;
        payment: {
          status: "SETTLED";
          provider: string;
          txHash: string;
          network: string;
          assetSymbol: string;
          amountAtomic: string;
          explorerUrl: string | null;
        };
      };
    };

function settledOutcome(input: {
  taskId: string;
  responseSlaMinutes: number;
  provider: string;
  txHash: string;
  network: string;
  assetSymbol: string;
  amountAtomic: string;
  explorerUrl: string | null;
  responseHeader?: { name: string; value: string };
}): QuoteRequestOutcome {
  const body = {
    outcome: "QUOTE_PENDING" as const,
    taskId: input.taskId,
    status: "AWAITING_QUOTE" as const,
    responseSlaMinutes: input.responseSlaMinutes,
    payment: {
      status: "SETTLED" as const,
      provider: input.provider,
      txHash: input.txHash,
      network: input.network,
      assetSymbol: input.assetSymbol,
      amountAtomic: input.amountAtomic,
      explorerUrl: input.explorerUrl,
    },
  };
  return input.responseHeader
    ? { kind: "SETTLED", httpStatus: 200, responseHeader: input.responseHeader, body }
    : { kind: "SETTLED", httpStatus: 200, body };
}

/** Replay a SETTLED receipt row (idempotent retry, or a concurrent winner). */
function settledReplay(row: ServicePaymentRow, route: QuoteRouteRow): QuoteRequestOutcome {
  return settledOutcome({
    taskId: row.taskId ?? "",
    responseSlaMinutes: route.responseSlaMinutes,
    provider: row.provider ?? "x402",
    txHash: row.txHash ?? "",
    network: row.network ?? "",
    assetSymbol: row.assetSymbol ?? "USDC",
    amountAtomic: row.amountAtomic ?? "0",
    explorerUrl: row.network && row.txHash ? explorerTxUrl(row.network, row.txHash) : null,
  });
}

/**
 * `verify` passed, `settle` outcome unknown (FR-PAY-007). Claimed neither way;
 * the agent must NOT re-authorise with a new nonce.
 */
function indeterminateError(code?: string | null, reason?: string | null): HttpError {
  return new HttpError(
    503,
    "PAYMENT_SETTLEMENT_INDETERMINATE",
    reason ??
      "Verification passed but the settlement outcome is unknown. Do not re-authorise — that could pay twice.",
    {
      code: code ?? "SETTLE_INDETERMINATE",
      retryable: false,
      guidance:
        "Do NOT retry with a new X-PAYMENT authorisation. Check the block explorer for a transfer from your payer address; if it landed, the query fee is already paid. Ask the route operator to reconcile.",
      payment: { status: "AUTHORISED", settlement: "unknown", txHash: null },
    },
  );
}

/**
 * Public agent quote request (TECHNICAL_SPEC §4).
 *
 * Free route:              valid request → 202 AWAITING_QUOTE.
 * Paid route, no key:      503 PAYMENT_SERVICE_UNAVAILABLE (task + audit created).
 * Paid route, no payment:  402 with x402 requirements (no task).
 * Paid route, X-PAYMENT:   official verify → settle → immutable receipt → 200.
 * Facilitator unreachable: 503 PAYMENT_SERVICE_UNAVAILABLE (retryable, no task).
 * Settle outcome unknown:  503 PAYMENT_SETTLEMENT_INDETERMINATE (do NOT re-authorise).
 * Bad authorisation:       402 PAYMENT_FAILED (immutable FAILED receipt, no task).
 * A route that is not quote-ready → 409 ROUTE_UNAVAILABLE with NO settlement.
 */
export async function requestQuoteViaCapabilityApi(
  db: Database,
  businessSlug: string,
  routeSlug: string,
  body: QuoteRequestBody,
  ctx: QuoteRequestContext,
): Promise<QuoteRequestOutcome> {
  const business = await findBusinessBySlug(db, businessSlug);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");

  const route = await findRouteByBusinessAndSlug(db, business.id, routeSlug);
  if (!route)
    throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that slug for this business.");

  // Never settle a payment for an unavailable route (AC-ROUTE-002).
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

  const fee = Number(route.queryFeeUsd);
  const sessionId = agentSessionId(body.requester);
  // A human buyer's browser session, when an agent is acting for them. Ignored
  // if it would just duplicate the task's own session.
  const buyerClaim = body.buyerClaim && body.buyerClaim !== sessionId ? body.buyerClaim : null;

  // --- Free route ---------------------------------------------------------
  if (fee <= 0) {
    const task = await createAwaitingTask(
      db,
      route,
      business.id,
      sessionId,
      validation.data,
      buyerClaim,
    );
    return {
      kind: "AWAITING_QUOTE",
      httpStatus: 202,
      body: {
        outcome: "AWAITING_QUOTE",
        taskId: task.id,
        status: "AWAITING_QUOTE",
        responseSlaMinutes: route.responseSlaMinutes,
        note: "Request recorded. A supplier will respond within the SLA; there is no synchronous quote in the MVP.",
      },
    };
  }

  // --- Paid route, no facilitator configured -----------------------------
  const adapter = getPaymentAdapter();
  if (!adapter.isConfigured()) {
    const task = await createAwaitingTask(
      db,
      route,
      business.id,
      sessionId,
      validation.data,
      buyerClaim,
    );
    await recordServicePaymentIntent(db, task, route);
    throw new HttpError(
      503,
      "PAYMENT_SERVICE_UNAVAILABLE",
      "This is a paid route and no x402 / cPay facilitator is configured. No 402 was issued, no receipt or transaction exists.",
      {
        taskId: task.id,
        taskStatus: task.status,
        payment: {
          status: "UNAVAILABLE",
          queryFeeUsd: fee,
          facilitator: null,
          settlement: null,
          txHash: null,
        },
      },
    );
  }

  const challengeInput = {
    resourceUrl: ctx.resourceUrl,
    method: "POST",
    payTo: route.payoutAddress,
    requestedFeeUsd: fee,
  };

  // --- Paid route, no payment presented → 402 ---------------------------
  if (!ctx.xPaymentHeader) {
    const challenge = adapter.buildChallenge(challengeInput);
    if (challenge.status === "UNAVAILABLE") {
      throw new HttpError(503, "PAYMENT_SERVICE_UNAVAILABLE", challenge.reason);
    }
    await recordChallengeIssued(db, {
      route,
      businessId: business.id,
      amountAtomic: challenge.amountAtomic,
      assetSymbol: challenge.assetSymbol,
      network: challenge.network,
    });
    throw new HttpError(
      402,
      "PAYMENT_REQUIRED",
      "Pay the query fee with an X-PAYMENT authorisation, then retry this request.",
      {
        x402Version: challenge.paymentRequired.x402Version,
        resource: challenge.paymentRequired.resource,
        accepts: challenge.paymentRequired.accepts,
        maxFeeUsd: adapter.describe().maxFeeUsd,
      },
    );
  }

  // --- Paid route, X-PAYMENT presented ---------------------------------
  // Never re-verify or re-settle a known authorisation.
  const authorizationKey = adapter.authorizationKey(ctx.xPaymentHeader);
  if (authorizationKey) {
    const existing = await findPaymentByAuthorizationKey(db, authorizationKey);
    if (existing?.status === "SETTLED") return settledReplay(existing, route);
    if (existing?.status === "AUTHORISED") throw indeterminateError(existing.errorCode);
    if (existing?.status === "FAILED") {
      throw new HttpError(
        402,
        "PAYMENT_FAILED",
        "This payment authorisation was already rejected.",
        { code: existing.errorCode ?? "PAYMENT_FAILED" },
      );
    }
    // existing?.status === "UNAVAILABLE" ⇒ verification never happened; retry now.
  }

  const result = await adapter.settle({
    xPaymentHeader: ctx.xPaymentHeader,
    challenge: challengeInput,
  });

  // Verification could not be obtained — no fault of the agent (retryable).
  if (result.status === "UNAVAILABLE") {
    await recordUnavailablePayment(db, { route, result });
    throw new HttpError(503, "PAYMENT_SERVICE_UNAVAILABLE", result.reason, {
      code: result.code ?? "PAYMENT_SERVICE_UNAVAILABLE",
      retryable: true,
      payment: { status: "UNAVAILABLE", settlement: null, txHash: null },
    });
  }

  // verify passed, settle outcome unknown — claimed neither way.
  if (result.status === "INDETERMINATE") {
    await recordIndeterminatePayment(db, { route, result });
    throw indeterminateError(result.code, result.reason);
  }

  if (result.status === "FAILED") {
    // A concurrent request may have settled this same authorisation first.
    const won = result.authorizationKey
      ? await findPaymentByAuthorizationKey(db, result.authorizationKey)
      : null;
    if (won?.status === "SETTLED") return settledReplay(won, route);

    await recordFailedPayment(db, { route, result });
    const retry = adapter.buildChallenge(challengeInput);
    throw new HttpError(402, "PAYMENT_FAILED", result.reason, {
      code: result.code,
      accepts: retry.status === 402 ? retry.paymentRequired.accepts : undefined,
    });
  }

  const settled: SettledResult = result;
  // Guard against a concurrent request that settled this authorisation.
  const prior = await findPaymentByAuthorizationKey(db, settled.authorizationKey);
  if (prior?.status === "SETTLED") return settledReplay(prior, route);

  const task = await createAwaitingTask(
    db,
    route,
    business.id,
    sessionId,
    validation.data,
    buyerClaim,
  );
  const receipt = await recordSettledReceipt(db, { route, taskId: task.id, result: settled });

  return settledOutcome({
    taskId: receipt.taskId ?? task.id,
    responseSlaMinutes: route.responseSlaMinutes,
    provider: settled.provider,
    txHash: settled.txHash,
    network: settled.network,
    assetSymbol: settled.assetSymbol,
    amountAtomic: settled.amountAtomic,
    explorerUrl: settled.explorerUrl,
    responseHeader: settled.responseHeader,
  });
}
