import type { ActorReference } from "@/features/conversation/types";

import type { WhatsAppConfig } from "./config";

/**
 * Role is selected by the verified Meta destination number, not by text the
 * sender types. The business-onboarding number grants only permission to build
 * a new DRAFT profile; it is not proof of ownership of any existing business.
 * That association is added by the gateway only after explicit consent and
 * successful draft creation.
 */
export function resolveWhatsAppActor(
  senderId: string,
  phoneNumberId: string,
  config: WhatsAppConfig,
): ActorReference | null {
  if (phoneNumberId === config.buyerPhoneNumberId) {
    return { role: "buyer", externalUserId: senderId };
  }
  if (
    config.businessOnboardingPhoneNumberId &&
    phoneNumberId === config.businessOnboardingPhoneNumberId
  ) {
    return { role: "business_owner", externalUserId: senderId };
  }
  return null;
}
