-- Rollback for supabase/migrations/20261025070915_platform_team_roles.sql (ADR-0029, ADR-0030).
-- Removes platform team roles: Admin/Team members lose all access; Owners (platform_admins) are untouched.
-- Run as the database owner. Audit rows already written (access_*) are kept.

begin;

-- 1. Restore the admin-only checks the migration widened.
do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('public.guard_business_admin_fields()',
     '(public.platform_can(''businesses.edit'') and (new.status is not distinct from old.status or public.platform_can(''businesses.status'')))'),
    ('public.admin_review_application(uuid, text, text)',
     'public.platform_can(case when p_action = ''reject'' then ''applications.reject'' else ''applications.approve'' end)'),
    ('public.admin_list_business_members(uuid)', 'public.platform_can(''businesses.view'')'),
    ('public.admin_user_emails(uuid[])',
     '(public.platform_can(''businesses.view'') or public.platform_can(''applications.view'') or public.platform_can(''records.view'') or public.platform_can(''access.view''))')
  ) as t(fn, chk) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    execute replace(v_def, '(public.is_platform_admin() or ' || r.chk || ')', 'public.is_platform_admin()');
  end loop;
end;
$$;

-- 2. Triggers and the policies the migration added.
drop trigger if exists products_publish_permission on public.products;
drop trigger if exists business_members_not_platform on public.business_members;
drop trigger if exists platform_members_not_business_owner on public.platform_members;

do $$
declare
  r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where policyname like 'Platform members %'
             and (schemaname, tablename) in (('public', 'businesses'), ('public', 'business_members'), ('public', 'business_applications'),
                                             ('public', 'products'), ('public', 'product_images'), ('public', 'product_models'),
                                             ('public', 'product_variants'), ('public', 'product_variant_images'),
                                             ('public', 'product_variant_models'), ('public', 'product_analytics'),
                                             ('public', 'email_log'), ('public', 'audit_events'), ('storage', 'objects')) loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- 3. Functions.
drop function if exists public.admin_invite_member(text, public.platform_role);
drop function if exists public.admin_set_member_role(uuid, public.platform_role);
drop function if exists public.admin_deactivate_member(uuid);
drop function if exists public.admin_reactivate_member(uuid);
drop function if exists public.admin_revoke_member_invite(uuid);
drop function if exists public.admin_set_role_permissions(public.platform_role, text[]);
drop function if exists public.admin_list_members();
drop function if exists public.admin_get_member(uuid);
drop function if exists public.admin_list_member_invites(uuid);
drop function if exists public.service_create_member_invite(uuid, text, timestamptz, uuid);
drop function if exists public.service_record_invite_email(uuid, boolean, text);
drop function if exists public.service_inspect_invite(text);
drop function if exists public.service_accept_invite(text, uuid, text);
drop function if exists public.service_user_can(uuid, text);
drop function if exists public.service_end_sessions(uuid);
drop function if exists private.member_json(public.platform_members);
drop function if exists private.invite_state(public.invite_status, timestamptz);
drop function if exists private.owner_or_deny(text);
drop function if exists public.service_log_access_denied(uuid, text);
drop function if exists private.products_publish_permission();
drop function if exists private.business_owner_not_platform_member();
drop function if exists private.platform_member_not_business_owner();

-- 4. Tables, access checks and types.
drop table if exists private.platform_invites;
drop table if exists public.platform_role_permissions;
drop table if exists public.platform_members;
drop function if exists public.my_platform_access();
drop function if exists public.is_platform_member();
drop function if exists public.platform_can(text);
drop type if exists public.invite_status;
drop type if exists public.member_status;
drop type if exists public.platform_role;

commit;
