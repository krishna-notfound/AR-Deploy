-- Content Editor (ADR-0043; spec docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md,
-- sections 4, 5 and 10): the 17th platform permission content.manage, the one-row site_content document (draft +
-- published) with its version history, the RPCs that are the only way to read or write it, the SQL gate
-- private.validate_apply_form, and the loosened business_applications columns the form builder needs.
-- Rollback: supabase/rollback/20261029_site_content_rollback.sql
-- Tests: supabase/tests/siteContent.test.ts (PGlite).
-- NOT APPLIED to any project. Apply only with the owner's go-ahead (ADR-0042), then `npm run db:types`.
--
-- SQL rules as in S4: RLS on every new table (revoke all from public, anon, authenticated, then explicit grants); every new
-- function security definer with `set search_path = ''`, execute revoked from public and anon and granted explicitly;
-- private functions revoked from public, anon and authenticated. Refusals raise '<key>': aal2_required and forbidden
-- (42501), draft_conflict and version_not_found (P0001), invalid_content (22023, detail '<document path>|<error key>').

-- PRE-FLIGHT (site_content) BEGIN
-- Read-only; run before this migration.
-- -- The stored Admin and Team sets (Admin gains content.manage; Team is unchanged).
-- select role::text, array_agg(permission order by permission) as permissions
--   from public.platform_role_permissions group by role order by role;
-- -- No site_content tables yet.
-- select to_regclass('public.site_content'), to_regclass('public.site_content_versions');
-- -- Largest stored application answers (the new limit is 65,536 bytes, so nothing existing is affected).
-- select max(pg_column_size(answers)) from public.business_applications;
-- PRE-FLIGHT (site_content) END

-- =============================================================================
-- 1. content.manage: the 17th permission (spec section 4)
-- =============================================================================
-- Same position in ALL_PERMISSIONS (src/domain/permissions.ts), _shared/team.ts and v_known below.
alter table public.platform_role_permissions
  drop constraint platform_role_permissions_permission_check,
  add constraint platform_role_permissions_permission_check check (permission in (
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage',
    'analytics.view', 'records.view', 'access.view', 'content.manage'));

-- private.permission_prerequisites() gets no row: content.manage needs no other permission.

-- Body from S4 Task 1; the Owner's fixed list has 17 keys.
create or replace function public.my_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.platform_admins where user_id = (select auth.uid())) then
      jsonb_build_object('role', 'owner', 'permissions', to_jsonb(array[
        'access.view', 'analytics.view', 'applications.approve', 'applications.reject', 'applications.view',
        'businesses.delete', 'businesses.edit', 'businesses.status', 'businesses.view', 'content.manage', 'models.manage',
        'owners.manage', 'products.delete', 'products.edit', 'products.publish', 'products.view', 'records.view']))
    else (
      select case m.status
        when 'active' then jsonb_build_object('role', m.role::text, 'permissions',
          (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
             from public.platform_role_permissions rp where rp.role = m.role))
        when 'deactivated' then jsonb_build_object('role', null, 'permissions', '[]'::jsonb, 'status', 'deactivated')
      end
      from public.platform_members m
      where m.user_id = (select auth.uid()))
  end;
$$;
revoke execute on function public.my_platform_access() from public, anon;
grant execute on function public.my_platform_access() to authenticated, service_role;

-- Body from S4 Task 1; v_known gains content.manage (last, the dashboard order). Without it the Owner could not give
-- the key to a role.
create or replace function public.admin_set_role_permissions(p_role public.platform_role, p_permissions text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_known constant text[] := array[
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage',
    'analytics.view', 'records.view', 'access.view', 'content.manage'];
  v_asked text[] := array(select distinct unnest(coalesce(p_permissions, '{}')) order by 1);
  v_new text[];
  v_implied text[];
  v_old text[];
  v_added text[];
  v_removed text[];
begin
  if not private.owner_or_deny('set_role_permissions') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not (v_asked <@ v_known) then
    return jsonb_build_object('error', 'unknown_permission');
  end if;
  v_new := private.with_prerequisites(v_asked);
  v_implied := array(select p from unnest(v_new) p where p <> all (v_asked) order by array_position(v_known, p));
  v_old := array(select permission from public.platform_role_permissions where role = p_role order by 1);
  v_added := array(select unnest(v_new) except select unnest(v_old) order by 1);
  v_removed := array(select unnest(v_old) except select unnest(v_new) order by 1);
  if cardinality(v_added) = 0 and cardinality(v_removed) = 0 then
    return jsonb_build_object('ok', true, 'added', to_jsonb(v_implied));
  end if;
  delete from public.platform_role_permissions where role = p_role and permission = any (v_removed);
  insert into public.platform_role_permissions (role, permission) select p_role, unnest(v_added);
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_permissions_changed', (select auth.uid()),
          jsonb_build_object('role', p_role::text, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  return jsonb_build_object('ok', true, 'added', to_jsonb(v_implied));
end;
$$;
revoke execute on function public.admin_set_role_permissions(public.platform_role, text[]) from public, anon;
grant execute on function public.admin_set_role_permissions(public.platform_role, text[]) to authenticated, service_role;

-- Backfill: the stored Admin set gains content.manage, by the system, with one access_permissions_changed row (as S4
-- did for models.manage). Team's set is not changed.
do $$
declare
  v_old text[] := array(select permission from public.platform_role_permissions where role = 'admin' order by 1);
  v_added text[];
begin
  v_added := array(select unnest(private.with_prerequisites(v_old || 'content.manage'::text))
                   except select unnest(v_old) order by 1);
  if cardinality(v_added) > 0 then
    insert into public.platform_role_permissions (role, permission) select 'admin', unnest(v_added);
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('access_permissions_changed', null,
            jsonb_build_object('role', 'admin', 'added', to_jsonb(v_added), 'removed', '[]'::jsonb,
                               'reason', 'content_editor_backfill'));
  end if;
end;
$$;

-- The one gate every Editor function starts with, like private.require_models_manage(): the 2FA step is checked first
-- (aal2_required, 42501), then the permission (forbidden, 42501).
create function private.require_content_manage()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.caller_mfa_satisfied() then
    raise exception 'aal2_required' using errcode = '42501';
  end if;
  if not public.platform_can('content.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_content_manage() from public, anon, authenticated;

-- =============================================================================
-- 2. Tables (spec section 5): no policies, no grants. All access goes through the functions below.
-- =============================================================================
create table public.site_content (
  id                boolean primary key default true check (id),        -- exactly one row
  draft             jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_updated_at  timestamptz not null default now(),
  draft_updated_by  uuid references auth.users on delete set null,
  published         jsonb check (published is null or (jsonb_typeof(published) = 'object' and octet_length(published::text) <= 524288)),
  published_version integer not null default 0,
  published_at      timestamptz,
  published_by      uuid references auth.users on delete set null
);
insert into public.site_content (id) values (true);

create table public.site_content_versions (
  version           integer primary key,
  content           jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 524288),
  published_at      timestamptz not null default now(),
  published_by      uuid references auth.users on delete set null,
  published_by_name text not null          -- display name at the time, so history survives account deletion
);

create index site_content_draft_updated_by_idx on public.site_content (draft_updated_by);
create index site_content_published_by_idx on public.site_content (published_by);
create index site_content_versions_published_by_idx on public.site_content_versions (published_by);

-- Supabase grants new tables to the API roles by default; take it all back. The draft shares its row with the
-- published text, so no column grant or policy is trusted: the public never touches the tables. service_role keeps
-- select (the submit-application Edge Function reads `published`).
alter table public.site_content enable row level security;
alter table public.site_content_versions enable row level security;
revoke all on public.site_content from public, anon, authenticated, service_role;
revoke all on public.site_content_versions from public, anon, authenticated, service_role;
grant select on public.site_content to service_role;
grant select on public.site_content_versions to service_role;

-- =============================================================================
-- 3. Validation (spec sections 5 and 10)
-- =============================================================================
-- The SQL gate for the application form. Returns null when the form is valid, else '<path>|<error key>' (the first
-- problem; the paths and keys are those of validateApplyForm in supabase/functions/_shared/applyForm.ts). Called by
-- publish through private.validate_site_content. Checks only what protects the live site; lengths and {token} sets are
-- the editor's job.
create function private.validate_apply_form(p jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_builtin constant text[] := array['businessName', 'website', 'category', 'description', 'country', 'city',
    'applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language',
    'productCount', 'photoReadiness', 'modelReadiness', 'notes'];
  c_locked constant text[] := array['businessName', 'applicantName', 'applicantEmail'];
  c_types constant text[] := array['short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice'];
  c_step_keys constant text[] := array['business', 'location', 'contact', 'catalogue', 'review'];
  v_steps jsonb;
  v_questions jsonb;
  v_fields jsonb;
  v_hidden jsonb;
  v_texts jsonb;
  v_n integer;
  v_i integer;
  v_j integer;
  v_el jsonb;
  v_step_ids text[] := '{}';
  v_q_ids text[] := '{}';
  v_keys text[] := '{}';
  v_review_id text;
  v_all text[];
  v_vals text[];
  v_key text;
  r record;
  l text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'applyForm|invalid_value';
  end if;

  -- steps: 1 to 8, unique ids, exactly one review step and it is last
  v_steps := p -> 'steps';
  if jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) < 1 then
    return 'steps|required';
  end if;
  v_n := jsonb_array_length(v_steps);
  if v_n > 8 then
    return 'steps|too_many';
  end if;
  for v_i in 0 .. v_n - 1 loop
    v_el := v_steps -> v_i;
    if jsonb_typeof(v_el) is distinct from 'object' or jsonb_typeof(v_el -> 'id') is distinct from 'string' or (v_el ->> 'id') = '' then
      return format('steps.%s.id|required', v_i);
    end if;
    if (v_el ->> 'id') = any (v_step_ids) then
      return format('steps.%s.id|duplicate_id', v_i);
    end if;
    v_step_ids := v_step_ids || (v_el ->> 'id');
    if v_el ? 'builtin' and (jsonb_typeof(v_el -> 'builtin') is distinct from 'string' or (v_el ->> 'builtin') <> all (c_step_keys)) then
      return format('steps.%s.builtin|invalid_value', v_i);
    end if;
    if not (v_el ? 'builtin') and btrim(coalesce(v_el -> 'title' ->> 'en', '')) = '' then
      return format('steps.%s.title.en|required', v_i);
    end if;
  end loop;
  select count(*) into v_n from jsonb_array_elements(v_steps) e where e ->> 'builtin' = 'review';
  if v_n <> 1 or (v_steps -> (jsonb_array_length(v_steps) - 1)) ->> 'builtin' is distinct from 'review' then
    return 'steps|review_position';
  end if;
  select e ->> 'id' into v_review_id from jsonb_array_elements(v_steps) e where e ->> 'builtin' = 'review';

  -- customQuestions: at most 10, unique ids, known type, 2 to 10 options for the choice types and none for the others
  v_questions := coalesce(p -> 'customQuestions', '[]'::jsonb);
  if jsonb_typeof(v_questions) <> 'array' then
    return 'customQuestions|invalid_value';
  end if;
  if jsonb_array_length(v_questions) > 10 then
    return 'customQuestions|too_many';
  end if;
  for v_i in 0 .. jsonb_array_length(v_questions) - 1 loop
    v_el := v_questions -> v_i;
    if jsonb_typeof(v_el) is distinct from 'object' or jsonb_typeof(v_el -> 'id') is distinct from 'string' or (v_el ->> 'id') = '' then
      return format('customQuestions.%s.id|required', v_i);
    end if;
    if (v_el ->> 'id') = any (v_q_ids) then
      return format('customQuestions.%s.id|duplicate_id', v_i);
    end if;
    v_q_ids := v_q_ids || (v_el ->> 'id');
    if jsonb_typeof(v_el -> 'type') is distinct from 'string' or (v_el ->> 'type') <> all (c_types) then
      return format('customQuestions.%s.type|invalid_value', v_i);
    end if;
    if btrim(coalesce(v_el -> 'label' ->> 'en', '')) = '' then
      return format('customQuestions.%s.label.en|required', v_i);
    end if;
    if (v_el ->> 'type') in ('single_choice', 'multi_choice') then
      if jsonb_typeof(v_el -> 'options') is distinct from 'array'
         or jsonb_array_length(v_el -> 'options') not between 2 and 10 then
        return format('customQuestions.%s.options|options_count', v_i);
      end if;
      if (select count(distinct o ->> 'id') from jsonb_array_elements(v_el -> 'options') o where jsonb_typeof(o -> 'id') = 'string' and (o ->> 'id') <> '')
         <> jsonb_array_length(v_el -> 'options') then
        return format('customQuestions.%s.options|duplicate_id', v_i);
      end if;
    elsif jsonb_typeof(v_el -> 'options') = 'array' and jsonb_array_length(v_el -> 'options') > 0 then
      return format('customQuestions.%s.options|options_not_allowed', v_i);
    end if;
  end loop;

  -- fields: a known key once, on an existing step that is not Review, locked keys never hidden or optional
  v_fields := coalesce(p -> 'fields', '[]'::jsonb);
  if jsonb_typeof(v_fields) <> 'array' then
    return 'fields|invalid_value';
  end if;
  for v_i in 0 .. jsonb_array_length(v_fields) - 1 loop
    v_el := v_fields -> v_i;
    v_key := case when jsonb_typeof(v_el) = 'object' and jsonb_typeof(v_el -> 'key') = 'string' then v_el ->> 'key' end;
    if v_key is null or not (v_key = any (c_builtin) or (v_key like 'custom:%' and substr(v_key, 8) = any (v_q_ids))) then
      return format('fields.%s.key|unknown_key', v_i);
    end if;
    if v_key = any (v_keys) then
      return format('fields.%s.key|duplicate_key', v_i);
    end if;
    v_keys := v_keys || v_key;
    if jsonb_typeof(v_el -> 'stepId') is distinct from 'string' or (v_el ->> 'stepId') <> all (v_step_ids) then
      return format('fields.%s.stepId|step_unknown', v_i);
    end if;
    if (v_el ->> 'stepId') = v_review_id then
      return format('fields.%s.stepId|review_misplaced', v_i);
    end if;
    if v_key = any (c_locked) then
      if (v_el -> 'hidden') = 'true'::jsonb then
        return format('fields.%s.hidden|locked', v_i);
      end if;
      if (v_el -> 'required') = 'false'::jsonb then
        return format('fields.%s.required|locked', v_i);
      end if;
    end if;
  end loop;
  -- every question has a placement
  for v_i in 0 .. coalesce(array_length(v_q_ids, 1), 0) - 1 loop
    if ('custom:' || v_q_ids[v_i + 1]) <> all (v_keys) then
      return format('customQuestions.%s|missing_placement', v_i);
    end if;
  end loop;

  -- hiddenOptions: only the four choice fields, values from the fixed set, at least one option stays visible
  v_hidden := coalesce(p -> 'hiddenOptions', '{}'::jsonb);
  if jsonb_typeof(v_hidden) <> 'object' then
    return 'hiddenOptions|invalid_value';
  end if;
  for r in select key, value from jsonb_each(v_hidden) loop
    v_all := case r.key
      when 'category' then array['furniture', 'lighting', 'decor', 'fashion', 'jewellery', 'electronics', 'industrial', 'other']
      when 'productCount' then array['1-10', '11-50', '51-200', '200+']
      when 'photoReadiness' then array['all', 'some', 'none']
      when 'modelReadiness' then array['glb_usdz', 'some', 'none', 'need_help']
    end;
    if v_all is null or jsonb_typeof(r.value) <> 'array' then
      return 'hiddenOptions.' || r.key || '|invalid_value';
    end if;
    v_vals := array(select jsonb_array_elements_text(r.value));
    if not (v_vals <@ v_all) then
      return 'hiddenOptions.' || r.key || '|invalid_value';
    end if;
    if v_all <@ v_vals then
      return 'hiddenOptions.' || r.key || '|last_option';
    end if;
  end loop;

  -- texts: keys apply.*, each value 600 characters or fewer
  v_texts := coalesce(p -> 'texts', '{}'::jsonb);
  if jsonb_typeof(v_texts) <> 'object' then
    return 'texts|invalid_value';
  end if;
  for r in select key, value from jsonb_each(v_texts) loop
    if r.key !~ '^apply\.' then
      return 'texts.' || r.key || '|unknown_key';
    end if;
    if jsonb_typeof(r.value) <> 'object' then
      return 'texts.' || r.key || '|invalid_value';
    end if;
    foreach l in array array['en', 'pt'] loop
      if r.value ? l then
        if jsonb_typeof(r.value -> l) <> 'string' then
          return 'texts.' || r.key || '.' || l || '|invalid_value';
        end if;
        if char_length(r.value ->> l) > 600 then
          return 'texts.' || r.key || '.' || l || '|too_long';
        end if;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;
revoke execute on function private.validate_apply_form(jsonb) from public, anon, authenticated;

-- The size and shape every save is held to: an object, schema 1, 512 KB, and the array caps. Null when fine.
create function private.check_site_content_shape(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'document|invalid_value';
  end if;
  if p -> 'schema' is distinct from '1'::jsonb then
    return 'schema|invalid_value';
  end if;
  if octet_length(p::text) > 524288 then
    return 'document|too_long';
  end if;
  if p ? 'customPages' then
    if jsonb_typeof(p -> 'customPages') <> 'array' then return 'customPages|invalid_value'; end if;
    if jsonb_array_length(p -> 'customPages') > 20 then return 'customPages|too_many'; end if;
  end if;
  if p ? 'applyForm' then
    if jsonb_typeof(p -> 'applyForm') <> 'object' then return 'applyForm|invalid_value'; end if;
    if jsonb_typeof(p -> 'applyForm' -> 'steps') = 'array' and jsonb_array_length(p -> 'applyForm' -> 'steps') > 8 then
      return 'applyForm.steps|too_many';
    end if;
    if jsonb_typeof(p -> 'applyForm' -> 'customQuestions') = 'array' and jsonb_array_length(p -> 'applyForm' -> 'customQuestions') > 10 then
      return 'applyForm.customQuestions|too_many';
    end if;
    if jsonb_typeof(p -> 'applyForm' -> 'fields') = 'array' and jsonb_array_length(p -> 'applyForm' -> 'fields') > 40 then
      return 'applyForm.fields|too_many';
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.check_site_content_shape(jsonb) from public, anon, authenticated;

-- The publish gate: the shape, then the checks that protect the live site. Null when the document may be published.
-- Slugs: ^[a-z0-9]+(-[a-z0-9]+)*$, 60 characters or fewer, unique, not reserved. Social values start with https://.
-- Reserved slugs are the same list as RESERVED_PAGE_SLUGS in src/domain/siteContent.ts.
create function private.validate_site_content(p jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_reserved constant text[] := array['admin', 'api', 'apply', 'catalog', 'dashboard', 'demo', 'embed', 'login', 'pages', 'privacy', 'products', 'terms'];
  v_msg text;
  v_slugs text[] := '{}';
  v_slug text;
  v_i integer;
  v_el jsonb;
  r record;
begin
  v_msg := private.check_site_content_shape(p);
  if v_msg is not null then
    return v_msg;
  end if;
  for v_i in 0 .. coalesce(jsonb_array_length(p -> 'customPages'), 0) - 1 loop
    v_el := p -> 'customPages' -> v_i;
    v_slug := case when jsonb_typeof(v_el) = 'object' and jsonb_typeof(v_el -> 'slug') = 'string' then v_el ->> 'slug' end;
    if v_slug is null or v_slug = '' then
      return format('customPages.%s.slug|required', v_i);
    end if;
    if char_length(v_slug) > 60 then
      return format('customPages.%s.slug|too_long', v_i);
    end if;
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      return format('customPages.%s.slug|invalid_slug', v_i);
    end if;
    if v_slug = any (c_reserved) then
      return format('customPages.%s.slug|slug_reserved', v_i);
    end if;
    if v_slug = any (v_slugs) then
      return format('customPages.%s.slug|slug_duplicate', v_i);
    end if;
    v_slugs := v_slugs || v_slug;
  end loop;
  if p ? 'social' then
    if jsonb_typeof(p -> 'social') <> 'object' then
      return 'social|invalid_value';
    end if;
    for r in select key, value from jsonb_each(p -> 'social') loop
      if jsonb_typeof(r.value) <> 'string' or (r.value #>> '{}') !~ '^https://' then
        return 'social.' || r.key || '|invalid_url';
      end if;
    end loop;
  end if;
  if p ? 'applyForm' then
    v_msg := private.validate_apply_form(p -> 'applyForm');
    if v_msg is not null then
      return 'applyForm.' || v_msg;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.validate_site_content(jsonb) from public, anon, authenticated;

-- The name shown in the history, taken when a version is published: profile name, else the team name, else the email.
create function private.content_actor_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.user_id = p_user),
    (select nullif(btrim(m.full_name), '') from public.platform_members m where m.user_id = p_user),
    (select u.email from auth.users u where u.id = p_user),
    'Platform');
$$;
revoke execute on function private.content_actor_name(uuid) from public, anon, authenticated;

-- =============================================================================
-- 4. Public read (spec section 5): published parts only, never the draft
-- =============================================================================
-- p_part 'chrome' (footer pages: slug and title; social links), 'page' (one page by slug: terms, privacy or a custom
-- slug) or 'apply' (the application form config). Returns {version, content}; content is null when nothing is
-- published or the page does not exist. Reads only `published`.
create function public.get_published_site_content(p_part text, p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pub jsonb;
  v_version integer;
  v_content jsonb;
  v_page jsonb;
begin
  if p_part is null or p_part not in ('chrome', 'page', 'apply') then
    raise exception 'invalid_part' using errcode = '22023';
  end if;
  select sc.published, sc.published_version into v_pub, v_version from public.site_content sc where sc.id;
  if v_pub is null then
    return jsonb_build_object('version', 0, 'content', null);
  end if;
  if p_part = 'chrome' then
    v_content := jsonb_build_object(
      'footerPages', (
        select coalesce(jsonb_agg(jsonb_build_object('slug', pg ->> 'slug', 'title', pg -> 'title')
                          order by case when jsonb_typeof(pg -> 'order') = 'number' then (pg ->> 'order')::numeric else 0 end,
                                   pg -> 'title' ->> 'en'), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(v_pub -> 'customPages') = 'array' then v_pub -> 'customPages' else '[]'::jsonb end) pg
         where pg -> 'showInFooter' = 'true'::jsonb),
      'social', case when jsonb_typeof(v_pub -> 'social') = 'object' then v_pub -> 'social' else '{}'::jsonb end);
  elsif p_part = 'apply' then
    v_content := case when jsonb_typeof(v_pub -> 'applyForm') = 'object' then v_pub -> 'applyForm' end;
  else
    if p_slug is null or char_length(p_slug) > 60 then
      return jsonb_build_object('version', v_version, 'content', null);
    end if;
    if p_slug in ('terms', 'privacy') then
      v_content := jsonb_build_object('kind', 'builtin',
        'body', case when jsonb_typeof(v_pub -> 'builtinPages' -> p_slug) = 'object' then v_pub -> 'builtinPages' -> p_slug else '{}'::jsonb end);
    else
      select pg into v_page
        from jsonb_array_elements(case when jsonb_typeof(v_pub -> 'customPages') = 'array' then v_pub -> 'customPages' else '[]'::jsonb end) pg
       where pg ->> 'slug' = p_slug
       limit 1;
      if v_page is not null then
        v_content := jsonb_build_object('kind', 'custom', 'title', v_page -> 'title', 'body', v_page -> 'body');
      end if;
    end if;
  end if;
  return jsonb_build_object('version', v_version, 'content', v_content);
end;
$$;
revoke execute on function public.get_published_site_content(text, text) from public, anon;
grant execute on function public.get_published_site_content(text, text) to anon, authenticated, service_role;

-- =============================================================================
-- 5. Editor functions (content.manage + 2FA)
-- =============================================================================
create function public.admin_get_site_content()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.site_content%rowtype;
  v_name text;
begin
  perform private.require_content_manage();
  select * into r from public.site_content sc where sc.id;
  select v.published_by_name into v_name from public.site_content_versions v where v.version = r.published_version;
  return jsonb_build_object('draft', r.draft, 'draftUpdatedAt', r.draft_updated_at, 'published', r.published,
                            'version', r.published_version, 'publishedAt', r.published_at, 'publishedByName', v_name);
end;
$$;
revoke execute on function public.admin_get_site_content() from public, anon;
grant execute on function public.admin_get_site_content() to authenticated, service_role;

-- Writes the draft when draft_updated_at = p_base, else raises draft_conflict. Returns the new draft_updated_at.
create function public.admin_save_site_content_draft(p_content jsonb, p_base timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg text;
  v_current timestamptz;
  v_new timestamptz := clock_timestamp();
begin
  perform private.require_content_manage();
  v_msg := private.check_site_content_shape(p_content);
  if v_msg is not null then
    raise exception 'invalid_content' using errcode = '22023', detail = v_msg;
  end if;
  select sc.draft_updated_at into v_current from public.site_content sc where sc.id for update;
  if p_base is null or v_current <> p_base then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  update public.site_content
     set draft = p_content, draft_updated_at = v_new, draft_updated_by = (select auth.uid())
   where id;
  return v_new;
end;
$$;
revoke execute on function public.admin_save_site_content_draft(jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_site_content_draft(jsonb, timestamptz) to authenticated, service_role;

-- Same p_base check, then the publish validation, then in one transaction: version + 1, draft copied to published, a
-- history row, an audit row. A failing validation changes nothing.
create function public.admin_publish_site_content(p_base timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.site_content%rowtype;
  v_msg text;
  v_version integer;
  v_at timestamptz := clock_timestamp();
  v_uid uuid := (select auth.uid());
begin
  perform private.require_content_manage();
  select * into r from public.site_content sc where sc.id for update;
  if p_base is null or r.draft_updated_at <> p_base then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  v_msg := private.validate_site_content(r.draft);
  if v_msg is not null then
    raise exception 'invalid_content' using errcode = '22023', detail = v_msg;
  end if;
  v_version := r.published_version + 1;
  insert into public.site_content_versions (version, content, published_at, published_by, published_by_name)
  values (v_version, r.draft, v_at, v_uid, private.content_actor_name(v_uid));
  update public.site_content
     set published = r.draft, published_version = v_version, published_at = v_at, published_by = v_uid
   where id;
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('site_content_published', v_uid, jsonb_build_object('version', v_version));
  return jsonb_build_object('version', v_version, 'publishedAt', v_at);
end;
$$;
revoke execute on function public.admin_publish_site_content(timestamptz) from public, anon;
grant execute on function public.admin_publish_site_content(timestamptz) to authenticated, service_role;

-- Newest first, at most 100. No content.
create function public.admin_list_site_content_versions()
returns table (version integer, published_at timestamptz, published_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_content_manage();
  return query
    select v.version, v.published_at, v.published_by_name
      from public.site_content_versions v
     order by v.version desc
     limit 100;
end;
$$;
revoke execute on function public.admin_list_site_content_versions() from public, anon;
grant execute on function public.admin_list_site_content_versions() to authenticated, service_role;

-- Copies that version's content into the draft (same p_base check). Does not publish.
create function public.admin_restore_site_content_version(p_version integer, p_base timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_content jsonb;
  v_new timestamptz := clock_timestamp();
  v_uid uuid := (select auth.uid());
begin
  perform private.require_content_manage();
  select sc.draft_updated_at into v_current from public.site_content sc where sc.id for update;
  if p_base is null or v_current <> p_base then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  select v.content into v_content from public.site_content_versions v where v.version = p_version;
  if v_content is null then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  update public.site_content set draft = v_content, draft_updated_at = v_new, draft_updated_by = v_uid where id;
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('site_content_draft_restored', v_uid, jsonb_build_object('version', p_version));
  return v_new;
end;
$$;
revoke execute on function public.admin_restore_site_content_version(integer, timestamptz) from public, anon;
grant execute on function public.admin_restore_site_content_version(integer, timestamptz) to authenticated, service_role;

-- =============================================================================
-- 6. business_applications: optional fields (spec sections 5 and 10)
-- =============================================================================
-- A hidden or optional field is stored as null, not as a fake "Not provided" string. The length checks stay and pass on
-- null. language stays not null (a hidden language field stores the visitor's page language).
alter table public.business_applications
  alter column country drop not null,
  alter column city drop not null,
  alter column category drop not null;

-- The custom answers (up to 10 questions, bilingual labels, all options chosen) need more room than 16 KB.
alter table public.business_applications drop constraint business_applications_answers_check;
alter table public.business_applications add constraint business_applications_answers_check
  check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 65536);
