import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";

import type { WhatsAppConfig } from "./config";
import { sendWhatsAppText } from "./sender";
import type { WhatsAppSendReceipt } from "./types";

const PROCESSING_STATUS = 102;

export class WhatsAppDeliveryProcessingError extends Error {
  constructor() {
    super("This WhatsApp delivery is already in progress.");
    this.name = "WhatsAppDeliveryProcessingError";
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Send each gateway output at most once for ordinary and concurrent webhook
 * retries. Failed sends release their claim so Meta's next retry can deliver
 * the already-persisted gateway result without repeating domain work. */
export async function deliverWhatsAppTextOnce(
  db: Database,
  input: {
    sourceMessageId: string;
    messageIndex: number;
    recipient: string;
    phoneNumberId: string;
    text: string;
  },
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ receipt: WhatsAppSendReceipt; replayed: boolean }> {
  const scope = `whatsapp.delivery:${digest(input.phoneNumberId).slice(0, 24)}`;
  const key = digest(`${input.sourceMessageId}\u0000${input.messageIndex}`);
  const requestHash = digest(
    JSON.stringify({
      recipient: input.recipient,
      phoneNumberId: input.phoneNumberId,
      text: input.text,
    }),
  );

  const claimed = await db
    .insert(idempotencyKeys)
    .values({
      scope,
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
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (!existing || existing.responseStatus === PROCESSING_STATUS) {
      throw new WhatsAppDeliveryProcessingError();
    }
    if (existing.requestHash !== requestHash) {
      throw new Error("WhatsApp delivery id was reused for different content.");
    }
    return { receipt: existing.responseBody as WhatsAppSendReceipt, replayed: true };
  }

  try {
    const receipt = await sendWhatsAppText(input, config, fetchImpl);
    await db
      .update(idempotencyKeys)
      .set({ responseStatus: 200, responseBody: receipt })
      .where(
        and(
          eq(idempotencyKeys.scope, scope),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.requestHash, requestHash),
          eq(idempotencyKeys.responseStatus, PROCESSING_STATUS),
        ),
      );
    return { receipt, replayed: false };
  } catch (error) {
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, scope),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.requestHash, requestHash),
          eq(idempotencyKeys.responseStatus, PROCESSING_STATUS),
        ),
      );
    throw error;
  }
}
