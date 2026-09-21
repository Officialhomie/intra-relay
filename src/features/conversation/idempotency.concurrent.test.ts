// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";

import { InboundMessageProcessingError, processInboundOnce } from "./idempotency";
import type { ConversationResult, InboundMessage } from "./types";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => close());

const message: InboundMessage = {
  actor: { role: "buyer", externalUserId: "concurrent-buyer" },
  channel: "whatsapp",
  externalConversationId: "phone:concurrent-buyer",
  externalMessageId: "wamid.concurrent-1",
  text: "I need flyers",
  receivedAt: new Date(),
};

const result: ConversationResult = {
  conversationId: "conversation-test",
  actor: message.actor,
  channel: "whatsapp",
  messages: [{ kind: "text", text: "How many?" }],
  stateChanges: [],
  actions: [],
  notifications: [],
};

describe("concurrent inbound claims", () => {
  it("allows only one simultaneous delivery to execute domain work", async () => {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (entered = resolve));
    let executions = 0;

    const first = processInboundOnce(db, message, async () => {
      executions += 1;
      entered();
      await blocked;
      return result;
    });
    await started;

    await expect(processInboundOnce(db, message, async () => result)).rejects.toBeInstanceOf(
      InboundMessageProcessingError,
    );
    release();
    await expect(first).resolves.toEqual({ result, replayed: false });
    expect(executions).toBe(1);

    await expect(processInboundOnce(db, message, async () => result)).resolves.toEqual({
      result,
      replayed: true,
    });
  });
});
