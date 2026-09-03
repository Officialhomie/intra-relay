import { desc, eq, or } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  feedback,
  quotes,
  recommendations,
  servicePayments,
  tasks,
  type FeedbackRow,
  type NewTaskRow,
  type QuoteRow,
  type RecommendationRow,
  type ServicePaymentRow,
  type TaskRow,
} from "@/lib/db/schema";

export async function insertTask(db: Database, values: NewTaskRow): Promise<TaskRow> {
  const [row] = await db.insert(tasks).values(values).returning();
  return row;
}

export async function findTaskById(db: Database, id: string): Promise<TaskRow | null> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row ?? null;
}

/**
 * Tasks a session owns (as creator or buyer claim, milestone 6 §17) that are
 * currently in one of the given states. Used by the conversational layer to
 * know whether "accept the quote" refers to a real open order.
 */
export async function listSessionTasksInStates(
  db: Database,
  sessionId: string,
  states: readonly TaskRow["status"][],
): Promise<TaskRow[]> {
  if (states.length === 0) return [];
  const rows = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.sessionId, sessionId), eq(tasks.buyerClaimSession, sessionId)));
  return rows.filter((row) => (states as readonly string[]).includes(row.status));
}

export async function updateTask(
  db: Database,
  id: string,
  patch: Partial<NewTaskRow>,
): Promise<TaskRow> {
  const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  return row;
}

export async function listTaskQuotes(db: Database, taskId: string): Promise<QuoteRow[]> {
  return db.select().from(quotes).where(eq(quotes.taskId, taskId)).orderBy(desc(quotes.createdAt));
}

export async function listTaskPayments(db: Database, taskId: string): Promise<ServicePaymentRow[]> {
  return db
    .select()
    .from(servicePayments)
    .where(eq(servicePayments.taskId, taskId))
    .orderBy(desc(servicePayments.createdAt));
}

export async function findTaskRecommendation(
  db: Database,
  taskId: string,
): Promise<RecommendationRow | null> {
  const [row] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.taskId, taskId))
    .limit(1);
  return row ?? null;
}

export async function listTaskFeedback(db: Database, taskId: string): Promise<FeedbackRow[]> {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.taskId, taskId))
    .orderBy(desc(feedback.createdAt));
}
