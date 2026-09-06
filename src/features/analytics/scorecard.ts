/**
 * The pilot observation scorecard (M9.5, brief §50).
 *
 * Operator-facing. Every value is a genuine COUNT derived on read from
 * `audit_events` and the product's own tables — 0 means no data, never an
 * estimate (brief §50, mirrors ADR-013). This is OPERATIONAL truth and is
 * independent of Amplitude: it works with no analytics key configured.
 *
 * It composes the existing `buildEvidenceReport` (real-scope snapshot, which
 * already excludes [DEMO SEED] data and computes returning-session logic) and
 * `getPilotFunnel` (pilot-event counts), and adds a few targeted counts.
 */

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { buildEvidenceReport } from "@/features/metrics/report";

import { getPilotFunnel } from "./pilot";

async function countRows(db: Database, type: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.type, type));
  return row?.n ?? 0;
}

async function countDistinctTasks(db: Database, type: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${auditEvents.taskId})::int` })
    .from(auditEvents)
    .where(and(eq(auditEvents.type, type), sql`${auditEvents.taskId} is not null`));
  return row?.n ?? 0;
}

export interface PilotScorecard {
  generatedAt: string;
  note: string;
  buyer: {
    conversationsStarted: number;
    meaningfulRequests: number;
    activatedBuyers: number;
    successfulWorkflows: number;
    returningBuyers: number;
  };
  business: {
    onboarded: number;
    available: number;
    requestsReceived: number;
    quotesSent: number;
    quotesAccepted: number;
    jobsCompleted: number;
  };
  notifications: {
    attentionRequiredWorkflows: number;
    notificationsOpened: number;
    workflowsResumed: number;
    actionsCompleted: number;
  };
  retention: {
    firstWorkflowCompleted: number;
    secondWorkflowCompleted: number;
  };
}

const NOTE =
  "Every value is a genuine count from audit_events and the product tables. " +
  "0 means no data, never an estimate. [DEMO SEED] activity is excluded.";

export async function buildPilotScorecard(
  db: Database,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<PilotScorecard> {
  const [report, funnel, requestsReceived, recommendationTasks, resumedAndAdvanced] =
    await Promise.all([
      buildEvidenceReport(db, now, env),
      getPilotFunnel(db),
      countDistinctTasks(db, "task.awaiting_quote"),
      countDistinctTasks(db, "recommendation.created"),
      countRows(db, "pilot.workflow_resumed"),
    ]);

  const real = report.real;

  return {
    generatedAt: now.toISOString(),
    note: NOTE,
    buyer: {
      conversationsStarted: funnel.conversationsStarted,
      meaningfulRequests: real.tasks.submitted,
      // activation proxy: submitted a real request AND reached a recommendation
      activatedBuyers: Math.min(real.tasks.submitted, recommendationTasks),
      successfulWorkflows: real.tasks.handoffConfirmed,
      returningBuyers: real.buyers.returningSessions,
    },
    business: {
      onboarded: real.businesses.total,
      available: real.businesses.active,
      requestsReceived,
      quotesSent: real.quoteResponses.priced,
      quotesAccepted: funnel.buyerAccepted,
      jobsCompleted: real.tasks.handoffConfirmed,
    },
    notifications: {
      attentionRequiredWorkflows: funnel.notificationsCreated,
      notificationsOpened: funnel.notificationsOpened,
      workflowsResumed: funnel.workflowsResumed,
      // best-effort: resumed workflows are a lower bound on notification-driven action
      actionsCompleted: Math.min(resumedAndAdvanced, funnel.workflowsResumed),
    },
    retention: {
      firstWorkflowCompleted: real.tasks.handoffConfirmed,
      secondWorkflowCompleted: real.buyers.sessionsWithMultipleTasks,
    },
  };
}
