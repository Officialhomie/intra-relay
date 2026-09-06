import type { ReactNode } from "react";

import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { Card, CardTitle } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";

import type { EvidenceReport, IntegrationStatus, MetricsSnapshot } from "./report";

function num(value: number | null): string {
  return value === null ? "—" : String(value);
}

function LatencyRow({ snapshot }: { snapshot: MetricsSnapshot }) {
  const l = snapshot.quoteResponses.latency;
  if (l.count === 0) {
    return <DataRow label="Quote-response latency">No genuine quote response recorded yet</DataRow>;
  }
  return (
    <DataRow
      label="Quote-response latency"
      hint={`${l.count} genuine response${l.count === 1 ? "" : "s"} measured from submission to the printer's quote or decline`}
    >
      median {num(l.medianMinutes)} min · p90 {num(l.p90Minutes)} min · range{" "}
      {num(l.fastestMinutes)}–{num(l.slowestMinutes)} min
    </DataRow>
  );
}

function SnapshotBody({ snapshot }: { snapshot: MetricsSnapshot }) {
  const d = snapshot.buyers.taskCountDistribution;
  return (
    <div className="space-y-5">
      <DataList>
        <DataRow label="Participating businesses">
          {snapshot.businesses.active} active of {snapshot.businesses.total}
        </DataRow>
        <DataRow label="Quote routes">
          {snapshot.routes.active} active · {snapshot.routes.paused} paused ·{" "}
          {snapshot.routes.fresh} fresh · {snapshot.routes.stale} stale
        </DataRow>
        <DataRow
          label="Independent buyer sessions"
          hint="Distinct opaque device sessions that created at least one task. No account, no wallet, no id shown."
        >
          {snapshot.buyers.independentSessions}
        </DataRow>
        <DataRow label="Returning buyers" hint="Sessions active on two or more calendar days">
          {snapshot.buyers.returningSessions}
        </DataRow>
        <DataRow label="Session task spread">
          1 task: {d["1"]} · 2: {d["2"]} · 3–5: {d["3to5"]} · 6+: {d["6plus"]}
        </DataRow>
        <DataRow label="Tasks">
          {snapshot.tasks.total} total · {snapshot.tasks.submitted} submitted ·{" "}
          {snapshot.tasks.failed} failed
        </DataRow>
        <DataRow label="Quote requests completed" hint="Reached a recommendation / handoff-ready">
          {snapshot.tasks.quoteRequestsCompleted}
        </DataRow>
        <DataRow label="Handoffs confirmed by the buyer">
          {snapshot.tasks.handoffConfirmed} of {snapshot.tasks.handoffReady} handoff-ready
        </DataRow>
        <DataRow label="Supplier quotes">
          {snapshot.quoteResponses.priced} priced · {snapshot.quoteResponses.declined} declined
        </DataRow>
        <LatencyRow snapshot={snapshot} />
        <DataRow label="Route pause / activation events">
          {snapshot.freshnessEvents.routePauses} pauses ·{" "}
          {snapshot.freshnessEvents.routeActivations} activations
          {snapshot.freshnessEvents.lastPauseAt
            ? ` · last pause ${snapshot.freshnessEvents.lastPauseAt.slice(0, 10)}`
            : ""}
        </DataRow>
        <DataRow label="Buyer feedback">
          {snapshot.feedback.total} total · {snapshot.feedback.useful} useful ·{" "}
          {snapshot.feedback.notUseful} not · {snapshot.feedback.withComment} with a comment
        </DataRow>
        <DataRow label="Verified Celo settlements" hint={snapshot.payments.note}>
          {snapshot.payments.verifiedSettlements}
          {snapshot.payments.failedAttempts ||
          snapshot.payments.unavailable ||
          snapshot.payments.indeterminate
            ? ` (${snapshot.payments.failedAttempts} failed, ${snapshot.payments.unavailable} unavailable, ${snapshot.payments.indeterminate} unconfirmed)`
            : ""}
        </DataRow>
      </DataList>
    </div>
  );
}

const INTEGRATION_TONE: Record<IntegrationStatus["state"], "active" | "neutral" | "danger"> = {
  available: "active",
  unavailable: "neutral",
  misconfigured: "danger",
};

function IntegrationList({ integrations }: { integrations: IntegrationStatus[] }) {
  return (
    <ul className="space-y-3">
      {integrations.map((integration) => (
        <li
          key={integration.key}
          className="flex flex-col gap-1.5 border-b border-border pb-3 last:border-0 last:pb-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{integration.label}</span>
            <StatusPill tone={INTEGRATION_TONE[integration.state]}>
              {integration.state === "available" ? "available" : integration.state}
            </StatusPill>
          </div>
          <p className="text-xs leading-relaxed text-muted">{integration.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function Zone({
  title,
  badge,
  intro,
  children,
  className,
}: {
  title: string;
  badge: ReactNode;
  intro: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-light tracking-tight text-foreground">{title}</h2>
        {badge}
      </div>
      <p className="mb-4 max-w-prose text-sm text-muted">{intro}</p>
      {children}
    </section>
  );
}

export function EvidenceView({
  report,
  recentEvents,
}: {
  report: EvidenceReport;
  recentEvents?: { type: string; at: string; to: string | null }[];
}) {
  const realHasData =
    report.real.tasks.total > 0 ||
    report.real.businesses.total > 0 ||
    report.real.feedback.total > 0;

  return (
    <div className="space-y-10">
      <Zone
        title="Real results"
        badge={<StatusPill tone="active">live data</StatusPill>}
        intro="Aggregated on read from genuine product activity. Dev-seed demonstration data is excluded from every number here."
      >
        {realHasData ? (
          <div className="space-y-4">
            <Card>
              <CardTitle>Submission targets vs. actual</CardTitle>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="pb-2 font-medium">Metric (PRD §3)</th>
                    <th className="pb-2 font-medium">Target</th>
                    <th className="pb-2 text-right font-medium">Actual (real)</th>
                  </tr>
                </thead>
                <tbody>
                  <TargetRow label={report.targets[0].metric} target={report.targets[0].target}>
                    {report.real.buyers.independentSessions}
                  </TargetRow>
                  <TargetRow label={report.targets[1].metric} target={report.targets[1].target}>
                    {report.real.buyers.returningSessions}
                  </TargetRow>
                  <TargetRow label={report.targets[2].metric} target={report.targets[2].target}>
                    {report.real.businesses.active}
                  </TargetRow>
                  <TargetRow label={report.targets[3].metric} target={report.targets[3].target}>
                    {report.real.tasks.quoteRequestsCompleted}
                  </TargetRow>
                  <TargetRow label={report.targets[4].metric} target={report.targets[4].target}>
                    {report.real.payments.verifiedSettlements}
                  </TargetRow>
                  <TargetRow label={report.targets[5].metric} target={report.targets[5].target}>
                    {report.feedbackChangelog.filter((e) => e.source.startsWith("askbots")).length}{" "}
                    rounds logged
                  </TargetRow>
                </tbody>
              </table>
            </Card>
            <Card>
              <CardTitle>Detail</CardTitle>
              <div className="mt-3">
                <SnapshotBody snapshot={report.real} />
              </div>
            </Card>
          </div>
        ) : (
          <Callout tone="info" title="No real activity recorded yet">
            No genuine businesses, tasks, or feedback exist in this database. Real numbers appear
            here as soon as a non-seed business is onboarded and a buyer sends a request.
          </Callout>
        )}
      </Zone>

      <Zone
        title="Demo data"
        badge={<StatusPill tone="pending">not real activity</StatusPill>}
        intro="Everything created by npm run db:seed — a single illustrative printer and route. Shown so the interface has something to render during a walkthrough. Never counted as adoption."
        className="bg-surface/60 rounded-md border border-dashed border-border-strong p-5"
      >
        <SnapshotBody snapshot={report.demo} />
      </Zone>

      <Zone
        title="Unavailable & external integrations"
        badge={<StatusPill tone="neutral">status</StatusPill>}
        intro="Capabilities that depend on access Intra does not control. Where a status is unavailable, the product returns an explicit unavailable state rather than a stand-in."
      >
        <Card>
          <IntegrationList integrations={report.integrations} />
        </Card>
      </Zone>

      <Zone
        title="What changed from feedback"
        badge={<StatusPill tone="info">{report.feedbackChangelog.length} entries</StatusPill>}
        intro="Genuine, shipped changes traceable to a review or decision. AskBots review rounds append here once that CLI is connected."
      >
        <ol className="space-y-3">
          {report.feedbackChangelog.map((entry, index) => (
            <li key={index}>
              <Card as="article" className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <span className="font-mono">{entry.date}</span>
                  <StatusPill tone="neutral">{entry.source}</StatusPill>
                </div>
                <p className="text-sm text-muted">
                  <span className="font-medium text-foreground">Feedback:</span> {entry.feedback}
                </p>
                <p className="text-sm text-muted">
                  <span className="font-medium text-foreground">Change:</span> {entry.change}
                </p>
                <p className="text-xs text-subtle">Evidence: {entry.evidence}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Zone>

      {recentEvents && recentEvents.length > 0 ? (
        <Zone
          title="Recent activity"
          badge={<StatusPill tone="neutral">operator only</StatusPill>}
          intro="Event type and time only — no task content, buyer identity, or amounts."
        >
          <Card>
            <ol className="space-y-1.5 text-xs text-muted">
              {recentEvents.map((event, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span>
                    {event.type}
                    {event.to ? ` → ${event.to}` : ""}
                  </span>
                  <span className="text-subtle">{event.at.replace("T", " ").slice(0, 16)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </Zone>
      ) : null}

      <details className="rounded-md border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">How these numbers are produced</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
          {report.methodology.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-subtle">
          Report generated {report.generatedAt.replace("T", " ").slice(0, 16)} UTC.
        </p>
      </details>
    </div>
  );
}

function TargetRow({
  label,
  target,
  children,
}: {
  label: string;
  target: string;
  children: ReactNode;
}) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2 text-foreground">{label}</td>
      <td className="py-2 pr-2 text-muted">{target}</td>
      <td className="py-2 text-right font-medium tabular-nums">{children}</td>
    </tr>
  );
}
