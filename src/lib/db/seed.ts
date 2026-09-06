/**
 * Development seed data.
 *
 *   npm run db:seed
 *
 * Everything here is clearly synthetic (name prefixed "[DEMO SEED]", a burn
 * payout address) so it can never be mistaken for a real merchant (CLAUDE §4.1).
 * Refuses to run in production.
 *
 * The fixtures deliberately cover THREE different commercial models
 * (milestone 5 §9), so the product is exercised against real pricing behaviour
 * rather than one printing shop repeated three times:
 *
 *   A  FIXED           a published per-unit price, the same every time
 *   B  STARTING_FROM   a floor price that moves with quantity and stock
 *   C  QUOTE_REQUIRED  no published price; the business judges each request
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { PricingModel } from "@/features/pricing/model";
import {
  FLYER_PRINTING_INPUT_FIELDS,
  FLYER_PRINTING_ROUTE_SLUG,
} from "@/features/routes/flyer-printing";
import { getTemplateForCategory } from "@/features/routes/templates";
import type { BusinessCategory } from "@/features/businesses/schema";
import type { RouteInputField } from "@/features/routes/schema";

import { DEFAULT_PGLITE_DIR, MIGRATIONS_FOLDER } from "./client";
import { auditEvents, businesses, quoteRoutes } from "./schema";
import * as schema from "./schema";
import type { Database } from "./client";

const DEMO_ADDRESS = `0x${"0".repeat(39)}1`;

const COPY_FIELDS: readonly RouteInputField[] = [
  { key: "pages", label: "Number of pages", example: "40", required: true },
  { key: "copies", label: "Number of copies", example: "3", required: true },
  { key: "colour", label: "Colour preference", example: "black-and-white", required: true },
  { key: "deadline", label: "Needed by", example: "Today 4pm", required: true },
  { key: "deliveryArea", label: "Pick-up point", example: "Yaba campus gate", required: true },
] as const;

const REPAIR_FIELDS: readonly RouteInputField[] = [
  { key: "device", label: "What needs repairing?", example: "iPhone 12", required: true },
  { key: "fault", label: "What is wrong with it?", example: "Screen cracked", required: true },
  { key: "deadline", label: "When do you need it back?", example: "Within 2 days", required: true },
  { key: "deliveryArea", label: "Drop-off area", example: "Surulere", required: true },
] as const;

interface DemoBusiness {
  slug: string;
  name: string;
  category: BusinessCategory;
  city: string;
  contact: string;
  sla: number;
  /** USD query fee. 0 = free route (works with no x402 facilitator configured). */
  queryFeeUsd: number;
  route: {
    slug: string;
    name: string;
    description: string;
    inputFields: readonly RouteInputField[];
    pricingModel: PricingModel;
    priceAmount: number | null;
    priceUnit: string | null;
  };
}

const DEMO_BUSINESSES: readonly DemoBusiness[] = [
  // The original paid-route printer — exercises the x402 unavailable path.
  {
    slug: "demo-seed-campus-prints",
    name: "[DEMO SEED] Campus Prints",
    category: "printing",
    city: "Lagos",
    contact: "+2340000000000",
    sla: 30,
    queryFeeUsd: getTemplateForCategory("printing").queryFeeUsd,
    route: {
      slug: FLYER_PRINTING_ROUTE_SLUG,
      name: "Flyer printing quote",
      description: "A structured request for current flyer pricing, availability, and turnaround.",
      inputFields: FLYER_PRINTING_INPUT_FIELDS,
      pricingModel: "STARTING_FROM",
      priceAmount: 12_000,
      priceUnit: "per 100",
    },
  },

  // MODEL B — quantity/context based. The flyer printers the agent demo uses.
  {
    slug: "demo-seed-yaba-reprographics",
    name: "[DEMO SEED] Yaba Reprographics",
    category: "printing",
    city: "Lagos",
    contact: "+2340000000001",
    sla: 20,
    queryFeeUsd: 0,
    route: {
      slug: FLYER_PRINTING_ROUTE_SLUG,
      name: "Flyer printing quote",
      description: "A structured request for current flyer pricing, availability, and turnaround.",
      inputFields: FLYER_PRINTING_INPUT_FIELDS,
      pricingModel: "STARTING_FROM",
      priceAmount: 15_000,
      priceUnit: "per 100",
    },
  },
  {
    slug: "demo-seed-akoka-print-studio",
    name: "[DEMO SEED] Akoka Print Studio",
    category: "printing",
    city: "Lagos",
    contact: "+2340000000002",
    sla: 45,
    queryFeeUsd: 0,
    route: {
      slug: FLYER_PRINTING_ROUTE_SLUG,
      name: "Flyer printing quote",
      description: "A structured request for current flyer pricing, availability, and turnaround.",
      inputFields: FLYER_PRINTING_INPUT_FIELDS,
      pricingModel: "STARTING_FROM",
      priceAmount: 13_500,
      priceUnit: "per 100",
    },
  },

  // MODEL A — a stable published price a buyer can compare before asking.
  {
    slug: "demo-seed-unilag-copy-centre",
    name: "[DEMO SEED] UNILAG Copy Centre",
    category: "printing",
    city: "Lagos",
    contact: "+2340000000003",
    sla: 15,
    queryFeeUsd: 0,
    route: {
      slug: "document-copying",
      name: "Document copying",
      description: "Straight black-and-white copying and binding at a published per-page rate.",
      inputFields: COPY_FIELDS,
      pricingModel: "FIXED",
      priceAmount: 50,
      priceUnit: "per page",
    },
  },

  // MODEL C — no published price; the business judges each request.
  {
    slug: "demo-seed-surulere-device-repair",
    name: "[DEMO SEED] Surulere Device Repair",
    category: "other",
    city: "Lagos",
    contact: "+2340000000004",
    sla: 120,
    queryFeeUsd: 0,
    route: {
      slug: "device-repair",
      name: "Device repair",
      description: "Phone and laptop repair. Priced after looking at the fault.",
      inputFields: REPAIR_FIELDS,
      pricingModel: "QUOTE_REQUIRED",
      priceAmount: null,
      priceUnit: null,
    },
  },
];

async function seedBusiness(db: Database, demo: DemoBusiness, now: Date): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, demo.slug))
    .limit(1);
  if (existing) return false;

  const [business] = await db
    .insert(businesses)
    .values({
      slug: demo.slug,
      name: demo.name,
      contactName: "Demo Operator",
      contactChannelType: "whatsapp",
      contactChannelValue: demo.contact,
      category: demo.category,
      city: demo.city,
      country: "Nigeria",
      payoutAddress: DEMO_ADDRESS,
      quoteCurrency: "NGN",
      consentAt: now,
      verifiedByOperatorAt: now,
      verifiedByOperatorLabel: "seed",
      status: "ACTIVE",
    })
    .returning();

  const [route] = await db
    .insert(quoteRoutes)
    .values({
      businessId: business.id,
      slug: demo.route.slug,
      name: demo.route.name,
      description: demo.route.description,
      inputSchema: [...demo.route.inputFields],
      queryFeeUsd: demo.queryFeeUsd.toFixed(4),
      responseSlaMinutes: demo.sla,
      quoteCurrency: "NGN",
      pricingModel: demo.route.pricingModel,
      priceAmount: demo.route.priceAmount?.toFixed(2) ?? null,
      priceUnit: demo.route.priceUnit,
      payoutAddress: DEMO_ADDRESS,
      endpoint: `/v1/${demo.slug}/${demo.route.slug}/quote`,
      status: "ACTIVE",
      verifiedAt: now,
      priceUpdatedAt: now,
      activationChecklist: {
        consentRecorded: true,
        contactChannelTested: true,
        publicAddressVerified: true,
        priceSourceDated: true,
        slaAgreed: true,
        sampleRequestTested: true,
      },
    })
    .returning();

  await db.insert(auditEvents).values({
    type: "seed.created",
    businessId: business.id,
    routeId: route.id,
    data: {
      note: "Synthetic development seed data.",
      pricingModel: demo.route.pricingModel,
      queryFeeUsd: demo.queryFeeUsd,
    },
  });

  console.log(
    `Seeded ${demo.slug} — ${demo.route.slug} (${demo.route.pricingModel}, $${demo.queryFeeUsd} query fee).`,
  );
  return true;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production.");
  }

  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      "db:seed only targets the local PGlite database. Do not seed a shared Postgres.",
    );
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? DEFAULT_PGLITE_DIR;
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const now = new Date();
  let seeded = 0;
  for (const demo of DEMO_BUSINESSES) {
    if (await seedBusiness(db, demo, now)) seeded += 1;
  }

  console.log(
    seeded === 0 ? "Seed already present. Nothing to do." : `Seeded ${seeded} demo business(es).`,
  );
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
