-- Rollback of 20261111095614_apply_form_delete_anything.sql (ADR-0057). Run as the database owner (psql / SQL editor), in one
-- transaction, only with the owner's approval.
--
-- Puts back: private.validate_apply_form as 20261105122617_application_catalogue.sql left it, private.check_site_content_shape as
-- 20261111083034_landing_sections.sql left it (8 sections, 10 own questions, 40 placements), the 3-argument
-- admin_review_application of 20261026075614_s2_business_logic.sql, and NOT NULL on business_name / applicant_name.
--
-- It REFUSES (raises apply_form_delete_anything_rollback_blocked and changes nothing) while
--   - an application has no business name or applicant name: NOT NULL would fail. Approve or reject them with a name, or fill the
--     two columns by hand, then run this again. NOT NULL comes back only when no row has a null in either column;
--   - the draft or published application form uses what the older gate does not know: a deleted built-in field (removedFields),
--     a hidden or optional business or applicant name, more than 8 sections, more than 10 own questions or more than 40 placements.
--     Republish the form without those first, or the older gate would refuse it at the next save.
-- If a later migration changed these functions, roll back by merging, not by running this file blindly.

begin;

do $$
begin
  if exists (select 1 from public.business_applications where business_name is null or applicant_name is null) then
    raise exception 'apply_form_delete_anything_rollback_blocked: applications without a business name or applicant name exist';
  end if;
  if exists (
    select 1 from public.site_content sc, unnest(array[sc.draft, sc.published]) f
     where f is not null and f -> 'applyForm' is not null and (
       jsonb_array_length(case when jsonb_typeof(f -> 'applyForm' -> 'removedFields') = 'array' then f -> 'applyForm' -> 'removedFields' else '[]'::jsonb end) > 0
       or jsonb_array_length(case when jsonb_typeof(f -> 'applyForm' -> 'steps') = 'array' then f -> 'applyForm' -> 'steps' else '[]'::jsonb end) > 8
       or jsonb_array_length(case when jsonb_typeof(f -> 'applyForm' -> 'customQuestions') = 'array' then f -> 'applyForm' -> 'customQuestions' else '[]'::jsonb end) > 10
       or jsonb_array_length(case when jsonb_typeof(f -> 'applyForm' -> 'fields') = 'array' then f -> 'applyForm' -> 'fields' else '[]'::jsonb end) > 40
       or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f -> 'applyForm' -> 'fields') = 'array' then f -> 'applyForm' -> 'fields' else '[]'::jsonb end) pl
                   where pl ->> 'key' in ('businessName', 'applicantName')
                     and (pl -> 'hidden' = 'true'::jsonb or pl -> 'required' = 'false'::jsonb)))
  ) then
    raise exception 'apply_form_delete_anything_rollback_blocked: the application form uses deleted or hidden names, or more sections, questions or fields than the older gate allows';
  end if;
end;
$$;

-- admin_review_application: the 3-argument S2 body.
drop function public.admin_review_application(uuid, text, text, text);
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

-- private.validate_apply_form: the application-catalogue body.
create or replace function private.validate_apply_form(p jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_builtin constant text[] := array['businessName', 'website', 'category', 'description', 'country', 'city',
    'applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language',
    'productCount', 'photoReadiness', 'modelReadiness', 'notes', 'catalogue'];
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

-- private.check_site_content_shape: the landing-sections body.
create or replace function private.check_site_content_shape(p jsonb)
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
  if p ? 'landing' then
    if jsonb_typeof(p -> 'landing') <> 'object' then return 'landing|invalid_value'; end if;
    if p -> 'landing' ? 'collections' then
      if jsonb_typeof(p -> 'landing' -> 'collections') <> 'array' then return 'landing.collections|invalid_value'; end if;
      if jsonb_array_length(p -> 'landing' -> 'collections') > 8 then return 'landing.collections|too_many'; end if;
    end if;
    if p -> 'landing' ? 'showcase' and jsonb_typeof(p -> 'landing' -> 'showcase') <> 'object' then return 'landing.showcase|invalid_value'; end if;
    if p -> 'landing' ? 'hero' and jsonb_typeof(p -> 'landing' -> 'hero') <> 'object' then return 'landing.hero|invalid_value'; end if;
    if p -> 'landing' ? 'texts' and jsonb_typeof(p -> 'landing' -> 'texts') <> 'object' then return 'landing.texts|invalid_value'; end if;
    if p -> 'landing' ? 'sections' then
      if jsonb_typeof(p -> 'landing' -> 'sections') <> 'array' then return 'landing.sections|invalid_value'; end if;
      if jsonb_array_length(p -> 'landing' -> 'sections') > 16 then return 'landing.sections|too_many'; end if;
    end if;
    if p -> 'landing' ? 'qr' and jsonb_typeof(p -> 'landing' -> 'qr') <> 'object' then return 'landing.qr|invalid_value'; end if;
    if p -> 'landing' ? 'about' and jsonb_typeof(p -> 'landing' -> 'about') <> 'object' then return 'landing.about|invalid_value'; end if;
  end if;
  if p ? 'chrome' and jsonb_typeof(p -> 'chrome') <> 'object' then return 'chrome|invalid_value'; end if;
  return null;
end;
$$;
revoke execute on function private.check_site_content_shape(jsonb) from public, anon, authenticated;

alter table public.business_applications alter column business_name set not null;
alter table public.business_applications alter column applicant_name set not null;

commit;
