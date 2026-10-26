-- S2 business logic (spec: docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md;
-- plan: docs/superpowers/plans/2026-10-26-s2-business-logic.md).
-- Rollback: supabase/rollback/20261026_s2_business_logic_rollback.sql (run before the S1.5 rollback).
-- Tests: supabase/tests/s2BusinessLogic.test.ts (PGlite, one describe per task).
--
-- Scope: S2 Task 2 redefines admin_review_application (one description limit). No other S2 task has SQL.
--
-- This is the only S2 migration. Each task appends one section at the END of this file, in this format:
--
--   -- =============================================================================
--   -- S2 Task N: <title> (R-Wn-k, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S2 Task N ----
--
-- A task never edits another task's section. A function S1.5 already redefined is `create or replace`d starting
-- from its latest body in 20261026041731_business_logic_fixes.sql, keeping its signature and grants.
-- SQL rules: RLS on every new table (revoke all from public, anon, authenticated, then explicit grants); every new
-- function security definer with `set search_path = ''`, execute revoked from public and granted explicitly.
-- Access checks use only the S1 gated helpers (is_platform_admin, platform_can, is_business_member).

-- =============================================================================
-- S2 Task 2: read-only business form, field limits, the owner's closure notice (R-W3-5, R-W3-6, R-W3-7)
-- =============================================================================

-- R-W3-7 (BIZ-09): one description limit. An approved application's description is cut to 1000 characters, the
-- same limit as the business form (BUSINESS_LIMITS.description). Body from the S1.5 Task 16 section of
-- 20261026041731_business_logic_fixes.sql; only the cap changes (5000 → 1000). Signature and grants unchanged.
create or replace function public.admin_review_application(p_application_id uuid, p_action text, p_reason text default null)
returns public.business_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app    public.business_applications;
  v_new    text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_biz    uuid;
  v_old    text;
begin
  if not (public.is_platform_admin()
          or public.platform_can(case p_action when 'reject' then 'applications.reject' else 'applications.approve' end)) then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  select * into v_app from public.business_applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  -- Reopen: only an approved application whose business no longer exists. Never a no-op repeat.
  if p_action = 'reopen' then
    if v_app.status <> 'approved' or v_app.business_id is not null then
      raise exception 'reopen_not_allowed' using errcode = '22023';
    end if;
    update public.business_applications
       set status = 'under_review',
           reviewed_by = auth.uid(),
           reviewed_at = now()
     where id = v_app.id
    returning * into v_app;
    insert into public.audit_events (event_type, actor_id, application_id, business_id, from_status, to_status, metadata)
    values ('application_status_changed', auth.uid(), v_app.id, null, 'approved', 'under_review',
            jsonb_build_object('action', 'reopen'));
    return v_app;
  end if;

  v_new := case p_action when 'start_review' then 'under_review' when 'approve' then 'approved' when 'reject' then 'rejected' end;
  if v_new is null then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if v_app.status = v_new then
    return v_app;
  end if;
  v_old := v_app.status;
  if not ((v_app.status = 'submitted' and v_new in ('under_review', 'approved', 'rejected'))
       or (v_app.status = 'under_review' and v_new in ('approved', 'rejected'))
       or (v_app.status = 'rejected' and v_new = 'under_review')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if v_new = 'rejected' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if v_new = 'approved' then
    -- A draft business: not public until the catalogue is activated. Contact fields stay empty on purpose:
    -- the applicant's private email/phone must not become public catalogue contacts.
    insert into public.businesses (name, slug, description, status)
    values (btrim(v_app.business_name), private.unique_business_slug(v_app.business_name),
            left(coalesce(v_app.answers ->> 'description', ''), 1000), 'draft')
    returning id into v_biz;
    insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
    values ('business_created', auth.uid(), v_app.id, v_biz, jsonb_build_object('source', 'application'));
  end if;

  update public.business_applications
     set status = v_new,
         decision_reason = case when v_new in ('approved', 'rejected') then v_reason else decision_reason end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         business_id = coalesce(v_biz, business_id)
   where id = v_app.id
  returning * into v_app;

  insert into public.audit_events (event_type, actor_id, application_id, business_id, from_status, to_status, metadata)
  values ('application_status_changed', auth.uid(), v_app.id, v_app.business_id, v_old, v_new,
          case when v_reason is not null then jsonb_build_object('reason', v_reason) else '{}'::jsonb end);
  return v_app;
end;
$$;
revoke execute on function public.admin_review_application(uuid, text, text) from public, anon;
grant execute on function public.admin_review_application(uuid, text, text) to authenticated;
-- ---- end S2 Task 2 ----
