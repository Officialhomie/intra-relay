/**
 * Flatten an {@link EvidenceReport} into rows for a CSV/JSON evidence export.
 * Every row is `scope,section,metric,value` so it drops straight into a
 * spreadsheet. Only aggregate counts are emitted — no session ids, no content.
 */
import type { EvidenceReport, MetricsSnapshot } from "./report";

export interface EvidenceRow {
  scope: string;
  section: string;
  metric: string;
  value: string | number;
}

function snapshotRows(snapshot: MetricsSnapshot): EvidenceRow[] {
  const s = snapshot.scope;
  const rows: EvidenceRow[] = [
    { scope: s, section: "businesses", metric: "total", value: snapshot.businesses.total },
    { scope: s, section: "businesses", metric: "active", value: snapshot.businesses.active },
    { scope: s, section: "routes", metric: "total", value: snapshot.routes.total },
    { scope: s, section: "routes", metric: "active", value: snapshot.routes.active },
    { scope: s, section: "routes", metric: "paused", value: snapshot.routes.paused },
    { scope: s, section: "routes", metric: "fresh", value: snapshot.routes.fresh },
    { scope: s, section: "routes", metric: "stale", value: snapshot.routes.stale },
    {
      scope: s,
      section: "buyers",
      metric: "independent_sessions",
      value: snapshot.buyers.independentSessions,
    },
    {
      scope: s,
      section: "buyers",
      metric: "returning_sessions",
      value: snapshot.buyers.returningSessions,
    },
    {
      scope: s,
      section: "buyers",
      metric: "sessions_with_multiple_tasks",
      value: snapshot.buyers.sessionsWithMultipleTasks,
    },
    { scope: s, section: "tasks", metric: "total", value: snapshot.tasks.total },
    { scope: s, section: "tasks", metric: "submitted", value: snapshot.tasks.submitted },
    {
      scope: s,
      section: "tasks",
      metric: "quote_requests_completed",
      value: snapshot.tasks.quoteRequestsCompleted,
    },
    {
      scope: s,
      section: "tasks",
      metric: "handoff_ready",
      value: snapshot.tasks.handoffReady,
    },
    {
      scope: s,
      section: "tasks",
      metric: "handoff_confirmed",
      value: snapshot.tasks.handoffConfirmed,
    },
    { scope: s, section: "tasks", metric: "failed", value: snapshot.tasks.failed },
    {
      scope: s,
      section: "quote_responses",
      metric: "priced",
      value: snapshot.quoteResponses.priced,
    },
    {
      scope: s,
      section: "quote_responses",
      metric: "declined",
      value: snapshot.quoteResponses.declined,
    },
    {
      scope: s,
      section: "quote_responses",
      metric: "latency_samples",
      value: snapshot.quoteResponses.latency.count,
    },
    {
      scope: s,
      section: "quote_responses",
      metric: "latency_median_minutes",
      value: snapshot.quoteResponses.latency.medianMinutes ?? "",
    },
    {
      scope: s,
      section: "quote_responses",
      metric: "latency_p90_minutes",
      value: snapshot.quoteResponses.latency.p90Minutes ?? "",
    },
    {
      scope: s,
      section: "freshness_events",
      metric: "route_pauses",
      value: snapshot.freshnessEvents.routePauses,
    },
    {
      scope: s,
      section: "freshness_events",
      metric: "route_activations",
      value: snapshot.freshnessEvents.routeActivations,
    },
    { scope: s, section: "feedback", metric: "total", value: snapshot.feedback.total },
    { scope: s, section: "feedback", metric: "useful", value: snapshot.feedback.useful },
    { scope: s, section: "feedback", metric: "not_useful", value: snapshot.feedback.notUseful },
    {
      scope: s,
      section: "feedback",
      metric: "with_comment",
      value: snapshot.feedback.withComment,
    },
    {
      scope: s,
      section: "payments",
      metric: "verified_settlements",
      value: snapshot.payments.verifiedSettlements,
    },
    {
      scope: s,
      section: "payments",
      metric: "failed_attempts",
      value: snapshot.payments.failedAttempts,
    },
    {
      scope: s,
      section: "payments",
      metric: "unavailable",
      value: snapshot.payments.unavailable,
    },
  ];
  for (const [status, count] of Object.entries(snapshot.tasks.byStatus)) {
    rows.push({ scope: s, section: "task_status", metric: status, value: count });
  }
  return rows;
}

export function reportToRows(report: EvidenceReport): EvidenceRow[] {
  const rows: EvidenceRow[] = [
    { scope: "meta", section: "report", metric: "generated_at", value: report.generatedAt },
  ];
  for (const integration of report.integrations) {
    rows.push({
      scope: "integrations",
      section: integration.key,
      metric: "state",
      value: integration.state,
    });
  }
  rows.push(...snapshotRows(report.real));
  rows.push(...snapshotRows(report.demo));
  return rows;
}

function csvCell(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function reportToCsv(report: EvidenceReport): string {
  const header = "scope,section,metric,value";
  const lines = reportToRows(report).map(
    (row) =>
      `${csvCell(row.scope)},${csvCell(row.section)},${csvCell(row.metric)},${csvCell(row.value)}`,
  );
  return [header, ...lines].join("\n") + "\n";
}
