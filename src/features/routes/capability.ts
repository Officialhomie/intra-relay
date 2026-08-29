import type { Database } from "@/lib/db/client";
import { quoteRoutes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import { findBusinessBySlug } from "@/features/businesses/repository";
import { facilitatorConfigured } from "@/features/payments/lifecycle";

import { routeFreshness } from "./freshness";
import type { RouteInputField } from "./schema";

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
  statement:
    "Intra never places the final order or moves buyer funds. It prepares a quote and a WhatsApp message; a human sends it and pays the supplier directly (BR-001, FR-REC-004).",
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
  status: string;
  lastUpdatedAt: string;
  priceUpdatedAt: string | null;
  stale: boolean;
  endpoint: string;
  quoteEndpoint: string;
  inputSchema: ReturnType<typeof inputSchemaDescriptor>;
  responseSchema: typeof QUOTE_RESPONSE_SCHEMA;
  payment: {
    queryFeeUsd: number;
    paid: boolean;
    facilitator: "x402" | null;
    available: boolean;
    state: "AVAILABLE" | "PAYMENT_SERVICE_UNAVAILABLE";
    note: string;
  };
  payoutAddress: string;
  responseSlaMinutes: number;
  finalOrderPolicy: typeof FINAL_ORDER_POLICY;
  /** Present only while the route is ACTIVE. */
  orderContact?: { channel: string; value: string; note: string };
}

export interface BusinessCapabilities {
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

  const facilitator = facilitatorConfigured();
  const now = new Date();

  return {
    business: {
      slug: business.slug,
      name: business.name,
      category: business.category,
      location: { city: business.city, country: business.country },
      operatorVerified: business.verifiedByOperatorAt !== null,
    },
    routes: routes.map((route): RouteCapability => {
      const fresh = routeFreshness(route, now);
      const fee = Number(route.queryFeeUsd);
      const paid = fee > 0;
      const paymentAvailable = !paid || facilitator;
      const contact =
        route.status === "ACTIVE"
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
        lastUpdatedAt: fresh.lastUpdatedAt,
        priceUpdatedAt: fresh.priceUpdatedAt,
        stale: fresh.stale,
        endpoint: route.endpoint,
        quoteEndpoint: `/v1/${business.slug}/${route.slug}/quote`,
        inputSchema: inputSchemaDescriptor(
          Array.isArray(route.inputSchema) ? route.inputSchema : [],
        ),
        responseSchema: QUOTE_RESPONSE_SCHEMA,
        payment: {
          queryFeeUsd: fee,
          paid,
          facilitator: paid ? "x402" : null,
          available: paymentAvailable,
          state: paymentAvailable ? "AVAILABLE" : "PAYMENT_SERVICE_UNAVAILABLE",
          note: paid
            ? facilitator
              ? "Paid route. The quote endpoint returns a facilitator-issued 402 challenge."
              : "Paid route, but no x402 / cPay facilitator is configured. The quote endpoint returns PAYMENT_SERVICE_UNAVAILABLE and never a fabricated settlement (ADR-004)."
            : "Free route. The quote endpoint accepts the request without payment.",
        },
        payoutAddress: route.payoutAddress,
        responseSlaMinutes: route.responseSlaMinutes,
        finalOrderPolicy: FINAL_ORDER_POLICY,
        ...(contact ? { orderContact: contact } : {}),
      };
    }),
    finalOrderPolicy: FINAL_ORDER_POLICY,
    generatedAt: now.toISOString(),
  };
}
