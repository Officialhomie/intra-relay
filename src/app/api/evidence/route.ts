import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { reportToCsv } from "@/features/metrics/csv";
import { buildEvidenceReport } from "@/features/metrics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public evidence export (MET-001). Privacy-minimised aggregates only — no
 * session ids, task content, or contact details. `?format=csv` returns a flat
 * spreadsheet; the default and `?format=json` return the full report envelope.
 */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const format = url.searchParams.get("format")?.toLowerCase() ?? "json";
  const db = await getDb();
  const report = await buildEvidenceReport(db);

  if (format === "csv") {
    return new Response(reportToCsv(report), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="intra-evidence-${report.generatedAt.slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return ok(report);
});
