"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { AlertCircle, BellRing, CheckCircle2, Clock, Info } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { ApiError, apiRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";

import type { AttentionLevel } from "./attention";

/**
 * The in-app action centre (milestone 7 §3, §10, §11, §14, §17–§19).
 *
 * Answers "what needs my attention?" in plain language — no raw event names.
 * Opening an item marks it read and follows its deep link to the exact
 * workflow; reading is never the same as taking the action there (§18).
 */

interface Item {
  id: string;
  event: string;
  level: AttentionLevel;
  title: string;
  body: string;
  deeplink: string;
  read: boolean;
  at: string;
}

interface ActionCentreView {
  needsAttention: Item[];
  updates: Item[];
  unread: number;
}

const LEVEL_STYLE: Record<
  AttentionLevel,
  { icon: typeof Info; ring: string; badge: string; label: string }
> = {
  ACTION_REQUIRED: {
    icon: AlertCircle,
    ring: "border-warning/40 bg-warning-wash/40",
    badge: "bg-warning text-primary-contrast",
    label: "Needs action",
  },
  TIME_SENSITIVE: {
    icon: Clock,
    ring: "border-warning/30 bg-warning-wash/20",
    badge: "border border-warning/40 text-warning",
    label: "Time-sensitive",
  },
  INFORMATIONAL: {
    icon: Info,
    ring: "border-border bg-surface",
    badge: "border border-border text-muted",
    label: "Update",
  },
  COMPLETED: {
    icon: CheckCircle2,
    ring: "border-success/25 bg-success-wash/30",
    badge: "border border-success/30 text-success",
    label: "Completed",
  },
};

export function ActionCentre({
  authQuery,
  heading = "Activity",
}: {
  /** Business auth as a query string, e.g. "businessSlug=x&t=y". Omit for a buyer. */
  authQuery?: string;
  heading?: string;
}) {
  const suffix = authQuery ? `?${authQuery}` : "";
  const [view, setView] = useState<ActionCentreView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<ActionCentreView>(`/api/notifications${suffix}`, {
        sessionId: authQuery ? undefined : getSessionId(),
      });
      setView(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [suffix, authQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(
    (id: string) => {
      // Optimistic — reading must not block following the link.
      setView((prev) =>
        prev
          ? {
              ...prev,
              unread: Math.max(0, prev.unread - 1),
              needsAttention: prev.needsAttention.map((i) =>
                i.id === id ? { ...i, read: true } : i,
              ),
              updates: prev.updates.map((i) => (i.id === id ? { ...i, read: true } : i)),
            }
          : prev,
      );
      void apiRequest(`/api/notifications/${id}/read${suffix}`, {
        method: "POST",
        sessionId: authQuery ? undefined : getSessionId(),
        body: {},
      }).catch(() => undefined);
    },
    [suffix, authQuery],
  );

  async function clearAll() {
    setView((prev) =>
      prev
        ? {
            ...prev,
            unread: 0,
            needsAttention: prev.needsAttention.map((i) => ({ ...i, read: true })),
            updates: prev.updates.map((i) => ({ ...i, read: true })),
          }
        : prev,
    );
    try {
      await apiRequest(`/api/notifications/read-all${suffix}`, {
        method: "POST",
        sessionId: authQuery ? undefined : getSessionId(),
        body: {},
      });
    } catch (err) {
      if (err instanceof ApiError) void load();
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-muted">Loading your activity…</p>;
  }
  if (state === "error" || !view) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-danger">
          Could not load your activity.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const total = view.needsAttention.length + view.updates.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={BellRing}
        title="Nothing needs you right now"
        description="When a business responds or your order moves forward, it will show up here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-light tracking-tight">
          {heading}
          {view.unread > 0 ? (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-contrast">
              {view.unread}
            </span>
          ) : null}
        </h2>
        {view.unread > 0 ? (
          <button
            type="button"
            onClick={() => void clearAll()}
            className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      {view.needsAttention.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">
            Needs your attention
          </h3>
          <ul className="space-y-2">
            {view.needsAttention.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={() => markRead(item.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      {view.updates.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">Updates</h3>
          <ul className="space-y-2">
            {view.updates.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={() => markRead(item.id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const style = LEVEL_STYLE[item.level];
  const Icon = style.icon;
  return (
    <li>
      <Link
        href={item.deeplink}
        onClick={onOpen}
        className={`flex gap-3 rounded-md border p-3.5 transition-colors hover:border-border-strong ${style.ring}`}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide ${style.badge}`}
            >
              {style.label}
            </span>
            {!item.read ? (
              <span className="inline-flex items-center gap-1 text-[0.65rem] font-medium text-primary">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                Unread
              </span>
            ) : null}
            <span className="text-xs text-subtle">{relativeTime(item.at)}</span>
          </div>
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-sm text-muted">{item.body}</p>
        </div>
      </Link>
    </li>
  );
}
