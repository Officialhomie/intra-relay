import { redirect } from "next/navigation";

/**
 * Retired (frontend audit D6, Priority 4). The structured-input capability
 * this page offered now lives inside `/agent` as "Prefer a form?", feeding
 * the same conversation → agent-run pipeline — not a second, single-provider
 * path with no multi-provider comparison. `/request` was never linked from
 * any nav or CTA, so this affects only a direct/bookmarked visit.
 */
export default function RequestPage() {
  redirect("/agent");
}
