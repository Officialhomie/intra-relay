import { desc, eq, inArray, or } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { businesses, quoteRoutes, quotes, tasks, type TaskRow } from "@/lib/db/schema";
import { listProoflineEvents } from "@/features/proofline/repository";
import { pendingChange } from "@/features/quotes/revision";

import { describeTaskException } from "./exceptions";

/**
 * The buyer's active work, from persisted state (milestone 7 §1, §2, §12, §20).
 *
 * This is what lets a person return to Intra without a notification and pick up
 * where they left. It reads the database — never the in-memory agent run store —
 * and groups every task into one of five plain buckets. No internal status name
 * ever reaches this output.
 */

export type BuyerWorkGroup = "ATTENTION" | "WAITING" | "IN_PROGRESS" | "READY" | "COMPLETED";

export interface BuyerWorkItem {
  taskId: string;
  /** What the job is, in a few words. */
  title: string;
  businessName: string | null;
  group: BuyerWorkGroup;
  /** One plain sentence: where this stands. */
  headline: string;
  /** The label for the button that opens it, or null for a passive item. */
  actionLabel: string | null;
  /** True when this item is genuinely waiting on the person (§19). */
  actionRequired: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface BuyerWorkView {
  items: BuyerWorkItem[];
  counts: Record<BuyerWorkGroup, number>;
  /** Total items that need the person to do something. */
  attention: number;
}

export const BUYER_WORK_GROUPS: readonly BuyerWorkGroup[] = [
  "ATTENTION",
  "READY",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
];

export const BUYER_WORK_GROUP_LABEL: Record<BuyerWorkGroup, string> = {
  ATTENTION: "Needs your attention",
  READY: "Ready",
  WAITING: "Waiting",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

function briefTitle(task: Pick<TaskRow, "structuredInput">, routeName: string | null): string {
  const brief = (task.structuredInput ?? {}) as Record<string, unknown>;
  const qty = brief.quantity;
  const what = routeName?.toLowerCase().includes("flyer")
    ? "flyers"
    : (routeName ?? "your request");
  if (typeof qty === "number") return `${qty.toLocaleString()} ${what}`;
  return routeName ?? "Your request";
}

interface Derived {
  group: BuyerWorkGroup;
  headline: string;
  actionLabel: string | null;
  actionRequired: boolean;
}

function derive(
  task: TaskRow,
  ctx: {
    businessName: string | null;
    changePending: boolean;
    proofline: { ready: boolean; confirmed: boolean };
  },
): Derived {
  const who = ctx.businessName ? ` with ${ctx.businessName}` : "";

  if (ctx.proofline.confirmed) {
    return {
      group: "COMPLETED",
      headline: "Order complete — you confirmed the handover.",
      actionLabel: null,
      actionRequired: false,
    };
  }

  if (task.status === "FAILED" || task.status === "CANCELLED") {
    const exception = describeTaskException(task);
    const needs = Boolean(exception?.actionNeeded);
    return {
      group: needs ? "ATTENTION" : "COMPLETED",
      headline: exception?.headline ?? "This request is closed.",
      actionLabel: needs ? "See what to do" : "View",
      actionRequired: needs,
    };
  }

  // A proposed price change outranks whatever else the order was doing — the
  // person has to decide on it before anything moves.
  if (ctx.changePending) {
    return {
      group: "ATTENTION",
      headline: `${ctx.businessName ?? "The business"} proposed a new price.`,
      actionLabel: "Review",
      actionRequired: true,
    };
  }

  if (task.status === "HANDOFF_READY") {
    if (ctx.proofline.ready) {
      return {
        group: "READY",
        headline: `Your order is ready for pickup${who}.`,
        actionLabel: "Confirm pickup",
        actionRequired: true,
      };
    }
    if (!task.handoffConfirmedAt) {
      return {
        group: "ATTENTION",
        headline: "You accepted the quote — send your order to the business.",
        actionLabel: "Open and send",
        actionRequired: true,
      };
    }
    return {
      group: "IN_PROGRESS",
      headline: `Your order is being prepared${who}.`,
      actionLabel: "View",
      actionRequired: false,
    };
  }

  if (task.status === "RECOMMENDED") {
    return {
      group: "ATTENTION",
      headline: "A quote is ready for your decision.",
      actionLabel: "Review",
      actionRequired: true,
    };
  }

  if (task.status === "AWAITING_QUOTE") {
    return {
      group: "WAITING",
      headline: ctx.businessName
        ? `Waiting for ${ctx.businessName} to send a price.`
        : "Finding businesses and asking for prices.",
      actionLabel: "View",
      actionRequired: false,
    };
  }

  // DRAFT / SUBMITTED
  return {
    group: "WAITING",
    headline: "Getting your request ready.",
    actionLabel: "View",
    actionRequired: false,
  };
}

export async function listBuyerWork(db: Database, sessionId: string): Promise<BuyerWorkView> {
  const rows = await db
    .select({
      task: tasks,
      routeName: quoteRoutes.name,
      businessName: businesses.name,
    })
    .from(tasks)
    .leftJoin(quoteRoutes, eq(tasks.routeId, quoteRoutes.id))
    .leftJoin(businesses, eq(quoteRoutes.businessId, businesses.id))
    .where(or(eq(tasks.sessionId, sessionId), eq(tasks.buyerClaimSession, sessionId)))
    .orderBy(desc(tasks.updatedAt));

  const taskIds = rows.map((r) => r.task.id);
  const changePendingByTask = new Set<string>();
  const prooflineByTask = new Map<string, { ready: boolean; confirmed: boolean }>();

  if (taskIds.length > 0) {
    const openTaskIds = rows
      .filter((r) => r.task.status === "RECOMMENDED" || r.task.status === "HANDOFF_READY")
      .map((r) => r.task.id);
    if (openTaskIds.length > 0) {
      const quoteRows = await db.select().from(quotes).where(inArray(quotes.taskId, openTaskIds));
      for (const id of openTaskIds) {
        const forTask = quoteRows.filter((q) => q.taskId === id);
        if (pendingChange(forTask)) changePendingByTask.add(id);
      }
      for (const id of openTaskIds) {
        const events = await listProoflineEvents(db, id);
        prooflineByTask.set(id, {
          ready: events.some((e) => e.eventType === "READY_FOR_PICKUP"),
          confirmed: events.some((e) => e.eventType === "PICKUP_CONFIRMED"),
        });
      }
    }
  }

  const items: BuyerWorkItem[] = rows.map(({ task, routeName, businessName }) => {
    const d = derive(task, {
      businessName,
      changePending: changePendingByTask.has(task.id),
      proofline: prooflineByTask.get(task.id) ?? { ready: false, confirmed: false },
    });
    return {
      taskId: task.id,
      title: briefTitle(task, routeName),
      businessName,
      group: d.group,
      headline: d.headline,
      actionLabel: d.actionLabel,
      actionRequired: d.actionRequired,
      updatedAt: task.updatedAt.toISOString(),
      createdAt: task.createdAt.toISOString(),
    };
  });

  const counts = BUYER_WORK_GROUPS.reduce(
    (acc, g) => ({ ...acc, [g]: items.filter((i) => i.group === g).length }),
    {} as Record<BuyerWorkGroup, number>,
  );

  return {
    items,
    counts,
    attention: items.filter((i) => i.actionRequired).length,
  };
}
