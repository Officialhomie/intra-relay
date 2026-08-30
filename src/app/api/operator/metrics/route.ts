import { desc, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { ok } from "@/lib/http/response";
import { auditEvents } from "@/lib/db/schema";
import { reportToCsv } from "@/features/metrics/csv";
import { buildEvidenceReport } from "@/features/metrics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPERATOR_EVENT_TYPES = [
  "route.status_changed",
  "task.awaiting_quote",
  "quote.received",
  "quote.declined",
  "task.handoff_ready",
  "task.handoff_confirmed",
  "feedback.received",
  "payment.settled",
  "payment.failed",
];

/**
 * Operator metrics view (PRD §4: operator "view metrics"). Same privacy-safe
 * report as the public export plus a short, content-free recent-activity feed
 * (event type + timestamp only). `?format=csv` streams the flat export.
 */
export const GET = route(async (request) => {
  requireOperator(request);
  const url = new URL(request.url);
  const db = await getDb();
  const report = await buildEvidenceReport(db);

  if (url.searchParams.get("format")?.toLowerCase() === "csv") {
    return new Response(reportToCsv(report), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="intra-evidence-${report.generatedAt.slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const recentEvents = (
    await db
      .select({
        type: auditEvents.type,
        createdAt: auditEvents.createdAt,
        to: auditEvents.data,
      })
      .from(auditEvents)
      .where(inArray(auditEvents.type, OPERATOR_EVENT_TYPES))
      .orderBy(desc(auditEvents.createdAt))
      .limit(25)
  ).map((row) => ({
    type: row.type,
    at: row.createdAt.toISOString(),
    to: typeof row.to?.to === "string" ? row.to.to : null,
  }));

  return ok({ ...report, recentEvents });
});
