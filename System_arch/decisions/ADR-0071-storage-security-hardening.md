# ADR-0071: Storage security hardening (bucket limits, avatar names, staff media rights, business-wide AR sync)
- **Status:** Accepted (migration written, not applied; the Edge Function is not redeployed)
- **Date:** 2026-11-14
- **Affects:** design/19-supabase.md, design/20-deployment.md; supabase/migrations/20261114123508_storage_security_hardening.sql

## Context
The QA report of 2026-11-14 raised five storage items. Checked against the code and, read-only, the live project: anonymous visitors list only files a published product of an active business uses (33 listed, 0 unreferenced; not a bug). The rest were real: bucket limits above the largest legitimate file; the avatars bucket accepts any content declared as a picture; staff with only `products.edit` (the Team role) can delete or overwrite any product-media file; a public AR copy (ar-models, public URL, no RLS) survives a paused business when the pausing staff member cannot read the products.

## Decision
1. **Limits equal the largest legitimate file.** business-logos 40 MB to 5 MB (a banner original is a picture of at most 5 MB, `IMAGE_RULES`; this replaces the 40 MB of ADR-0065), product-media and ar-models 50 MB to 40 MB (the largest file is a 40 MB USDZ). site-content stays at 40 MB (.usdz), avatars 512 KB, model-request-photos 10 MB, application-files 20 MB. The migration only lowers.
2. **Avatars.** A file name must be `{user id}/{uuid}.{jpg|png|webp}`. A policy cannot read content, so the app (`uploadAvatar`) also reads the file header and refuses a file whose real type is not the declared one (`imageMimeOf`). The crop dialog already re-encodes every profile photo through a canvas.
3. **Staff with `products.edit` only** may delete or overwrite a product-media file only when no product, option, photo original or request references it (what replacing a picture or a model needs). `products.delete`, `businesses.delete` and `models.manage` keep their rights. Helper: `public.product_media_editor_can_change(text)`.
4. **Business-wide AR sync.** `sync-ar-models` accepts `{ businessId }` and lists the business's products and folders itself (service role); gate `public.can_sync_ar_models_business`. The client calls it once when a business is paused, resumed or deleted, and tries a failed call once more. `{ all: true }` also clears every ar-models folder whose product is not published (reconcile).

## Consequences
- Good: a caller with a lawful right to pause a business always removes its public copies; the Team role cannot destroy live media; odd avatar names and files that are not pictures are refused in the app.
- Trade-off: a polyglot file with a valid picture header can still be stored in avatars by a direct API call (Storage cannot sniff bytes); the bucket's content types are images, so a browser never runs it. The ar-models bucket stays public (stable URL for phone AR); a stale copy is removed by the function, not hidden by a policy, so a lost call still leaves a copy until the reconcile runs. A scheduled run is the owner's decision (see the QA log).

## Alternatives rejected
- Make ar-models private with signed URLs or a proxy: Scene Viewer and Quick Look need a stable public URL (owner decision 2026-10-26).
- Delete rows from `storage.objects` in a database trigger: the files would stay in the object store, unreachable and unremovable.
- Lower business-logos to 2 MB: it would refuse a normal photograph kept as a banner original (ADR-0065).
