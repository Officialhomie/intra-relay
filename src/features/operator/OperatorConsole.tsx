"use client";

import { useCallback, useEffect, useState } from "react";

import { KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/ui/States";
import { Card, CardTitle } from "@/components/ui/Section";
import { StatusPill, routeStatusTone } from "@/components/ui/StatusPill";
import { ApiError, apiRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { ACTIVATION_CHECKS, ACTIVATION_CHECK_LABELS } from "@/features/routes/activation";
import { MetricsPanel } from "./MetricsPanel";
import { EvidencePanel } from "./EvidencePanel";

const KEY_STORAGE = "intra.operatorKey";

interface QueueItem {
  route: {
    id: string;
    slug: string;
    name: string;
    status: string;
    responseSlaMinutes: number;
    queryFeeUsd: string;
    priceUpdatedAt: string | null;
    updatedAt: string;
  };
  business: {
    slug: string;
    name: string;
    city: string;
    country: string;
    consentAt: string | null;
    contactChannelType: string;
    contactChannelValue: string;
    verifiedByOperatorAt: string | null;
  };
}

export function OperatorConsole() {
  const [operatorKey, setOperatorKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "metrics" | "evidence">("queue");

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(KEY_STORAGE);
      if (stored) setOperatorKey(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (key: string) => {
    setStatus("loading");
    setLoadError(null);
    try {
      const data = await apiRequest<QueueItem[]>("/api/operator/routes", { operatorKey: key });
      setItems(data);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setLoadError(
        error instanceof ApiError && error.status === 401
          ? "That operator key was not accepted."
          : error instanceof ApiError
            ? error.message
            : "Could not load the queue.",
      );
    }
  }, []);

  useEffect(() => {
    if (operatorKey) void load(operatorKey);
  }, [operatorKey, load]);

  function saveKey(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    try {
      window.sessionStorage.setItem(KEY_STORAGE, trimmed);
    } catch {
      /* ignore */
    }
    setOperatorKey(trimmed);
  }

  function forgetKey() {
    try {
      window.sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      /* ignore */
    }
    setOperatorKey("");
    setItems(null);
    setStatus("idle");
  }

  if (!operatorKey) {
    return (
      <Card className="max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-5 text-primary" />
          <CardTitle>Operator sign-in</CardTitle>
        </div>
        <p className="text-sm text-muted">
          Enter your operator key. It is held only for this browser session and never stored on a
          server or logged.
        </p>
        <form onSubmit={saveKey} className="space-y-3">
          <input
            type="password"
            autoComplete="off"
            aria-label="Operator key"
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            className="w-full rounded-sm border border-border bg-bg px-3 py-2.5 text-base outline-none focus-visible:border-foreground"
            placeholder="operator key"
          />
          <Button type="submit">Continue</Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden className="size-4 text-success" />
          Operating as verified operator
        </p>
        <Button size="sm" variant="ghost" onClick={forgetKey}>
          Sign out
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Operator views"
        className="flex gap-1 rounded-md border border-border bg-surface p-1"
      >
        {(["queue", "metrics", "evidence"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-9 flex-1 rounded-sm px-3 text-sm font-medium capitalize transition-colors ${
              tab === value
                ? "bg-primary text-primary-contrast"
                : "text-muted hover:text-foreground"
            }`}
          >
            {value === "queue" ? "Review queue" : value === "metrics" ? "Metrics" : "Evidence"}
          </button>
        ))}
      </div>

      {tab === "metrics" ? <MetricsPanel operatorKey={operatorKey} /> : null}
      {tab === "evidence" ? <EvidencePanel operatorKey={operatorKey} /> : null}

      {tab === "queue" ? (
        <>
          {status === "loading" && !items ? <LoadingPanel label="Loading route queue" /> : null}

          {status === "error" ? (
            <ErrorState
              title="Could not load the queue"
              description={loadError ?? undefined}
              action={
                <Button size="sm" variant="secondary" onClick={() => load(operatorKey)}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {status === "ready" && items && items.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing needs review"
              description="New routes from supplier onboarding will appear here for verification."
            />
          ) : null}

          {items && items.length > 0 ? (
            <ol className="space-y-4">
              {items.map((item) => (
                <li key={item.route.id}>
                  <OperatorRouteCard
                    item={item}
                    operatorKey={operatorKey}
                    onChanged={() => load(operatorKey)}
                  />
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OperatorRouteCard({
  item,
  operatorKey,
  onChanged,
}: {
  item: QueueItem;
  operatorKey: string;
  onChanged: () => void;
}) {
  const { route, business } = item;
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(ACTIVATION_CHECKS.map((c) => [c, false])),
  );
  const [phase, setPhase] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const allChecked = ACTIVATION_CHECKS.every((c) => checks[c]);
  const canActivate =
    route.status === "DRAFT" ||
    route.status === "PENDING_VERIFICATION" ||
    route.status === "PAUSED";

  async function mutate(body: Record<string, unknown>) {
    setPhase("pending");
    setError(null);
    try {
      await apiRequest(`/api/routes/${route.id}/status`, { method: "PATCH", operatorKey, body });
      onChanged();
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(err instanceof ApiError ? err.message : "The change did not go through.");
    }
  }

  const activate = () => mutate({ status: "ACTIVE", checklist: checks });
  const pause = () => mutate({ status: "PAUSED" });

  return (
    <Card as="article" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{business.name}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            {route.name} · {business.city}, {business.country}
          </p>
        </div>
        <StatusPill tone={routeStatusTone(route.status)}>
          {route.status.replace(/_/g, " ")}
        </StatusPill>
      </div>

      <DataList>
        <DataRow label="Consent">
          {business.consentAt ? `Recorded ${relativeTime(business.consentAt)}` : "Not recorded"}
        </DataRow>
        <DataRow label="Order channel">
          {business.contactChannelType} · {business.contactChannelValue}
        </DataRow>
        <DataRow label="Query fee / SLA">
          ${Number(route.queryFeeUsd).toFixed(2)} · {route.responseSlaMinutes} min
        </DataRow>
        <DataRow label="Last updated">{relativeTime(route.updatedAt)}</DataRow>
      </DataList>

      {canActivate ? (
        <fieldset className="space-y-2 rounded-md border border-border bg-bg p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-subtle">
            Confirm before activation
          </legend>
          {ACTIVATION_CHECKS.map((check) => (
            <label key={check} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0"
                checked={checks[check]}
                onChange={(event) =>
                  setChecks((current) => ({ ...current, [check]: event.target.checked }))
                }
              />
              <span>{ACTIVATION_CHECK_LABELS[check]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? (
        <Callout tone="warning" title="Could not update the route">
          {error}
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canActivate ? (
          <Button size="sm" disabled={!allChecked} pending={phase === "pending"} onClick={activate}>
            {route.status === "PAUSED" ? "Reactivate route" : "Verify and activate"}
          </Button>
        ) : null}
        {route.status === "ACTIVE" ? (
          <Button size="sm" variant="secondary" pending={phase === "pending"} onClick={pause}>
            Pause route
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
