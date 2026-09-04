"use client";

import { useEffect } from "react";

import { pilotPing } from "./pilot-ping";

/**
 * Records that a person arrived at a live workflow from a push notification
 * (milestone 7 phase C §33) — the metric that actually matters is whether they
 * resumed, not whether the push was delivered. Fires once per page load when
 * the service worker's `?ref=push` marker is present.
 */
export function ResumeSignal({ authQuery }: { authQuery?: string }) {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("ref") === "push") {
        pilotPing("workflow_resumed", { authQuery });
      }
    } catch {
      /* ignore */
    }
  }, [authQuery]);
  return null;
}
