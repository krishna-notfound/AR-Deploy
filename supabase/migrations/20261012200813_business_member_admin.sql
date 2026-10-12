-- =============================================================================
-- business_member_admin: lets platform admins see and link business owners by email
-- from the dashboard (instead of SQL). Removal uses the existing admin-only DELETE
-- policy on business_members, so only listing and adding need trusted functions.
--
-- Both functions are SECURITY DEFINER because they read auth.users (emails), which the
-- Data API roles cannot. Each one checks public.is_platform_admin() first and raises 42501
-- for anyone else. EXECUTE is granted to authenticated only (never anon).
-- Safe to review before applying: creates two functions; no data changes.
-- =============================================================================

create function public.admin_list_business_members(p_business_id uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can manage business owners' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.created_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id
    order by m.created_at;
end;
$$;

-- Links an existing account (created in Supabase Auth) to a business as its owner.
-- Returns the user id. Raises P0002 when no account has that email.
create function public.admin_add_business_member(p_business_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can manage business owners' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No account uses this email address' using errcode = 'P0002';
  end if;
  insert into public.business_members (business_id, user_id)
  values (p_business_id, v_user)
  on conflict (business_id, user_id) do nothing;
  return v_user;
end;
$$;

revoke execute on function public.admin_list_business_members(uuid) from public, anon;
revoke execute on function public.admin_add_business_member(uuid, text) from public, anon;
grant execute on function public.admin_list_business_members(uuid) to authenticated, service_role;
grant execute on function public.admin_add_business_member(uuid, text) to authenticated, service_role;
