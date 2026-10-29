-- Rollback for the Content Editor migration supabase/migrations/20261029074648_site_content.sql (ADR-0043; spec
-- docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md, section 16.5). Run as the
-- database owner, after redeploying the submit-application function of the release before the Editor and before any
-- earlier rollback script (S4, S2, S1.5).
--
-- What it does: drops the site_content tables and every function the migration added, restores the S4 bodies of
-- my_platform_access and admin_set_role_permissions, takes content.manage out of every role set (one
-- access_permissions_changed row per role that had it, by the system) and puts the permission check back to 16 keys,
-- and restores business_applications: country, city and category are filled with "Not given" where null and become
-- not null again, and the answers limit goes back to 16,384 bytes. audit_events and email_log rows are kept.
--
-- DATA: the published pages, the draft and the version history are in site_content and are deleted with it. Export them
-- first if the client wants to keep them:
--   select draft, published, published_version from public.site_content;
--   select * from public.site_content_versions order by version;
-- The answers limit is restored only if no application is larger: otherwise this script stops with
-- application_answers_too_large (nothing is changed) and those rows must be shortened or exported first.

begin;

-- business_applications first (it can refuse).
do $$
begin
  if exists (select 1 from public.business_applications where pg_column_size(answers) > 16384) then
    raise exception 'application_answers_too_large' using errcode = 'P0001',
      hint = 'An application has more than 16,384 bytes of answers (custom questions). Export or shorten it, then run this rollback again.';
  end if;
end;
$$;
update public.business_applications set country = 'Not given' where country is null;
update public.business_applications set city = 'Not given' where city is null;
update public.business_applications set category = 'Not given' where category is null;
alter table public.business_applications
  alter column country set not null,
  alter column city set not null,
  alter column category set not null;
alter table public.business_applications drop constraint business_applications_answers_check;
alter table public.business_applications add constraint business_applications_answers_check
  check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 16384);

-- Functions and tables (the tables take their indexes with them).
drop function public.admin_restore_site_content_version(integer, timestamptz);
drop function public.admin_list_site_content_versions();
drop function public.admin_publish_site_content(timestamptz);
drop function public.admin_save_site_content_draft(jsonb, timestamptz);
drop function public.admin_get_site_content();
drop function public.get_published_site_content(text, text);
drop function private.content_actor_name(uuid);
drop function private.validate_site_content(jsonb);
drop function private.check_site_content_shape(jsonb);
drop function private.validate_apply_form(jsonb);
drop table public.site_content_versions;
drop table public.site_content;
drop function private.require_content_manage();

-- content.manage leaves every role set, then the check constraint goes back to the 16 keys.
do $$
declare
  r record;
begin
  for r in select role from public.platform_role_permissions where permission = 'content.manage' order by role loop
    delete from public.platform_role_permissions where role = r.role and permission = 'content.manage';
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('access_permissions_changed', null,
            jsonb_build_object('role', r.role::text, 'added', '[]'::jsonb, 'removed', jsonb_build_array('content.manage'),
                               'reason', 'content_editor_rollback'));
  end loop;
end;
$$;
alter table public.platform_role_permissions
  drop constraint platform_role_permissions_permission_check,
  add constraint platform_role_permissions_permission_check check (permission in (
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage',
    'analytics.view', 'records.view', 'access.view'));

-- my_platform_access as in S4 Task 1 (16 keys).
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
        'businesses.delete', 'businesses.edit', 'businesses.status', 'businesses.view', 'models.manage', 'owners.manage',
        'products.delete', 'products.edit', 'products.publish', 'products.view', 'records.view']))
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

-- admin_set_role_permissions as in S4 Task 1 (16 keys).
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
    'analytics.view', 'records.view', 'access.view'];
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

commit;
