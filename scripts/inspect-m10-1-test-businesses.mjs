#!/usr/bin/env node
// One-off, READ-ONLY inspection of the two M10.1 live-test businesses, ahead
// of a manual cleanup decision. Reports exact ids and checks every table
// that could hold a dependent record, so the cleanup plan isn't guessing at
// what's safe to delete. No writes.
//
// Usage:
//   DATABASE_URL=<pulled from `vercel env pull`> node scripts/inspect-m10-1-test-businesses.mjs

import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

const { rows: businesses } = await client.query(
  `select id, slug, name, status, created_at from businesses where name like 'M10.1 Test Printer%' order by created_at`,
);

if (businesses.length === 0) {
  console.log("No 'M10.1 Test Printer%' businesses found.");
  await client.end();
  process.exit(0);
}

const businessIds = businesses.map((b) => b.id);
console.log("=== businesses ===");
console.log(JSON.stringify(businesses, null, 2));

const { rows: routes } = await client.query(
  `select id, business_id, slug, status, created_at from quote_routes where business_id = any($1)`,
  [businessIds],
);
console.log("=== quote_routes ===");
console.log(JSON.stringify(routes, null, 2));
const routeIds = routes.map((r) => r.id);

const { rows: submissions } = await client.query(
  `select id, status, tally_submission_id, business_id, route_id from onboarding_submissions where business_id = any($1)`,
  [businessIds],
);
console.log("=== onboarding_submissions ===");
console.log(JSON.stringify(submissions, null, 2));

// Every other table that references businesses/quote_routes (schema.ts) or
// could reference a business by an opaque recipient key.
const checks = [
  { table: "commitments", col: "business_id", ids: businessIds },
  { table: "order_payments", col: "business_id", ids: businessIds },
  { table: "tasks", col: "route_id", ids: routeIds },
  { table: "quotes", col: "route_id", ids: routeIds },
  { table: "service_payments", col: "route_id", ids: routeIds },
  { table: "audit_events", col: "business_id", ids: businessIds },
  { table: "audit_events", col: "route_id", ids: routeIds },
];

console.log("=== dependent-record checks (expect 0 for all except audit_events) ===");
for (const { table, col, ids } of checks) {
  if (ids.length === 0) {
    console.log(`${table}.${col}: skipped (no ids to check)`);
    continue;
  }
  const { rows } = await client.query(
    `select count(*)::int as n from ${table} where ${col} = any($1)`,
    [ids],
  );
  console.log(`${table}.${col}: ${rows[0].n}`);
}

const { rows: notifs } = await client.query(
  `select count(*)::int as n from notifications where audience = 'BUSINESS' and recipient_key = any($1)`,
  [businessIds],
);
console.log(`notifications (recipientKey match): ${notifs[0].n}`);

const { rows: pushSubs } = await client.query(
  `select count(*)::int as n from push_subscriptions where audience = 'BUSINESS' and recipient_key = any($1)`,
  [businessIds],
);
console.log(`push_subscriptions (recipientKey match): ${pushSubs[0].n}`);

const { rows: prefs } = await client.query(
  `select count(*)::int as n from notification_preferences where audience = 'BUSINESS' and recipient_key = any($1)`,
  [businessIds],
);
console.log(`notification_preferences (recipientKey match): ${prefs[0].n}`);

await client.end();
