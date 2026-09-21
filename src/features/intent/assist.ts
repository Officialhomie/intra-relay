import { clampUser } from "../agent/model/prompt";
import { resolveModelProvider } from "../agent/model/provider";
import { DEFAULT_MODEL_LIMITS, type ModelProvider } from "../agent/model/types";
import { KNOWN_CATEGORIES } from "./domain";
import type { ConversationTurn } from "./memory";
import { classificationSystemPrompt, classificationUserPrompt } from "./model/prompt";
import { conversationClassificationSchema } from "./model/schema";
import type { UserIntent } from "./types";

/**
 * The Haiku fallback for a message the deterministic layer cannot place
 * (milestone 10.4, step 7).
 *
 *   deterministic extraction (unchanged, always first)
 *   → confidence check (the CALLER decides whether to call this at all)
 *   → this: one bounded, schema-validated model call
 *   → structured interpretation handed back as plain data
 *   → the caller merges it through the SAME deterministic `mergeUserIntent`
 *     and `routeReading` as any other extraction — the model never touches
 *     domain truth (availability, eligibility, pricing) and never mutates
 *     anything itself.
 *
 * Returns null on ANY failure — no provider configured, timeout, bad JSON,
 * schema mismatch, or an "unclear" classification. The caller's existing
 * deterministic reply is always a safe, correct fallback.
 */

export interface AssistedClassification {
  category?: string;
  service?: string;
  confidence: "low" | "medium" | "high";
  clarificationQuestion: string | null;
}

export interface InterpretUnknownMessageInput {
  message: string;
  knownIntent: UserIntent;
  recentTurns: ConversationTurn[];
  /** Injected in tests; defaults to `resolveModelProvider()`. */
  modelProvider?: ModelProvider | null;
}

export async function interpretUnknownMessage(
  input: InterpretUnknownMessageInput,
): Promise<AssistedClassification | null> {
  const provider =
    input.modelProvider !== undefined ? input.modelProvider : resolveModelProvider().provider;
  if (!provider) return null;

  try {
    const res = await provider.generate(
      {
        purpose: "classify_conversation",
        system: classificationSystemPrompt(),
        user: clampUser(
          classificationUserPrompt({
            message: input.message,
            knownIntent: input.knownIntent,
            recentTurns: input.recentTurns,
          }),
          DEFAULT_MODEL_LIMITS.maxInputChars,
        ),
        schema: conversationClassificationSchema,
        schemaName: "ConversationClassification",
      },
      DEFAULT_MODEL_LIMITS,
    );

    const { category, service, confidence, clarificationQuestion } = res.value;
    // Defensive even though the schema enum already constrains this: never
    // hand the caller a category `resolveDomain` would not recognise.
    if (category === "unclear" || !KNOWN_CATEGORIES.includes(category)) {
      return { confidence, clarificationQuestion, service: service ?? undefined };
    }
    return {
      category,
      service: service ?? undefined,
      confidence,
      clarificationQuestion,
    };
  } catch {
    return null;
  }
}
