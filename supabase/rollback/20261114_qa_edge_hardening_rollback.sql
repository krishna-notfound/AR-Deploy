-- Rollback for supabase/migrations/20261114123842_qa_edge_hardening.sql (QA 2026-11-14, EF-3 and EF-4). Run as the database
-- owner, only with the owner's approval.
--
-- DATA: the claim table is dropped with its rows (they only say "the decision email of this rejection was claimed"; nothing
-- else reads them). push_subscriptions keeps every row. Redeploy review-application of the release before this change
-- first, or it would call a function that no longer exists (it then still sends the email, and logs the failed claim).

begin;
drop function if exists public.service_claim_decision_email(uuid);
drop table if exists private.application_decision_emails;
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_host_check;
commit;
