import { FLYER_COLOURS } from "@/features/routes/flyer-printing";

import { missingBriefFields, parseBuyerIntent } from "../runtime/intent";
import type { BuyerIntent, DecisionReason } from "../types";
import type { IntentInterpretation } from "./schema";

/**
 * Merge the model's interpretation with the deterministic parse.
 *
 * Rule: the deterministic parser wins wherever it found something (it is
 * auditable and repeatable); the model only fills the gaps it left. Dates are
 * ALWAYS produced by the deterministic parser — the model supplies a phrase, not
 * a date. The model never sets a value the parser contradicts.
 */

type ColourEnum = (typeof FLYER_COLOURS)[number];

export function colourEnumFromPhrase(phrase: string | null): ColourEnum | null {
  if (phrase === "full colour" || phrase === "full-colour") return "full-colour";
  if (phrase === "black and white" || phrase === "black-and-white") return "black-and-white";
  return null;
}

export function colourPhraseFromEnum(value: ColourEnum | null): string | null {
  if (value === "full-colour") return "full colour";
  if (value === "black-and-white") return "black and white";
  return null;
}

export interface MergedIntent {
  intent: BuyerIntent;
  missing: string[];
  /** Non-null when a required field is still missing after the merge. */
  clarification: { question: string; missing: string[] } | null;
  /** Non-null when the model judged this is not a flyer-printing request. */
  outOfScope: string | null;
  notes: DecisionReason[];
}

export function mergeIntent(
  deterministic: BuyerIntent,
  model: IntentInterpretation,
  now: Date,
): MergedIntent {
  const notes: DecisionReason[] = [];

  const quantity = deterministic.quantity ?? model.quantity ?? null;
  if (
    deterministic.quantity !== null &&
    model.quantity !== null &&
    model.quantity !== deterministic.quantity
  ) {
    notes.push({
      code: "MODEL_FIELD_OVERRIDDEN",
      statement: `The request literally says ${deterministic.quantity}, so the model's ${model.quantity} was not used.`,
    });
  }

  const size = deterministic.size ?? model.size ?? null;
  const colourPhrase = deterministic.colour ?? colourPhraseFromEnum(model.colour);

  // Dates: keep the deterministic date; otherwise re-run the deterministic
  // parser over the model's short phrase (never trust the model to do date math).
  let deadline = deterministic.deadline;
  if (!deadline && model.deadlineText) {
    deadline = parseBuyerIntent(model.deadlineText, { now }).deadline;
    if (deadline) {
      notes.push({
        code: "MODEL_NORMALISED_DEADLINE",
        statement: `Read the deadline from "${model.deadlineText}".`,
      });
    }
  }

  const deliveryArea = deterministic.deliveryArea ?? (model.deliveryArea?.trim() || null);
  if (!deterministic.deliveryArea && deliveryArea) {
    notes.push({
      code: "MODEL_EXTRACTED_AREA",
      statement: `Read the delivery area "${deliveryArea}" from the request.`,
    });
  }

  const intent: BuyerIntent = {
    ...deterministic,
    quantity,
    size,
    colour: colourPhrase,
    deadline,
    deliveryArea,
  };

  const missing = missingBriefFields(intent);
  const outOfScope =
    model.service === "other"
      ? "The request does not look like a flyer / poster / leaflet printing job, which is the only service this agent handles."
      : null;

  let clarification: MergedIntent["clarification"] = null;
  if (missing.length > 0) {
    const modelQ = model.clarificationQuestion?.trim();
    clarification = {
      question:
        modelQ && modelQ.length >= 8
          ? modelQ
          : `To get a quote I still need: ${missing.join(", ")}. Could you add those?`,
      missing,
    };
  }

  return { intent, missing, clarification, outOfScope, notes };
}
