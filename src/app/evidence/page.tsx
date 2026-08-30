import type { Metadata } from "next";

import { SectionHeader } from "@/components/ui/Section";
import { getDb } from "@/lib/db/client";
import { EvidenceView } from "@/features/metrics/EvidenceView";
import { buildEvidenceReport } from "@/features/metrics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Intra's hackathon results, separating genuine activity from demo data and unavailable integrations. Privacy-minimised aggregates only.",
};

export default async function EvidencePage() {
  const db = await getDb();
  const report = await buildEvidenceReport(db);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Evidence"
        title="What Intra has actually done"
        description="Real results, demonstration data, and unavailable integrations are kept strictly separate. Every figure is aggregated from the product's own records — no separate tracking, no session ids, no fabricated adoption."
      />

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/evidence?format=json"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
        >
          Download JSON
        </a>
        <a
          href="/api/evidence?format=csv"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
        >
          Download CSV
        </a>
      </div>

      <EvidenceView report={report} />
    </div>
  );
}
