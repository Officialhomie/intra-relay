import { afterEach, describe, expect, it } from "vitest";

import { classifyMessage } from "./classify";
import { __resetConversations, getConversation, mergeUserIntent, recordTurn } from "./memory";

/**
 * Conversation memory (milestone 6 §30): context accumulates across turns, and
 * one session never sees another's.
 */

afterEach(() => __resetConversations());

const NOW = new Date("2026-09-03T09:00:00Z");

function say(sessionId: string, text: string) {
  const reading = classifyMessage(text, {
    now: NOW,
    priorIntent: getConversation(sessionId)?.intent,
  });
  return recordTurn({
    sessionId,
    userText: text,
    extracted: reading.extracted,
    intentKind: reading.intent,
  });
}

describe("context builds up over a conversation", () => {
  it("'I need flyers' then '500' then 'By Friday' produces one full brief", () => {
    say("s1", "I need flyers");
    say("s1", "500");
    const last = say("s1", "By Friday");

    expect(last.state.intent).toMatchObject({
      service: "flyers",
      category: "printing",
      quantity: 500,
    });
    expect(last.state.intent.deadline?.phrase).toBe("by friday");
    expect(last.changed).toContain("deadline");
  });

  it("a later value corrects an earlier one", () => {
    say("s2", "I need 500 flyers");
    const fixed = say("s2", "actually make it 750");
    expect(fixed.state.intent.quantity).toBe(750);
    expect(fixed.changed).toContain("quantity");
  });

  it("keeps a transcript of the turns", () => {
    say("s3", "hi");
    say("s3", "I need flyers");
    expect(getConversation("s3")?.turns.map((t) => t.text)).toEqual(["hi", "I need flyers"]);
  });
});

describe("sessions are isolated", () => {
  it("does not leak one session's intent into another", () => {
    say("alice", "I need 500 flyers by Friday");
    say("bob", "hey");

    expect(getConversation("bob")?.intent).toEqual({});
    expect(getConversation("alice")?.intent.quantity).toBe(500);
  });
});

describe("mergeUserIntent", () => {
  it("only reports fields that actually changed", () => {
    const { intent, changed } = mergeUserIntent(
      { quantity: 500, category: "printing" },
      { quantity: 500, service: "flyers" },
    );
    expect(changed).toEqual(["service"]);
    expect(intent).toEqual({ quantity: 500, category: "printing", service: "flyers" });
  });
});
