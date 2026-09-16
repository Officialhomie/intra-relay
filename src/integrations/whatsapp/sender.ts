import { z } from "zod";

import type { WhatsAppConfig } from "./config";
import type { WhatsAppSendReceipt } from "./types";

const sendResponseSchema = z.object({
  messaging_product: z.string().optional(),
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
});

export class WhatsAppDeliveryError extends Error {
  constructor(readonly providerStatus: number | null) {
    super("WhatsApp did not accept the outbound message.");
    this.name = "WhatsAppDeliveryError";
  }
}

/** Provider-specific plain-text sender. No gateway/domain module imports this. */
export async function sendWhatsAppText(
  input: { recipient: string; phoneNumberId: string; text: string },
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsAppSendReceipt> {
  const allowed =
    input.phoneNumberId === config.buyerPhoneNumberId ||
    input.phoneNumberId === config.businessOnboardingPhoneNumberId;
  if (!allowed || !input.text.trim() || input.text.length > 4096) {
    throw new WhatsAppDeliveryError(null);
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(input.phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.recipient,
          type: "text",
          text: { preview_url: false, body: input.text },
        }),
      },
    );
  } catch {
    throw new WhatsAppDeliveryError(null);
  }
  if (!response.ok) throw new WhatsAppDeliveryError(response.status);

  const parsed = sendResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new WhatsAppDeliveryError(response.status);
  return { providerMessageId: parsed.data.messages[0].id };
}
