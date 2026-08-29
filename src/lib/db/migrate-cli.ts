/**
 * Apply pending migrations to the configured database.
 *
 *   npm run db:migrate
 *
 * With no `DATABASE_URL`, migrations run against the local PGlite data dir.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";

import { DEFAULT_PGLITE_DIR, MIGRATIONS_FOLDER } from "./client";
import * as schema from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;

  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.end();
    console.log("Migrations applied to Postgres.");
    return;
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? DEFAULT_PGLITE_DIR;
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await client.close();
  console.log(`Migrations applied to PGlite at ${dataDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
