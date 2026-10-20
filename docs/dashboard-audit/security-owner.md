# Security delta: owner dashboard and variant media (Agent E)

Date: 2026-10-20. Branch `feature/sanctus-brand-design-system`. Read-only: no repo edits, no live calls.
This is a delta on `nextlevel/findings/security.md` (SEC-20 to SEC-28). It does not repeat those findings. Where an item overlaps one, the overlap is named.

## Evidence

All files are in `<local>`.

- `owner-probe.mjs` → `owner-probe-out.txt`. It applies all 9 migrations to PGlite with Supabase-style default privileges (anon and authenticated get ALL on new tables and functions, as on a real project). It then runs about 60 probes as `anon`, `authenticated` and `service_role`.
  - Owner OB owns business B. This is the attacker.
  - Owner OA owns two businesses, A and C. One user owning several businesses is allowed: the one-owner index is per business.
  - A has one published product and one draft product, each with stored media, a model and a variant.
- `variant-media-sketch.sql` and `variant-probe.mjs` → `variant-probe-out.txt`. These apply the proposed variant-media migration on top and run 23 probes.

Severity scale (same as SEC-*):
- P1: takeover.
- P2: abuse or integrity problem with moderate impact.
- P3: hardening.

## Summary

| ID | Sev | Conf. | Title |
|---|---|---|---|
| OWN-01 | P3 | High (repro) | A product can be moved to another business through the Data API. Its media then points into the old business's folder, which gives cross-tenant serving and replacement, and the product can no longer be saved |
| OWN-02 | P3 | High (repro), platform part a hypothesis | `storage_path` is checked on its first path segment only. Traversal-shaped and arbitrary-shape paths are accepted |
| OWN-03 | P3 | High (repro) | Some publish and integrity rules exist only in the UI: a whitespace English name, a negative variant `price_delta`, several primary images, unlimited variants and images |
| OWN-04 | P3 | High (code + repro) | Anyone can inflate any published product's analytics, even after SEC-22 is fixed: no dedupe, IPv6 per-address keys, and `ar_activation` accepted for products with no 3D model |
| OWN-05 | P3 | High | The AR metric is labelled bare "AR" in tables and "Activations per product view" in a hint, but the event is a launch attempt |
| OWN-06 | P3 | High (repro) | Media `url` columns accept any host, including plain `http://`. Owner-chosen third-party hosts get every visitor's IP, and AR loads 3D files from them (extends SEC-27 and SEC-24) |

**No P0, P1 or P2.** All six attack questions (a) to (f) fail for an owner of a *different* business (see "Confirmed OK"). OWN-01 needs one user who owns two businesses and makes a direct API call.

---

## OWN-01: Products can change `business_id`, and their media stays in the old tenant's folder

- **Severity:** P3. **Confidence:** High (reproduced).
- **Location:**
  - `20261012192143_init_schema.sql:279-282`: the products UPDATE policy only checks membership of the *new* `business_id`.
  - `:290-294` and `:303-307`: the folder check on `storage_path` runs only when an image or model row is written, never when the parent product moves.
  - There are no column grants, so `business_id` is updatable (SEC-27 lists the same root cause for other columns).
  - `supabaseCatalogService.ts:522-528`: `removeUnreferencedMedia` says "Cross-business references are impossible (RLS)". That stops being true here.
  - The UI cannot do this, because the business selector is disabled for existing products (`ProductEditorForm.tsx:358`), and `save_product` ignores `business_id` on update (probes f4 and f5).
- **Preconditions:**
  - A user who owns two businesses, or a platform admin, makes a direct PATCH to `/rest/v1/products`.
  - `provision-owner` allows linking an account that already owns another business (SEC-20 fix text), so this state is supported.
- **Repro:** `owner-probe-out.txt`:
  - `f2`: OA runs `update products set business_id=C where id=<A product>` and it succeeds (1 row).
  - `f3`: the product is now in C, and its image is `A/pub.png`.
  - `f9`: a normal editor save of that product now fails with an RLS violation on `product_images`. The product cannot be edited until its media is replaced.
  - `f6` and `f7`: after OA loses business A (it is reassigned), anon still reads `A/pub.png` through C's published product.
- **Impact:**
  - Business A's next owner controls files that appear on business C's public page. Storage UPDATE and DELETE on their own folder lets them replace or delete those files: cross-tenant content injection, at low likelihood.
  - A's files are exposed through a tenant A no longer controls.
  - The product breaks in the editor.
  - Analytics: the composite FK on `product_analytics` (no ON UPDATE) blocks the move once a product has events. So the problem mainly affects new or untracked products.
- **Root cause:** `business_id` is treated as mutable. Child-row invariants are validated only on child writes.
- **Fix:** Use a forward migration with the immutability trigger in `variant-media-sketch.sql` §0 (`private.products_business_immutable`, `before update of business_id`, which raises `42501` for anon and authenticated, admins included). Proven by `v19` and `v20`. Alternatively, apply SEC-27's column-level UPDATE grant list, which already omits `business_id`. The trigger is preferred because it covers admins too. Then update the `removeUnreferencedMedia` comment.
- **Regression test:** In `supabase/tests/migrations.test.ts`, add a second business for OWNER. Expect `update products set business_id=<second>` to be refused with `product_business_immutable`, and the same for ADMIN.

## OWN-02: `storage_path` is validated by its first segment only

- **Severity:** P3. **Confidence:**
  - The DB part is reproduced.
  - Whether Supabase Storage normalises `..` in keys is **unverified** (a hypothesis). If it does not, the issue is harmless today.
- **Location:** the WITH CHECK in `init_schema.sql:294` and `:307` is `split_part(storage_path,'/',1) = business_id`. The length cap is 512 and there is no shape check.
- **Repro:**
  - `b3`: OB saves its own product with `storage_path = 'B/../A/draft.png'`, and it is accepted.
  - `b4`: anon still cannot read `A/draft.png`, because the storage SELECT policy compares the literal `name`. So there is no leak at the database level.
- **Impact:**
  - Defence in depth only. Safety rests on Storage never resolving `..`, and on every future consumer comparing literal names.
  - Arbitrary shapes also make media cleanup and audits harder.
- **Fix:**
  - In a new migration, replace both write policies' path condition with the exact upload shape that `uploadAsset` produces (`supabaseCatalogService.ts:888`):

    ```sql
    storage_path is null or storage_path ~ ('^' || p.business_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$')
    ```

  - Before applying, run this read-only pre-check on each project: `select count(*) from product_images where storage_path !~ '<regex without business>'` (and the same on `product_models`). `save_product` rewrites every row on each save, so one legacy row in another shape would block the product's saves.
  - Also restrict the upload extension to a known list in `uploadAsset`.
- **Regression test:** PGlite: `save_product` with `B/../A/x.png` and `B/sub/x.png` is rejected. `B/<uuid>.png` is accepted.

## OWN-03: Some publish and integrity rules exist only in the UI

- **Severity:** P3 (an owner can only damage their own catalogue, but the public page shows the result). **Confidence:** High.
- **Repro:** all of the following were allowed on a published product:
  - `c3`: English name of `"   "`. The DB checks `name->>'en' <> ''`, while the app trims (`validation.ts:48`).
  - `c4`: variant `price_delta = -1000`. The app refuses negatives (`validation.ts:41`). `ProductPage.tsx:129` adds the delta, so the shown price can be below the base price or negative.
  - `c5`: two primary gallery images.
  - `c7`: 1000 variants on one product. There is no cap on images or variants either. Every public page load fetches and signs all of them.
- **Fix:**

  ```sql
  alter table public.product_variants add constraint product_variants_price_delta_nonneg check (price_delta is null or price_delta >= 0);
  -- products: replace the publish check's name test with btrim(name->>'en') <> ''
  create unique index product_images_one_primary on public.product_images (product_id) where is_primary and kind = 'gallery';
  -- caps inside save_product (see sketch: too_many_variants), plus jsonb_array_length(p_images) <= 30
  ```

  Pre-check existing data on each project before adding the checks, because the constraints validate existing rows.
- **Regression test:** Each case above should be refused in PGlite with a stable error key, and each key should be mapped in `DB_RULES`.

## OWN-04: Analytics counts can be inflated by anyone (beyond SEC-22)

- **Severity:** P3. These are vanity metrics with no billing attached. If they ever feed client reporting, raise it to P2. **Confidence:** High.
- **What is right:**
  - Events are tied to a product that is **published**, belongs to the **given business**, and sits in an **active business** (`record_event_limited`; probes h3 and h4 return `invalid`).
  - Browsers cannot insert directly (h1, h2).
  - Owners cannot delete or edit events (h7).
  - The limiter works for a fixed key (h6).
- **Gaps:**
  1. **No dedupe.** Each visitor key may record 30 events a minute, about 43,000 a day, on any single product. The limiter has no per-product or per-day uniqueness.
  2. **IPv6.** `visitorKey` hashes the full address (`track-event/handler.ts:39-42`). One home /64 has 2^64 distinct keys, so the per-IP limit does not hold even once SEC-22's XFF fix lands.
  3. **AR events need no model.** `ar_activation` and `model_interaction` are recorded for a product that has no GLB or USDZ (h5). The UI only fires them when a model exists, so these can only come from direct calls.
  4. **No origin binding.** CORS is `*` and a server-side caller ignores it anyway. This is expected for a public beacon, but it means the counts are not tamper-evident.
- **Fix:**
  - Bucket IPv6 by /64 (and IPv4 by /32) before hashing.
  - Add `private.analytics_seen(visitor_key, product_id, event_type, day)` with a PK and `insert … on conflict do nothing`. Record only first-seen `view` and `ar_activation` per visitor, product and day. This needs an owner decision, because the metric changes from page views to daily unique visitors.
  - In `record_event_limited`, require `exists (select 1 from product_models where product_id = p_product_id)` for `ar_activation` and `model_interaction`.
- **Regression test:**
  - Handler: two IPv6 addresses in the same /64 produce the same key.
  - SQL: `record_event_limited` called twice with the same key, product and day gives one row.
  - SQL: `ar_activation` on a product with no model returns `invalid`.

## OWN-05: AR metric labelling

- **Severity:** P3 (CLAUDE.md "be honest in the UI"). **Confidence:** High.
- **Semantics:**
  - `ar_activation` fires once per AR button tap, before `activateAR()` is called, and whether or not AR starts (`ProductPage.tsx:140-149`). The comment says "never the piece was placed".
  - Most surfaces say "AR launch attempts" (`AnalyticsView.tsx:72,97`, `BusinessOverviewPage.tsx:58`, `AdminOverviewPage.tsx:68`, `Charts.tsx:11`).
- **Where it slips:**
  - `ProductTable.tsx:89` has the column header **"AR"**, and line 129 shows "N AR".
  - `AnalyticsView.tsx:146,172` shows "N AR".
  - `AnalyticsView.tsx:99`: the "AR launch rate" hint reads "Activations per product view".
- **Fix:**
  - Header "AR attempts". Compact text "N AR attempts".
  - Hint "AR launch attempts per product view (not confirmed AR sessions)".
- **Regression test:** A component test asserting the header text.

## OWN-06: Media `url` columns accept any host, including `http://`

- **Severity:** P3 (privacy and integrity of the public page; the owner chooses it). **Confidence:** High.
- **Location:**
  - `product_images.url` and `product_models.url` accept `^(https?://|/[^/])` (`init_schema.sql:114,127`).
  - The editor deliberately allows model links (`ModelSection.tsx:111`, https only). The DB also accepts `http://` (probe b5), and accepts an image URL on any host as the only gallery image of a published product.
- **Impact:**
  - Owner-chosen third parties receive every visitor's IP and user agent (the same class as SEC-27's logo).
  - Mixed content.
  - Scene Viewer and Quick Look fetch 3D files from arbitrary hosts.
  - The CSP is report-only (SEC-24), so nothing blocks any of this.
- **Fix:**
  - At minimum, `check (url ~* '^(https://|/[^/])')`.
  - Product decision: for **published** products, require `storage_path` (owner uploads) for gallery images and models. Or put external hosts on an allowlist that the CSP `img-src` and `connect-src` mirror.
- **Regression test:** PGlite: an `http://` URL is refused.

---

## Confirmed OK (this delta, re-proved)

Owner OB attacking business A:

- **(a) Writing another business's rows** is refused in every form:
  - `save_product` update of A's product: `42501`. Create in A: RLS (a1, a2).
  - Direct update or delete of A's products, variants and images affects 0 rows (a3, a4, a9, a10).
  - Insert of images, models or variants under A's product is refused by RLS (a5, a6, a7).
  - Moving OB's own variant to A's product is refused by RLS (a8).
- **(b) Asset cross-linking:** `save_product` with `p_images` or `p_models` `storage_path` in A's folder is refused by RLS (b1, b2, b6).
- **(c) Publish rules:**
  - Publishing without a gallery image fails at commit, even across statements (c1).
  - `price = 0` hits a check violation (c2).
  - The owner cannot change their business's status (c6).
  - `published_at` is stamped by the server (the existing test).
- **(d) Drafts of another business:**
  - The product, its images, models and variants, and its analytics (raw and daily) all return 0 rows (d1, d2, d4, d5).
  - `save_product` on another business's draft id and on a random id return the same `42501`, so there is no existence oracle (d6, d7).
- **(e) Another business's storage:**
  - Draft and unreferenced objects cannot be read (e1, e2). The folder listing shows only the published file (e8).
  - Update/replace and delete affect 0 rows (e4, e5).
  - Upload into A's folder and renaming into A's folder are refused (e6, e7).
  - Published media is readable by design (e3).
- **(f) `business_id`:**
  - A single-business owner cannot move a product (f1).
  - `save_product` ignores `business_id` on update (f4, f5).
  - The multi-business case is OWN-01.
- **Lifecycle:**
  - Unpublish works, and anon immediately loses read access to its media (g1, g2).
  - Duplicate references the same files in the same folder, and `save_product` cannot re-home it (g3).
  - Delete cascades (g4).
  - Client cleanup deletes only files that no row visible to the caller references (`removeUnreferencedMedia`). That is correct while OWN-01 is impossible.
  - Note: `published_at` stays set after an unpublish (g1). This is cosmetic, not security.
- **Analytics:** covered under OWN-04 (h1 to h4, h6, h7).
- **Client authorization:** no owner screen relies on hidden UI for authorization. Every hidden or disabled control is backed by RLS.
  - Owner business id: it comes from `business_members` (`services/supabase/auth.ts:80`), never from the URL.
  - `/dashboard/products/:id` of another business: the editor shows "not found" (`ProductEditorPage.tsx:40`), which is UX only. RLS backs it: a published foreign product is readable but not writable (a1, a3).
  - `getProductsByBusiness(otherId)` returns only public rows.
  - Analytics: `getBusinessAnalytics(otherId)` returns nothing (RLS plus the `security_invoker` view).
  - `BusinessForm mode="owner"` hides slug and status, and the `guard_business_admin_fields` trigger backs that (c6). The other writable owner fields are SEC-27.
  - Upload paths are built client-side, but the storage policy enforces the folder (e6).
  - The business selector is disabled on existing products, and the server ignores it (f4).
  - `RequireRole` is UX only, as documented. Admin RPCs check `is_platform_admin()` (SEC baseline).
  - Product note (not security): `auth.ts:80` picks only the most recent membership, so a multi-business owner sees one business in the UI.

---

## Variant media security spec (owner-approved additive migration)

The full SQL is in `sec/variant-media-sketch.sql`. It was applied to PGlite on top of all 9 migrations and passes all 23 probes in `variant-probe-out.txt`. Create the real file with `npx supabase migration new variant_media`, and never apply it without the owner's go-ahead.

### Design decisions

1. **Separate child tables** `product_variant_images` and `product_variant_models`. Both carry a denormalised `product_id` and a **composite FK** `(variant_id, product_id) → product_variants (id, product_id)`, using the new `unique (id, product_id)` (always true, because `id` is the PK).
   - This guarantees a media row's variant belongs to the product its RLS is evaluated against. A row cannot combine a foreign variant with its own product (v6: FK error).
   - RLS WITH CHECK runs before the FK, so the FK error is no existence oracle: a foreign product is refused by RLS first (v7).
2. **`storage_path` only, no external `url`.** Variant media is always an owner upload (this avoids OWN-06 from day one).
3. **Strict path shape in WITH CHECK:**
   - `^<products.business_id>/<uuid>\.(png|jpe?g|webp)$` for images and `\.(glb|usdz)$` for models.
   - This blocks other business folders (v1, v2), `..` and sub-folders (v3), and a model in an image slot (v4). It is stronger than today's first-segment check (OWN-02).
4. **Read** follows parent product visibility: `exists (select 1 from products p where p.id = product_id)`. Products RLS applies inside the subquery, so anon sees only published products of active businesses (v10, v14, v15).
5. **Grants:**
   - `revoke all … from anon, authenticated` first, because Supabase default privileges give ALL on new tables.
   - anon gets `select`. authenticated gets `select, insert, delete`. **No UPDATE**, so `variant_id` and `product_id` can never be re-pointed (v8). service_role gets `all`. Verified in v21.
6. **Storage:** an additive SELECT policy, "Media of visible variants is readable", is ORed with the existing one, so published variant files can be signed by anon (v16). Files of draft products stay private (v14). Once the variant or its media row is removed, the file is no longer readable (v18).
7. **`save_product`:**
   - It is replaced *in place* with the same signature, so its ACL is kept. It stays SECURITY INVOKER, so every write passes RLS.
   - Variants are **upserted** so their ids stay stable (today they are deleted and re-inserted on every save, which would cascade-delete variant media). A client-sent id is honoured only by `update … where id = $id and product_id = v_id`. Any other id is ignored and a fresh one is generated. This means no hijacking of another business's variant and no id squatting (v5, v5b, v13).
   - Removed variants are deleted at the end and cascade their media (v17).
   - Caps: at most 50 variants (v11) and at most 20 images per variant. `sort_order` comes from the array position.
   - The trailing `revoke … from public, anon; grant … to authenticated, service_role` is re-asserted. If the signature ever changes, the new overload would otherwise inherit anon EXECUTE. v22 shows anon is denied.
8. **Include OWN-01's trigger** (sketch §0) in the same migration. Otherwise a moved product would carry its variant media into another tenant (v19 and v20 show the move refused for owner and admin).

### Required client changes (same PR)

- `hydrate`: sign the variant media paths too.
- `removeUnreferencedMedia`: also query `product_variant_images` and `product_variant_models` before deleting any file. Otherwise replacing a product image could delete a file that a variant or a duplicate still uses.
- `toSaveProductArgs`: send `variants[i].id` (stable), `images[]` and `models[]` with `storage_path` only.
- `duplicateProduct`: no change needed. The new product id makes `save_product` mint fresh variant ids.
- Mock service parity (demo mode), and `DB_RULES` keys for `too_many_variants` and `too_many_variant_images`.

### Test cases for `supabase/tests/migrations.test.ts`

These are ported from `variant-probe.mjs`.

1. Another owner's variant image or model path in A's folder → refused by RLS (v1, v2).
2. `B/../A/x.png`, `B/sub/x.png`, `B/<uuid>.glb` as an image → refused by RLS (v3, v4).
3. `save_product` with A's variant id → A's variant is unchanged and B gets a new id (v5, v5b).
4. Direct insert of (A variant, B product) → FK error. Insert on A's product → RLS error (v6, v7).
5. Owner UPDATE of a variant media row → permission denied. anon INSERT → permission denied (v8, v9).
6. Stranger reads a draft's variant media → 0 rows (v10).
7. 51 variants → `too_many_variants` (v11).
8. Owner adds media to an existing variant → the id is kept (v12, v13).
9. anon storage read of a variant file: draft gives 0, published gives 1, after the variant is removed gives 0 (v14, v16, v18).
10. A `business_id` change by owner or admin → `product_business_immutable` (v19, v20).
11. Grants match the spec, and anon cannot execute `save_product` (v21, v22).
