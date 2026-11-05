-- =============================================================================
-- Application catalogue (ADR-0050): an optional PDF product catalogue attached to a business application.
-- Spec: docs/superpowers/specs/2026-11-05-client-feedback-design.md, piece 2.
--
--   1. the private bucket `application-files` (20 MB, application/pdf only);
--   2. business_applications.catalogue_path (nullable);
--   3. staff with applications.view read the files (no policy lets anon or authenticated insert, update or delete:
--      uploads go through signed upload URLs that the application-upload Edge Function creates with the service role);
--   4. the application-form SQL gate knows the new built-in field `catalogue` (so the form builder can place, hide
--      or require it, like the other optional built-in fields).
--
-- Deploy order: this migration first, then the Edge Functions application-upload and submit-application.
-- =============================================================================

-- 1. The bucket. An existing bucket keeps its settings (on conflict do nothing); refuse to continue if it is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-files', 'application-files', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from storage.buckets where id = 'application-files' and public) then
    raise exception 'Bucket application-files exists and is public. Make it private before applying this migration.';
  end if;
end;
$$;

-- 2. The stored path. `pending/<submission key>/catalogue.pdf` is where the form uploads it; `imports/...` is reserved
-- for catalogue files that platform staff read products from later. Null = no catalogue. The column is covered by the
-- table's existing grants (staff select through RLS; service_role insert) and needs no new grant.
alter table public.business_applications
  add column catalogue_path text
    constraint business_applications_catalogue_path_check
    check (catalogue_path ~ '^(pending|imports)/[0-9a-f-]{36}/[a-z0-9-]+\.pdf$');

-- 3. Staff read. platform_can already includes the staff 2FA gate (private.mfa_satisfied('staff')), exactly as the
-- other staff storage reads. No insert, update or delete policy for anon or authenticated on this bucket.
create policy "Staff read application catalogues" on storage.objects
  for select to authenticated
  using (bucket_id = 'application-files' and (select public.platform_can('applications.view')));

-- 4. The application-form SQL gate with the new built-in field key `catalogue` (the only change to the function:
-- supabase/functions/_shared/applyForm.ts has the same list). create or replace keeps the grants.
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
