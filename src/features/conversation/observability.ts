import type { Database } from "@/lib/db/client";
import { appendAuditEvent } from "@/features/audit/repository";

import type { ActorReference, ConversationChannel } from "./types";

export type ConversationEventName =
  | "message_received"
  | "message_processed"
  | "intent_extracted"
  | "state_changed"
  | "domain_action_triggered"
  | "domain_action_completed"
  | "response_generated"
  | "processing_failed";

/** Best-effort structured instrumentation on the existing audit log. Raw text
 * and contact values are deliberately not accepted by this API. */
export async function recordConversationEvent(
  db: Database,
  input: {
    name: ConversationEventName;
    conversationId: string;
    actor: ActorReference;
    channel: ConversationChannel;
    businessId?: string | null;
    data?: Record<string, string | number | boolean | null | string[]>;
  },
): Promise<void> {
  try {
    await appendAuditEvent(db, {
      type: `conversation.${input.name}`,
      businessId: input.businessId ?? input.actor.businessId ?? null,
      data: {
        conversationId: input.conversationId,
        actorRole: input.actor.role,
        channel: input.channel,
        ...(input.data ?? {}),
      },
    });
  } catch {
    // Observability cannot change conversation behavior.
  }
}
