"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

/**
 * The buyer's escape hatch on an agreed order (milestone 6 §18): cancel it, or
 * report that the handover did not go through. Both are consequential and
 * explicit — nothing here happens without the buyer choosing it, and neither
 * path claims a refund Intra cannot make.
 */

type Action = "cancel" | "handover";

export function OrderProblemPanel({
  taskId,
  onChanged,
}: {
  taskId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: Action) {
    setPending(true);
    setError(null);
    try {
      const path = action === "cancel" ? "cancel" : "handover-problem";
      const key = action === "cancel" ? "reason" : "detail";
      await apiRequest(`/api/tasks/${taskId}/${path}`, {
        method: "POST",
        sessionId: getSessionId(),
        idempotencyKey: `${action}-${taskId}-${Date.now()}`,
        body: note.trim() ? { [key]: note.trim() } : {},
      });
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not do that just now. Try again shortly.",
      );
      setPending(false);
    }
  }

  return (
    <details
      className="rounded-md border border-border bg-surface p-4 text-sm"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) setOpen(null);
      }}
    >
      <summary className="cursor-pointer font-medium">Something wrong with this order?</summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted">
          Intra never held any money for this order, so there is nothing to refund here. If you paid
          the business directly, settle that with them.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpen(open === "cancel" ? null : "cancel")}
          >
            Cancel this order
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpen(open === "handover" ? null : "handover")}
          >
            The pickup or handover failed
          </Button>
        </div>

        {open ? (
          <div className="space-y-2 rounded-md border border-border bg-bg p-3">
            <label htmlFor="order-problem-note" className="block text-xs text-muted">
              {open === "cancel"
                ? "Optional: tell the business why you're cancelling."
                : "Optional: what went wrong with the collection?"}
            </label>
            <textarea
              id="order-problem-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={400}
              className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm outline-none focus-visible:border-foreground"
            />
            <Button size="sm" pending={pending} onClick={() => submit(open)}>
              {open === "cancel" ? "Cancel the order" : "Report the problem"}
            </Button>
          </div>
        ) : null}

        {error ? <Callout tone="warning">{error}</Callout> : null}
      </div>
    </details>
  );
}
