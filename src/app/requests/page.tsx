import type { Metadata } from "next";

import { BuyerWorkPanel } from "@/features/tasks/BuyerWorkPanel";

export const metadata: Metadata = { title: "Requests" };

/**
 * The buyer's dedicated request overview — the persistent nav's "Requests"
 * destination (frontend audit D2). Reuses `BuyerWorkPanel` as-is: the same
 * five plain buckets already shown on `/agent`, just given its own page
 * rather than a second implementation of the same list.
 */
export default function RequestsPage() {
  return (
    <div className="page-enter mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Your requests</p>
        <h1 className="text-3xl sm:text-4xl">Everything you&apos;ve asked for</h1>
        <p className="text-sm leading-relaxed text-muted">
          Grouped by what needs you, what&apos;s in progress, and what&apos;s done.
        </p>
      </header>
      <BuyerWorkPanel />
    </div>
  );
}
