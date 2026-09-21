import type { InboundMessage } from "./types";

export interface WebInboundInput {
  sessionId: string;
  messageId: string;
  text: string;
  receivedAt?: Date;
}

/** The Web channel's complete normalization responsibility. */
export function normalizeWebInbound(input: WebInboundInput): InboundMessage {
  return {
    actor: { role: "buyer", externalUserId: input.sessionId },
    channel: "web",
    externalConversationId: input.sessionId,
    externalMessageId: input.messageId,
    text: input.text,
    receivedAt: input.receivedAt ?? new Date(),
  };
}
