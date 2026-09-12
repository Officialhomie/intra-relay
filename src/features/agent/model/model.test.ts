import { describe, expect, it } from "vitest";

import { parseBuyerIntent } from "../runtime/intent";
import { MockModelProvider } from "./mock";
import { colourEnumFromPhrase, mergeIntent } from "./normalize";
import { clampUser, extractJsonObject } from "./prompt";
import { resolveModelProvider } from "./provider";
import { intentInterpretationSchema, offerReasoningSchema, quotePlanSchema } from "./schema";
import { DEFAULT_MODEL_LIMITS, ModelUnavailableError } from "./types";

const NOW = new Date("2026-09-01T09:00:00.000Z");

// --- MockModelProvider (Part N) -----------------------------------------------

describe("MockModelProvider — the credit-free stand-in", () => {
  it("produces a schema-valid interpretation from the prompt with no script", async () => {
    const mock = new MockModelProvider();
    const res = await mock.generate({
      purpose: "understand_intent",
      system: "s",
      user: `Buyer message:\n"""500 A5 full colour flyers by Friday to Yaba"""`,
      schema: intentInterpretationSchema,
      schemaName: "IntentInterpretation",
    });
    expect(res.value.service).toBe("print_flyers");
    expect(res.value.quantity).toBe(500);
    expect(res.value.clarificationNeeded).toBe(false);
  });

  it("returns a scripted value verbatim", async () => {
    const mock = new MockModelProvider({
      scripts: {
        select_offer: {
          value: {
            selectedBusinessSlug: "b",
            reason: "cheapest that still meets Friday",
            tradeoffs: [],
            uncertainties: [],
          },
        },
      },
    });
    const res = await mock.generate({
      purpose: "select_offer",
      system: "s",
      user: "- a — A\n- b — B",
      schema: offerReasoningSchema,
      schemaName: "OfferReasoning",
    });
    expect(res.value.selectedBusinessSlug).toBe("b");
  });

  it("raises INVALID_JSON on unparseable raw text", async () => {
    const mock = new MockModelProvider({ scripts: { plan_quotes: { raw: "not json at all" } } });
    await expect(
      mock.generate(
        {
          purpose: "plan_quotes",
          system: "s",
          user: "u",
          schema: quotePlanSchema,
          schemaName: "QuotePlan",
        },
        DEFAULT_MODEL_LIMITS,
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("raises SCHEMA_MISMATCH on well-formed JSON that breaks the contract", async () => {
    const mock = new MockModelProvider({
      scripts: { select_offer: { raw: JSON.stringify({ selectedBusinessSlug: 42 }) } },
    });
    await expect(
      mock.generate(
        {
          purpose: "select_offer",
          system: "s",
          user: "u",
          schema: offerReasoningSchema,
          schemaName: "OfferReasoning",
        },
        DEFAULT_MODEL_LIMITS,
      ),
    ).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
  });

  it("surfaces provider errors (rate limit, provider error) as ModelUnavailableError", async () => {
    const mock = new MockModelProvider({ scripts: { replan: { error: "RATE_LIMIT" } } });
    await expect(
      mock.generate(
        { purpose: "replan", system: "s", user: "u", schema: quotePlanSchema, schemaName: "x" },
        DEFAULT_MODEL_LIMITS,
      ),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("times out when told to hang, within the call limit", async () => {
    const mock = new MockModelProvider({ scripts: { understand_intent: { hang: true } } });
    await expect(
      mock.generate(
        {
          purpose: "understand_intent",
          system: "s",
          user: "u",
          schema: intentInterpretationSchema,
          schemaName: "x",
        },
        { ...DEFAULT_MODEL_LIMITS, timeoutMs: 30 },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("walks a scripted array across successive calls (e.g. replanning)", async () => {
    const calls: string[] = [];
    const mock = new MockModelProvider({
      calls: calls as never,
      scripts: {
        plan_quotes: [
          { value: { quote: [{ businessSlug: "a", reason: "first" }], skip: [], note: "" } },
          { value: { quote: [{ businessSlug: "b", reason: "second" }], skip: [], note: "" } },
        ],
      },
    });
    const one = await mock.generate({
      purpose: "plan_quotes",
      system: "s",
      user: "u",
      schema: quotePlanSchema,
      schemaName: "QuotePlan",
    });
    const two = await mock.generate({
      purpose: "plan_quotes",
      system: "s",
      user: "u",
      schema: quotePlanSchema,
      schemaName: "QuotePlan",
    });
    expect(one.value.quote[0].businessSlug).toBe("a");
    expect(two.value.quote[0].businessSlug).toBe("b");
    expect(calls).toEqual(["plan_quotes", "plan_quotes"]);
  });
});

// --- provider resolution (Part O) --------------------------------------------

describe("resolveModelProvider — key is optional, nothing throws", () => {
  const base = { NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;

  it("returns no provider when nothing is configured (deterministic fallback)", () => {
    const r = resolveModelProvider(base);
    expect(r.provider).toBeNull();
    expect(r.info.configured).toBe(false);
  });

  it("honours AGENT_MODEL_PROVIDER=off", () => {
    const r = resolveModelProvider({ ...base, AGENT_MODEL_PROVIDER: "off" });
    expect(r.provider).toBeNull();
    expect(r.info.provider).toBe("none");
  });

  it("gives the mock provider on AGENT_MODEL_PROVIDER=mock", () => {
    const r = resolveModelProvider({ ...base, AGENT_MODEL_PROVIDER: "mock" });
    expect(r.provider?.info.provider).toBe("mock");
    expect(r.info.worksWithoutCredits).toBe(true);
  });

  it("builds the Anthropic provider when a key is present", () => {
    const r = resolveModelProvider({
      ...base,
      ANTHROPIC_API_KEY: "sk-ant-test",
      AGENT_MODEL: "claude-x",
    });
    expect(r.provider?.info.provider).toBe("anthropic");
    expect(r.info.model).toBe("claude-x");
    expect(r.info.worksWithoutCredits).toBe(false);
  });
});

// --- intent merge: model proposes, deterministic disposes --------------------

describe("mergeIntent", () => {
  const det = parseBuyerIntent("I want 500 copies, size A5", { now: NOW });

  it("keeps the deterministic value and ignores a contradicting model value", () => {
    const merged = mergeIntent(det, interp({ quantity: 999, size: "A3" }), NOW);
    expect(merged.intent.quantity).toBe(500);
    expect(merged.intent.size).toBe("A5");
    expect(merged.notes.some((n) => n.code === "MODEL_FIELD_OVERRIDDEN")).toBe(true);
  });

  it("fills only the gaps the parser left", () => {
    const merged = mergeIntent(det, interp({ colour: "full-colour", deliveryArea: "LASU" }), NOW);
    expect(merged.intent.colour).toBe("full colour");
    expect(merged.intent.deliveryArea).toBe("LASU");
  });

  it("turns a model deadline PHRASE into a date via the deterministic parser", () => {
    const merged = mergeIntent(det, interp({ deadlineText: "this Friday" }), NOW);
    expect(merged.intent.deadline?.slice(0, 10)).toBe("2026-09-04");
    expect(merged.notes.some((n) => n.code === "MODEL_NORMALISED_DEADLINE")).toBe(true);
  });

  it("asks for clarification (not a guess) when a field is still missing", () => {
    const merged = mergeIntent(
      det,
      interp({ clarificationNeeded: true, clarificationQuestion: "What size and colour?" }),
      NOW,
    );
    expect(merged.clarification?.missing).toContain("colour");
    expect(merged.clarification?.question).toBe("What size and colour?");
  });

  it("flags an out-of-scope request", () => {
    const merged = mergeIntent(det, interp({ service: "other" }), NOW);
    expect(merged.outOfScope).toBeTruthy();
  });
});

// --- prompt helpers ---------------------------------------------------------

describe("prompt helpers", () => {
  it("clampUser truncates over-long input", () => {
    expect(clampUser("x".repeat(100), 40).length).toBeLessThanOrEqual(40);
    expect(clampUser("short", 40)).toBe("short");
  });

  it("extractJsonObject reads a bare or fenced object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('here you go: {"a":3} thanks')).toEqual({ a: 3 });
  });

  it("colourEnumFromPhrase maps both spellings", () => {
    expect(colourEnumFromPhrase("full colour")).toBe("full-colour");
    expect(colourEnumFromPhrase("full-colour")).toBe("full-colour");
    expect(colourEnumFromPhrase(null)).toBeNull();
  });
});

// --- schema contract: nullable means "present as null", not "may be omitted" -

describe("intentInterpretationSchema — nullable fields must be explicit null, not omitted", () => {
  const complete = interp({ colour: "full-colour" });

  it("rejects an object where a nullable key is entirely omitted", () => {
    const withoutColour: Partial<typeof complete> = { ...complete };
    delete withoutColour.colour;
    expect(intentInterpretationSchema.safeParse(withoutColour).success).toBe(false);
  });

  it("accepts the same object with the key present and explicitly null", () => {
    expect(intentInterpretationSchema.safeParse({ ...complete, colour: null }).success).toBe(true);
  });

  it("rejects a numeric confidence — must be the low/medium/high enum, not a probability", () => {
    // Exactly the shape the live model returned before the tool-use fix.
    expect(intentInterpretationSchema.safeParse({ ...complete, confidence: 0.95 }).success).toBe(
      false,
    );
  });
});

function interp(
  over: Partial<import("./schema").IntentInterpretation>,
): import("./schema").IntentInterpretation {
  return {
    service: "print_flyers",
    quantity: null,
    size: null,
    colour: null,
    deadlineText: null,
    deliveryArea: null,
    clarificationNeeded: false,
    clarificationQuestion: null,
    missing: [],
    confidence: "medium",
    ...over,
  };
}
