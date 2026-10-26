-- Rollback for the S2 migration supabase/migrations/20261026075614_s2_business_logic.sql
-- (plan: docs/superpowers/plans/2026-10-26-s2-business-logic.md). Run as the database owner, BEFORE
-- 20261026_business_logic_fixes_rollback.sql.
--
-- What it does: restores the S1.5 body of admin_review_application (the description cap goes back to 5000), with
-- its grants. It drops nothing and loses no data.
--
-- Sections run newest task first. Each task inserts its section directly below the `begin;` line, in this format:
--   -- =============================================================================
--   -- S2 Task N rollback: <title> (R-Wn-k, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S2 Task N rollback ----

begin;

commit;
