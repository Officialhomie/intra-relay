// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";

import { classifyMessage } from "./classify";
import { getConversation, mergeUserIntent, recordTurn } from "./memory";

/**
 * Conversation memory (milestone 6 §30; milestone 10.4): context accumulates
 * across turns, one session never sees another's, and it now survives past
 * the process that wrote it — backed by the same Postgres/PGlite database as
 * everything else, verified here against a fresh embedded instance per test.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const NOW = new Date("2026-09-03T09:00:00Z");

async function say(sessionId: string, text: string) {
  const reading = classifyMessage(text, {
    now: NOW,
    priorIntent: (await getConversation(db, sessionId))?.intent,
  });
  return recordTurn(db, {
    sessionId,
    userText: text,
    extracted: reading.extracted,
    intentKind: reading.intent,
  });
}

describe("context builds up over a conversation", () => {
  it("'I need flyers' then '500' then 'By Friday' produces one full brief", async () => {
    await say("s1", "I need flyers");
    await say("s1", "500");
    const last = await say("s1", "By Friday");

    expect(last.state.intent).toMatchObject({
      service: "flyers",
      category: "printing",
      quantity: 500,
    });
    expect(last.state.intent.deadline?.phrase).toBe("by friday");
    expect(last.changed).toContain("deadline");
  });

  it("a later value corrects an earlier one", async () => {
    await say("s2", "I need 500 flyers");
    const fixed = await say("s2", "actually make it 750");
    expect(fixed.state.intent.quantity).toBe(750);
    expect(fixed.changed).toContain("quantity");
    expect(fixed.corrected).toContain("quantity");
  });

  it("keeps a transcript of the turns", async () => {
    await say("s3", "hi");
    await say("s3", "I need flyers");
    const state = await getConversation(db, "s3");
    expect(state?.turns.map((t) => t.text)).toEqual(["hi", "I need flyers"]);
  });
});

describe("sessions are isolated", () => {
  it("does not leak one session's intent into another", async () => {
    await say("alice", "I need 500 flyers by Friday");
    await say("bob", "hey");

    expect((await getConversation(db, "bob"))?.intent).toEqual({});
    expect((await getConversation(db, "alice"))?.intent.quantity).toBe(500);
  });
});

describe("mergeUserIntent", () => {
  it("only reports fields that actually changed", () => {
    const { intent, changed, corrected } = mergeUserIntent(
      { quantity: 500, category: "printing" },
      { quantity: 500, service: "flyers" },
    );
    expect(changed).toEqual(["service"]);
    expect(corrected).toEqual([]);
    expect(intent).toEqual({ quantity: 500, category: "printing", service: "flyers" });
  });

  it("reports a field that overwrote an existing value as corrected, not just changed", () => {
    const { changed, corrected } = mergeUserIntent(
      { quantity: 300, category: "printing" },
      { quantity: 500 },
    );
    expect(changed).toEqual(["quantity"]);
    expect(corrected).toEqual(["quantity"]);
  });

  it("a field repeated with the same value is neither changed nor corrected", () => {
    const { changed, corrected } = mergeUserIntent(
      { quantity: 300, category: "printing" },
      { quantity: 300 },
    );
    expect(changed).toEqual([]);
    expect(corrected).toEqual([]);
  });
});
