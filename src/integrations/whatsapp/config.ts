import { HttpError } from "@/lib/http/response";

export interface WhatsAppConfig {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  graphApiVersion: string;
  buyerPhoneNumberId: string;
  businessOnboardingPhoneNumberId: string | null;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new HttpError(503, "WHATSAPP_UNCONFIGURED", "WhatsApp integration is not configured.");
  }
  return value;
}

/** Read only at the request boundary, so environments that intentionally do
 * not enable WhatsApp can still boot and use every other Intra surface. */
export function readWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const graphApiVersion = required(env, "WHATSAPP_GRAPH_API_VERSION");
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new HttpError(503, "WHATSAPP_UNCONFIGURED", "WhatsApp integration is not configured.");
  }

  const buyerPhoneNumberId = required(env, "WHATSAPP_PHONE_NUMBER_ID");
  const businessOnboardingPhoneNumberId =
    env.WHATSAPP_BUSINESS_ONBOARDING_PHONE_NUMBER_ID?.trim() || null;
  if (businessOnboardingPhoneNumberId === buyerPhoneNumberId) {
    throw new HttpError(503, "WHATSAPP_UNCONFIGURED", "WhatsApp integration is not configured.");
  }

  return {
    verifyToken: required(env, "WHATSAPP_VERIFY_TOKEN"),
    appSecret: required(env, "WHATSAPP_APP_SECRET"),
    accessToken: required(env, "WHATSAPP_ACCESS_TOKEN"),
    graphApiVersion,
    buyerPhoneNumberId,
    businessOnboardingPhoneNumberId,
  };
}

export function readWhatsAppVerifyToken(env: NodeJS.ProcessEnv = process.env): string {
  return required(env, "WHATSAPP_VERIFY_TOKEN");
}
