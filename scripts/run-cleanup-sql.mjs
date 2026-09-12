#!/usr/bin/env node
// Runs scripts/cleanup-m10-1-test-businesses.sql against DATABASE_URL.
// Exists only because psql isn't installed locally — same `pg` dependency
// the other one-off scripts already use, nothing new.
//
// Usage:
//   DATABASE_URL=<pulled from `vercel env pull`> node scripts/run-cleanup-sql.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = readFileSync(new URL("./cleanup-m10-1-test-businesses.sql", import.meta.url), "utf8");

const client = new Client({ connectionString: url });
await client.connect();
await client.query(sql);
console.log("Cleanup complete.");
await client.end();
