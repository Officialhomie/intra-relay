// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { WhatsAppConfig } from "./config";
import { textWebhook, statusWebhook } from "./__fixtures__/webhook";
import { extractWhatsAppTextEnvelopes, normalizeWhatsAppMessage } from "./normalizer";
import { metaWhatsAppWebhookSchema } from "./types";

const config: WhatsAppConfig = {
  verifyToken: "verify",
  appSecret: "secret",
  accessToken: "access",
  graphApiVersion: "v99.0",
  buyerPhoneNumberId: "phone-buyer-001",
  businessOnboardingPhoneNumberId: "phone-business-001",
};

describe("WhatsApp payload normalization", () => {
  it("normalizes a buyer text into the existing InboundMessage contract", () => {
    const payload = metaWhatsAppWebhookSchema.parse(
      textWebhook({
        text: "I need 500 A5 flyers in Ikeja by Friday",
        messageId: "wamid.buyer-1",
      }),
    );
    const [envelope] = extractWhatsAppTextEnvelopes(payload);
    expect(normalizeWhatsAppMessage(envelope, config)).toEqual({
      inbound: {
        actor: { role: "buyer", externalUserId: "2348012345678" },
        channel: "whatsapp",
        externalConversationId: "phone-buyer-001:2348012345678",
        externalMessageId: "wamid.buyer-1",
        text: "I need 500 A5 flyers in Ikeja by Friday",
        receivedAt: new Date(1789552800 * 1000),
      },
      recipient: "2348012345678",
      phoneNumberId: "phone-buyer-001",
    });
  });

  it("uses the dedicated onboarding number for a prospective business owner", () => {
    const payload = metaWhatsAppWebhookSchema.parse(
      textWebhook({ phoneNumberId: "phone-business-001" }),
    );
    const normalized = normalizeWhatsAppMessage(extractWhatsAppTextEnvelopes(payload)[0], config);
    expect(normalized?.inbound.actor).toEqual({
      role: "business_owner",
      externalUserId: "2348012345678",
    });
    expect(normalized?.inbound.actor.businessId).toBeUndefined();
  });

  it("ignores statuses, unsupported message types, and unconfigured destination numbers", () => {
    const status = metaWhatsAppWebhookSchema.parse(statusWebhook());
    expect(extractWhatsAppTextEnvelopes(status)).toEqual([]);

    const image = metaWhatsAppWebhookSchema.parse(textWebhook({ type: "image" }));
    expect(extractWhatsAppTextEnvelopes(image)).toEqual([]);

    const unknown = metaWhatsAppWebhookSchema.parse(
      textWebhook({ phoneNumberId: "phone-not-configured" }),
    );
    expect(normalizeWhatsAppMessage(extractWhatsAppTextEnvelopes(unknown)[0], config)).toBeNull();
  });

  it("rejects malformed top-level payloads", () => {
    expect(metaWhatsAppWebhookSchema.safeParse({ object: "page", entry: [] }).success).toBe(false);
  });
});
