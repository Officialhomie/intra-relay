import { createHash } from "node:crypto";

import type { Database } from "@/lib/db/client";
import { appendAuditEvent } from "@/features/audit/repository";

export type WhatsAppEventName =
  | "webhook_received"
  | "message_normalized"
  | "actor_resolved"
  | "message_processed"
  | "delivery_attempted"
  | "delivery_succeeded"
  | "delivery_failed"
  | "webhook_rejected";

export function whatsappIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

/** Provider-level events in the existing audit trail. Identifiers are hashed;
 * raw phone/WA ids, message text, signatures, and tokens are never accepted. */
export async function recordWhatsAppEvent(
  db: Database,
  input: {
    name: WhatsAppEventName;
    messageKey?: string | null;
    conversationKey?: string | null;
    actorRole?: string | null;
    status?: string | null;
    count?: number;
  },
): Promise<void> {
  try {
    await appendAuditEvent(db, {
      type: `whatsapp.${input.name}`,
      data: {
        ...(input.messageKey ? { messageKey: input.messageKey } : {}),
        ...(input.conversationKey ? { conversationKey: input.conversationKey } : {}),
        ...(input.actorRole ? { actorRole: input.actorRole } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.count !== undefined ? { count: input.count } : {}),
      },
    });
  } catch {
    // Provider observability cannot change webhook behavior.
  }
}
