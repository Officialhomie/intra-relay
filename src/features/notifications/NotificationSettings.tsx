"use client";

import { BellOff, BellRing } from "lucide-react";

import { usePushSetup } from "@/features/pwa/usePushSetup";

/**
 * The person's notification controls (milestone 7 phase C §16). Two switches,
 * plain language, and honest about what the browser is doing. The person is
 * always in control — turning push off is one tap and never blocked.
 */
export function NotificationSettings({ authQuery }: { authQuery?: string }) {
  const push = usePushSetup({ authQuery });

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {push.subscribed ? (
          <BellRing aria-hidden className="size-4 text-primary" />
        ) : (
          <BellOff aria-hidden className="size-4 text-muted" />
        )}
        <h3 className="text-sm font-medium text-foreground">
          Notifications while you&apos;re away
        </h3>
      </div>

      {push.permission === "unsupported" ? (
        <p className="text-sm text-muted">
          This browser can&apos;t send notifications when the app is closed. You&apos;ll still see
          everything in Activity when you come back.
        </p>
      ) : !push.available ? (
        <p className="text-sm text-muted">
          Off-tab notifications aren&apos;t set up on this deployment yet. Activity always shows
          what needs you.
        </p>
      ) : push.permission === "denied" ? (
        <p className="text-sm text-muted">
          You&apos;ve blocked notifications for Intra in your browser. To turn them back on, allow
          notifications for this site in your browser settings.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              Notify me when something needs my attention
            </span>
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={push.subscribed}
              disabled={push.busy}
              onChange={(e) => {
                if (e.target.checked) void push.enable();
                else void push.disable();
              }}
            />
          </label>

          {push.subscribed ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">
                Also send the quieter updates, not just action needed
              </span>
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={push.preference?.pushInformational ?? false}
                disabled={push.busy}
                onChange={(e) => void push.setInformational(e.target.checked)}
              />
            </label>
          ) : null}

          {push.error ? <p className="text-xs text-danger">{push.error}</p> : null}
        </div>
      )}
    </section>
  );
}
