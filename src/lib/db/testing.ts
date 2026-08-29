import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { MIGRATIONS_FOLDER, __setTestDatabase, type Database } from "./client";
import * as schema from "./schema";

/**
 * Build a fresh in-memory PostgreSQL (PGlite) for a test, run migrations, and
 * route `getDb()` at it. Call `close()` in an afterEach/afterAll.
 */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  __setTestDatabase(db);
  return {
    db,
    close: async () => {
      __setTestDatabase(null);
      await client.close();
    },
  };
}
