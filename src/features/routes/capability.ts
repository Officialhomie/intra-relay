import type { Database } from "@/lib/db/client";
import { quoteRoutes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import { findBusinessBySlug } from "@/features/businesses/repository";
import { getPaymentAdapter, PAYMENT_MAX_FEE_USD } from "@/features/payments/adapter";

import {
  PRICE_FRESHNESS_MAX_AGE_DAYS,
  ROUTE_READY_DETAIL,
  routeFreshness,
  routeIsQuoteReady,
  type RouteReadyReason,
} from "./freshness";
import type { RouteInputField } from "./schema";

/** Contract version for the capability document. Bump on a breaking shape change. */
export const CAPABILITY_CONTRACT_VERSION = "0.2";

/**
 * The shape of a successful quote once a supplier responds (FR-REC-001). Agents
 * read this from the capability document; the quote route itself does not return
 * a quote synchronously in the MVP.
 */
export const QUOTE_RESPONSE_SCHEMA = {
  type: "object",
  fields: [
    { key: "status", type: "string", enum: ["RECEIVED", "DECLINED", "EXPIRED"] },
    { key: "currency", type: "string", note: "ISO-ish stablecoin/fiat code, e.g. NGN" },
    { key: "amountMin", type: "number" },
    { key: "amountMax", type: "number", required: false, note: "present for an estimate range" },
    { key: "deliveryCharge", type: "number", required: false },
    { key: "fixed", type: "boolean", note: "true = fixed price, false = estimate" },
    { key: "turnaround", type: "string" },
    { key: "availabilityNote", type: "string", required: false },
    { key: "assumptions", type: "string", required: false },
    { key: "confidence", type: "string", enum: ["low", "medium", "high"], required: false },
    { key: "expiresAt", type: "string", format: "date-time", required: false },
    { key: "declineReason", type: "string", required: false },
  ],
} as const;

export const FINAL_ORDER_POLICY = {
  humanApprovalRequired: true,
  whatsappHandoffRequired: true,
  statement:
    "Intra never places the final order or moves buyer funds. It prepares a quote and a WhatsApp message; a human reviews it, sends it, and pays the supplier directly (BR-001, FR-REC-004).",
} as const;

/**
 * How a buyer completes the order once a quote is in. The capability document
 * always states the mechanism; the concrete contact value is only attached to a
 * route that is actually AVAILABLE (never a draft, paused, unverified, or stale
 * route), so a public reader sees the least merchant data necessary.
 */
export const ORDER_HANDOFF = {
  humanApprovalRequired: true,
  mechanism:
    "Intra returns a pre-filled WhatsApp message with the quote. A human buyer reviews it, sends it to the supplier, and settles payment directly. No agent sends the message or pays the supplier.",
} as const;

function inputSchemaDescriptor(fields: RouteInputField[]) {
  return {
    type: "object",
    fields: fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: "string",
      required: field.required,
      example: field.example,
    })),
  };
}

export interface RouteCapability {
  slug: string;
  name: string;
  description: string;
  /** Lifecycle status (FR-ROUTE-003). NOT a usability verdict — see `availability`. */
  status: string;
  /**
   * Whether an agent may POST a quote request right now. An ACTIVE route with
   * stale critical data reports `state: "UNAVAILABLE"` here while `status` stays
   * "ACTIVE" — it is never silently presented as current (AC-ROUTE-002).
   */
  availability: {
    state: "AVAILABLE" | "UNAVAILABLE";
    acceptingQuoteRequests: boolean;
    reason: RouteReadyReason;
    detail: string;
  };
  lastUpdatedAt: string;
  priceUpdatedAt: string | null;
  stale: boolean;
  /** Price/availability freshness and the explicit expiry/stale behaviour (BR-003, BR-006). */
  freshness: {
    priceConfirmedAt: string | null;
    maxAgeDays: number;
    staleAfter: string | null;
    stale: boolean;
    behaviour: string;
  };
  /** Quote SLA / response expectation (FR-ROUTE-001). */
  quoteSla: {
    responseWithinMinutes: number;
    expectation: string;
  };
  endpoint: string;
  quoteEndpoint: string;
  inputSchema: ReturnType<typeof inputSchemaDescriptor>;
  responseSchema: typeof QUOTE_RESPONSE_SCHEMA;
  payment: {
    queryFeeUsd: number;
    /** The most an agent can be charged for this query, regardless of queryFeeUsd. */
    maxFeeUsd: number;
    paid: boolean;
    provider: "x402" | "cpay" | null;
    network?: string;
    asset?: string;
    available: boolean;
    state: "AVAILABLE" | "PAYMENT_SERVICE_UNAVAILABLE";
    scheme?: "402-x-payment";
    /** Machine code when unavailable, e.g. "NOT_CONFIGURED" or "CONFIG_ERROR". */
    code?: string;
    /** Non-fatal payment-config problem (e.g. a malformed attribution tag). */
    configWarning?: string;
    /** Outcomes an agent should expect from the quote endpoint. */
    outcomes: string;
    note: string;
  };
  payoutAddress: string;
  responseSlaMinutes: number;
  finalOrderPolicy: typeof FINAL_ORDER_POLICY;
  /** How the buyer completes the order. Always present; describes the mechanism. */
  handoff: typeof ORDER_HANDOFF & { channelType: string };
  /**
   * Concrete order channel. Present ONLY for a route whose `availability.state`
   * is "AVAILABLE" — a paused, unverified, draft, or stale route does not
   * expose the merchant's contact value.
   */
  orderContact?: { channel: string; value: string; note: string };
}

export interface BusinessCapabilities {
  /** Capability-document contract version (not the business's data). */
  version: string;
  business: {
    slug: string;
    name: string;
    category: string;
    location: { city: string; country: string };
    operatorVerified: boolean;
  };
  routes: RouteCapability[];
  finalOrderPolicy: typeof FINAL_ORDER_POLICY;
  generatedAt: string;
}

export async function buildBusinessCapabilities(
  db: Database,
  businessSlug: string,
): Promise<BusinessCapabilities | null> {
  const business = await findBusinessBySlug(db, businessSlug);
  if (!business) return null;

  const routes = await db.select().from(quoteRoutes).where(eq(quoteRoutes.businessId, business.id));

  const adapter = getPaymentAdapter().describe();
  const facilitator = adapter.available;
  const now = new Date();

  const operatorVerified = business.verifiedByOperatorAt !== null;

  return {
    version: CAPABILITY_CONTRACT_VERSION,
    business: {
      slug: business.slug,
      name: business.name,
      category: business.category,
      location: { city: business.city, country: business.country },
      operatorVerified,
    },
    routes: routes.map((route): RouteCapability => {
      const fresh = routeFreshness(route, now);
      const fee = Number(route.queryFeeUsd);
      const paid = fee > 0;
      const paymentAvailable = !paid || facilitator;

      const readiness = routeIsQuoteReady(route, operatorVerified, now);
      const availability = {
        state: readiness.ready ? ("AVAILABLE" as const) : ("UNAVAILABLE" as const),
        acceptingQuoteRequests: readiness.ready,
        reason: readiness.reason,
        detail: ROUTE_READY_DETAIL[readiness.reason],
      };

      // Least merchant data necessary: the concrete contact value is attached
      // only to a route an agent can actually use right now.
      const contact = readiness.ready
        ? {
            channel: business.contactChannelType,
            value: business.contactChannelValue,
            note: "Order channel — a human sends the final order here. Intra never sends it.",
          }
        : undefined;

      return {
        slug: route.slug,
        name: route.name,
        description: route.description,
        status: route.status,
        availability,
        lastUpdatedAt: fresh.lastUpdatedAt,
        priceUpdatedAt: fresh.priceUpdatedAt,
        stale: fresh.stale,
        freshness: {
          priceConfirmedAt: fresh.priceUpdatedAt,
          maxAgeDays: PRICE_FRESHNESS_MAX_AGE_DAYS,
          staleAfter: fresh.staleAfter,
          stale: fresh.stale,
          behaviour:
            "Price/availability data must be reconfirmed by the supplier within maxAgeDays. Once staleAfter passes (or it was never confirmed) the route becomes UNAVAILABLE and the quote endpoint returns 409 ROUTE_UNAVAILABLE until it is refreshed.",
        },
        quoteSla: {
          responseWithinMinutes: route.responseSlaMinutes,
          expectation:
            "No synchronous quote. A valid request is recorded and a supplier responds out of band, normally within responseWithinMinutes.",
        },
        endpoint: route.endpoint,
        quoteEndpoint: `/v1/${business.slug}/${route.slug}/quote`,
        inputSchema: inputSchemaDescriptor(
          Array.isArray(route.inputSchema) ? route.inputSchema : [],
        ),
        responseSchema: QUOTE_RESPONSE_SCHEMA,
        payment: {
          queryFeeUsd: fee,
          maxFeeUsd: PAYMENT_MAX_FEE_USD,
          paid,
          provider: paid
            ? ((adapter.provider === "none" ? "x402" : adapter.provider) as "x402")
            : null,
          ...(paid && facilitator ? { network: adapter.network, asset: adapter.asset } : {}),
          available: paymentAvailable,
          state: paymentAvailable ? "AVAILABLE" : "PAYMENT_SERVICE_UNAVAILABLE",
          ...(paid && facilitator ? { scheme: "402-x-payment" as const } : {}),
          ...(paid && !facilitator && adapter.code ? { code: adapter.code } : {}),
          ...(adapter.configWarning ? { configWarning: adapter.configWarning } : {}),
          outcomes: paid
            ? "200 SETTLED (verified tx) · 402 PAYMENT_REQUIRED (no X-PAYMENT) · 402 PAYMENT_FAILED (bad authorisation) · 503 PAYMENT_SERVICE_UNAVAILABLE (facilitator unreachable / not configured) · 503 PAYMENT_SETTLEMENT_INDETERMINATE (verified, settlement outcome unknown — do not re-authorise)."
            : "202 AWAITING_QUOTE.",
          note: paid
            ? facilitator
              ? `Paid route. POST without X-PAYMENT returns a 402 with x402 requirements (max $${PAYMENT_MAX_FEE_USD} per query); retry with an X-PAYMENT authorisation to settle.`
              : adapter.code === "CONFIG_ERROR"
                ? "Paid route, but the x402 configuration is invalid (check the X402_* server environment). The quote endpoint returns PAYMENT_SERVICE_UNAVAILABLE and never a fabricated settlement."
                : "Paid route, but no x402 / cPay facilitator is configured. The quote endpoint returns PAYMENT_SERVICE_UNAVAILABLE and never a fabricated settlement (ADR-004)."
            : "Free route. The quote endpoint accepts the request without payment.",
        },
        payoutAddress: route.payoutAddress,
        responseSlaMinutes: route.responseSlaMinutes,
        finalOrderPolicy: FINAL_ORDER_POLICY,
        handoff: { ...ORDER_HANDOFF, channelType: business.contactChannelType },
        ...(contact ? { orderContact: contact } : {}),
      };
    }),
    finalOrderPolicy: FINAL_ORDER_POLICY,
    generatedAt: now.toISOString(),
  };
}
