"use client";

import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import type { BuyerWorkView } from "@/features/tasks/work";

/**
 * The "needs you" count for the nav — the same `attention` figure
 * `BuyerWorkPanel` already computes server-side from persisted task state
 * (payment/decision/confirmation/exception). No second source of truth: this
 * reads the same `/api/tasks` endpoint, just for the nav badge instead of the
 * work list.
 */
export function useBuyerAttention(pathname: string): number | null {
  const [attention, setAttention] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<BuyerWorkView>("/api/tasks", { sessionId: getSessionId() })
      .then((data) => {
        if (!cancelled) setAttention(data.attention);
      })
      .catch(() => {
        if (!cancelled) setAttention(null);
      });
    return () => {
      cancelled = true;
    };
    // Re-check on every buyer-route navigation so an action taken on one
    // screen (e.g. deciding a quote) is reflected the next time the nav mounts
    // a fresh check — the layout itself never unmounts between navigations.
  }, [pathname]);

  return attention;
}
