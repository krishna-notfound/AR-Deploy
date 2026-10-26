# PROD audit (products, variants, media, publishing)
Scope read: `src/features/products/**` (ProductEditorPage, ProductTable, useProductActions, productReadiness, ProductQrDialog, EmbedCodeDialog, editor/ProductEditorForm, formModel, VariantsEditor, ModelSection, LocalizedField), `src/components/ui/ImageUpload.tsx`, `src/services/validation.ts`, `src/lib/{slug,files,scale,product,format,urls}.ts`, `src/services/supabase/supabaseCatalogService.ts` (products, media, uploads, errors), `src/services/mock/mockCatalogService.ts` (products, uploads), `src/features/public/{ProductPage,CatalogPage,EmbedProductPage}.tsx`, `src/features/ar/variantMedia.ts`, `src/features/team/{permissions.ts,RolePermissionsPage.tsx}`. SQL: `20261012192143_init_schema`, `20261012192159_storage`, `20261012192454_save_product`, `20261013093006_publish_rules`, `20261020143507_variant_media`, `20261024065538_security_hardening`, `20261025070915_platform_team_roles` (product, storage and permission parts), `20261025180600_account_settings_optin_2fa` (is_business_member). Docs: PRD, DECISIONS, PROJECT_COMPLETION_STATUS §4/§7, SECURITY_REVIEW accepted risks, PRODUCTION_READINESS, CLIENT_HANDOVER, design/04, design/15, design/19, ADR-0025.

Checked and consistent (no finding): the UI publish checklist (`validation.ts:52-61`) matches SQL (CHECK `init_schema.sql:97-98`, `products_name_en_not_blank`, deferred gallery-image trigger `publish_rules.sql:52-62`). `published_at` is server-stamped. Products can't change business. Variant caps (50 / 20) match `save_product`. Variant ids stay stable. Exactly one primary image is sent and indexed. Variant media paths are regex-checked for owners and staff. Anon storage reads are tied to visible rows. Duplicates share files, and delete/replace only removes files nothing references any more. The editor locks the business once files are stored. The scale note says when only the GLB was measured.

## Findings

### PROD-01 "Open product page" / "Preview" shows "Product not found" for a published product in a draft or paused catalog — Medium — CONFIRMED
- Where: `src/features/products/editor/ProductEditorForm.tsx:333` (`preview: currentStatus !== 'published'`), `src/features/products/useProductActions.tsx:87` (`preview: p.status !== 'published'`), and the refusal at `src/services/supabase/supabaseCatalogService.ts:782` (same in mock `mockCatalogService.ts:215`). Correct pattern already used: `ProductEditorForm.tsx:684` (`preview: business.status !== 'active'`).
- What happens: a new owner's business stays `draft` until a platform admin activates it (ADR-0024 manual approval). The owner publishes a product, then clicks **Preview** in the editor or **Open product page** in the table. The URL has no `?preview=1`, so `getPublicProduct` runs without `allowDraft`, sees `business.status !== 'active'`, and the page says the product does not exist. The same happens for every product of a paused (`inactive`) business. Only the "Product published" dialog button works.
- Expected rule: ADR-0025 / DUX-02 says an owner of a draft or paused business can see their own catalog and products in preview. `ProductPage.tsx:72` already treats "business not active" as hidden-from-public and previewable.
- Fix sketch (UI): use `preview: p.status !== 'published' || business.status !== 'active'` in both places, or one `needsPreview(product, business)` helper in `lib/urls.ts`.
- Live check: as the owner of a draft business, publish a product and choose Products → ⋯ → Open product page.

### PROD-02 Two people editing one product at once: last save wins, and its media cleanup deletes the other person's new files or leaves rows pointing at deleted files — Medium — CONFIRMED (traced; needs two sessions to see live)
- Where: `supabaseCatalogService.ts:788-799` (`updateProduct`: re-reads `current`, saves, then `removeUnreferencedMedia(mediaPaths(current.data))`), `:595-605`. `save_product` (`20261020143507_variant_media.sql:139-271`) has no version or `updated_at` check and never checks that a referenced storage object exists.
- What happens: an owner and a platform admin (or one user in two tabs) open the same product. A replaces the GLB `O` with `X` and saves, so `O` is deleted from Storage. B's form still holds `O` and B saves. `save_product` re-inserts a row pointing at the deleted `O`, and B's cleanup then deletes `X` because the saved product no longer references it. Result: A's edits are silently lost, the product (possibly published) shows a missing photo or a broken model, and the AR button hands a dead URL to Scene Viewer or Quick Look. Text fields are lost the same way, with no warning.
- Expected rule: brief "Data integrity: races"; CLAUDE.md "never claim saved when it isn't". After B's save the editor says "All changes saved" while A's work is gone.
- Fix sketch (SQL + service): pass the loaded `updated_at` to `save_product` and raise a stable `product_changed_elsewhere` key when it differs (map it to "This product was changed by someone else. Reload."). Optionally refuse `storage_path` values with no `storage.objects` row.
- Live check: two browsers, same product; replace the model in one, save; change a field in the other, save; reload.

### PROD-03 Files uploaded in the editor but never saved stay in Storage forever — Medium — CONFIRMED (known gap, still bites)
- Where: uploads happen at pick time: `src/components/ui/ImageUpload.tsx:63`, `ModelSection.tsx` `onFile` → `service.uploadAsset` (`supabaseCatalogService.ts:965-985`). Remove and replace only edit form state: `ImageUpload.tsx:77`, `ModelSection.tsx` Remove → `onChange(undefined)`, `VariantsEditor.tsx:126`. Leaving ("Leave page", `ProductEditorForm.tsx` blocker) and failed saves discard the form. Cleanup (`removeUnreferencedMedia`) only looks at paths of the previously saved product (`:797`, `:817`).
- What happens: an owner uploads a 50 MB GLB, replaces it twice, then leaves without saving. Three 50 MB objects remain in `{business_id}/` and are never referenced or deleted. The same happens when a variant is removed before its first save, when a save fails validation after uploads, or when `createSignedUrl` fails right after a successful upload (`:980-981`: the file is stored but not added to the form). Only a full business delete sweeps them, and that sweep covers only the first 1000 objects (`:607-611`).
- Expected rule: design/19 "Known gaps: no orphaned-file cleanup" (accepted as open, not fixed). Storage quota and cost grow with ordinary editing.
- Fix sketch (service/UI): keep a per-editor list of paths uploaded this session. On remove, replace, leave or unmount, delete the ones not in the last saved product (best effort via `removeUnreferencedMedia`). Later, add a scheduled sweep of unreferenced objects older than a day.
- Live check: upload and replace a model without saving, then list `product-media/{business_id}` in the dashboard.

### PROD-04 Product permissions can be granted without the permissions they depend on: Publish fails with "no permission", and Delete leaves the files behind — Medium — CONFIRMED
- Where: role editor `src/features/team/permissions.ts:36-44` (no "Needs …" note for `products.publish` or `products.delete`, unlike `businesses.status` at `:22`). `admin_set_role_permissions` (`platform_team_roles.sql:582-615`) accepts any subset. The update policy needs `products.edit` (`platform_team_roles.sql:215-217`). The storage delete needs `products.edit` (`:297-299`). The table shows Publish when `products.publish` is held (`ProductTable.tsx:77-83`).
- What happens: (a) The Owner gives Team `products.publish` but not `products.edit`. A Team member clicks Publish, the PATCH matches 0 rows under RLS, and they get "Cannot publish yet: You don't have permission to do this." The permission they were given never works. (b) A role with `products.delete` but not `products.edit` deletes a product. The rows go (`:218-219`), but `removeUnreferencedMedia`'s `storage.remove` is filtered by RLS and fails silently, so every photo and model stays in Storage. The permission text promises "Deletes the product and its media."
- Expected rule: ADR-0029/0030 role table; brief "no dead buttons" and "UI allows what the DB refuses".
- Fix sketch (SQL + UI): either make `admin_set_role_permissions` add the implied permissions (publish/delete ⇒ edit ⇒ view) or refuse with `permission_requires`. Show "Needs Create and edit products" in the role editor. Or change the storage delete policy to `products.edit or products.delete`.
- Live check: on a test role, grant `products.publish` without edit and try Publish from the table.

### PROD-05 Client guide and PRD say variants don't change photos or 3D, and that the unit switch doesn't convert; both are false — Medium — CONFIRMED
- Where: `docs/CLIENT_HANDOVER.md:107-108` ("The 3D model and the photos stay the same for every option"), `:204` (Known limitations, same claim), `:99` ("The unit switch … does **not** convert them"); `docs/PRD.md:32` (R-09 INCOMPLETE, "doesn't change model, photos"), `:92-94`. Real behaviour: per-variant photos, GLB and USDZ (`VariantsEditor.tsx:147-176`, `20261020143507_variant_media.sql`, `variantMedia.ts:26-33`). The unit switch asks "Convert to …" (`ProductEditorForm.tsx` `pendingUnit` modal, `formModel.ts:63-72`). Internal drift too: `System_arch/design/19-supabase.md:126,130,192` (1-hour signed URLs, actually 12 h at `catalogService.ts:60`; "deleting a product does not delete its files", but it now does; "publish image rule is app-only", but it is SQL since `20261013093006`).
- What happens: the client reads the handover and believes finishes can't have their own photos or models, so they never upload them, or they report a "bug" when the page changes. An owner who follows "the switch doesn't convert" may press Convert on numbers that were already in inches.
- Expected rule: CLAUDE.md "Be honest in the UI"; the handover is the client's user guide.
- Fix sketch (docs): rewrite CLIENT_HANDOVER §Options and §Known limitations, set PRD R-09 to the shipped state (A-3 answered by variant_media), fix the unit-switch line, and refresh the design/19 storage section.
- Live check: not needed.

### PROD-06 A published product's URL slug can be edited with no warning, which breaks its printed QR code, embeds and shared links — Low — CONFIRMED
- Where: `ProductEditorForm.tsx:499-507` (slug always editable; the hint shows only the new URL); `ProductQrDialog.tsx:42` and the embed code encode the slug.
- What happens: an owner tidies the URL of a live product. Every printed product QR code, every embed on their website and every shared link now shows "product not found". Nothing in the editor says so.
- Expected rule: ADR-0025:14 (product QR codes are for published products because "the slug can still change" on drafts) and :22 (an accepted trade-off that the dialog steers people to the catalog QR code). Accepted, but the editor gives no warning at the moment the damage happens.
- Fix sketch (UI): when the product is published and the slug differs from the saved one, show an inline warning ("Links, QR codes and embeds that use the old address will stop working") and confirm before saving.
- Live check: not needed.

### PROD-07 Limits enforced only in the database come back as field-less or misleading errors — Low — CONFIRMED
- Where: `parseMoneyInput` (`lib/format.ts:11-15`) has no upper bound, and `price`/`price_delta` are `integer` (`init_schema.sql:82,140`). Dimensions are `numeric(8,2)` (`:85-87`) with no UI cap (`formModel.ts:80-86`). Several fields have JSONB/text caps (`:71-79` description 20000 B, material 2000 B for EN+PT together; `sku` ≤ 100, variant name ≤ 500 B at `:136-139`) but no `maxLength` (`ProductEditorForm.tsx` full description and material `LocalizedField`; `VariantsEditor.tsx:96-105`). Mapping: `mapDbError` `supabaseCatalogService.ts:182-191`.
- What happens: a price of 30,000,000.00 or a dimension of 1,000,000 raises 22003 and maps to `default` → "The request could not be completed. Try again in a moment." Retrying never helps. Long EN+PT material text or a 120-character SKU raises 23514 → "Some values were rejected. Check the fields and try again." with no field highlighted.
- Expected rule: brief "UI allows what the DB refuses → user gets a raw/useless error"; validation.ts is meant to mirror the DB (it already does so for the slug at `:34` and the variant caps at `:45-47`).
- Fix sketch (UI/service): add caps to `validateProductDraft` (price and delta ≤ 2,147,483,647 minor units, dimensions < 1,000,000, SKU ≤ 100) and `maxLength` on description, material and variant fields. Map 22003 to VALIDATION.
- Live check: not needed (deterministic).

### PROD-08 Saving a product that was deleted elsewhere says "You don't have permission to do this" — Low — CONFIRMED
- Where: `save_product` raises `'Product not found or access denied'` with 42501 (`20261020143507_variant_media.sql:207-209`). `mapDbError` maps 42501 to `teamFail('forbidden')` before it looks at `ctx.notFound` (`supabaseCatalogService.ts:185-186`; the ctx is passed at `:622`).
- What happens: an admin deletes a product while the owner has it open. The owner clicks Save and is told they lack permission, instead of "This product no longer exists."
- Expected rule: consistency with `refusedOrMissing` (`:674-679`), which already tells "forbidden" and "gone" apart.
- Fix sketch (SQL or service): raise a distinct key such as `product_not_found` (or, in the service, call `refusedOrMissing('products', { id })` on 42501 from `save_product`).
- Live check: not needed.

### PROD-09 The first variant is an unstated default: public price and photo differ from the dashboard, and reordering silently changes the public price — Low — CONFIRMED
- Where: catalog card price `initialPrice` = base + first variant's delta (`lib/product.ts:4-6`, `CatalogPage.tsx:214`); card photo = the product's own primary (`CatalogPage.tsx:200`); product page opens on the first variant's own photos and model (`variantMedia.ts:36-38`, `ProductPage.tsx:115-118`); dashboard table shows the base price (`ProductTable.tsx` price column, `formatMoney(p.price …)`); order comes from list position (`save_product` `sort_order = v_ord - 1`). `VariantsEditor.tsx:64-66` only says "The price difference is added … when a customer selects the option".
- What happens: base €1,000 and first finish "+€200". The dashboard lists €1,000, the public catalog shows €1,200, and the card shows the base photo while the page opens on the finish's photos. Moving another finish to the top changes the public price with no hint.
- Expected rule: PRODUCTION_READINESS:169 ("catalog card price = price the product page opens with"). This holds, but the editor and table don't say the first option is the default.
- Fix sketch (UI): label the first row "Default (shown first)", show "from €1,200" or the default price in the table, and use the default variant's primary photo on the card when it has one.
- Live check: not needed.

### PROD-10 A variant with a swatch or price difference but no English name is dropped on save without a message — Low — CONFIRMED
- Where: `formModel.ts:93-97`. Unnamed variants are filtered out, and the error fires only when PT name, SKU, photos or models exist. A price delta and a custom colour are not checked.
- What happens: the owner adds an option, picks a colour and enters "+50.00", but forgets the name. Save reports "Changes saved", and the option is gone.
- Expected rule: the code comment itself says "one with anything entered … must be named".
- Fix sketch (UI): add `v.priceDelta !== undefined || v.colorHex !== DEFAULT_SWATCH` to the condition.
- Live check: not needed.

### PROD-11 Removing a variant has no confirmation and breaks its shared `?variant=` links without telling anyone — Low — CONFIRMED
- Where: `VariantsEditor.tsx:126` (instant remove); `save_product` deletes missing variants and cascades their media (`variant_media.sql:268`); files are removed after save (`supabaseCatalogService.ts:797`); `pickVariant` falls back to the first variant (`variantMedia.ts:36-38`).
- What happens: a finish whose link (`?variant=<id>`, ADR-0026 embeds and shared links) is in use gets removed with one tap on the trash icon. On save its photos and models are deleted from Storage, and existing links quietly open a different finish at a different price.
- Expected rule: the product delete asks for confirmation (`useProductActions.tsx:55-60`); a variant with its own uploaded media deserves the same protection (brief: "deleting a variant in use").
- Fix sketch (UI): confirm when the variant is saved and has its own media ("Its photos and 3D files will be deleted when you save; links to this option will open the first option").
- Live check: not needed.

### PROD-12 Demo uploads don't model the real rules — Low — CONFIRMED
- Where: mock `uploadAsset` (`mockCatalogService.ts:573-579`) needs no `businessId` and returns no `storagePath`. Supabase refuses without a business (`supabaseCatalogService.ts:968`), and the editor's business lock depends on `storagePath` (`ProductEditorForm.tsx:205-209`). The mock also logs `product_unpublished` / `product_deleted` activity (`mockCatalogService.ts:299,333`), which Supabase's `getRecentActivity` (`supabaseCatalogService.ts:843-862`, `analytics.ts:92-107`) never produces.
- What happens: in demo mode an admin can upload photos before choosing a business and then switch business freely, so the "choose the business first" and "locked once files are stored" rules are never exercised by tests or demos. The demo activity feed shows events the real feed can't show.
- Expected rule: brief: "the demo must model the real rules".
- Fix sketch (mock): fail without `businessId` for non-logo uploads, return a fake `storagePath` (`{businessId}/{uuid}.{ext}`), and derive activity the same way as Supabase (or add real audit rows).
- Live check: not needed.

### PROD-13 Product categories are furniture-only while applications accept non-furniture industries — Low — CONFIRMED (known open decision C10, still bites)
- Where: `domain/types.ts:17` and SQL `init_schema.sql:80-81` (sofa…decor) vs `features/apply/ApplyPage.tsx:20` (fashion, jewellery, electronics, industrial, other).
- What happens: an approved "jewellery" business can only file products as sofa, chair, table and so on, so its catalog filters are meaningless.
- Expected rule: PROJECT_COMPLETION_STATUS §4 "Product categories: a fixed furniture list today, versus multi-industry (C10)". Still open.
- Fix sketch: client decision. Until then, either limit apply categories to furniture/lighting/decor or say so on the apply page.
- Live check: not needed.

## Ideas (optional, max 5 lines)
- A "where this product is used" panel (catalog QR, product QR downloads, embeds, `?variant` links) before slug changes, variant deletes and product deletes.
- A scheduled Edge Function that deletes `product-media` objects no row references after 24 h (closes PROD-03 and the business-delete 1000-object limit).
- Optimistic `updated_at` checks on business settings too, if PROD-02 is fixed for products.
