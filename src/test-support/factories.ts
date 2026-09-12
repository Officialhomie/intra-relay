import type { Database } from "@/lib/db/client";
import { createBusiness, type CreateBusinessRequest } from "@/features/businesses/service";
import {
  changeRouteStatus,
  createRoute,
  type ActivationChecklist,
} from "@/features/routes/service";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { submitQuote } from "@/features/quotes/service";
import { createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
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

/**
 * Drive a task all the way to `HANDOFF_READY` with an accepted commitment —
 * the state a buyer can pay for (M10.5). The commitment is created but NOT
 * EAS-attested (that is a separate, retryable step and the order payment does
 * not depend on it).
 */
export async function createHandoffReadyOrder(
  db: Database,
  opts: {
    session?: string;
    amountMin?: number;
    deliveryCharge?: number;
    /** Pass `null` to force the default commitment window (no quote expiry). */
    expiresAt?: Date | null;
    payoutAddress?: string;
    /** Distinct name when a test creates more than one order/business. */
    businessName?: string;
  } = {},
) {
  const session = opts.session ?? "buyer-session-m105-0001";
  const routeOverrides: Partial<CreateBusinessRequest> = {};
  if (opts.payoutAddress) routeOverrides.payoutAddress = opts.payoutAddress;
  if (opts.businessName) routeOverrides.businessName = opts.businessName;
  const { business, route } = await createActiveRoute(db, routeOverrides);
  const task = await createTask(db, session, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, session);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: opts.amountMin ?? 45000,
    turnaround: "24 hours",
    fixed: true,
    confidence: "high",
    ...(opts.deliveryCharge !== undefined ? { deliveryCharge: opts.deliveryCharge } : {}),
    ...(opts.expiresAt === null
      ? {}
      : { expiresAt: opts.expiresAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000) }),
  });
  await decideOnQuote(db, task.id, session, { decision: "ACCEPT" });
  const commitment = (await findCommitmentByTaskId(db, task.id))!;
  return { business, route, task, commitment, session };
}
