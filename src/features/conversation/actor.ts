import { createHash } from "node:crypto";

import { HttpError } from "@/lib/http/response";

import type { ActorReference, InboundMessage } from "./types";

function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized)
    throw new HttpError(400, "INVALID_CONVERSATION_IDENTITY", `${label} is required.`);
  if (normalized.length > 200) {
    throw new HttpError(400, "INVALID_CONVERSATION_IDENTITY", `${label} is too long.`);
  }
  return normalized;
}

/** Normalize an adapter-resolved actor without guessing authority. */
export function resolveActorReference(actor: ActorReference): ActorReference {
  const externalUserId = requiredIdentifier(actor.externalUserId, "External user id");
  const businessId = actor.businessId?.trim() || undefined;
  if (actor.role === "business_operator" && !businessId) {
    throw new HttpError(
      400,
      "BUSINESS_ACTOR_UNRESOLVED",
      "A business operator must be associated with a business.",
    );
  }
  return { role: actor.role, externalUserId, ...(businessId ? { businessId } : {}) };
}

/** Preserve today's Web buyer session ids. Other channels get a non-PII,
 * deterministic internal key while their provider ids remain in metadata. */
export function conversationSessionId(message: InboundMessage): string {
  const externalConversationId = requiredIdentifier(
    message.externalConversationId,
    "External conversation id",
  );
  if (
    message.channel === "web" &&
    message.actor.role === "buyer" &&
    externalConversationId === message.actor.externalUserId
  ) {
    return externalConversationId;
  }
  const digest = createHash("sha256")
    .update(`${message.channel}\u0000${message.actor.role}\u0000${externalConversationId}`)
    .digest("hex");
  return `conversation:${digest}`;
}
