-- QA round of 2026-11-14, group database-rules (ADR-0072): database rules that only the browser or a convention enforced.
--
--   1. RLS-05  private.platform_invites gets row level security (no policies): the other seven private tables already had it.
--   2. DB-F4   indexes on eight foreign keys to auth.users (deleting a user scans these columns for "on delete set null").
--   3. F-TI-2  cancel_model_request: "not found" is raised with P0001 (PostgREST answers 400) instead of P0002 (answers 500).
--              The message key (model_request_not_found) is unchanged, so the client mapping is unchanged.
--   4. BL-3    a published product cannot lose its last GLB (publish_needs_model, checked at commit like the publish rule).
--              Products already published WITHOUT a GLB are untouched (ADR-0054, owner 2026-11-09): nothing fires for them.
--   5. BL-4    localized text (products name, short_description, description, material, cta_label; options name): en must
--              be a string, pt absent or a string. A JSON null or a number can no longer be stored.
--   6. BL-6    private.unique_business_slug takes a transaction-level advisory lock, so two approvals at the same time cannot
--              pick the same slug (the second waits for the first to commit, then sees its row and takes the next suffix).
--   7. RLS-04  push_subscriptions: an insert trigger keeps the newest 10 devices per user, so a direct INSERT cannot bypass
--              the cap that register_push_subscription already applied.
--   8. FV-06   products.category and products.currency: a NEW value must be an active category and an enabled currency.
--              A product that already has a hidden category or a disabled currency keeps it (ADR-0055); only a change is checked.
--   9. FV-07   rules the browser had alone: business description 1000 characters (the editor's limit), contact e-mail shape,
--              website and CTA URL need a host, and the Website Editor's social links must be on the network's own domain.
--
-- RLS-03 (the internal company description readable by every signed-in user) is NOT changed here: ADR-0054 accepted it, and
-- closing it needs a design decision (see docs/qa/2026-11-14-database-rules.md).
--
-- Storage buckets and storage.objects policies are not touched (another change owns them). No data is deleted or rewritten.
-- The new CHECK constraints are NOT VALID: they hold every new and changed row, and existing rows are not scanned. Before
-- validating them later, find rows that would fail, for example:
--   select id from public.products where jsonb_typeof(name -> 'en') is distinct from 'string' or (name ? 'pt' and jsonb_typeof(name -> 'pt') <> 'string');
--   select id from public.businesses where char_length(btrim(description)) > 1000 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
-- Nothing is applied by this file being in the repo: it needs the owner's go-ahead.
-- Rollback: supabase/rollback/20261114_qa_database_rules_rollback.sql.
-- Tested: supabase/tests/qaDatabaseRules.test.ts (PGlite, every migration applied in order).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. RLS-05: private.platform_invites
-- ---------------------------------------------------------------------------------------------------------------------
-- No policies on purpose: the API roles have no grant on the table either; the SECURITY DEFINER functions (table owner) and
-- the service role (bypassrls) are unaffected. This is defence in depth, as on the other private tables.
alter table private.platform_invites enable row level security;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. DB-F4: foreign keys to auth.users without an index
-- ---------------------------------------------------------------------------------------------------------------------
create index platform_members_invited_by_idx on public.platform_members (invited_by);
create index platform_settings_updated_by_idx on public.platform_settings (updated_by);
create index model_requests_requested_by_idx on public.model_requests (requested_by);
create index model_requests_handled_by_idx on public.model_requests (handled_by);
create index model_request_files_uploaded_by_idx on public.model_request_files (uploaded_by);
create index platform_invites_created_by_idx on private.platform_invites (created_by);
create index platform_invites_revoked_by_idx on private.platform_invites (revoked_by);
create index owner_invite_attempts_actor_idx on private.owner_invite_attempts (actor);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. F-TI-2: cancel_model_request answers 4xx for an unknown or another business's request
-- ---------------------------------------------------------------------------------------------------------------------
-- Body of 20261026120000_s4_model_requests.sql (its only definition); only the errcode of the first exception changes.
-- PostgREST maps P0001 to 400 and the P0 class otherwise to 500. The lists use the same convention (category_not_found, P0001).
create or replace function public.cancel_model_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.model_requests%rowtype;
  v_paths text[];
begin
  select * into v_req from public.model_requests r where r.id = p_request for update;
  if not found or not exists (select 1 from public.business_members m
                               where m.business_id = v_req.business_id and m.user_id = (select auth.uid())) then
    raise exception 'model_request_not_found' using errcode = 'P0001';
  end if;
  perform private.require_business_member(v_req.business_id);
  if v_req.status <> 'requested' then
    raise exception 'model_request_not_cancellable' using errcode = 'P0001';
  end if;
  update public.model_requests set status = 'cancelled', closed_at = now() where id = p_request;
  select coalesce(array_agg(p.storage_path order by p.sort_order), '{}') into v_paths
    from public.model_request_photos p where p.request_id = p_request;
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values ('model_request_cancelled', (select auth.uid()), v_req.business_id,
          jsonb_build_object('request_id', p_request, 'product_id', v_req.product_id, 'variant_id', v_req.variant_id));
  return jsonb_build_object('status', 'cancelled', 'photo_paths', to_jsonb(v_paths));
end;
$$;
revoke execute on function public.cancel_model_request(uuid) from public, anon;
grant execute on function public.cancel_model_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. BL-3: a published product keeps its GLB
-- ---------------------------------------------------------------------------------------------------------------------
-- Same function as the publish rule (private.assert_publish_model: published and no glb row left -> publish_needs_model),
-- fired when a glb row is deleted, or changed to another format or product. Deferred to commit because save_product deletes
-- and re-inserts the model rows in one transaction (a replaced GLB leaves one behind). Deleting the product (cascade) or
-- unpublishing it in the same transaction passes: at commit the product is gone or no longer published. A product that was
-- published without any GLB has no glb row to remove, so it is never affected.
create function private.product_models_keep_glb_check()
returns trigger
language plpgsql
security definer -- callers have no access to the private schema
set search_path = ''
as $$
begin
  perform private.assert_publish_model(old.product_id);
  return null;
end;
$$;
revoke all on function private.product_models_keep_glb_check() from public;

create constraint trigger product_models_published_keeps_glb_del
  after delete on public.product_models
  deferrable initially deferred
  for each row when (old.format = 'glb')
  execute function private.product_models_keep_glb_check();

create constraint trigger product_models_published_keeps_glb_upd
  after update of format, product_id on public.product_models
  deferrable initially deferred
  for each row when (old.format = 'glb' and (new.format is distinct from old.format or new.product_id is distinct from old.product_id))
  execute function private.product_models_keep_glb_check();

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. BL-4: localized text must be text
-- ---------------------------------------------------------------------------------------------------------------------
-- The earlier checks only required an object with an "en" key, so {"en": null} or {"en": 5, "pt": []} was accepted and the
-- public pages (localized()) then received a non-string. Inline expressions (no helper function): a CHECK runs as the caller,
-- who has no access to the private schema.
alter table public.products
  add constraint products_name_strings check (coalesce(jsonb_typeof(name -> 'en') = 'string' and (not name ? 'pt' or jsonb_typeof(name -> 'pt') = 'string'), false)) not valid,
  add constraint products_short_description_strings check (coalesce(jsonb_typeof(short_description -> 'en') = 'string' and (not short_description ? 'pt' or jsonb_typeof(short_description -> 'pt') = 'string'), false)) not valid,
  add constraint products_description_strings check (coalesce(jsonb_typeof(description -> 'en') = 'string' and (not description ? 'pt' or jsonb_typeof(description -> 'pt') = 'string'), false)) not valid,
  add constraint products_material_strings check (coalesce(jsonb_typeof(material -> 'en') = 'string' and (not material ? 'pt' or jsonb_typeof(material -> 'pt') = 'string'), false)) not valid,
  add constraint products_cta_label_strings check (coalesce(jsonb_typeof(cta_label -> 'en') = 'string' and (not cta_label ? 'pt' or jsonb_typeof(cta_label -> 'pt') = 'string'), false)) not valid;
alter table public.product_variants
  add constraint product_variants_name_strings check (coalesce(jsonb_typeof(name -> 'en') = 'string' and (not name ? 'pt' or jsonb_typeof(name -> 'pt') = 'string'), false)) not valid;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. BL-6: two approvals at the same time cannot pick the same slug
-- ---------------------------------------------------------------------------------------------------------------------
-- unique_business_slug looked for a free slug and the caller inserted the row later, so two transactions could both see
-- "free". Both approval paths call it inside the transaction that inserts the business, so a transaction-level advisory lock
-- (released at commit or rollback) makes the second one wait and then see the first one's row. Patched in place from the
-- function's current definition (the unicode translate table is not repeated here).
do $$
declare
  v_def text := pg_get_functiondef('private.unique_business_slug(text)'::regprocedure);
  v_old constant text := E'  v_base := lower(translate(btrim(p_name),';
  v_new constant text := E'  perform pg_advisory_xact_lock(hashtext(''private.unique_business_slug''));\n  v_base := lower(translate(btrim(p_name),';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'private.unique_business_slug has an unexpected body; not patched';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. RLS-04: the 10-device cap holds for a direct insert too
-- ---------------------------------------------------------------------------------------------------------------------
-- Same rule as register_push_subscription ("the oldest are dropped"), now in the table: after each insert only 10 rows of
-- that user stay, the row just inserted first and then the newest others. A multi-row insert is capped too: each row's
-- trigger keeps exactly 10 (it never deletes below 10, even when an earlier trigger already removed its own row).
create function private.push_subscriptions_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions s
   where s.id in (select o.id from public.push_subscriptions o
                   where o.user_id = new.user_id
                   order by (o.id = new.id) desc, o.created_at desc, o.id offset 10);
  return null;
end;
$$;
revoke all on function private.push_subscriptions_cap() from public;

create trigger push_subscriptions_cap
  after insert on public.push_subscriptions
  for each row execute function private.push_subscriptions_cap();

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. FV-06: a new category must be active, a new currency enabled
-- ---------------------------------------------------------------------------------------------------------------------
-- The product editor only offers active categories and enabled currencies (plus the product's own current value, ADR-0055),
-- but the API did not check. Here an insert, or an update that CHANGES the value, to a hidden category or a disabled
-- currency is refused (category_hidden, currency_disabled). An unchanged value is never checked, so a product that kept
-- a value which was hidden or disabled later can still be saved. The foreign keys still refuse an unknown value. A rename of
-- a category slug or currency code reaches the products through the foreign key's own update (trigger depth above 1): skipped.
create function private.products_list_values_check()
returns trigger
language plpgsql
security definer -- reads the two lists whatever the caller's grants
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  -- The lists exist from 20261109120000_managed_lists.sql; the to_regclass guards keep this trigger harmless if that
  -- migration is ever rolled back on its own (its rollback drops the tables).
  if to_regclass('public.product_categories') is not null then
    if (tg_op = 'INSERT' or new.category is distinct from old.category)
       and exists (select 1 from public.product_categories c where c.slug = new.category and not c.active) then
      raise exception 'category_hidden' using errcode = 'check_violation';
    end if;
  end if;
  if to_regclass('public.currencies') is not null then
    if (tg_op = 'INSERT' or new.currency is distinct from old.currency)
       and exists (select 1 from public.currencies c where c.code = new.currency and not c.enabled) then
      raise exception 'currency_disabled' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.products_list_values_check() from public;

create trigger products_list_values_check
  before insert or update of category, currency on public.products
  for each row execute function private.products_list_values_check();

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. FV-07: form rules the browser had alone
-- ---------------------------------------------------------------------------------------------------------------------
-- The same rules as src/services/validation.ts: description 1000 characters (trimmed; the table kept a looser 5000), e-mail
-- shape /^[^\s@]+@[^\s@]+\.[^\s@]+$/, and an http(s) URL with a host (isHttpUrl: new URL() throws without one).
alter table public.businesses
  add constraint businesses_description_len check (char_length(btrim(description)) <= 1000) not valid,
  add constraint businesses_contact_email_shape check (contact_email is null or contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid,
  add constraint businesses_contact_website_host check (contact_website is null or contact_website ~* '^https?://[^/?#[:space:]]+') not valid;
alter table public.products
  add constraint products_cta_url_host check (cta_url is null or cta_url ~* '^https?://[^/?#[:space:]]+') not valid;

-- Website Editor social links (src/domain/siteContent.ts checkSocialUrl): https, no spaces, 300 characters or fewer, no user
-- info and no port, and the host is the network's own domain or one of its subdomains. A network this function does not
-- know is not judged here (the editor lists the six).
create function private.social_url_ok(p_network text, p_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_domains text[];
  v_host    text;
  v_d       text;
begin
  if p_url is null or char_length(p_url) > 300 or p_url ~ '[[:space:]]' then
    return false;
  end if;
  v_domains := case p_network
    when 'instagram' then array['instagram.com']
    when 'facebook'  then array['facebook.com', 'fb.com']
    when 'linkedin'  then array['linkedin.com']
    when 'youtube'   then array['youtube.com', 'youtu.be']
    when 'tiktok'    then array['tiktok.com']
    when 'pinterest' then array['pinterest.com', 'pinterest.pt']
  end;
  if v_domains is null then
    return true;
  end if;
  v_host := lower(substring(p_url from '^https://([^/?#@:]+)(?:[/?#]|$)'));
  if v_host is null then
    return false;
  end if;
  foreach v_d in array v_domains loop
    if v_host = v_d or v_host like '%.' || v_d then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke execute on function private.social_url_ok(text, text) from public, anon, authenticated;

-- The publish gate and the draft check call it. Patched in place from the current private.validate_site_content, so this
-- migration does not depend on which migration last defined it.
do $$
declare
  v_def text := pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure);
  v_old constant text := E'(r.value #>> ''{}'') !~ ''^https://'' then';
  v_new constant text := E'(r.value #>> ''{}'') !~ ''^https://'' or not private.social_url_ok(r.key, r.value #>> ''{}'') then';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'private.validate_site_content: the social link check was not found; not patched';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;
