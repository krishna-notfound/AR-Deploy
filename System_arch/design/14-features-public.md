
### Landing pictures (ADR-0063, IC-2)
The landing page takes every frame from `src/lib/imageFrames.ts`. Uploaded pictures show in their frame with `object-contain` (collection card 4:5, About main 4:5, About detail and third 1:1, picture + text and QR section 4:3); hero and banner stay 16:9 `object-cover`; the built-in static photos keep filling their frame (`object-cover`). The About grid's third box shows the third picture (same border, `object-contain`) when the Website Editor set one, and the italic caption otherwise.# 14 · Public catalog & product pages
Read when: building `/catalog/*` or `/products/*`. Also read [09-3d-ar.md](09-3d-ar.md) and [10-i18n.md](10-i18n.md). Load the `frontend-design` skill.

**Look (ADR-0037, 2026-10-26):** the original catalog and product layout, with slightly soft corners on the public pages only (`.public-soft` in `src/index.css`: 6px controls, 10px cards, photos and panels). The product's own link is a real button. ADR-0036 (the Stitch redesign) is superseded.

## CatalogPage `/catalog/:businessSlug`
- **Page header (every `/catalog/**` and product page, also the loading and not-found states; ADR-0062):** the Sanctus `Wordmark` linking to `/` and the language switch. The company name and logo are not in the header. Branding comes from `--brand-accent`.
- **Catalogue top (ADR-0062):** a full-width Sanctus photograph (`public/images/sanctus/v2/lamp-vase.webp`) under a dark veil, as the landing hero and the sign-in panel. On it, in white: the company logo (on a small chalk tile), the "Catalog" eyebrow, the company name as the only `<h1>` and the piece count. The name appears once on the page: the footer is "Catalogue powered by Sanctus" without `© name`; the tab title stays the name. The company description is not shown (ADR-0054).
- **Body (ADR-0062):** a serif "The pieces" heading, then the search and category chips (sticky bar from `sm`), then the grid.
- **Grid:** 2 columns on phones, 3 at `lg`, 4 at `xl`. Each `ProductCard` (ADR-0054) shows the contained primary image, category, name and a "3D · AR" chip when a GLB exists. No price.
- Shows **published** products only.
- **States:**
  - Skeleton grid while loading.
  - Empty: "No products yet".
  - Unknown slug: not-found.
  - Inactive business: "This catalog is currently unavailable".

## ProductPage `/products/:businessSlug/:productSlug`
Mobile-first, single column. Switches to two columns at `lg`.
- **Media:** a toggle between `ModelViewer3D` and the gallery, with thumbnails. The whole piece is always visible (ADR-0062): the stage, the thumbnails and "More photos" use `object-contain` on the subtle ground with padding, never a crop. `SmartImage` keeps `object-cover` as its default but drops it when the caller sets its own `object-*` class.
- **Info:**
  - Name, price, and short description.
  - **"View in my home"** button (prominent).
  - Dimensions: cm/in toggle and the scale badge.
  - Material.
  - Variant swatches. Selecting one changes the variant name and adds its price delta.
  - Full description.
  - Additional photos grid.
- **CTA button:** opens `cta.url` in a new tab. With no URL, show the business contact details as the fallback.
- **Share:** use `navigator.share`, or copy `window.location.href` when it isn't available.
- **Back link:** "← Back to {business} catalog".
- **View tracking:** record a `view` event once per page load. Guard against the StrictMode double effect.
- Include `InAppNotice` and `ArTips`.
- **Draft preview:** allowed only with `?preview=1` **and** a logged-in admin. Show a "Draft preview" ribbon.
- **Not-found page** (linking back to the catalog) when:
  - the product is unknown,
  - the product is unpublished and this isn't a draft preview, or
  - the business is inactive.

## Embed `/embed/products/:businessSlug/:productSlug` (ADR-0026)
- Chrome-less product card for other websites' iframes (`EmbedProductPage`); `/embed/products/:productSlug` on a business subdomain.
- Primary photo, name, price, `VariantPicker`, and `ProductMedia` (`fill`, `ar={false}`) with a "View in 3D" / "Photos" toggle on the stage.
- Published products of active businesses only; never a draft preview, even for a signed-in owner. Loading, "Product not available" and error-with-retry states.
- "View in your space (opens Sanctus)" opens the full product page in a new tab (same finish and language), where native AR runs. Records `view` and `model_interaction` like the product page, never `ar_activation`.

## Landing page (`/`, ADR-0016)
Sections:
- **Hero:** live model-viewer turntable of the Glam Velvet Sofa, with a caption of its size measured in the browser.
- **Experience:** 3D, then AR, with three facts.
- **How it works:** three numbered steps.
- **Showcase:** published products from active businesses, via the service.
- **Business value.**
- **Platform features:** a hairline list.
- **Try it on your phone:** QR code of a product page, with a localhost caveat.
- **Demo picker** (`DemoAccounts`).
- **Footer:** contact placeholder and credits.

The page is English-only. Its copy changes with the mode (no "sample data" claims in Supabase mode).

## Photo frame (ADR-0064)
Every product photo is shown in the 4:5 product frame with `object-contain`: the catalogue card, the product page stage (4:5 at every width; on a wide screen its width is capped so its height stays within the viewport), the stage thumbnails and "More photos" (two columns on phones, three from `md`, four from `lg`). A cropped file fills the frame exactly; an old or "whole" photo shows whole on the frame's plain colour.