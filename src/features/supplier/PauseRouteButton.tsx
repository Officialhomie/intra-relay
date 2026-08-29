"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { PauseCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ApiError, apiRequest } from "@/lib/api";

interface Props {
  routeId: string;
  manageToken: string;
  disabled?: boolean;
}

/** Fail-safe supplier control (BR-006): pausing only ever reduces availability. */
export function PauseRouteButton({ routeId, manageToken, disabled }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm" | "pending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function pause() {
    setPhase("pending");
    setMessage(null);
    try {
      await apiRequest(`/api/routes/${routeId}/status`, {
        method: "PATCH",
        manageToken,
        body: { status: "PAUSED" },
      });
      router.refresh();
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof ApiError ? error.message : "Could not pause the route.");
    }
  }

  if (phase === "confirm") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">
          Pause this route now? Buyers cannot send new requests until an operator reactivates it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" onClick={pause}>
            Yes, pause route
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase("idle")}>
            Keep it live
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        pending={phase === "pending"}
        onClick={() => setPhase("confirm")}
      >
        <PauseCircle aria-hidden className="size-4" />
        Pause route
      </Button>
      {phase === "error" && message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
