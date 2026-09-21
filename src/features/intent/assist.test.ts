import { describe, expect, it } from "vitest";

import { MockModelProvider } from "../agent/model/mock";
import { interpretUnknownMessage } from "./assist";

/**
 * The Haiku fallback for a message the deterministic layer cannot place
 * (milestone 10.4). It must degrade to "do nothing" on every kind of
 * failure — no provider, a bad reply, an unclear classification — since the
 * caller's existing deterministic reply is always safe on its own.
 */

describe("interpretUnknownMessage", () => {
  it("returns null when no model provider is configured", async () => {
    const result = await interpretUnknownMessage({
      message: "cakes",
      knownIntent: {},
      recentTurns: [],
      modelProvider: null,
    });
    expect(result).toBeNull();
  });

  it("returns a known category the deterministic layer had no keyword for", async () => {
    const provider = new MockModelProvider({
      scripts: {
        classify_conversation: {
          value: {
            category: "food",
            service: "cakes",
            confidence: "high",
            clarificationQuestion: null,
          },
        },
      },
    });
    const result = await interpretUnknownMessage({
      message: "cakes",
      knownIntent: {},
      recentTurns: [],
      modelProvider: provider,
    });
    expect(result).toEqual({
      category: "food",
      service: "cakes",
      confidence: "high",
      clarificationQuestion: null,
    });
  });

  it("never returns a category outside the known list, even if asked to", async () => {
    const provider = new MockModelProvider({
      scripts: {
        classify_conversation: {
          raw: '{"category":"unclear","service":null,"confidence":"low","clarificationQuestion":"What do you need?"}',
        },
      },
    });
    const result = await interpretUnknownMessage({
      message: "asdf",
      knownIntent: {},
      recentTurns: [],
      modelProvider: provider,
    });
    expect(result?.category).toBeUndefined();
    expect(result?.clarificationQuestion).toBe("What do you need?");
  });

  it("returns null on a schema-mismatched reply rather than throwing", async () => {
    const provider = new MockModelProvider({
      scripts: { classify_conversation: { raw: "not json at all" } },
    });
    const result = await interpretUnknownMessage({
      message: "cakes",
      knownIntent: {},
      recentTurns: [],
      modelProvider: provider,
    });
    expect(result).toBeNull();
  });

  it("returns null on a provider error rather than throwing", async () => {
    const provider = new MockModelProvider({
      scripts: { classify_conversation: { error: "PROVIDER_ERROR" } },
    });
    const result = await interpretUnknownMessage({
      message: "cakes",
      knownIntent: {},
      recentTurns: [],
      modelProvider: provider,
    });
    expect(result).toBeNull();
  });

  it("returns null on timeout rather than hanging the conversation", async () => {
    const provider = new MockModelProvider({
      scripts: { classify_conversation: { error: "TIMEOUT" } },
    });
    const result = await interpretUnknownMessage({
      message: "cakes",
      knownIntent: {},
      recentTurns: [],
      modelProvider: provider,
    });
    expect(result).toBeNull();
  });
});
