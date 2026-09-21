import { describeCategoriesForModel } from "../domain";
import { summariseIntent } from "../reply";
import type { ConversationTurn } from "../memory";
import type { UserIntent } from "../types";

/**
 * Prompt for the conversation-classification fallback (milestone 10.4).
 *
 * Called only when the deterministic classifier (`classify.ts`/`extract.ts`)
 * found no commercial signal at all — never on every turn. The model's only
 * job is to name a known category from plain language it has no keyword for
 * yet ("cakes" → "food"); it never decides availability, price, or eligibility
 * (`resolveDomain` and the rest of `routing.ts` still own that, unchanged).
 *
 * Context is deliberately compact — never the raw full transcript: the
 * caller passes the already-accumulated `UserIntent` (read back with the
 * existing `summariseIntent`, not a second model-written summary) plus only
 * the last few turns, so a long conversation never grows the prompt.
 */

const CORE_RULES = `You classify one buyer message for a marketplace assistant on Intra.
You NEVER invent a category that is not in the list below, a price, a provider, or a fact about a business.
If the message does not clearly match a known category, answer "unclear" rather than guessing.
Reply with exactly one JSON object matching the requested shape. No markdown, no commentary.`;

export function classificationSystemPrompt(): string {
  const categories = describeCategoriesForModel()
    .map((c) => `- "${c.category}" (${c.label}): e.g. ${c.examples.slice(0, 5).join(", ")}`)
    .join("\n");
  return `${CORE_RULES}

KNOWN CATEGORIES:
${categories}

TASK: Read the buyer's current message, in the context given, and decide:
- "category": one of the known category values above, or "unclear".
- "service": the specific thing they want, in their own words (e.g. "wedding cake"), or null.
- "confidence": "low", "medium", or "high" — how sure you are of the category.
- "clarificationQuestion": ONE short plain-language question to ask next, ONLY if category is "unclear" or confidence is "low". Otherwise null.`;
}

function compactTurns(turns: ConversationTurn[], max = 4): string {
  if (turns.length === 0) return "(none yet)";
  return turns
    .slice(-max)
    .map((t) => `${t.role === "user" ? "Buyer" : "Assistant"}: ${t.text}`)
    .join("\n");
}

export function classificationUserPrompt(input: {
  message: string;
  knownIntent: UserIntent;
  recentTurns: ConversationTurn[];
}): string {
  const summary = summariseIntent(input.knownIntent) || "(nothing yet)";
  return `CURRENT INTENT
${JSON.stringify({ category: input.knownIntent.category ?? null, service: input.knownIntent.service ?? null })}

CONVERSATION SUMMARY
${summary}

RECENT TURNS
${compactTurns(input.recentTurns)}

CURRENT BUYER MESSAGE
"""${input.message}"""`;
}
