/**
 * Development seed data.
 *
 *   npm run db:seed
 *
 * Everything here is clearly synthetic (name prefixed "[DEMO SEED]", a burn
 * payout address) so it can never be mistaken for a real merchant (CLAUDE §4.1).
 * Refuses to run in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { getTemplateForCategory } from "@/features/routes/templates";

import { DEFAULT_PGLITE_DIR, MIGRATIONS_FOLDER } from "./client";
import { auditEvents, businesses, quoteRoutes } from "./schema";
import * as schema from "./schema";

const DEMO_ADDRESS = `0x${"0".repeat(39)}1`;

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

  const slug = "demo-seed-campus-prints";
  const [existing] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (existing) {
    console.log("Seed already present. Nothing to do.");
    await client.close();
    return;
  }

  const now = new Date();
  const [business] = await db
    .insert(businesses)
    .values({
      slug,
      name: "[DEMO SEED] Campus Prints",
      contactName: "Demo Operator",
      contactChannelType: "whatsapp",
      contactChannelValue: "+2340000000000",
      category: "printing",
      city: "Lagos",
      country: "Nigeria",
      payoutAddress: DEMO_ADDRESS,
      quoteCurrency: "NGN",
      consentAt: now,
      verifiedByOperatorAt: now,
      verifiedByOperatorLabel: "seed",
      status: "ACTIVE",
    })
    .returning();

  const template = getTemplateForCategory("printing");
  const [route] = await db
    .insert(quoteRoutes)
    .values({
      businessId: business.id,
      slug: template.id,
      name: template.name,
      description: template.description,
      inputSchema: [...template.inputFields],
      queryFeeUsd: template.queryFeeUsd.toFixed(4),
      responseSlaMinutes: template.responseSlaMinutes,
      quoteCurrency: "NGN",
      payoutAddress: DEMO_ADDRESS,
      endpoint: `/v1/${slug}/${template.id}/quote`,
      status: "ACTIVE",
      verifiedAt: now,
    })
    .returning();

  await db.insert(auditEvents).values({
    type: "seed.created",
    businessId: business.id,
    routeId: route.id,
    data: { note: "Synthetic development seed data." },
  });

  console.log(`Seeded business ${business.slug} with ACTIVE route ${route.slug}.`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
