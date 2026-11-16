# ADR-0080: "More photos" keep their own camera shape
- **Status:** Accepted (supersedes the "More photos" part of ADR-0064)
- **Date:** 2026-11-16
- **Affects:** src/components/image/ImageCropDialog.tsx, src/lib/imageCrop.ts, src/components/ui/ImageUpload.tsx, src/features/products/editor/ProductEditorForm.tsx, src/features/public/ProductParts.tsx

## Context
The client asked for product images with a clean, uniform look and no beige areas. Every product photo sat in a 4:5 frame (ADR-0064); a photo saved as "Show whole picture" showed the frame's beige ground around it, and a wide shot of a long sofa either got its sides cut or got beige bands. The owner (2026-11-16) decided: the main photo keeps 4:5, so the catalogue cards and the product page stay even, and the additional photos may have any standard camera shape, chosen in the crop step ("aspect ratio should be like normal cam photos, not any random number").

## Decision
- Main product photos (kind `gallery`: catalogue card, product page stage and its thumbnails, admin thumbnails) stay 4:5, cropped as before.
- Additional photos (kind `additional`) get a shape choice in the crop step: Original (the photo's own shape, the default for a new photo), 4:5, 3:4, 2:3, 1:1, 4:3, 3:2 and 16:9 (`CROP_SHAPES` in `src/lib/imageCrop.ts`). Picking a shape starts from the centred crop that fills it.
- The product page's "More photos" shows each photo in its saved shape, in a staggered column layout, with no frame colour around it.
- For a fully white look the client uploads photos on a white background; the crop step changes the shape, not the photo's own background.

## Consequences
- Good: no beige bands in "More photos"; wide and tall shots show whole; no database change (the crop is already stored with each photo).
- Trade-off: "More photos" rows are uneven by design; the main photo still needs a 4:5 crop or shows the frame ground.

## Alternatives rejected
- Any shape for the main photo too: catalogue cards would differ in height or the photo would be cut or banded, and the product page stage would need a rebuild.
- Free-form crop (any ratio): the owner wants standard camera shapes only.
