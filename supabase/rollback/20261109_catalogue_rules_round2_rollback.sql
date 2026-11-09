-- Rollback for supabase/migrations/20261109120040_catalogue_rules_round2.sql (client requests round 2, W3, ADR-0054).
-- Run as the database owner. Put the release before this change live first: the public pages of the new release read
-- businesses by an explicit column list that includes share_enabled, which this script drops.
--
-- DATA: dropping the column loses every company's Share choice (all Share buttons show again). No other data is touched.
-- Undone: the publish-needs-a-model triggers are removed (photo-only products can be published again), anon gets its
-- table-level select on businesses back (so the description is readable by the public API again), share_enabled is gone.

begin;

drop trigger if exists products_publish_requires_model_ins on public.products;
drop trigger if exists products_publish_requires_model_upd on public.products;
drop function if exists private.products_publish_model_check();
drop function if exists private.assert_publish_model(uuid);

-- Table-level select again (as init_schema.sql); the column grants it replaces go with it.
revoke select on public.businesses from anon;
grant select on public.businesses to anon;

-- Dropping the column also drops its column grants.
alter table public.businesses drop column share_enabled;

commit;
