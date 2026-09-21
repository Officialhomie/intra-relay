import type { BusinessCategory } from "@/features/businesses/schema";
import type { PricingModel } from "@/features/pricing/model";

import type { RouteInputField } from "./schema";
import {
  FLYER_PRINTING_INPUT_FIELDS,
  FLYER_PRINTING_QUERY_FEE_USD,
  FLYER_PRINTING_ROUTE_SLUG,
  FLYER_PRINTING_SLA_MINUTES,
} from "./flyer-printing";

export interface ServiceTemplate {
  id: string;
  category: BusinessCategory;
  name: string;
  description: string;
  inputFields: readonly RouteInputField[];
  queryFeeUsd: number;
  responseSlaMinutes: number;
  availability: "mvp" | "coming_soon";
  /**
   * The pricing behaviour this kind of service usually has. A business can
   * change it — the template only picks a sensible starting point so onboarding
   * does not open with a question most operators would rather not answer.
   */
  defaultPricingModel: PricingModel;
  /** What a published amount would buy, when the model has one. */
  defaultPriceUnit: string | null;
}

const DESIGN_FIELDS: readonly RouteInputField[] = [
  {
    key: "deliverable",
    label: "What do you need designed?",
    example: "A 2-page event flyer",
    required: true,
  },
  {
    key: "brandAssets",
    label: "Brand assets or direction",
    example: "Use red and white; logo supplied",
    required: true,
  },
  { key: "deadline", label: "Needed by", example: "Friday 3pm", required: true },
  { key: "revisionScope", label: "Revision expectation", example: "One revision", required: false },
] as const;

const CATERING_FIELDS: readonly RouteInputField[] = [
  { key: "guestCount", label: "Number of guests", example: "50", required: true },
  { key: "mealType", label: "Meal type", example: "Jollof rice and chicken", required: true },
  { key: "eventDate", label: "Event date and time", example: "Saturday 1pm", required: true },
  { key: "deliveryArea", label: "Delivery area", example: "Yaba, Lagos", required: true },
] as const;

const DELIVERY_FIELDS: readonly RouteInputField[] = [
  { key: "pickupArea", label: "Pick-up area", example: "Yaba", required: true },
  { key: "dropoffArea", label: "Drop-off area", example: "Lekki Phase 1", required: true },
  {
    key: "itemDescription",
    label: "What is being delivered?",
    example: "Small document envelope",
    required: true,
  },
  { key: "readyAt", label: "When will it be ready?", example: "Today at 4pm", required: true },
] as const;

const GENERAL_FIELDS: readonly RouteInputField[] = [
  { key: "request", label: "What do you need?", example: "Describe the service", required: true },
  { key: "deadline", label: "Needed by", example: "Friday 3pm", required: true },
  {
    key: "location",
    label: "Location or service area",
    example: "Surulere, Lagos",
    required: true,
  },
] as const;

export const SERVICE_TEMPLATES: readonly ServiceTemplate[] = [
  {
    id: FLYER_PRINTING_ROUTE_SLUG,
    category: "printing",
    name: "Flyer printing quote",
    description: "A structured request for current flyer pricing, availability, and turnaround.",
    inputFields: FLYER_PRINTING_INPUT_FIELDS,
    queryFeeUsd: FLYER_PRINTING_QUERY_FEE_USD,
    responseSlaMinutes: FLYER_PRINTING_SLA_MINUTES,
    availability: "mvp",
    // A print run has a floor price that then scales with quantity and stock.
    defaultPricingModel: "STARTING_FROM",
    defaultPriceUnit: "per 100",
  },
  {
    id: "graphic-design-quote",
    category: "design",
    name: "Graphic design quote",
    description: "A brief for a design deliverable, timeline, and revision scope.",
    inputFields: DESIGN_FIELDS,
    queryFeeUsd: 0.03,
    responseSlaMinutes: 60,
    availability: "coming_soon",
    // Design work is judged job by job.
    defaultPricingModel: "QUOTE_REQUIRED",
    defaultPriceUnit: null,
  },
  {
    id: "event-catering-quote",
    category: "catering",
    name: "Event catering quote",
    description: "An event brief for menu, guest count, timing, and location.",
    inputFields: CATERING_FIELDS,
    queryFeeUsd: 0.03,
    responseSlaMinutes: 60,
    availability: "coming_soon",
    defaultPricingModel: "STARTING_FROM",
    defaultPriceUnit: "per guest",
  },
  {
    id: "local-delivery-quote",
    category: "delivery",
    name: "Local delivery quote",
    description: "A structured pick-up and delivery request for a local courier.",
    inputFields: DELIVERY_FIELDS,
    queryFeeUsd: 0.01,
    responseSlaMinutes: 20,
    availability: "coming_soon",
    // A courier run inside one city is the classic flat, published price.
    defaultPricingModel: "FIXED",
    defaultPriceUnit: "per drop",
  },
  {
    id: "service-request-quote",
    category: "other",
    name: "General service quote",
    description: "A safe starting structure for a service that does not fit a template yet.",
    inputFields: GENERAL_FIELDS,
    queryFeeUsd: 0.02,
    responseSlaMinutes: 60,
    availability: "coming_soon",
    defaultPricingModel: "QUOTE_REQUIRED",
    defaultPriceUnit: null,
  },
] as const;

/** Every template for a category, in catalogue order (M10.6). Empty array for
 * a category with none — never falls back to "other" the way the single-
 * template lookups below do, since "there are several to choose from" and
 * "there are none" are different answers. */
export function getTemplatesForCategory(category: BusinessCategory): ServiceTemplate[] {
  return SERVICE_TEMPLATES.filter((template) => template.category === category);
}

/** The one template a single-route flow (quick-start, legacy onboarding)
 * should use for a category — the first match, or the general "other"
 * template if the category has none of its own. This is the exact behaviour
 * `getTemplateForCategory` always had; new code should prefer this name. */
export function defaultTemplateFor(category: BusinessCategory): ServiceTemplate {
  return getTemplatesForCategory(category)[0] ?? SERVICE_TEMPLATES[4];
}

/** @deprecated Use `defaultTemplateFor` — same behaviour, clearer name now
 * that `getTemplatesForCategory` (many) also exists (M10.6). Kept so existing
 * single-route callers do not need to change until they choose to. */
export function getTemplateForCategory(category: BusinessCategory): ServiceTemplate {
  return defaultTemplateFor(category);
}
