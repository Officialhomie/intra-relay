"use client";

import { useEffect } from "react";

import { useAnalytics } from "@/features/analytics/useAnalytics";

import { pilotPing } from "./pilot-ping";

/**
 * Records that a person arrived at a live workflow from a push notification
 * (milestone 7 phase C §33; M9.5 §19, §24) — the metric that actually matters
 * is whether they resumed, not whether the push was delivered. Fires once per
 * page load when the service worker's `?ref=push` marker is present.
 */
export function ResumeSignal({ authQuery }: { authQuery?: string }) {
  const analytics = useAnalytics(authQuery ? "business" : "buyer");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("ref") === "push") {
        pilotPing("workflow_resumed", { authQuery });
        analytics.track("workflow_resumed", { notification_channel: "push" });
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authQuery]);
  return null;
}
