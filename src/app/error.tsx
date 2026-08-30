"use client";

import { useEffect } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/Button";

/**
 * App Router error boundary. Any unhandled render/data error in a route segment
 * lands here instead of a blank screen. Keep the copy calm and non-technical.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Surface for local debugging; production logging is wired at the platform.
    console.error(error);
  }, [error]);

  return (
    <section role="alert" className="mx-auto max-w-md space-y-4 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong on our side</h1>
      <p className="text-sm text-muted">
        This page hit an unexpected error. Nothing you did caused it, and no request was sent to a
        printer. Try again, or head back home.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
