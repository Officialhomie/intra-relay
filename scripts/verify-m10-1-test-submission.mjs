#!/usr/bin/env node
// One-off, READ-ONLY check for the M10.1 live Tally verification. Confirms
// the real webhook delivery actually produced a correctly-mapped business,
// route, and pricing — not just a 200 response. No writes, no secrets echoed.
//
// Usage:
//   DATABASE_URL=<pulled from `vercel env pull`> node scripts/verify-m10-1-test-submission.mjs

import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

const { rows: submissions } = await client.query(
  `select id, status, tally_submission_id, normalized_data, issues, business_id, route_id, created_at, processed_at
   from onboarding_submissions
   where normalized_data->>'businessName' ilike 'M10.1 Test Printer%'
   order by created_at desc`,
);

if (submissions.length === 0) {
  console.log("No onboarding_submissions row found for 'M10.1 Test Printer%'.");
  await client.end();
  process.exit(0);
}

for (const s of submissions) {
  console.log("=== onboarding_submissions row ===");
  console.log(
    JSON.stringify(
      {
        id: s.id,
        status: s.status,
        tallySubmissionId: s.tally_submission_id,
        issues: s.issues,
        businessId: s.business_id,
        routeId: s.route_id,
        receivedAt: s.created_at,
        processedAt: s.processed_at,
        normalizedData: s.normalized_data,
      },
      null,
      2,
    ),
  );

  if (s.business_id) {
    const { rows: businesses } = await client.query(
      `select id, slug, name, contact_name, contact_channel_type, contact_channel_value,
              category, city, country, payout_address, quote_currency, status, consent_at
       from businesses where id = $1`,
      [s.business_id],
    );
    console.log("=== linked businesses row ===");
    console.log(JSON.stringify(businesses[0] ?? null, null, 2));
  }

  if (s.route_id) {
    const { rows: routes } = await client.query(
      `select id, business_id, slug, name, pricing_model, price_amount, price_unit,
              payout_address, status, created_at
       from quote_routes where id = $1`,
      [s.route_id],
    );
    console.log("=== linked quote_routes row ===");
    console.log(JSON.stringify(routes[0] ?? null, null, 2));
  }
}

await client.end();
