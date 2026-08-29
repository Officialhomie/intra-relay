import type { Metadata } from "next";

import { CirclePause, ClipboardCheck, ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Operator workspace" };
export default function OperatorPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Operator workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Protect the quality of every agent answer.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This is the operational control plane: verify the merchant before publication, watch
          freshness, and pause an inaccurate route before an agent requests or pays for it.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Verified active routes" value="—" text="No live data connected" />
        <Stat label="Routes awaiting review" value="—" text="Drafts appear here" />
        <Stat label="Verified Celo receipts" value="—" text="Only facilitator-confirmed" />
        <Stat label="Buyer feedback" value="—" text="Opt-in and minimised" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border p-5">
          <div className="flex gap-3">
            <ClipboardCheck aria-hidden className="size-5 text-blue-700 dark:text-blue-400" />
            <div>
              <h2 className="font-semibold">Activation checklist</h2>
              <p className="mt-1 text-sm text-muted">
                Every item is required before a route changes from `PENDING_VERIFICATION` to
                `ACTIVE`.
              </p>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm text-muted">
            <li>□ Business contact channel tested</li>
            <li>□ Quote-display consent recorded</li>
            <li>□ Public Celo address format and ownership verified</li>
            <li>□ One genuine, dated price/availability source reviewed</li>
            <li>□ SLA, expiry, and out-of-area behaviour agreed</li>
            <li>□ Merchant tested a sample structured request</li>
          </ul>
        </article>
        <article className="rounded-xl border border-border p-5">
          <div className="flex gap-3">
            <CirclePause aria-hidden className="size-5 text-amber-600" />
            <div>
              <h2 className="font-semibold">Pause is a safety feature</h2>
              <p className="mt-1 text-sm text-muted">
                A route must stop accepting requests immediately if pricing, availability, consent,
                or contact information becomes unreliable.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-lg bg-surface p-4 text-sm">
            <p className="font-medium">Routes never request payment while paused.</p>
            <p className="mt-1 text-muted">
              The agent returns `ROUTE_UNAVAILABLE`; it does not retry against the merchant or
              charge a buyer.
            </p>
          </div>
        </article>
      </section>
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-3">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">No synthetic evidence</p>
            <p className="mt-1 leading-relaxed">
              This surface deliberately shows no made-up route, user, payment, or transaction
              activity. Connect persistence and the official Celo facilitator before using it as a
              live operational dashboard.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
function Stat({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <article className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{text}</p>
    </article>
  );
}
