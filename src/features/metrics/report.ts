/**
 * Privacy-minimised experiment tracking (PRD §3 success metrics, backlog
 * MET-001).
 *
 * There is NO separate analytics store and NO new per-event tracking. Every
 * number here is derived on read from rows the product already persists for its
 * own operation (tasks, quotes, feedback, audit events, service payments).
 *
 * Privacy stance:
 * - Buyer sessions are opaque random ids with no account or wallet behind them.
 *   This report exposes only COUNTS and a bucketed distribution — never a raw
 *   session id, task content, contact detail, or address.
 * - Genuine activity (`real`) and dev-seed demonstration data (`demo`) are
 *   computed as separate scopes and never summed (CLAUDE.md §4.1).
 * - A Celo settlement is counted only when the row is SETTLED AND carries a
 *   verified transaction hash. Nothing is inferred or fabricated.
 */
import { inArray } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  auditEvents,
  businesses,
  feedback,
  quoteRoutes,
  quotes,
  servicePayments,
  tasks,
  type AuditEventRow,
  type BusinessRow,
  type FeedbackRow,
  type QuoteRouteRow,
  type QuoteRow,
  type ServicePaymentRow,
  type TaskRow,
} from "@/lib/db/schema";
import { readPaymentConfig } from "@/features/payments/adapter/config";
import { readAttestationConfig } from "@/features/attestation/config";
import { PRICE_FRESHNESS_MAX_AGE_MS } from "@/features/routes/freshness";
import { ROUTE_STATUSES, type RouteStatus } from "@/features/routes/schema";
import { TASK_STATUSES, type TaskStatus } from "@/features/tasks/status";

import { type DataScope, scopeForBusinessName } from "./classification";
import { FEEDBACK_CHANGELOG, type FeedbackChangeEntry } from "./feedback-changelog";

const HANDOFF_CONFIRMED_EVENT = "task.handoff_confirmed";
const ROUTE_STATUS_EVENT = "route.status_changed";

export interface LatencySummary {
  count: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
}

export interface MetricsSnapshot {
  scope: DataScope;
  businesses: { total: number; active: number };
  routes: {
    total: number;
    byStatus: Record<RouteStatus, number>;
    active: number;
    paused: number;
    fresh: number;
    stale: number;
  };
  buyers: {
    /** Distinct opaque session ids that created at least one task. */
    independentSessions: number;
    /** Sessions whose tasks span two or more calendar days (UTC) — PRD "returning". */
    returningSessions: number;
    sessionsWithMultipleTasks: number;
    taskCountDistribution: Record<"1" | "2" | "3to5" | "6plus", number>;
  };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    submitted: number;
    quoteRequestsCompleted: number;
    handoffReady: number;
    handoffConfirmed: number;
    failed: number;
  };
  quoteResponses: {
    priced: number;
    declined: number;
    latency: LatencySummary;
  };
  freshnessEvents: {
    routePauses: number;
    routeActivations: number;
    lastPauseAt: string | null;
  };
  feedback: { total: number; useful: number; notUseful: number; withComment: number };
  payments: {
    verifiedSettlements: number;
    failedAttempts: number;
    unavailable: number;
    /** verify passed, settlement unconfirmed — claimed neither way (FR-PAY-007). */
    indeterminate: number;
    note: string;
  };
}

export type IntegrationState = "available" | "unavailable" | "misconfigured";

export interface IntegrationStatus {
  key: string;
  label: string;
  state: IntegrationState;
  detail: string;
}

export interface EvidenceReport {
  generatedAt: string;
  /** PRD §3 success-metric targets, for side-by-side comparison on the page. */
  targets: { metric: string; target: string }[];
  real: MetricsSnapshot;
  demo: MetricsSnapshot;
  integrations: IntegrationStatus[];
  feedbackChangelog: FeedbackChangeEntry[];
  methodology: string[];
}

function zeroRouteStatus(): Record<RouteStatus, number> {
  return Object.fromEntries(ROUTE_STATUSES.map((s) => [s, 0])) as Record<RouteStatus, number>;
}
function zeroTaskStatus(): Record<TaskStatus, number> {
  return Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return round1(sortedAsc[0]);
  const rank = (p / 100) * (sortedAsc.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const value = sortedAsc[low] + (sortedAsc[high] - sortedAsc[low]) * (rank - low);
  return round1(value);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function summariseLatency(minutes: number[]): LatencySummary {
  const sorted = [...minutes].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMinutes: percentile(sorted, 50),
    p90Minutes: percentile(sorted, 90),
    fastestMinutes: sorted.length ? round1(sorted[0]) : null,
    slowestMinutes: sorted.length ? round1(sorted[sorted.length - 1]) : null,
  };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface ScopeInput {
  scope: DataScope;
  routes: QuoteRouteRow[];
  tasks: TaskRow[];
  quotes: QuoteRow[];
  feedback: FeedbackRow[];
  payments: ServicePaymentRow[];
  statusEvents: AuditEventRow[];
  handoffConfirmedTaskIds: Set<string>;
  businessCount: number;
  activeBusinessCount: number;
  now: Date;
}

function buildSnapshot(input: ScopeInput): MetricsSnapshot {
  const { scope, routes, tasks: scopeTasks, quotes: scopeQuotes, now } = input;

  const routeByStatus = zeroRouteStatus();
  let fresh = 0;
  let stale = 0;
  for (const route of routes) {
    routeByStatus[route.status as RouteStatus] += 1;
    const ageMs = route.priceUpdatedAt ? now.getTime() - route.priceUpdatedAt.getTime() : null;
    if (ageMs !== null && ageMs <= PRICE_FRESHNESS_MAX_AGE_MS) fresh += 1;
    else stale += 1;
  }

  // Buyer sessions.
  const sessionDays = new Map<string, Set<string>>();
  const sessionTaskCount = new Map<string, number>();
  for (const task of scopeTasks) {
    sessionTaskCount.set(task.sessionId, (sessionTaskCount.get(task.sessionId) ?? 0) + 1);
    const days = sessionDays.get(task.sessionId) ?? new Set<string>();
    days.add(utcDay(task.createdAt));
    sessionDays.set(task.sessionId, days);
  }
  const dist = { "1": 0, "2": 0, "3to5": 0, "6plus": 0 };
  for (const count of sessionTaskCount.values()) {
    if (count <= 1) dist["1"] += 1;
    else if (count === 2) dist["2"] += 1;
    else if (count <= 5) dist["3to5"] += 1;
    else dist["6plus"] += 1;
  }
  const returningSessions = [...sessionDays.values()].filter((days) => days.size >= 2).length;
  const sessionsWithMultipleTasks = [...sessionTaskCount.values()].filter((c) => c >= 2).length;

  // Task lifecycle.
  const taskByStatus = zeroTaskStatus();
  for (const task of scopeTasks) taskByStatus[task.status as TaskStatus] += 1;
  const submitted = scopeTasks.filter((t) => t.submittedAt !== null).length;
  const scopeTaskIds = new Set(scopeTasks.map((t) => t.id));
  const handoffConfirmed = [...input.handoffConfirmedTaskIds].filter((id) =>
    scopeTaskIds.has(id),
  ).length;

  // Quote responses + genuine latency.
  const taskById = new Map(scopeTasks.map((t) => [t.id, t]));
  let priced = 0;
  let declined = 0;
  const latencyMinutes: number[] = [];
  for (const quote of scopeQuotes) {
    if (quote.status === "DECLINED") declined += 1;
    else priced += 1;
    const task = taskById.get(quote.taskId);
    if (!task?.submittedAt) continue;
    const deltaMs = quote.createdAt.getTime() - task.submittedAt.getTime();
    if (deltaMs >= 0) latencyMinutes.push(deltaMs / 60_000);
  }

  // Route freshness / pause events.
  let routePauses = 0;
  let routeActivations = 0;
  let lastPauseAt: string | null = null;
  for (const event of input.statusEvents) {
    const to = typeof event.data?.to === "string" ? event.data.to : null;
    if (to === "PAUSED") {
      routePauses += 1;
      const iso = event.createdAt.toISOString();
      if (!lastPauseAt || iso > lastPauseAt) lastPauseAt = iso;
    } else if (to === "ACTIVE") {
      routeActivations += 1;
    }
  }

  // Feedback.
  const usefulCount = input.feedback.filter((f) => f.useful).length;
  const withComment = input.feedback.filter((f) => (f.comment ?? "").trim().length > 0).length;

  // Payments — verified only.
  const verifiedSettlements = input.payments.filter(
    (p) => p.status === "SETTLED" && typeof p.txHash === "string" && p.txHash.length > 0,
  ).length;
  const failedAttempts = input.payments.filter((p) => p.status === "FAILED").length;
  const unavailable = input.payments.filter((p) => p.status === "UNAVAILABLE").length;
  const indeterminate = input.payments.filter(
    (p) => p.status === "AUTHORISED" && p.errorCode === "SETTLE_INDETERMINATE",
  ).length;

  return {
    scope,
    businesses: { total: input.businessCount, active: input.activeBusinessCount },
    routes: {
      total: routes.length,
      byStatus: routeByStatus,
      active: routeByStatus.ACTIVE,
      paused: routeByStatus.PAUSED,
      fresh,
      stale,
    },
    buyers: {
      independentSessions: sessionTaskCount.size,
      returningSessions,
      sessionsWithMultipleTasks,
      taskCountDistribution: {
        "1": dist["1"],
        "2": dist["2"],
        "3to5": dist["3to5"],
        "6plus": dist["6plus"],
      },
    },
    tasks: {
      total: scopeTasks.length,
      byStatus: taskByStatus,
      submitted,
      quoteRequestsCompleted: taskByStatus.HANDOFF_READY + taskByStatus.RECOMMENDED,
      handoffReady: taskByStatus.HANDOFF_READY,
      handoffConfirmed,
      failed: taskByStatus.FAILED,
    },
    quoteResponses: {
      priced,
      declined,
      latency: summariseLatency(latencyMinutes),
    },
    freshnessEvents: { routePauses, routeActivations, lastPauseAt },
    feedback: {
      total: input.feedback.length,
      useful: usefulCount,
      notUseful: input.feedback.length - usefulCount,
      withComment,
    },
    payments: {
      verifiedSettlements,
      failedAttempts,
      unavailable,
      indeterminate,
      note:
        verifiedSettlements === 0
          ? "No verified Celo settlement recorded. A settlement is counted only after the official facilitator returns a valid transaction hash."
          : "Counts rows that are SETTLED with a verified on-chain transaction hash.",
    },
  };
}

function readIntegrations(env: NodeJS.ProcessEnv = process.env): IntegrationStatus[] {
  let x402: IntegrationStatus;
  try {
    const config = readPaymentConfig(env);
    x402 =
      config.provider === "x402"
        ? {
            key: "x402",
            label: "Celo x402 settlement",
            state: "available",
            detail: `Facilitator configured for ${config.networkLabel} (${config.asset.symbol}). Verified settlements appear in the payments metrics.`,
          }
        : {
            key: "x402",
            label: "Celo x402 settlement",
            state: "unavailable",
            detail: "X402_API_KEY is not set. Paid routes return an explicit unavailable state.",
          };
  } catch (error) {
    x402 = {
      key: "x402",
      label: "Celo x402 settlement",
      state: "misconfigured",
      detail: error instanceof Error ? error.message : "Payment configuration is invalid.",
    };
  }

  const attributionTag = env.X402_ATTRIBUTION_TAG?.trim();
  const databaseUrl = env.DATABASE_URL?.trim();

  const attestation = readAttestationConfig(env);
  const eas: IntegrationStatus = {
    key: "eas-attestation",
    label: "EAS attestation (Celo mainnet)",
    state: attestation.onChain ? "available" : "unavailable",
    detail: attestation.reason,
  };

  return [
    x402,
    eas,
    {
      key: "erc8021-attribution",
      label: "ERC-8021 attribution tag",
      state: attributionTag ? "available" : "unavailable",
      detail: attributionTag
        ? "Attribution tag configured; recorded on settlement receipts."
        : "Issued at hackathon registration. Set X402_ATTRIBUTION_TAG once received.",
    },
    {
      key: "erc8004-agent-id",
      label: "ERC-8004 Agent ID",
      state: "unavailable",
      detail: "Celo Builders registration pending. No registration-dependent claim is made.",
    },
    {
      key: "cpay",
      label: "cPay agent marketplace",
      state: "unavailable",
      detail: "Closed beta, no public SDK. The adapter interface is ready for it (ADR-011).",
    },
    {
      key: "askbots-cli",
      label: "AskBots CLI review rounds",
      state: "unavailable",
      detail:
        "CLI / account not set up. Feedback-driven changes are logged in docs/FEEDBACK_CHANGELOG.md and rendered below.",
    },
    {
      key: "managed-postgres",
      label: "Managed PostgreSQL",
      state: databaseUrl ? "available" : "unavailable",
      detail: databaseUrl
        ? "DATABASE_URL is set."
        : "Running on embedded PGlite (local/dev). Set DATABASE_URL for a hosted deployment.",
    },
  ];
}

const METHODOLOGY: string[] = [
  "No separate analytics store: every figure is aggregated on read from the product's own tables (tasks, quotes, feedback, audit events, service payments).",
  "Buyer sessions are opaque random ids with no account behind them. Only counts and a bucketed distribution are exposed — never a raw id or any task content.",
  '"Real" excludes every business created by npm run db:seed (name prefixed [DEMO SEED]); "Demo" is only that seed data. The two are never added together.',
  '"Returning" means a session whose tasks span two or more calendar days (UTC), matching PRD metric G-004.',
  "Quote-response latency is measured from task submission to the supplier's genuine quote or decline row; tasks without a real response are excluded.",
  "A Celo settlement is counted only when its row is SETTLED and carries a verified transaction hash. Zero is reported honestly when facilitator access is unavailable.",
];

export async function buildEvidenceReport(
  db: Database,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<EvidenceReport> {
  const [businessRows, routeRows, taskRows, quoteRows, feedbackRows, paymentRows, eventRows] =
    await Promise.all([
      db.select().from(businesses),
      db.select().from(quoteRoutes),
      db.select().from(tasks),
      db.select().from(quotes),
      db.select().from(feedback),
      db.select().from(servicePayments),
      db
        .select()
        .from(auditEvents)
        .where(inArray(auditEvents.type, [ROUTE_STATUS_EVENT, HANDOFF_CONFIRMED_EVENT])),
    ]);

  const businessScope = new Map<string, DataScope>();
  for (const b of businessRows as BusinessRow[]) {
    businessScope.set(b.id, scopeForBusinessName(b.name));
  }
  const routeScope = new Map<string, DataScope>();
  for (const r of routeRows as QuoteRouteRow[]) {
    routeScope.set(r.id, businessScope.get(r.businessId) ?? "real");
  }
  const taskScope = (task: TaskRow): DataScope =>
    task.routeId ? (routeScope.get(task.routeId) ?? "real") : "real";

  const handoffConfirmedTaskIds = new Set(
    eventRows
      .filter((e) => e.type === HANDOFF_CONFIRMED_EVENT && typeof e.taskId === "string")
      .map((e) => e.taskId as string),
  );

  const buildForScope = (scope: DataScope): MetricsSnapshot => {
    const scopeRoutes = routeRows.filter((r) => (routeScope.get(r.id) ?? "real") === scope);
    const scopeRouteIds = new Set(scopeRoutes.map((r) => r.id));
    const scopeTasks = taskRows.filter((t) => taskScope(t) === scope);
    const scopeTaskIds = new Set(scopeTasks.map((t) => t.id));
    const scopeBusinesses = businessRows.filter(
      (b) => (businessScope.get(b.id) ?? "real") === scope,
    );
    const activeBusinessIds = new Set(
      scopeRoutes.filter((r) => r.status === "ACTIVE").map((r) => r.businessId),
    );

    return buildSnapshot({
      scope,
      now,
      routes: scopeRoutes,
      tasks: scopeTasks,
      quotes: quoteRows.filter((q) => scopeTaskIds.has(q.taskId)),
      feedback: feedbackRows.filter((f) => scopeTaskIds.has(f.taskId)),
      payments: paymentRows.filter((p) => {
        if (p.taskId) return scopeTaskIds.has(p.taskId);
        if (p.routeId) return scopeRouteIds.has(p.routeId);
        // A fully unattributed attempt (e.g. a rejected X-PAYMENT) counts as real activity.
        return scope === "real";
      }),
      statusEvents: eventRows.filter(
        (e) =>
          e.type === ROUTE_STATUS_EVENT &&
          e.routeId != null &&
          (routeScope.get(e.routeId) ?? "real") === scope,
      ),
      handoffConfirmedTaskIds,
      businessCount: scopeBusinesses.length,
      activeBusinessCount: activeBusinessIds.size,
    });
  };

  return {
    generatedAt: now.toISOString(),
    targets: [
      { metric: "Independent buyer tests", target: "10" },
      { metric: "Returning buyers on two or more days", target: "3" },
      { metric: "Participating printers", target: "2" },
      { metric: "Completed quote requests", target: "15" },
      { metric: "Real verified x402 settlements", target: "3+ if beta access permits" },
      { metric: "AskBots review score", target: "Positive delta across two rounds" },
    ],
    real: buildForScope("real"),
    demo: buildForScope("demo"),
    integrations: readIntegrations(env),
    feedbackChangelog: FEEDBACK_CHANGELOG,
    methodology: METHODOLOGY,
  };
}
