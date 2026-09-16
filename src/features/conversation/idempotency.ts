import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";

import type { ConversationResult, InboundMessage } from "./types";

const PROCESSING_STATUS = 102;

/** A concurrent delivery already owns this message. Channel adapters may
 * acknowledge the duplicate while the owner finishes. */
export class InboundMessageProcessingError extends Error {
  constructor() {
    super("This inbound message is already being processed.");
    this.name = "InboundMessageProcessingError";
  }
}

function messageHash(message: InboundMessage): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor: message.actor,
        channel: message.channel,
        externalConversationId: message.externalConversationId,
        externalMessageId: message.externalMessageId,
        text: message.text,
      }),
    )
    .digest("hex");
}

function scope(message: InboundMessage): string {
  const digest = createHash("sha256")
    .update(`${message.channel}\u0000${message.externalConversationId}`)
    .digest("hex")
    .slice(0, 32);
  return `conversation.message:${digest}`;
}

/** Reuse the project's durable idempotency store for channel message ids. */
export async function processInboundOnce(
  db: Database,
  message: InboundMessage,
  process: () => Promise<ConversationResult>,
): Promise<{ result: ConversationResult; replayed: boolean }> {
  const idempotencyScope = scope(message);
  const requestHash = messageHash(message);
  const key = message.externalMessageId.trim();
  if (!key || key.length > 200) {
    throw new HttpError(
      400,
      "INVALID_EXTERNAL_MESSAGE_ID",
      "External message id must be between 1 and 200 characters.",
    );
  }

  // Claim before any domain work. M10.16 originally checked first and stored
  // only after processing, which allowed two simultaneous provider retries to
  // both execute. The existing idempotency table can represent the claim; no
  // second message store or queue is needed for the current synchronous flow.
  const claimed = await db
    .insert(idempotencyKeys)
    .values({
      scope: idempotencyScope,
      key,
      requestHash,
      responseStatus: PROCESSING_STATUS,
      responseBody: { state: "PROCESSING" },
      responseHeaders: null,
    })
    .onConflictDoNothing()
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, idempotencyScope), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (!existing) throw new InboundMessageProcessingError();
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        "EXTERNAL_MESSAGE_ID_CONFLICT",
        "This external message id was already used for different content.",
      );
    }
    if (existing.responseStatus === PROCESSING_STATUS) {
      throw new InboundMessageProcessingError();
    }
    return { result: existing.responseBody as ConversationResult, replayed: true };
  }

  try {
    const result = await process();
    await db
      .update(idempotencyKeys)
      .set({ responseStatus: 200, responseBody: result })
      .where(
        and(
          eq(idempotencyKeys.scope, idempotencyScope),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.requestHash, requestHash),
          eq(idempotencyKeys.responseStatus, PROCESSING_STATUS),
        ),
      );
    return { result, replayed: false };
  } catch (error) {
    // A failed attempt is retryable. Delete only this still-processing claim;
    // never erase a result another worker has completed.
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, idempotencyScope),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.requestHash, requestHash),
          eq(idempotencyKeys.responseStatus, PROCESSING_STATUS),
        ),
      );
    throw error;
  }
}
