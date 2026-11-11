# ADR-0064: Product photo frame is 4:5 everywhere
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/11-design-system.md, design/14-features-public.md, design/12-features-admin.md; amends ADR-0054 and ADR-0062 (not superseded)

## Context
The crop dialog (ADR-0063) needs one target shape per place. The catalogue card was already 4:5 (ADR-0054), but the product page stage was square on phones and 5:4 from `sm`, the stage thumbnails were squares, "More photos" were 4:3, and the admin lists and the editor grid used square thumbnails that cover-cropped the photo (ADR-0062 made the thumbnails and More photos contain). A photo cropped for one shape therefore looked different in the others. Owner (2026-11-11): every product photo is 4:5, including the product page ("yes").

## Decision
- **One module, `src/lib/imageFrames.ts`,** holds every frame's aspect ratio and fit (`imageFrame('product')` and the keys for the Website Editor, logo and profile photo). Components take their aspect class and object-fit from it instead of hardcoding `aspect-[…]`.
- **`product` is 4:5, `object-contain`,** for: the catalogue card (no inner padding any more, so a cropped file fills the frame exactly), the product page stage at every width, the stage thumbnails, "More photos" (two columns on phones, three from `md`, four from `lg`), the admin thumbnails (`Thumb`: product table, analytics, model requests; the "most viewed" list) and the editor photo grid. A photo that was saved as "whole" shows whole on the frame's plain colour; an old photo that is not 4:5 shows whole too (as under ADR-0062).
- **Product page balance on desktop:** the stage keeps its 4:5 shape and its width is capped at `min(100%, max(18rem, (100svh - 16rem) × 0.8))`, centred in its card, so it is never taller than the screen; the thumbnails and text keep the full width.
- **Hero and banner** (16:9, full width) keep `object-cover`; the embed's stage keeps filling its parent. The site's own built-in photographs keep their current look.

## Consequences
- Good: a photo cropped once looks the same on the card, the product page and in the admin.
- Trade-off: the product page stage is taller than before on phones (4:5 instead of 1:1) and narrower than its card on a short desktop window.
- Trade-off: a card photo that is not 4:5 now touches its frame edges (no 8 px inner padding); it still shows whole.

## Alternatives rejected
- Keep the square or 5:4 stage and crop twice: two crops per photo would defeat the point of one dialog.
- A different shape per place (square for admin thumbnails): the same photo would show different parts of itself.
