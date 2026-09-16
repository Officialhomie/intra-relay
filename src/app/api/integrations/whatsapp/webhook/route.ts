import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { HttpError } from "@/lib/http/response";
import { handleInboundMessage } from "@/features/conversation/gateway";
import { InboundMessageProcessingError } from "@/features/conversation/idempotency";
import { readWhatsAppConfig, readWhatsAppVerifyToken } from "@/integrations/whatsapp/config";
import {
  deliverWhatsAppTextOnce,
  WhatsAppDeliveryProcessingError,
} from "@/integrations/whatsapp/delivery";
import {
  extractWhatsAppTextEnvelopes,
  normalizeWhatsAppMessage,
} from "@/integrations/whatsapp/normalizer";
import { recordWhatsAppEvent, whatsappIdentifier } from "@/integrations/whatsapp/observability";
import { verifyMetaChallengeToken, verifyMetaSignature } from "@/integrations/whatsapp/signature";
import { WhatsAppDeliveryError } from "@/integrations/whatsapp/sender";
import { metaWhatsAppWebhookSchema } from "@/integrations/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1_000_000;

async function recordRejection(status: string): Promise<void> {
  try {
    await recordWhatsAppEvent(await getDb(), { name: "webhook_rejected", status });
  } catch {
    // A rejected webhook must stay rejected even when observability is down.
  }
}

/** Meta's one-time callback verification handshake. */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = readWhatsAppVerifyToken();
  if (mode !== "subscribe" || !challenge || !verifyMetaChallengeToken(token, expected)) {
    throw new HttpError(403, "WHATSAPP_VERIFICATION_FAILED", "Webhook verification failed.");
  }
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
});

/**
 * Meta Cloud API delivery endpoint. Processing is synchronous and forced onto
 * the deterministic conversation path for this first slice: success is
 * acknowledged only after the gateway result has been delivered. If delivery
 * fails, Meta receives non-2xx and can retry; gateway and outbound claims make
 * that retry safe without a queue.
 */
export const POST = route(async (request) => {
  const config = readWhatsAppConfig();
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    await recordRejection("payload_too_large");
    throw new HttpError(413, "WHATSAPP_PAYLOAD_TOO_LARGE", "Webhook payload is too large.");
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    await recordRejection("payload_too_large");
    throw new HttpError(413, "WHATSAPP_PAYLOAD_TOO_LARGE", "Webhook payload is too large.");
  }
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    await recordRejection("invalid_signature");
    throw new HttpError(401, "INVALID_WHATSAPP_SIGNATURE", "Webhook signature did not verify.");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    await recordRejection("invalid_json");
    throw new HttpError(400, "INVALID_JSON", "Webhook body must be valid JSON.");
  }
  const parsed = metaWhatsAppWebhookSchema.safeParse(json);
  if (!parsed.success) {
    await recordRejection("invalid_payload");
    throw new HttpError(400, "INVALID_WHATSAPP_PAYLOAD", "Unrecognized WhatsApp webhook shape.");
  }

  const db = await getDb();
  const envelopes = extractWhatsAppTextEnvelopes(parsed.data);
  await recordWhatsAppEvent(db, { name: "webhook_received", count: envelopes.length });

  for (const envelope of envelopes) {
    const normalized = normalizeWhatsAppMessage(envelope, config);
    if (!normalized) continue; // signed event for a phone number this deployment does not serve

    const messageKey = whatsappIdentifier(normalized.inbound.externalMessageId);
    const conversationKey = whatsappIdentifier(normalized.inbound.externalConversationId);
    await recordWhatsAppEvent(db, {
      name: "message_normalized",
      messageKey,
      conversationKey,
    });
    await recordWhatsAppEvent(db, {
      name: "actor_resolved",
      messageKey,
      conversationKey,
      actorRole: normalized.inbound.actor.role,
    });

    let gateway;
    try {
      gateway = await handleInboundMessage(db, normalized.inbound, {
        origin: new URL(request.url).origin,
        // Keep provider acknowledgement bounded; M10.19 can revisit assisted
        // interpretation behind a durable worker if real usage requires it.
        mode: "deterministic",
      });
    } catch (error) {
      if (error instanceof InboundMessageProcessingError) continue;
      throw error;
    }
    await recordWhatsAppEvent(db, {
      name: "message_processed",
      messageKey,
      conversationKey,
      actorRole: gateway.result.actor.role,
      status: gateway.replayed ? "replayed" : "processed",
    });

    for (const [index, outbound] of gateway.result.messages.entries()) {
      await recordWhatsAppEvent(db, {
        name: "delivery_attempted",
        messageKey,
        conversationKey,
      });
      try {
        const delivery = await deliverWhatsAppTextOnce(
          db,
          {
            sourceMessageId: normalized.inbound.externalMessageId,
            messageIndex: index,
            recipient: normalized.recipient,
            phoneNumberId: normalized.phoneNumberId,
            text: outbound.text,
          },
          config,
        );
        await recordWhatsAppEvent(db, {
          name: "delivery_succeeded",
          messageKey,
          conversationKey,
          status: delivery.replayed ? "replayed" : "accepted",
        });
      } catch (error) {
        if (error instanceof WhatsAppDeliveryProcessingError) continue;
        await recordWhatsAppEvent(db, {
          name: "delivery_failed",
          messageKey,
          conversationKey,
          status:
            error instanceof WhatsAppDeliveryError && error.providerStatus
              ? `http_${error.providerStatus}`
              : "network_or_invalid_response",
        });
        throw new HttpError(
          502,
          "WHATSAPP_DELIVERY_FAILED",
          "WhatsApp did not accept the response message.",
        );
      }
    }
  }

  // Meta expects a successful HTTP acknowledgement for handled/ignored events.
  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
});
