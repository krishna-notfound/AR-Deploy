-- Rollback for supabase/migrations/20261026130000_ar_public_models.sql (public AR model copies). Run as the database
-- owner. Before running it, empty the ar-models bucket through the Storage API or dashboard (Storage > ar-models >
-- select all > Delete): hosted Storage does not let SQL delete objects, and a bucket with objects is kept here.
--
-- What it does: drops the public_url columns (the public copy URLs are lost; the uploads in product-media are
-- untouched), their triggers and trigger function, can_sync_ar_models, and the empty ar-models bucket.
-- Phone AR then uses the signed product-media URLs again (the client falls back when public_url is absent).

begin;

drop trigger if exists product_models_keep_public_url on public.product_models;
drop trigger if exists product_variant_models_keep_public_url on public.product_variant_models;
drop function if exists private.ar_models_keep_public_url();
drop function if exists public.can_sync_ar_models(uuid, uuid);
alter table public.product_models drop column if exists public_url;
alter table public.product_variant_models drop column if exists public_url;

-- The ar-models bucket, only when empty. Hosted Storage blocks direct deletes from its tables unless
-- storage.allow_delete_query is on (ignored where the setting does not exist, e.g. PGlite). If the delete is
-- still refused, the refusal is only a notice (the rest of this rollback commits): delete the empty bucket in
-- the dashboard then (Storage > ar-models > Delete bucket).
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
exception when others then
  null;
end;
$$;
do $$
begin
  delete from storage.buckets b
   where b.id = 'ar-models'
     and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
exception when others then
  raise notice 'ar-models bucket not deleted (%): delete it in the dashboard (Storage > ar-models > Delete bucket)', sqlerrm;
end;
$$;

commit;
