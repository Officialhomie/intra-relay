/**
 * One-time, DRY-RUN-BY-DEFAULT backfill: promote serviceArea/pickupAvailable/
 * deliveryAvailable/typicalTurnaround from an existing route's ORIGINAL Tally
 * onboarding submission onto the route itself (M10.8 Part G).
 *
 * Why this exists: M10.8 added these four columns to `quote_routes` and wired
 * new Tally submissions to populate them going forward
 * (`onboarding/service.ts`'s `enrichPrintingRoute`). A route created by an
 * EARLIER Tally submission — before this migration existed — has these four
 * columns `null` even though the original submission's `normalizedData` jsonb
 * blob may still legitimately contain the answers. This script closes that
 * gap for those specific routes, and only those routes:
 *
 * - It NEVER invents a value. A route with no matching onboarding submission,
 *   or a submission whose relevant field is itself null (the business never
 *   answered), is left exactly as it is — still UNKNOWN, correctly.
 * - It NEVER overwrites a value that is already set on the route. If an
 *   operator or the business already edited service area/turnaround since
 *   onboarding, this script will not touch it.
 * - It runs in DRY-RUN mode by default: it prints exactly what it WOULD
 *   change and writes nothing. Pass `--apply` to actually write.
 *
 * Usage:
 *   npx tsx scripts/backfill-route-fulfilment-data.ts            # dry run
 *   npx tsx scripts/backfill-route-fulfilment-data.ts --apply    # writes
 *
 * Per M10.8 Part G/O: this script is prepared and reported, but is NOT run
 * against any environment as part of this milestone. Do not run it against a
 * shared/production database without a human deciding to, and never while
 * another process (e.g. the dev server) holds the same PGlite data directory
 * open — see the M10.4/M10.6 incident notes on concurrent PGlite access.
 */
import { getDb } from "../src/lib/db/client";
import { businesses, quoteRoutes } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { findOnboardingSubmissionByRouteId } from "../src/features/onboarding/repository";
import type { NormalizedOnboarding } from "../src/features/onboarding/normalize";

interface Patch {
  serviceArea?: string;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  typicalTurnaround?: string;
}

function isNormalizedOnboarding(value: unknown): value is NormalizedOnboarding {
  return typeof value === "object" && value !== null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();

  const rows = await db
    .select({ route: quoteRoutes, businessSlug: businesses.slug })
    .from(quoteRoutes)
    .innerJoin(businesses, eq(quoteRoutes.businessId, businesses.id));

  let candidates = 0;
  let wouldChange = 0;

  for (const { route, businessSlug } of rows) {
    const alreadyComplete =
      route.serviceArea !== null &&
      route.pickupAvailable !== null &&
      route.deliveryAvailable !== null &&
      route.typicalTurnaround !== null;
    if (alreadyComplete) continue;
    candidates += 1;

    const submission = await findOnboardingSubmissionByRouteId(db, route.id);
    if (!submission || submission.status !== "PROCESSED") continue;
    if (!isNormalizedOnboarding(submission.normalizedData)) continue;
    const data = submission.normalizedData;

    const patch: Patch = {};
    if (route.serviceArea === null && typeof data.serviceArea === "string") {
      patch.serviceArea = data.serviceArea;
    }
    if (route.pickupAvailable === null && typeof data.pickupAvailable === "boolean") {
      patch.pickupAvailable = data.pickupAvailable;
    }
    if (route.deliveryAvailable === null && typeof data.deliveryAvailable === "boolean") {
      patch.deliveryAvailable = data.deliveryAvailable;
    }
    if (route.typicalTurnaround === null && typeof data.turnaround === "string") {
      patch.typicalTurnaround = data.turnaround;
    }

    if (Object.keys(patch).length === 0) continue;
    wouldChange += 1;

    console.log(`${businessSlug} / ${route.slug} (${route.id})`);
    console.log(`  from submission ${submission.id}: ${JSON.stringify(patch)}`);

    if (apply) {
      await db.update(quoteRoutes).set(patch).where(eq(quoteRoutes.id, route.id));
      console.log("  applied.");
    }
  }

  console.log(
    `\n${candidates} route(s) had at least one unset field; ${wouldChange} had a matching ` +
      `onboarding submission with data to backfill. ${apply ? "Changes were applied." : "Dry run only — pass --apply to write."}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
