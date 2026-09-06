import { z } from "zod";

/**
 * How a business prices a service.
 *
 * Real businesses do not all price the same way, and the ones on Intra change
 * their prices often. Forcing every service through "a human types a number
 * each time" is why the product only worked for printing. These three models
 * cover the commercial behaviours we actually need to support, and the whole
 * system treats them uniformly: published pricing is *guidance*, and the quote
 * a business sends for a specific request is still the only commitment.
 *
 * The enum values never reach a screen — `PRICING_MODEL_COPY` does.
 */

export const PRICING_MODELS = ["FIXED", "STARTING_FROM", "QUOTE_REQUIRED"] as const;
export const pricingModelSchema = z.enum(PRICING_MODELS);
export type PricingModel = z.infer<typeof pricingModelSchema>;

export interface PricingModelCopy {
  /** What a business operator picks in the UI. */
  label: string;
  /** One line explaining it to a business operator. */
  forBusiness: string;
  /** A concrete example in the operator's own terms. */
  example: string;
  /** How a buyer should read a published price under this model. */
  forBuyer: string;
}

export const PRICING_MODEL_COPY: Record<PricingModel, PricingModelCopy> = {
  FIXED: {
    label: "Set price",
    forBusiness: "You charge the same amount every time. Customers see it up front.",
    example: "A4 black & white — ₦50 per page",
    forBuyer: "This is the published price. The business still confirms it for your order.",
  },
  STARTING_FROM: {
    label: "Price starts from",
    forBusiness: "You have a base price, and the final amount depends on the job.",
    example: "Flyer printing — from ₦15,000",
    forBuyer: "The final price depends on your job and can be higher than the starting figure.",
  },
  QUOTE_REQUIRED: {
    label: "Priced per job",
    forBusiness: "You look at each request and send your price. Nothing is published up front.",
    example: "Phone repair — depends on the fault",
    forBuyer: "The business prices this individually. You will get a quote before deciding.",
  },
};

/** The published price on a service, when the model has one. */
export interface PublishedPrice {
  amount: number;
  currency: string;
  /** What the amount buys, e.g. "per page", "per 100 flyers". Null for a flat job price. */
  unit: string | null;
}

export interface ServicePricing {
  model: PricingModel;
  /** Null for QUOTE_REQUIRED, and for a service whose price is not yet set. */
  published: PublishedPrice | null;
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * The one line a buyer sees before any quote exists.
 *
 * Deliberately never claims a published figure IS the price for their job —
 * only a quote does that (BR-003, quote integrity).
 */
export function describePricing(pricing: ServicePricing): string {
  const { model, published } = pricing;
  if (model === "QUOTE_REQUIRED" || !published) {
    return "Priced per job";
  }
  const amount = money(published.currency, published.amount);
  const withUnit = published.unit ? `${amount} ${published.unit}` : amount;
  return model === "FIXED" ? withUnit : `From ${withUnit}`;
}

/** The same fact, phrased for the business that set it. */
export function describePricingForBusiness(pricing: ServicePricing): string {
  const { model, published } = pricing;
  if (model === "QUOTE_REQUIRED" || !published) {
    return "You price each request individually.";
  }
  const amount = money(published.currency, published.amount);
  const withUnit = published.unit ? `${amount} ${published.unit}` : amount;
  return model === "FIXED"
    ? `Customers see ${withUnit}.`
    : `Customers see “from ${withUnit}”, and you confirm the final amount.`;
}

/**
 * Whether a published price is enough for a buyer to judge an option before a
 * quote arrives. Only a FIXED price is — everything else needs the business.
 */
export function hasComparablePrice(pricing: ServicePricing): boolean {
  return pricing.model === "FIXED" && pricing.published !== null;
}

/**
 * A published price is guidance, not an offer. This is the sentence that keeps
 * the distinction honest wherever a published figure is shown.
 */
export const PUBLISHED_PRICE_CAVEAT =
  "This is the price the business publishes. The quote they send for your job is the amount that counts.";

/** Validation for a business setting its own price. */
export const servicePricingInputSchema = z
  .object({
    model: pricingModelSchema,
    amount: z.coerce.number().positive("Enter an amount above zero.").max(1_000_000_000).nullable(),
    unit: z.string().trim().max(40).nullable(),
  })
  .refine((value) => value.model === "QUOTE_REQUIRED" || value.amount !== null, {
    path: ["amount"],
    message: "Enter the amount customers should see.",
  });
export type ServicePricingInput = z.infer<typeof servicePricingInputSchema>;
