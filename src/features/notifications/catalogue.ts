import type { QuoteRow, TaskRow } from "@/lib/db/schema";
import { describeTaskException } from "@/features/tasks/exceptions";

import type { AttentionLevel, NotificationAudience } from "./attention";

/**
 * The one place that knows, for a domain event: does a human need to know, who,
 * how urgently, and in what words (milestone 7 §13, §17).
 *
 * Everything here is user-facing language. No internal event name, enum,
 * lifecycle state, amount, address or code appears in a title or body — the
 * linked page shows protected detail once the person is authorised (§18, §37).
 */

export interface NotificationSpec {
  audience: NotificationAudience;
  recipientKey: string;
  event: string;
  level: AttentionLevel;
  title: string;
  body: string;
  deeplink: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
}

export interface EventBusiness {
  id: string;
  name: string;
  slug: string;
  manageToken: string;
}

export interface DomainEventContext {
  event: string;
  task: TaskRow | null;
  quote: QuoteRow | null;
  business: EventBusiness | null;
}

/** The buyer inbox key for a task, or null when only an agent owns it. */
export function buyerRecipientKey(
  task: Pick<TaskRow, "sessionId" | "buyerClaimSession">,
): string | null {
  const key = task.buyerClaimSession ?? task.sessionId;
  if (!key || key.startsWith("agent:")) return null;
  return key;
}

function orderPath(taskId: string): string {
  return `/tasks/${taskId}`;
}

function requestsPath(business: EventBusiness): string {
  return `/supplier/${business.slug}/requests?t=${business.manageToken}`;
}

function buyerOrderSpec(
  task: TaskRow,
  event: string,
  level: AttentionLevel,
  title: string,
  body: string,
): NotificationSpec | null {
  const recipientKey = buyerRecipientKey(task);
  if (!recipientKey) return null;
  return {
    audience: "BUYER",
    recipientKey,
    event,
    level,
    title,
    body,
    deeplink: orderPath(task.id),
    entityType: "task",
    entityId: task.id,
    // One evolving attention item per order (§21).
    dedupeKey: `order:${task.id}`,
  };
}

function businessRequestSpec(
  business: EventBusiness,
  task: TaskRow,
  event: string,
  level: AttentionLevel,
  title: string,
  body: string,
): NotificationSpec {
  return {
    audience: "BUSINESS",
    recipientKey: business.id,
    event,
    level,
    title,
    body,
    deeplink: requestsPath(business),
    entityType: "task",
    entityId: task.id,
    dedupeKey: `request:${task.id}`,
  };
}

/**
 * Zero or more notifications for a domain event. An event that no human needs
 * to hear about returns `[]`.
 */
export function specsForEvent(ctx: DomainEventContext): NotificationSpec[] {
  const { event, task, business } = ctx;
  if (!task) return [];
  const out: (NotificationSpec | null)[] = [];

  switch (event) {
    // --- Buyer ---------------------------------------------------------------
    case "recommendation.created":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "ACTION_REQUIRED",
          "A quote is ready for your decision",
          business
            ? `${business.name} sent a price. Open the order to see it and choose whether to go ahead.`
            : "A business sent a price. Open the order to see it and decide.",
        ),
      );
      break;

    case "quote.change_proposed":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "ACTION_REQUIRED",
          "The business proposed a new price",
          "The price you agreed still stands until you decide. Open the order to review the change.",
        ),
      );
      break;

    case "quote.revised":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "ACTION_REQUIRED",
          "The business sent a different price",
          "Open the order to see the new price before you decide.",
        ),
      );
      break;

    case "task.handoff_ready":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "ACTION_REQUIRED",
          "Your order is ready to send",
          "You accepted the quote. Open the order to send the message and agree it with the business.",
        ),
      );
      break;

    case "proofline.ready_for_pickup":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "ACTION_REQUIRED",
          "Your order is ready for pickup",
          "The business marked your order ready. Open it to confirm once you have collected it.",
        ),
      );
      break;

    case "proofline.pickup_confirmed":
      out.push(
        buyerOrderSpec(
          task,
          event,
          "COMPLETED",
          "Your order is complete",
          "You confirmed the handover. Nothing else is needed.",
        ),
      );
      break;

    case "task.failed": {
      // task.failed only ever comes from a provider or a system exception here;
      // a buyer cancellation is task.buyer_declined. Reuse the semantic account
      // the order page already shows (§18).
      const view = describeTaskException(task);
      if (!view) break;
      out.push(
        buyerOrderSpec(
          task,
          event,
          view.reason === "NO_VIABLE_OFFER" ? "INFORMATIONAL" : "ACTION_REQUIRED",
          view.headline,
          view.actionNeeded ?? view.whatNext,
        ),
      );
      if (view.reason === "HANDOVER_FAILED" && business) {
        out.push(
          businessRequestSpec(
            business,
            task,
            event,
            "ACTION_REQUIRED",
            "A handover did not complete",
            "Open your requests to see which order and re-coordinate the collection.",
          ),
        );
      }
      break;
    }

    // --- Business ----------------------------------------------------------
    case "task.awaiting_quote":
      if (business) {
        out.push(
          businessRequestSpec(
            business,
            task,
            event,
            "ACTION_REQUIRED",
            "New customer request",
            "A customer is waiting for your price. Open your requests to send a quote or decline.",
          ),
        );
      }
      break;

    case "task.buyer_accepted":
      if (business) {
        out.push(
          businessRequestSpec(
            business,
            task,
            event,
            "ACTION_REQUIRED",
            "A customer accepted your quote",
            "Open your requests to see the order and get the job moving.",
          ),
        );
      }
      break;

    case "task.buyer_declined":
      if (business) {
        const agreed = task.failureReason === "BUYER_CANCELLED_AFTER_AGREEMENT";
        out.push(
          businessRequestSpec(
            business,
            task,
            event,
            agreed ? "ACTION_REQUIRED" : "INFORMATIONAL",
            agreed ? "A customer cancelled an agreed order" : "A customer decided not to proceed",
            agreed
              ? "Open your requests to see which order and follow up if you had started work."
              : "No action needed. Open your requests to see which one.",
          ),
        );
      }
      break;

    default:
      break;
  }

  return out.filter((spec): spec is NotificationSpec => spec !== null);
}
