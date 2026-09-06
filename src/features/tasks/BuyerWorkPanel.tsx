"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Loader2, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";
import { InstallPrompt } from "@/features/pwa/InstallPrompt";
import { PushPrompt } from "@/features/pwa/PushPrompt";

import type { BuyerWorkGroup, BuyerWorkItem, BuyerWorkView } from "./work";

/**
 * The buyer's active work on the home screen (milestone 7 §1, §2, §12, §20).
 *
 * Reads persisted state through `/api/tasks` — never the in-memory run store —
 * so a person who closed the tab and came back still sees every request and can
 * reopen the authoritative server state. Grouped into five plain buckets; no
 * internal status name is shown.
 */

const GROUP_ORDER: BuyerWorkGroup[] = ["ATTENTION", "READY", "WAITING", "IN_PROGRESS", "COMPLETED"];

const GROUP_META: Record<BuyerWorkGroup, { label: string; icon: typeof Clock3; tone: string }> = {
  ATTENTION: { label: "Needs your attention", icon: ArrowRight, tone: "text-warning" },
  READY: { label: "Ready", icon: PackageCheck, tone: "text-success" },
  WAITING: { label: "Waiting", icon: Clock3, tone: "text-muted" },
  IN_PROGRESS: { label: "In progress", icon: Loader2, tone: "text-info" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, tone: "text-subtle" },
};

export function BuyerWorkPanel() {
  const [view, setView] = useState<BuyerWorkView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<BuyerWorkView>("/api/tasks", { sessionId: getSessionId() });
      setView(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <p className="text-sm text-muted">Loading your requests…</p>;
  }
  if (state === "error" || !view) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-danger">
          Could not load your requests.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (view.items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No active requests yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Tell me what you need above and I&apos;ll help you find a business and get a real price.
        </p>
      </div>
    );
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: view.items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  // A request that is still in flight is a reason to come back — so it is the
  // moment to offer notifications and installation (§4, §5).
  const hasAsyncWork = view.items.some((i) => i.group !== "COMPLETED");

  return (
    <div className="space-y-6">
      {hasAsyncWork ? (
        <div className="space-y-3">
          <PushPrompt reason="One of your requests is waiting on a business." />
          <InstallPrompt />
        </div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-light tracking-tight">Your requests</h2>
        {view.attention > 0 ? (
          <span className="text-xs font-medium text-warning">
            {view.attention} {view.attention === 1 ? "needs" : "need"} you
          </span>
        ) : null}
      </div>
      {groups.map(({ group, items }) => (
        <section key={group} className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-medium uppercase tracking-wide ${GROUP_META[group].tone}`}
            >
              {GROUP_META[group].label}
            </span>
            <span className="text-xs text-subtle">· {items.length}</span>
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <WorkRow key={item.taskId} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WorkRow({ item }: { item: BuyerWorkItem }) {
  const Icon = GROUP_META[item.group].icon;
  return (
    <li>
      <Link
        href={`/tasks/${item.taskId}`}
        className="flex items-start gap-3 rounded-md border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
      >
        <Icon
          aria-hidden
          className={`mt-0.5 size-4 shrink-0 ${GROUP_META[item.group].tone} ${item.group === "IN_PROGRESS" ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <span className="text-xs text-subtle">{relativeTime(item.updatedAt)}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">{item.headline}</p>
        </div>
        {item.actionLabel ? (
          <span
            className={`shrink-0 self-center rounded-md px-2.5 py-1 text-xs font-medium ${
              item.actionRequired
                ? "bg-primary text-primary-contrast"
                : "border border-border-strong text-muted"
            }`}
          >
            {item.actionLabel}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
