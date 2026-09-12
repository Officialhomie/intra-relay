-- M10.1 live-test cleanup plan — NOT executed by any script or CI.
-- Reviewed manually, then run by hand (e.g. `psql "$DATABASE_URL" -f scripts/cleanup-m10-1-test-businesses.sql`)
-- only when you've decided to remove the two test businesses created during
-- the M10.1 live Tally verification (2026-09-11).
--
-- Inspected first (scripts/inspect-m10-1-test-businesses.mjs) — confirmed zero
-- blocking dependents: commitments, order_payments, tasks, quotes,
-- service_payments, notifications, push_subscriptions, and
-- notification_preferences all returned 0 rows for these two businesses.
-- Both routes are DRAFT and were never buyer-facing.
--
-- Target rows (exact ids, from the live inspection):
--   businesses:            c120e2f4-6aa9-4606-9da7-50c5ebb611bf ("M10.1 Test Printer")
--                           f9ee2815-8912-4c89-93dc-2cd2207f9199 ("M10.1 Test Printer 2")
--   quote_routes:           10180024-96c3-48b0-84a8-a93c842f4f2b
--                           7a302613-36f0-4373-afb1-d8e835da3195
--   onboarding_submissions: 1959e6ff-9446-470b-9922-24f4c4100b23
--                           e254544d-54b4-41ff-a954-5d3aeb331cf1
--
-- Order matters: onboarding_submissions.business_id / .route_id are FKs with
-- NO ACTION (RESTRICT) — deleting businesses/quote_routes first will fail
-- with a foreign key violation. onboarding_submissions must go first.
-- quote_routes.business_id is ON DELETE CASCADE, so deleting the businesses
-- row removes its route automatically — no separate DELETE for quote_routes
-- is needed (included below anyway, commented out, for anyone who wants an
-- explicit step instead of relying on the cascade).

begin;

-- 1. Required: the row(s) that would otherwise block the business delete.
delete from onboarding_submissions
where id in (
  '1959e6ff-9446-470b-9922-24f4c4100b23',
  'e254544d-54b4-41ff-a954-5d3aeb331cf1'
);

-- 2. Required: the businesses themselves. Cascades to quote_routes,
--    commitments, and order_payments (all confirmed empty for these two).
delete from businesses
where id in (
  'c120e2f4-6aa9-4606-9da7-50c5ebb611bf',
  'f9ee2815-8912-4c89-93dc-2cd2207f9199'
);

-- Explicit equivalent of the cascade in step 2, if you'd rather not rely on
-- ON DELETE CASCADE (harmless no-op after step 2 already removed them):
-- delete from quote_routes
-- where id in (
--   '10180024-96c3-48b0-84a8-a93c842f4f2b',
--   '7a302613-36f0-4373-afb1-d8e835da3195'
-- );

commit;

-- ---------------------------------------------------------------------------
-- OPTIONAL — audit_events for these two businesses/routes.
-- ---------------------------------------------------------------------------
-- audit_events.business_id / .route_id are plain columns with NO foreign key
-- (by design — an append-only audit trail; see schema.ts). Steps 1-2 above
-- succeed with or without this: these rows are not a blocker, they just
-- become orphaned references to businesses that no longer exist.
--
-- Trade-off worth deciding on purpose, not by default: an audit trail is
-- normally kept even after the entity it describes is gone (that's the point
-- of an audit trail). Only run this if you specifically want zero trace of
-- the test businesses left anywhere, including the operational log.
--
-- begin;
-- delete from audit_events
-- where business_id in (
--   'c120e2f4-6aa9-4606-9da7-50c5ebb611bf',
--   'f9ee2815-8912-4c89-93dc-2cd2207f9199'
-- )
-- or route_id in (
--   '10180024-96c3-48b0-84a8-a93c842f4f2b',
--   '7a302613-36f0-4373-afb1-d8e835da3195'
-- );
-- commit;
