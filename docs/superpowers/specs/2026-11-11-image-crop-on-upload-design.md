# Image crop dialog on upload (2026-11-11)

Source:
- the client's brief "Universal Image Upload, Automatic Resizing & Manual Adjustment System";
- the owner's direction: "user should be able to crop and resize on the website while uploading … we don't need to fill background … simple engineering, not complex".

Owner answers:
- keep the original and allow re-editing;
- the default is the whole picture, fitted;
- no gap-fill tricks: crop and resize are the fix;
- if a picture is saved without filling the frame, nudge and then allow it;
- applies to product and variant photos, Website Editor pictures, the company logo and the profile photo;
- one shape per place, with **4:5 for every product photo, including the product page**.

## Rules

- **Nothing is cropped automatically.** The dialog opens showing the whole picture. A crop only happens when the user chooses it ("Fill the frame", zoom or drag).
- **No AI, no generative fill, no stretched pictures.**
- **The original file is never changed or deleted** by this feature. Existing pictures keep working unchanged; they show whole, as today.

## 1. The dialog: `ImageCropDialog` (shared, `src/components/image/`)

- **Library:** `react-easy-crop`, exact version pinned. It is a new dependency, so it gets ADR-0063 with its row.
- **Props:**
  - `file` (a `File` or `Blob`) or `src` (re-edit);
  - `aspect` (a number);
  - `initialCrop?` (a `CropArea`);
  - `title`;
  - `onSave({ blob, crop, whole })`;
  - `onCancel`.
- **UI:**
  - the frame in the target shape and the picture inside;
  - drag to move;
  - zoom with a slider (with − and + buttons), the mouse wheel, or pinch on touch;
  - buttons: **Fill the frame** (zoom so the picture covers the frame, centred), **Show whole picture** (zoom out until all of it fits), **Reset**, **Cancel** and **Save**.
- **Starting state:** the whole picture fitted. This needs `minZoom < 1` / `restrictPosition={false}` so the whole picture can sit inside the frame.
- **The nudge:** when the picture does not cover the frame, a note says "This picture doesn't fill the frame." next to **Fill the frame**. Save stays allowed (`whole: true`).
- **Accessibility:** a dialog with focus trap, Escape cancels, all controls work by keyboard (arrow keys move, +/− zoom), and touch targets are at least 44 px.
- Bilingual through `t()` (EN + PT-PT), tokens only, light and dark.

## 2. Processing: `src/lib/imageCrop.ts` (pure where possible, with unit tests)

- **`CropArea = { x, y, width, height }`:** in original pixels; it may extend past the picture when saved "whole".
- **`renderCrop(source, crop, { maxSide: 2000, type: 'image/webp', quality: 0.85 })`:**
  - draws the crop on a canvas (OffscreenCanvas when available, else a DOM canvas, following the `modelOptimize` and `lib/image.ts` patterns);
  - honours EXIF orientation (`createImageBitmap(…, { imageOrientation: 'from-image' })`);
  - scales so the long side is at most 2000;
  - WebP output, falling back to JPEG when WebP encoding isn't supported;
  - **Transparent areas:** a "whole" save with a transparent area stays transparent in WebP, and is flattened to white in the JPEG fallback.
  - **The 100 MP cap** from `lib/image.ts` stays.
- **Pure helpers:** `fitWholeCrop(imgW, imgH, aspect)`, `fillFrameCrop(imgW, imgH, aspect)` and `coversFrame(crop, imgW, imgH)`.

## 3. Frames: one module, `src/lib/imageFrames.ts`

| Key | Aspect | Used by |
|---|---|---|
| `product` | 4/5 | Product and variant photos: catalogue card, **product page stage (now 4:5 at every width)**, stage thumbnails, "More photos", admin product thumbnails, editor photo grid |
| `hero`, `banner` | 16/9 | Landing hero, banner sections. These are full-width, so they keep `object-cover`; the editor notes that very narrow screens trim the sides slightly |
| `collection` | 4/5 | Landing collection cards |
| `aboutMain` | 4/5 | About main photo |
| `aboutDetail` | 1 | About detail photo |
| `imageText`, `qr` | 4/3 | Picture + text section, QR section picture |
| `logo`, `avatar` | 1 | Company logo, profile photo |

- **Display:** all except hero and banner use `object-contain` in their frame, so a cropped file fills it exactly and an uncropped "whole" save shows whole on the card's plain colour. The site's own built-in photos (static assets) keep their current look.
- **Frame shapes come from this module,** not from hardcoded aspect classes per component.

## 4. Uploads and storage

- **Flow:** pick a file → the existing validation (type and size) → the dialog → upload **both** the original and the edited WebP to the existing bucket and path pattern, each with its own uuid name (both buckets' path rules already allow webp) → save `path` = the edited copy, `originalPath` = the original, and `crop`.
- **Re-edit:** the **Edit picture** button on an image opens the dialog with `src` = the original (or, for an old picture without `originalPath`, the current file) and `initialCrop`. Save uploads a new edited copy. Neither the original nor the old copy is deleted by this feature; any existing orphan clean-up keeps its current behaviour.
- **Logo and avatar:** crop on upload only, with no stored original and no re-edit. The avatar replaces today's automatic `squareResize` centre-crop with the dialog (1:1). Its output stays at 256–512 px within its 512 KB bucket limit.
- **Out of scope:** model-request photos (originals kept), the favicon (stays the PNG square check), and showcase pieces (they use product photos).

## 5. Database (backward compatible; the owner allows applying it to the TESTING database once tests pass)

- **Migration A (product photos):**
  - `product_images` and `product_variant_images` get `original_path text null` and `crop jsonb null`;
  - `crop` has a check: an object with numeric `x`, `y` and positive `width`, `height`;
  - `original_path` follows the same storage path rule as `storage_path`, and the same RLS;
  - `save_product` accepts and stores `originalPath` and `crop` per image and per variant image. They are optional, and old callers still work;
  - the read mapping (`normalizeImages` and the variant mapping) returns them **to the editor only**. Public pages ignore them; whether the column is sent to the public read is decided by the existing select/grants, and no original is exposed to visitors;
  - a rollback plus PGlite tests.
- **Migration B (site content):**
  - `SiteAsset` and `SiteImage` get optional `originalPath` and `crop`;
  - `private.validate_site_content` and/or `private.check_site_content_shape` are replaced **from their latest bodies** (`20261111083034_landing_sections.sql` and `20261111095614_apply_form_delete_anything.sql`), adding only these optional keys: `originalPath` through `private.site_asset_ok`, `crop` by shape. The TS mirror is updated together;
  - a rollback plus PGlite tests.
- **The demo/mock service** supports everything.

## 6. Work split (two agents, one after the other)

- **IC-1, core and products:** dependency + ADR-0063, `imageCrop.ts`, `imageFrames.ts`, `ImageCropDialog`, Migration A, product and variant photo upload and Edit picture (`ImageUpload.tsx`, `VariantsEditor.tsx`), product frames at 4:5 (stage, thumbnails, More photos, admin thumbnails, editor grid).
- **IC-2, Website Editor, logo and avatar:** Migration B, `UploadButton` and its callers (hero, collections, sections, QR, About) passing their frame and offering Edit picture, landing rendering per the frame table, `LogoUpload` and the profile photo through the dialog.

## Done (each agent)

- **Tests:**
  - unit: the crop math, `renderCrop` sizes and type (jsdom canvas mocked);
  - component: the dialog buttons, nudge, keyboard, cancel;
  - the upload flow in the demo service;
  - PGlite: apply, rollback and re-apply.
- **Playwright with fixtures** (square, portrait, landscape, very wide 4:1, very tall 1:4, transparent PNG, white-background JPG, 4000 px JPG):
  - upload → dialog → Fill the frame / Save whole → card and product page show it without distortion;
  - reopen → the crop is kept;
  - existing pictures unchanged.
- Screenshots at 1440 and 390 px, looked at.
- `typecheck`, `lint` (0 errors), `test` and `build` pass.
- **Records:** ADR-0063 (dependency, crop on upload) plus its README row; ADR-0064 (product photo frame 4:5 everywhere, amends ADR-0054/0062) plus its README row; the design notes; and the `docs/CLIENT_HANDOVER.md` how-to.
