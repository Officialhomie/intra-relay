import type { Metadata } from "next";
import Link from "next/link";

import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/**
 * Shown by the service worker when a navigation fails with no connection
 * (milestone 7 phase C §3). Deliberately static — it must render from cache.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-warning-wash text-warning">
        <WifiOff aria-hidden className="size-5" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-sm leading-relaxed text-muted">
        Intra needs a connection to show your latest requests and prices. Your work is safe on the
        server — reconnect and open the page again.
      </p>
      <Link
        href="/agent"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast"
      >
        Try again
      </Link>
    </div>
  );
}
