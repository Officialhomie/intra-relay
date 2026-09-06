/**
 * The attention model (milestone 7 §2).
 *
 * Before anything is delivered, every notifiable event is classified by *what
 * it asks of the person*. This is a product concept, not a log level: the buyer
 * home, the action centre and push all read from it.
 */

export const ATTENTION_LEVELS = [
  /** Nothing is required. "Your order is being prepared." */
  "INFORMATIONAL",
  /** Human judgement or action is required. "The business proposed a new price." */
  "ACTION_REQUIRED",
  /** Action is required within a meaningful window. "Your quote expires in 20 minutes." */
  "TIME_SENSITIVE",
  /** Finished. Nothing to do. "Your order has been handed over." */
  "COMPLETED",
] as const;
export type AttentionLevel = (typeof ATTENTION_LEVELS)[number];

/** Who a notification is for. */
export const NOTIFICATION_AUDIENCES = ["BUYER", "BUSINESS"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/** Levels that put an item in the "needs your attention" group. */
export const NEEDS_ATTENTION_LEVELS: readonly AttentionLevel[] = [
  "ACTION_REQUIRED",
  "TIME_SENSITIVE",
];

export function needsAttention(level: AttentionLevel): boolean {
  return NEEDS_ATTENTION_LEVELS.includes(level);
}

/** Plain, human phrasing for a level — for a heading, never a raw badge. */
export const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  INFORMATIONAL: "Update",
  ACTION_REQUIRED: "Needs your attention",
  TIME_SENSITIVE: "Needs your attention soon",
  COMPLETED: "Completed",
};
