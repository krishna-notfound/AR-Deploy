-- Site icon and editable landing texts (client request 2026-11-09, ADR-0053): the Website Editor can set the site's favicon and
-- override the landing page's wording in English and Portuguese. This migration adds one function and replaces three (same
-- signatures, grants and security as before; bodies copied from the latest versions, in landing_hero):
--   0. NEW private.landing_text_limits(): the whitelist of landing text keys with the longest text each may have (the twin of
--      LANDING_TEXT_LIMITS in src/domain/landingTexts.ts; supabase/tests/siteContentRound2.test.ts compares the two).
--   1. private.check_site_content_shape: a draft whose `chrome` or `landing.texts` is present but not an object is refused on save
--      with `chrome|invalid_value` / `landing.texts|invalid_value`.
--   2. private.validate_site_content: the publish gate also checks `chrome.favicon` when present (an uploaded .png of the bucket
--      site-content, private.site_asset_ok 'image' plus a .png path; error `chrome.favicon|invalid_value`) and `landing.texts` when
--      present: every key must be in landing_text_limits (`landing.texts.<key>|unknown_key`), each value an object
--      (`|invalid_value`) whose `en` and `pt`, when present, are strings of at most the key's limit
--      (`landing.texts.<key>.<en|pt>|invalid_value` / `|too_long`).
--   3. public.get_published_site_content: the part 'chrome' also returns the published favicon as `favicon` and the texts as
--      `landingTexts` (only the whitelisted keys, so a key removed from the list later never reaches the page). The draft is never returned.
-- No table, column, bucket or storage-policy changes: a favicon is a PNG, which the bucket and its policies already accept
-- (ICO is not supported on purpose, ADR-0053). Rollback: supabase/rollback/20261109_site_content_round2_rollback.sql (puts the three
-- bodies back and drops the new function; `chrome` and `landing.texts` keys stay inside the site-content documents, unused).
-- Tests: supabase/tests/siteContentRound2.test.ts (PGlite).
-- NOT APPLIED to any project. Apply only with the owner's go-ahead (ADR-0042); no `npm run db:types` is needed (no table or signature changed).
-- NOTE for the merge: workstream W6 (apply_form_round2) replaces private.validate_site_content too. Whichever migration runs later must carry
-- both changes (this file's checks and W6's); merge the bodies, do not let the later one overwrite the other.

-- PRE-FLIGHT (site_content_round2) BEGIN
-- Read-only; run before this migration. The three functions exist and the new one does not.
-- select to_regprocedure('private.check_site_content_shape(jsonb)'), to_regprocedure('private.validate_site_content(jsonb)'),
--        to_regprocedure('public.get_published_site_content(text,text)'), to_regprocedure('private.landing_text_limits()');
-- PRE-FLIGHT (site_content_round2) END

-- The landing text keys the Editor may override, with the longest text of each (eyebrow 60, button 40, title 200, body 600).
create or replace function private.landing_text_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'landing.title', 200,
    'landing.hero.eyebrow', 60, 'landing.hero.title1', 200, 'landing.hero.title2', 200, 'landing.hero.body', 600, 'landing.hero.cta3d', 40, 'landing.hero.note', 600,
    'landing.how.eyebrow', 60, 'landing.how.title1', 200, 'landing.how.title2', 200,
    'landing.how.s1Title', 200, 'landing.how.s1Body', 600, 'landing.how.s2Title', 200, 'landing.how.s2Body', 600,
    'landing.how.s3Title', 200, 'landing.how.s3Body', 600, 'landing.how.s4Title', 200, 'landing.how.s4Body', 600,
    'landing.xp.eyebrow', 60, 'landing.xp.title', 200, 'landing.xp.body', 600,
    'landing.xp.f1Title', 200, 'landing.xp.f1Body', 600, 'landing.xp.f2Title', 200, 'landing.xp.f2Body', 600,
    'landing.xp.f3Title', 200, 'landing.xp.f3Body', 600, 'landing.xp.cta', 40,
    'landing.col.eyebrow', 60, 'landing.col.title1', 200, 'landing.col.title2', 200, 'landing.col.body', 600, 'landing.col.view', 40,
    'landing.col.sofas', 200, 'landing.col.sofasBody', 600, 'landing.col.tables', 200, 'landing.col.tablesBody', 600,
    'landing.col.armchairs', 200, 'landing.col.armchairsBody', 600, 'landing.col.decor', 200, 'landing.col.decorBody', 600,
    'landing.about.eyebrow', 60, 'landing.about.title1', 200, 'landing.about.title2', 200, 'landing.about.body', 600,
    'landing.feature.textureCaption', 200,
    'landing.biz.eyebrow', 60, 'landing.biz.title', 200, 'landing.biz.body', 600
  );
$$;
revoke execute on function private.landing_text_limits() from public, anon, authenticated;

-- The size and shape every save is held to, plus the landing array cap and the landing.showcase and landing.hero shapes. Null when fine.
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
  end if;
  if p ? 'chrome' and jsonb_typeof(p -> 'chrome') <> 'object' then return 'chrome|invalid_value'; end if;
  return null;
end;
$$;
revoke execute on function private.check_site_content_shape(jsonb) from public, anon, authenticated;

-- The publish gate: the shape, then the checks that protect the live site. Null when the document may be published.
-- Slugs: ^[a-z0-9]+(-[a-z0-9]+)*$, 60 characters or fewer, unique, not reserved. Social values start with https://.
-- Landing cards: at most 8 (shape), unique ids, a unique slug, title.en 1..60 (pt 60), text 160, a known photo key, at most 24
-- products (business and product slug each), a link of kind collection (the card's own page), product (business and
-- product slug), catalog (business slug, optional known category), apply or none. landing.featured and landing.example, when
-- present: business and product slug. landing.hero, when present: image an uploaded picture, model.glb an uploaded .glb, alt.en and
-- alt.pt text of 120 characters or fewer.
create or replace function private.validate_site_content(p jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_reserved constant text[] := array['admin', 'api', 'apply', 'catalog', 'dashboard', 'demo', 'embed', 'login', 'pages', 'privacy', 'products', 'terms'];
  c_images constant text[] := array['sofa-travertine', 'dining-table', 'lounge-chair', 'lamp-vase', 'hero-living', 'armchair-walnut',
    'coffee-table', 'detail-joinery', 'interior-villa', 'ar-phone', 'model-wireframe', 'showroom-qr'];
  c_categories constant text[] := array['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor'];
  c_slug constant text := '^[a-z0-9]+(-[a-z0-9]+)*$';
  v_msg text;
  v_slugs text[] := '{}';
  v_slug text;
  v_i integer;
  v_el jsonb;
  v_cols jsonb;
  v_link jsonb;
  v_ids text[] := '{}';
  v_card_slugs text[] := '{}';
  v_j integer;
  v_prods jsonb;
  v_ref jsonb;
  v_path text;
  v_f text;
  v_lang text;
  v_sc jsonb;
  v_hero jsonb;
  v_max integer;
  v_limits jsonb;
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
    if v_slug !~ c_slug then
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

  -- landing.collections (the count was checked with the shape)
  v_cols := coalesce(p -> 'landing' -> 'collections', '[]'::jsonb);
  for v_i in 0 .. jsonb_array_length(v_cols) - 1 loop
    v_el := v_cols -> v_i;
    v_path := format('landing.collections.%s', v_i);
    if jsonb_typeof(v_el) is distinct from 'object' then
      return v_path || '|invalid_value';
    end if;
    if jsonb_typeof(v_el -> 'id') is distinct from 'string' or (v_el ->> 'id') = '' then
      return v_path || '.id|required';
    end if;
    if (v_el ->> 'id') = any (v_ids) then
      return v_path || '.id|duplicate_id';
    end if;
    v_ids := v_ids || (v_el ->> 'id');
    if jsonb_typeof(v_el -> 'slug') is distinct from 'string' or (v_el ->> 'slug') = '' then
      return v_path || '.slug|required';
    end if;
    if char_length(v_el ->> 'slug') > 60 then
      return v_path || '.slug|too_long';
    end if;
    if (v_el ->> 'slug') !~ c_slug then
      return v_path || '.slug|invalid_slug';
    end if;
    if (v_el ->> 'slug') = any (v_card_slugs) then
      return v_path || '.slug|slug_duplicate';
    end if;
    v_card_slugs := v_card_slugs || (v_el ->> 'slug');
    v_prods := coalesce(v_el -> 'products', '[]'::jsonb);
    if jsonb_typeof(v_prods) <> 'array' then
      return v_path || '.products|invalid_value';
    end if;
    if jsonb_array_length(v_prods) > 24 then
      return v_path || '.products|too_many';
    end if;
    for v_j in 0 .. jsonb_array_length(v_prods) - 1 loop
      v_ref := v_prods -> v_j;
      if jsonb_typeof(v_ref) is distinct from 'object' then
        return format('%s.products.%s|invalid_value', v_path, v_j);
      end if;
      foreach v_f in array array['businessSlug', 'productSlug'] loop
        if jsonb_typeof(v_ref -> v_f) is distinct from 'string' or (v_ref ->> v_f) = '' then
          return format('%s.products.%s.%s|required', v_path, v_j, v_f);
        end if;
        if char_length(v_ref ->> v_f) > 60 or (v_ref ->> v_f) !~ c_slug then
          return format('%s.products.%s.%s|invalid_slug', v_path, v_j, v_f);
        end if;
      end loop;
    end loop;
    if jsonb_typeof(v_el -> 'title' -> 'en') is distinct from 'string' or btrim(v_el -> 'title' ->> 'en') = '' then
      return v_path || '.title.en|required';
    end if;
    if char_length(v_el -> 'title' ->> 'en') > 60 then
      return v_path || '.title.en|too_long';
    end if;
    if v_el -> 'title' ? 'pt' and (jsonb_typeof(v_el -> 'title' -> 'pt') is distinct from 'string' or char_length(v_el -> 'title' ->> 'pt') > 60) then
      return v_path || '.title.pt|' || case when jsonb_typeof(v_el -> 'title' -> 'pt') = 'string' then 'too_long' else 'invalid_value' end;
    end if;
    foreach v_f in array array['en', 'pt'] loop
      if v_el -> 'text' ? v_f and (jsonb_typeof(v_el -> 'text' -> v_f) is distinct from 'string' or char_length(v_el -> 'text' ->> v_f) > 160) then
        return v_path || '.text.' || v_f || '|' || case when jsonb_typeof(v_el -> 'text' -> v_f) = 'string' then 'too_long' else 'invalid_value' end;
      end if;
    end loop;
    if jsonb_typeof(v_el -> 'image') = 'object' then
      -- an uploaded picture (bucket site-content)
      if not private.site_asset_ok(v_el -> 'image', 'image') then
        return v_path || '.image|invalid_value';
      end if;
    else
      if jsonb_typeof(v_el -> 'image') is distinct from 'string' or (v_el ->> 'image') = '' then
        return v_path || '.image|required';
      end if;
      if (v_el ->> 'image') <> all (c_images) then
        return v_path || '.image|invalid_value';
      end if;
    end if;
    v_link := v_el -> 'link';
    if jsonb_typeof(v_link) is distinct from 'object' or jsonb_typeof(v_link -> 'kind') is distinct from 'string'
       or (v_link ->> 'kind') <> all (array['collection', 'product', 'catalog', 'apply', 'none']) then
      return v_path || '.link|invalid_value';
    end if;
    if (v_link ->> 'kind') in ('product', 'catalog') then
      foreach v_f in array case when (v_link ->> 'kind') = 'product' then array['businessSlug', 'productSlug'] else array['businessSlug'] end loop
        if jsonb_typeof(v_link -> v_f) is distinct from 'string' or (v_link ->> v_f) = '' then
          return v_path || '.link.' || v_f || '|required';
        end if;
        if char_length(v_link ->> v_f) > 60 or (v_link ->> v_f) !~ c_slug then
          return v_path || '.link.' || v_f || '|invalid_slug';
        end if;
      end loop;
      if (v_link ->> 'kind') = 'catalog' and v_link ? 'category'
         and (jsonb_typeof(v_link -> 'category') is distinct from 'string' or (v_link ->> 'category') !~ c_slug) then
        return v_path || '.link.category|invalid_value';
      end if;
    end if;
  end loop;

  -- landing.featured (the piece "Open a live piece in 3D" opens)
  if p -> 'landing' ? 'featured' then
    v_ref := p -> 'landing' -> 'featured';
    if jsonb_typeof(v_ref) is distinct from 'object' then
      return 'landing.featured|invalid_value';
    end if;
    foreach v_f in array array['businessSlug', 'productSlug'] loop
      if jsonb_typeof(v_ref -> v_f) is distinct from 'string' or (v_ref ->> v_f) = '' then
        return 'landing.featured.' || v_f || '|required';
      end if;
      if char_length(v_ref ->> v_f) > 60 or (v_ref ->> v_f) !~ c_slug then
        return 'landing.featured.' || v_f || '|invalid_slug';
      end if;
    end loop;
  end if;

  -- landing.example (the piece the hero's "See a live example" opens; checked exactly like landing.featured)
  if p -> 'landing' ? 'example' then
    v_ref := p -> 'landing' -> 'example';
    if jsonb_typeof(v_ref) is distinct from 'object' then
      return 'landing.example|invalid_value';
    end if;
    foreach v_f in array array['businessSlug', 'productSlug'] loop
      if jsonb_typeof(v_ref -> v_f) is distinct from 'string' or (v_ref ->> v_f) = '' then
        return 'landing.example.' || v_f || '|required';
      end if;
      if char_length(v_ref ->> v_f) > 60 or (v_ref ->> v_f) !~ c_slug then
        return 'landing.example.' || v_f || '|invalid_slug';
      end if;
    end loop;
  end if;

  -- landing.showcase (the 3D card: the Owner/Admin's own picture and model)
  if p -> 'landing' ? 'showcase' then
    v_sc := p -> 'landing' -> 'showcase';
    if jsonb_typeof(v_sc -> 'title' -> 'en') is distinct from 'string' or btrim(v_sc -> 'title' ->> 'en') = '' then
      return 'landing.showcase.title.en|required';
    end if;
    foreach v_f in array array['eyebrow', 'title', 'text', 'materials'] loop
      if v_sc ? v_f then
        if jsonb_typeof(v_sc -> v_f) <> 'object' then
          return 'landing.showcase.' || v_f || '|invalid_value';
        end if;
        v_max := case v_f when 'eyebrow' then 40 when 'title' then 80 when 'text' then 400 else 120 end;
        foreach v_lang in array array['en', 'pt'] loop
          if v_sc -> v_f ? v_lang then
            if jsonb_typeof(v_sc -> v_f -> v_lang) <> 'string' then
              return 'landing.showcase.' || v_f || '.' || v_lang || '|invalid_value';
            end if;
            if char_length(v_sc -> v_f ->> v_lang) > v_max then
              return 'landing.showcase.' || v_f || '.' || v_lang || '|too_long';
            end if;
          end if;
        end loop;
      end if;
    end loop;
    if v_sc ? 'dimensions' then
      if jsonb_typeof(v_sc -> 'dimensions') <> 'string' then return 'landing.showcase.dimensions|invalid_value'; end if;
      if char_length(v_sc ->> 'dimensions') > 80 then return 'landing.showcase.dimensions|too_long'; end if;
    end if;
    if v_sc ? 'price' then
      if jsonb_typeof(v_sc -> 'price') <> 'object' or jsonb_typeof(v_sc -> 'price' -> 'amount') is distinct from 'number'
         or (v_sc -> 'price' ->> 'amount')::numeric <= 0 or (v_sc -> 'price' ->> 'amount')::numeric > 1000000 then
        return 'landing.showcase.price.amount|invalid_value';
      end if;
      if v_sc -> 'price' -> 'currency' is distinct from '"EUR"'::jsonb then
        return 'landing.showcase.price.currency|invalid_value';
      end if;
    end if;
    if v_sc ? 'image' and not private.site_asset_ok(v_sc -> 'image', 'image') then
      return 'landing.showcase.image|invalid_value';
    end if;
    if v_sc ? 'model' then
      if jsonb_typeof(v_sc -> 'model') <> 'object' then return 'landing.showcase.model|invalid_value'; end if;
      if not private.site_asset_ok(v_sc -> 'model' -> 'glb', 'glb') then return 'landing.showcase.model.glb|invalid_value'; end if;
      if v_sc -> 'model' ? 'usdz' and not private.site_asset_ok(v_sc -> 'model' -> 'usdz', 'usdz') then
        return 'landing.showcase.model.usdz|invalid_value';
      end if;
    end if;
    if v_sc ? 'product' then
      v_ref := v_sc -> 'product';
      if jsonb_typeof(v_ref) is distinct from 'object' then return 'landing.showcase.product|invalid_value'; end if;
      foreach v_f in array array['businessSlug', 'productSlug'] loop
        if jsonb_typeof(v_ref -> v_f) is distinct from 'string' or (v_ref ->> v_f) = '' then
          return 'landing.showcase.product.' || v_f || '|required';
        end if;
        if char_length(v_ref ->> v_f) > 60 or (v_ref ->> v_f) !~ c_slug then
          return 'landing.showcase.product.' || v_f || '|invalid_slug';
        end if;
      end loop;
    end if;
  end if;

  -- landing.hero (the hero's own picture, optional in-place 3D model and description)
  if p -> 'landing' ? 'hero' then
    v_hero := p -> 'landing' -> 'hero';
    if jsonb_typeof(v_hero) is distinct from 'object' then return 'landing.hero|invalid_value'; end if;
    if v_hero ? 'image' and private.site_asset_ok(v_hero -> 'image', 'image') is not true then
      return 'landing.hero.image|invalid_value';
    end if;
    if v_hero ? 'model' then
      if jsonb_typeof(v_hero -> 'model') <> 'object' then return 'landing.hero.model|invalid_value'; end if;
      if private.site_asset_ok(v_hero -> 'model' -> 'glb', 'glb') is not true then return 'landing.hero.model.glb|invalid_value'; end if;
    end if;
    if v_hero ? 'alt' then
      if jsonb_typeof(v_hero -> 'alt') <> 'object' then return 'landing.hero.alt|invalid_value'; end if;
      foreach v_lang in array array['en', 'pt'] loop
        if v_hero -> 'alt' ? v_lang then
          if jsonb_typeof(v_hero -> 'alt' -> v_lang) <> 'string' then return 'landing.hero.alt.' || v_lang || '|invalid_value'; end if;
          if char_length(v_hero -> 'alt' ->> v_lang) > 120 then return 'landing.hero.alt.' || v_lang || '|too_long'; end if;
        end if;
      end loop;
    end if;
  end if;

  -- landing.texts (overrides of the landing page's wording: only the keys of landing_text_limits, each language within its limit)
  if p -> 'landing' ? 'texts' then
    v_limits := private.landing_text_limits();
    for r in select key, value from jsonb_each(p -> 'landing' -> 'texts') loop
      if not v_limits ? r.key then
        return 'landing.texts.' || r.key || '|unknown_key';
      end if;
      if jsonb_typeof(r.value) is distinct from 'object' then
        return 'landing.texts.' || r.key || '|invalid_value';
      end if;
      foreach v_lang in array array['en', 'pt'] loop
        if r.value ? v_lang then
          if jsonb_typeof(r.value -> v_lang) <> 'string' then return 'landing.texts.' || r.key || '.' || v_lang || '|invalid_value'; end if;
          if char_length(r.value ->> v_lang) > (v_limits ->> r.key)::integer then return 'landing.texts.' || r.key || '.' || v_lang || '|too_long'; end if;
        end if;
      end loop;
    end loop;
  end if;

  -- chrome.favicon (the site icon: an uploaded .png of the bucket site-content)
  if p ? 'chrome' and p -> 'chrome' ? 'favicon' then
    if private.site_asset_ok(p -> 'chrome' -> 'favicon', 'image') is not true or (p -> 'chrome' -> 'favicon' ->> 'path') !~ '\.png$' then
      return 'chrome.favicon|invalid_value';
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.validate_site_content(jsonb) from public, anon, authenticated;

-- Public read: published parts only, never the draft. p_part 'chrome' (footer pages: slug and title; social links; the
-- landing collection cards; the 3D showcase card; the live-example piece; the hero), 'page' or 'apply'. Returns {version, content}; content is null when nothing is published.
create or replace function public.get_published_site_content(p_part text, p_slug text default null)
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
      'social', case when jsonb_typeof(v_pub -> 'social') = 'object' then v_pub -> 'social' else '{}'::jsonb end,
      'landingCollections', case when jsonb_typeof(v_pub -> 'landing' -> 'collections') = 'array' then v_pub -> 'landing' -> 'collections' else '[]'::jsonb end)
      || case when jsonb_typeof(v_pub -> 'landing' -> 'featured') = 'object'
              then jsonb_build_object('landingFeatured', v_pub -> 'landing' -> 'featured') else '{}'::jsonb end
      || case when jsonb_typeof(v_pub -> 'landing' -> 'example') = 'object'
              then jsonb_build_object('landingExample', v_pub -> 'landing' -> 'example') else '{}'::jsonb end
      || case when jsonb_typeof(v_pub -> 'landing' -> 'showcase') = 'object'
              then jsonb_build_object('landingShowcase', v_pub -> 'landing' -> 'showcase') else '{}'::jsonb end
      || case when jsonb_typeof(v_pub -> 'landing' -> 'hero') = 'object'
              then jsonb_build_object('landingHero', v_pub -> 'landing' -> 'hero') else '{}'::jsonb end
      || case when jsonb_typeof(v_pub -> 'landing' -> 'texts') = 'object'
              then jsonb_build_object('landingTexts', (
                     select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                       from jsonb_each(v_pub -> 'landing' -> 'texts') e
                      where private.landing_text_limits() ? e.key and jsonb_typeof(e.value) = 'object'))
              else '{}'::jsonb end
      || case when jsonb_typeof(v_pub -> 'chrome' -> 'favicon') = 'object'
              then jsonb_build_object('favicon', v_pub -> 'chrome' -> 'favicon') else '{}'::jsonb end;
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
