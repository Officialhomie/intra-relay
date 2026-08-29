import type { Database } from "@/lib/db/client";
import { createBusiness, type CreateBusinessRequest } from "@/features/businesses/service";
import {
  changeRouteStatus,
  createRoute,
  type ActivationChecklist,
} from "@/features/routes/service";
import type { Operator } from "@/lib/http/operator";

export const TEST_OPERATOR: Operator = { label: "test-op" };
export const VALID_ADDRESS = `0x${"a".repeat(40)}`;

export const FULL_CHECKLIST: ActivationChecklist = {
  consentRecorded: true,
  contactChannelTested: true,
  publicAddressVerified: true,
  priceSourceDated: true,
  slaAgreed: true,
  sampleRequestTested: true,
};

export function businessInput(
  overrides: Partial<CreateBusinessRequest> = {},
): CreateBusinessRequest {
  return {
    businessName: "Campus Prints NG",
    contactName: "Ada Obi",
    contactChannelType: "whatsapp",
    contactChannelValue: "+2348012345678",
    category: "printing",
    city: "Lagos",
    country: "Nigeria",
    quoteCurrency: "NGN",
    payoutAddress: VALID_ADDRESS,
    consentToQuoteDisplay: true,
    ...overrides,
  };
}

export const COMPLETE_FLYER_BRIEF = {
  size: "A5",
  quantity: 200,
  colour: "full-colour",
  deadline: "Friday 3pm",
  deliveryArea: "UNILAG main gate",
} as const;

/** Create a business + route and drive it to ACTIVE via an operator. */
export async function createActiveRoute(
  db: Database,
  overrides: Partial<CreateBusinessRequest> = {},
) {
  const business = await createBusiness(db, businessInput(overrides));
  const draft = await createRoute(db, business.slug, {});
  await changeRouteStatus(db, draft.id, "PENDING_VERIFICATION", {
    operator: null,
    canManage: true,
  });
  const route = await changeRouteStatus(
    db,
    draft.id,
    "ACTIVE",
    { operator: TEST_OPERATOR },
    FULL_CHECKLIST,
  );
  return { business, route };
}
