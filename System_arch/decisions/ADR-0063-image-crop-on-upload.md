# ADR-0063: Image crop on upload (react-easy-crop, original kept, edited copy shown)
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/12-features-admin.md, design/19-supabase.md, design/11-design-system.md; tasks: none (client round 3)

## Context
The client's brief "Universal Image Upload, Automatic Resizing & Manual Adjustment System" and the owner's direction ("the user should be able to crop and resize on the website while uploading … we don't need to fill background … simple engineering, not complex"). Today an uploaded photo is stored as it is and every page fits it its own way (some cover, some contain), so a wide or tall photo looks different on the card, the product page and the admin list. Owner answers (spec `docs/superpowers/specs/2026-11-11-image-crop-on-upload-design.md`): keep the original and allow re-editing; the default is the whole picture, fitted; no gap-fill tricks (crop and resize are the fix); a picture saved without filling the frame gets a nudge and is then allowed.

## Decision
- **A crop dialog opens on every product and option photo upload** (`ImageCropDialog`, `src/components/image/`; the Website Editor, company logo and profile photo follow in the same project). It starts on the **whole picture, fitted** in the frame. Nothing is cropped automatically; a crop exists only because the user chose it ("Fill the frame", zoom or drag). No AI, no generative fill, no stretching.
- **New dependency `react-easy-crop` 6.2.4**, pinned exactly (published 2026-10-06, more than 14 days old; MIT; one small dependency, `normalize-wheel`; peer `react`). It does the drag, wheel and pinch handling; the position and zoom are controlled by our code, `restrictPosition={false}` lets the whole picture sit inside the frame, and its stylesheet is imported (`disableAutomaticStylesInjection`, so the CSP's `style-src` is not involved). All the crop maths (whole, fill, view to rectangle) is ours, in `src/lib/imageCrop.ts`, with unit tests.
- **Output:** `renderCrop` draws the chosen rectangle of the original (EXIF orientation applied, long side at most 2000 px, 100 MP cap kept) to a canvas and writes WebP at 0.85 (JPEG where WebP cannot be written; a part of the rectangle outside the picture stays transparent in WebP and is flattened to white in JPEG). The rectangle (`CropArea`, in the original's pixels, may reach past the picture) is stored as `crop`.
- **Storage:** both files are uploaded to the existing `product-media` bucket with the existing `{business_id}/{uuid}.{ext}` path rule: the **untouched original** (`original_path`) and the **edited copy** (`storage_path`, what the pages show). **Edit picture** reopens the original with its `crop`; saving uploads a new edited copy. A photo from before this change has no original: its shown file becomes the original the first time it is edited. Nothing in this feature deletes an original or an old copy; the existing clean-up after a product delete or a replaced photo still removes files nothing references, and now counts a file as in use while it is some photo's `original_path`.
- **Database (migration `product_image_crop`, backward compatible):** `product_images` and `product_variant_images` get `original_path text null` and `crop jsonb null` (a check: an object with numeric `x`, `y` and positive `width`, `height`, no other keys). The four write policies hold `original_path` to the product's own business folder with the exact upload shape, like `storage_path`. `save_product` (from its latest body) takes `original_path` and `crop` per photo and per option photo; both are optional, so an old caller works unchanged. `private.unreferenced_media_paths` treats an original as in use. A visitor's API call can read the two columns of a published product's photo (a random path and four numbers) but not the file: the product-media select policy for anon matches `storage_path` only. A rollback and PGlite tests (apply, rollback, re-apply) come with it.
- **Demo mode** keeps the same flow: the picture is resized to the demo's 1600 px data URL first (so the crop is measured on the file that is kept), the original and the edited copy are both kept as data URLs, and `getMediaUrl` hands back what it is given.
- **Reading the original:** the product read does not sign originals. `CatalogService.getMediaUrl(storagePath)` signs one on demand when the owner clicks Edit picture.

## Consequences
- Good: one place to fix a photo's framing; the owner can always go back to the original; every page shows the same shape (ADR-0064).
- Good: the maths is ours and tested; the library only moves the picture.
- Trade-off: each photo stores two files (the original up to 5 MB plus an edited copy of about 100 to 400 KB); in demo mode both sit in the browser's storage.
- Trade-off: the dialog adds a step to every upload; Cancel skips only that file, and saving the untouched dialog keeps the whole picture.
- Trade-off: one new package (about 40 KB, minified) in the editor chunk.

## Alternatives rejected
- Server-side cropping or resizing: the project has no custom backend (ADR-0015).
- Cropping automatically to a frame on upload: the owner said nothing is cropped unless the user chooses it.
- Filling the frame with a blurred copy or generated background: the owner ruled out gap-fill tricks.
- A hand-written cropper without a library: pinch, wheel and touch drag across browsers are the part most likely to break; the maths we need is small and stays ours.
- Overwriting the stored file on edit: it would lose the original and make re-editing impossible.
