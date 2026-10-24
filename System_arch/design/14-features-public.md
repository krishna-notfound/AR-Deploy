# 14 · Public catalog & product pages
Read when: building `/catalog/*` or `/products/*`. Also read [09-3d-ar.md](09-3d-ar.md) and [10-i18n.md](10-i18n.md). Load the `frontend-design` skill.

## CatalogPage `/catalog/:businessSlug`
- **Header:** logo, name, description. Branding comes from `--brand-accent`.
- **Controls:** search and category chips.
- **Grid:** 1, 2, 3, or 4 columns depending on width. Each `ProductCard` shows the primary image, name, price, and a "3D" pill when a GLB exists.
- Shows **published** products only.
- **States:**
  - Skeleton grid while loading.
  - Empty: "No products yet".
  - Unknown slug: not-found.
  - Inactive business: "This catalog is currently unavailable".

## ProductPage `/products/:businessSlug/:productSlug`
Mobile-first, single column. Switches to two columns at `lg`.
- **Media:** a toggle between `ModelViewer3D` and the gallery, with thumbnails.
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
