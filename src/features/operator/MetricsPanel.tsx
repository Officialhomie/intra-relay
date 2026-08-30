"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingPanel } from "@/components/ui/States";
import { ApiError, apiRequest } from "@/lib/api";
import { EvidenceView } from "@/features/metrics/EvidenceView";
import type { EvidenceReport } from "@/features/metrics/report";

interface OperatorReport extends EvidenceReport {
  recentEvents: { type: string; at: string; to: string | null }[];
}

/** Operator metrics view (PRD §4). Reuses the shared evidence renderer. */
export function MetricsPanel({ operatorKey }: { operatorKey: string }) {
  const [report, setReport] = useState<OperatorReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    setError(null);
    try {
      const data = await apiRequest<OperatorReport>("/api/operator/metrics", { operatorKey });
      setReport(data);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ApiError && err.status === 401
          ? "That operator key was not accepted."
          : err instanceof ApiError
            ? err.message
            : "Could not load metrics.",
      );
    }
  }, [operatorKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading" && !report) return <LoadingPanel label="Loading metrics" />;

  if (status === "error") {
    return (
      <ErrorState
        title="Could not load metrics"
        description={error ?? undefined}
        action={
          <Button size="sm" variant="secondary" onClick={load}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/evidence?format=csv"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
        >
          Export CSV
        </a>
        <a
          href="/api/evidence?format=json"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
        >
          Export JSON
        </a>
        <Button size="sm" variant="ghost" onClick={load}>
          Refresh
        </Button>
      </div>
      <EvidenceView report={report} recentEvents={report.recentEvents} />
    </div>
  );
}
