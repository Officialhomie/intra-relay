import { z } from "zod";

import { KNOWN_CATEGORIES } from "../domain";

/**
 * The one JSON contract the assisted conversation fallback may return
 * (milestone 10.4). Deliberately narrow: the model classifies which known
 * category a message belongs to — it never invents a category, a price, a
 * provider, or a domain fact. `resolveDomain` (existing, unchanged) still
 * decides what happens next.
 */

const trimmed = (max: number) => z.string().trim().max(max);

// `KNOWN_CATEGORIES` is a non-empty runtime list derived from the single
// domain registry in `domain.ts`. TS can't see it's non-empty from a spread,
// so this double-casts through `unknown` to satisfy z.enum's tuple type,
// rather than re-declaring the category names a second time here.
const CATEGORY_OR_UNCLEAR = [...KNOWN_CATEGORIES, "unclear"] as unknown as [string, ...string[]];

export const conversationClassificationSchema = z.object({
  /** One of the platform's known categories, or "unclear" — never invented. */
  category: z.enum(CATEGORY_OR_UNCLEAR),
  /** The specific thing asked for, in the buyer's own words, or null. */
  service: trimmed(80).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  /** Only when confidence is low/category is "unclear": one useful question. */
  clarificationQuestion: trimmed(200).nullable(),
});
export type ConversationClassification = z.infer<typeof conversationClassificationSchema>;
