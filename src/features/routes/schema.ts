import { z } from "zod";

import { EVM_ADDRESS_REGEX } from "@/lib/address";

/**
 * Agent-readable quote route (F-ROUTE, PRD §10 QuoteRoute).
 *
 * Phase 1 uses these schemas to shape the draft payload a supplier reviews
 * during onboarding. Persistence and the live REST endpoints arrive in later
 * phases; nothing here is stored yet.
 */

// FR-ROUTE-003
export const ROUTE_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
] as const;

export const routeStatusSchema = z.enum(ROUTE_STATUSES);
export type RouteStatus = z.infer<typeof routeStatusSchema>;

export const routeInputFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  example: z.string().min(1),
  required: z.boolean(),
  /**
   * The values this specific route actually accepts for this field, when the
   * field is a closed choice (M10.6) — e.g. which printing products THIS
   * business supports. Omitted for a free-text field. Never used to validate
   * a buyer's request on its own; a route with a dedicated hardcoded schema
   * (like `flyer-printing`) still validates against that schema.
   */
  options: z.array(z.string()).optional(),
});
export type RouteInputField = z.infer<typeof routeInputFieldSchema>;

export const QUOTE_CURRENCIES = ["NGN", "USD", "USDm", "cUSD", "cNGN", "USDC", "USDT"] as const;
export const quoteCurrencySchema = z.enum(QUOTE_CURRENCIES);
export type QuoteCurrency = z.infer<typeof quoteCurrencySchema>;

// FR-ROUTE-001
export const quoteRouteSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1),
  businessSlug: z.string().min(1),
  inputFields: z.array(routeInputFieldSchema).min(1),
  queryFeeUsd: z.number().nonnegative(),
  responseSlaMinutes: z.number().int().positive(),
  quoteCurrency: quoteCurrencySchema,
  /** Null on a draft route whose merchant did not enable paid agent queries. */
  payoutAddress: z.string().regex(EVM_ADDRESS_REGEX).nullable(),
  endpoint: z.string().min(1),
  status: routeStatusSchema,
});
export type QuoteRoute = z.infer<typeof quoteRouteSchema>;
