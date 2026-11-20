# ADR-0081: Main product photos have two crops: catalogue card and product page
- **Status:** Accepted (supersedes the product-page part of ADR-0064 and the "main photo stays 4:5 on the product page" line of ADR-0080)
- **Date:** 2026-11-20
- **Affects:** src/domain/types.ts, src/components/ui/ImageUpload.tsx, src/components/image/ImageCropDialog.tsx, src/features/products/editor/ProductEditorForm.tsx, src/features/public/ProductMedia.tsx, src/services/supabase/supabaseCatalogService.ts, supabase/migrations (product_image_page_crop)

## Context
Since ADR-0064 every main product photo was cut once to 4:5, and that one copy showed on the catalogue card and on the product page. The owner (2026-11-20) found the product page now looked like the catalogue card ("it fills the full box"): the client's photos come in different shapes and the product page should show them in their own shape, while the catalogue cards stay even.

## Decision
- A main photo (kind `gallery`, and a variant's photos) keeps its 4:5 copy (`url`, `storage_path`, `crop`) for the catalogue card.
- It also gets a product-page copy (`pageUrl`, `page_path`, `page_crop`) cut from the same original, in a standard camera shape chosen in a second crop step: Original (default, the whole photo), 4:5, 3:4, 2:3, 1:1, 4:3, 3:2, 16:9 (the `CROP_SHAPES` of ADR-0080).
- The product page stage and its thumbnails show the product-page copy; the photo stage takes that photo's shape, never taller than the screen. The 3D view keeps its box.
- A photo without a product-page copy (from before this ADR, or the second step skipped) shows its card copy, as before.
- Storage: new columns `page_path text` and `page_crop jsonb` on `product_images` and `product_variant_images`, written by `save_product`; visitors may read `page_path` files under the same rule as `storage_path`; the media clean-up counts `page_path` as in use.

## Consequences
- Good: catalogue rows stay even; the product page shows each photo in its real shape; old photos keep working without a data change.
- Trade-off: two crop steps for a new main photo, and one more file per photo in storage.
- Trade-off: the photo stage changes height between photos of different shapes.

## Alternatives rejected
- Product page always shows the untouched original: simplest for the client, but the original is never meant for visitors (ADR-0063) and the client could not trim it.
- One shape for both pages: catalogue cards would differ in height.
