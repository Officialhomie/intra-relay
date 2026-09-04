"use client";

import { useEffect, useState } from "react";

import { Bell, X } from "lucide-react";

import { Button } from "@/components/ui/Button";

import { pilotPing } from "./pilot-ping";
import { usePushSetup } from "./usePushSetup";

/**
 * The contextual permission ask (milestone 7 phase C §5).
 *
 * Rendered only by a surface that has a *reason* — a workflow just became
 * asynchronous — and only while permission is still "default". A dismissal is
 * remembered, so a person is never nagged; a browser that has denied is never
 * asked again.
 */

const DISMISS_KEY = "intra.pushPromptDismissed";

export function PushPrompt({ reason, authQuery }: { reason: string; authQuery?: string }) {
  const push = usePushSetup({ authQuery });
  const [dismissed, setDismissed] = useState(true);
  const [prompted, setPrompted] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const show = push.available && push.permission === "default" && !push.subscribed && !dismissed;

  useEffect(() => {
    if (show && !prompted) {
      setPrompted(true);
      pilotPing("push_permission_prompted", { authQuery });
    }
  }, [show, prompted, authQuery]);

  if (!show) return null;

  async function enable() {
    const ok = await push.enable();
    pilotPing(ok ? "push_permission_granted" : "push_permission_denied", { authQuery });
    if (ok) dismiss();
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="border-mist/60 flex items-start gap-3 rounded-md border bg-info-wash p-4 text-sm text-info">
      <Bell aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-foreground">
          {reason} Want us to notify you when something needs you — even if this tab is closed?
        </p>
        {push.error ? <p className="text-xs text-danger">{push.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" pending={push.busy} onClick={() => void enable()}>
            Enable notifications
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-9 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="shrink-0 text-muted hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
