import { z } from "zod";

import { PRINTING_PRODUCT_TYPES } from "./printing-products";
import type { RouteInputField } from "./schema";

/**
 * The MVP printing route (ADR-001; extended M10.6 to cover more than flyers).
 * Template mirrors docs/BUSINESS_ONBOARDING.md.
 */

export const FLYER_PRINTING_ROUTE_SLUG = "flyer-printing";
export const FLYER_PRINTING_QUERY_FEE_USD = 0.02;
export const FLYER_PRINTING_SLA_MINUTES = 30;

export const FLYER_PRINTING_INPUT_FIELDS: readonly RouteInputField[] = [
  { key: "size", label: "Paper size", example: "A5", required: true },
  { key: "quantity", label: "Number of copies", example: "100", required: true },
  { key: "colour", label: "Colour preference", example: "full-colour", required: true },
  { key: "deadline", label: "Needed by", example: "Friday 3pm", required: true },
  {
    key: "deliveryArea",
    label: "Delivery / pick-up area",
    example: "UNILAG main gate",
    required: true,
  },
] as const;

export const FLYER_SIZES = ["A6", "A5", "A4", "A3"] as const;
export const FLYER_COLOURS = ["full-colour", "black-and-white"] as const;

/**
 * Buyer-supplied brief inputs for a flyer-printing quote
 * (FR-TASK-002, FR-ROUTE-002). Used by the buyer flow in a later phase; defined
 * now as a shared foundation.
 *
 * `productType` (M10.6) is OPTIONAL and additive: a printer whose route now
 * lists more than flyers (see `onboarding/printing-mapping.ts`) can be asked
 * for a specific product, but every existing buyer flow, form, and
 * model-assisted brief that never mentions it keeps working unchanged —
 * `size`/`quantity`/`colour`/`deadline`/`deliveryArea` remain the only
 * required fields, exactly as before this milestone.
 */
export const flyerPrintingInputSchema = z.object({
  size: z.enum(FLYER_SIZES, { message: "Choose a paper size." }),
  quantity: z.coerce
    .number({ message: "Enter the number of copies." })
    .int("Use a whole number.")
    .min(1, "At least 1 copy.")
    .max(100_000, "That is more than we quote for here."),
  colour: z.enum(FLYER_COLOURS, { message: "Choose a colour option." }),
  deadline: z.string().trim().min(1, "Tell the printer when you need them."),
  deliveryArea: z.string().trim().min(1, "Add a delivery or pick-up area."),
  productType: z.enum(PRINTING_PRODUCT_TYPES).optional(),
});
export type FlyerPrintingInput = z.infer<typeof flyerPrintingInputSchema>;
