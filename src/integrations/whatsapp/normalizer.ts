import { HttpError } from "@/lib/http/response";
import type { InboundMessage } from "@/features/conversation/types";

import { resolveWhatsAppActor } from "./actor";
import type { WhatsAppConfig } from "./config";
import type { MetaWhatsAppWebhook, WhatsAppTextEnvelope } from "./types";

export interface NormalizedWhatsAppMessage {
  inbound: InboundMessage;
  recipient: string;
  phoneNumberId: string;
}

/** Pull only supported inbound text messages out of Meta's batch envelope.
 * Status callbacks and unsupported message types are intentionally ignored. */
export function extractWhatsAppTextEnvelopes(payload: MetaWhatsAppWebhook): WhatsAppTextEnvelope[] {
  const messages: WhatsAppTextEnvelope[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (value.messaging_product !== "whatsapp" || !value.metadata) continue;
      for (const message of value.messages ?? []) {
        if (message.type !== "text") continue;
        if (!message.text?.body) {
          throw new HttpError(
            400,
            "INVALID_WHATSAPP_PAYLOAD",
            "A WhatsApp text message did not contain text.",
          );
        }
        messages.push({
          phoneNumberId: value.metadata.phone_number_id,
          recipient: message.from,
          providerMessageId: message.id,
          text: message.text.body,
          timestampSeconds: Number(message.timestamp),
        });
      }
    }
  }
  return messages;
}

export function normalizeWhatsAppMessage(
  message: WhatsAppTextEnvelope,
  config: WhatsAppConfig,
): NormalizedWhatsAppMessage | null {
  const actor = resolveWhatsAppActor(message.recipient, message.phoneNumberId, config);
  if (!actor) return null;
  const receivedAt = new Date(message.timestampSeconds * 1000);
  if (Number.isNaN(receivedAt.getTime())) {
    throw new HttpError(400, "INVALID_WHATSAPP_PAYLOAD", "WhatsApp message time was invalid.");
  }
  return {
    inbound: {
      actor,
      channel: "whatsapp",
      // A participant may use the buyer and business entry points separately.
      externalConversationId: `${message.phoneNumberId}:${message.recipient}`,
      externalMessageId: message.providerMessageId,
      text: message.text,
      receivedAt,
    },
    recipient: message.recipient,
    phoneNumberId: message.phoneNumberId,
  };
}
