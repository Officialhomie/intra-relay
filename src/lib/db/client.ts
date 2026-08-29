import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";

/**
 * Database access.
 *
 * - Local dev / tests: embedded PostgreSQL via PGlite (no server to run).
 * - Production: a real PostgreSQL server via `DATABASE_URL` (node-postgres).
 *
 * The query API is identical across drivers, so repositories are written once
 * against `Database`.
 */
export type Database = PgliteDatabase<typeof schema>;

/** Resolved from the project root (process cwd) so bundlers do not treat it as an asset. */
export const MIGRATIONS_FOLDER = join(process.cwd(), "drizzle");
export const DEFAULT_PGLITE_DIR = join(process.cwd(), ".pglite");

let cached: Promise<Database> | null = null;
let override: Database | null = null;

function isPostgresUrl(value: string | undefined): value is string {
  return !!value && /^postgres(ql)?:\/\//.test(value);
}

async function createFromEnv(): Promise<Database> {
  const url = process.env.DATABASE_URL;

  if (isPostgresUrl(url)) {
    // Production / shared Postgres. Migrations are applied by `npm run db:migrate`
    // in the deploy pipeline, never implicitly at request time.
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    return drizzle(pool, { schema }) as unknown as Database;
  }

  // Dev default: file-backed PGlite so data survives a restart.
  const dataDir = process.env.PGLITE_DATA_DIR ?? DEFAULT_PGLITE_DIR;
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Memoised database handle. */
export function getDb(): Promise<Database> {
  if (override) return Promise.resolve(override);
  if (!cached) cached = createFromEnv();
  return cached;
}

/** Test hook: point `getDb()` at an isolated database. */
export function __setTestDatabase(db: Database | null): void {
  override = db;
}

export { schema };
