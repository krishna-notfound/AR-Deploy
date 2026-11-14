-- Rollback for supabase/migrations/20261114123438_recovery_code_restore.sql (ADR-0069): drops
-- public.service_restore_recovery_code. Run as the database owner, only with the owner's approval.
--
-- DATA: nothing is deleted or changed. The account-security function of this release calls the function only after a
-- failed recovery; without it that call fails quietly (logged) and a recovery code spent by a failed request stays spent,
-- as before this change.

begin;
drop function if exists public.service_restore_recovery_code(uuid, text);
commit;
