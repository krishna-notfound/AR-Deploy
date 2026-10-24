# ADR-0026: Product embed for external websites (iframe), AR hands off to the full product page
- **Status:** Accepted
- **Date:** 2026-10-24
- **Affects:** design/08-tenancy-urls.md, design/14-features-public.md, design/20-deployment.md, design/13-features-business.md. Keeps ADR-0021 (native AR only) unchanged.

## Context
Businesses want to show a product, with its 3D model, on their own website. Nothing could be framed: `vercel.json` sent `Content-Security-Policy: frame-ancestors 'none'` for every route. Native AR (Scene Viewer intents, iOS Quick Look) is a top-level navigation that browsers may block or break inside a cross-origin iframe, so AR cannot be promised inside an embed.

## Decision
1. **Public embed route**, chrome-less (`EmbedProductPage`): `/embed/products/:businessSlug/:productSlug` in path mode, `/embed/products/:productSlug` on a business subdomain. URLs come from `productEmbedUrl` / `productEmbedLocalPath` / `tenantProductEmbedPath` in `src/lib/urls.ts`; `?lang=` and `?variant=` work as on the product page.
2. It shows the primary photo, name, price, finish swatches (`VariantPicker`, shared with the product page) and the existing viewer (`ProductMedia` with `fill` and `ar={false}`). Data comes from `service.getPublicProduct` **without** `allowDraft`: published products of active businesses only, never a preview, whoever is signed in. Loading, "Product not available" and error-with-retry states are distinct.
3. **AR is not started in the frame.** "View in your space (opens Sanctus)" is a plain link (`target="_blank" rel="noopener"`) to the full product page on this deployment (`embedProductPageUrl`, same finish and language), where native AR works. The embed records the product page's `view` and `model_interaction` events, never `ar_activation` (that is recorded only when AR is really launched on the product page). No new event types.
4. **Headers:** `frame-ancestors 'none'` now comes from a rule for `/((?!embed/).*)`; `/embed/(.*)` gets `frame-ancestors *`. The other security headers still apply to every path. The two sources never overlap, so the result does not depend on rule order.
5. **Dashboard:** "Embed on your website" in the shared product row menu opens `EmbedCodeDialog`: a copyable iframe snippet (`width="100%"`, `height="560"`, `max-width:960px`, `title`, `loading="lazy"`, `allow="fullscreen"`), the embed URL, a language choice, and the AR note. Drafts get "Not public yet" and no code; a published product of a non-active business gets the code with a warning (same rules as the product QR, ADR-0025).

## Consequences
- Good: any website can show a live, always-current product card with 3D, with no extra backend.
- Good: AR keeps working because it always runs on a top-level Sanctus page.
- Trade-off: AR needs one extra tap and a new tab. Clickjacking protection is dropped for `/embed/*` only, and those pages carry no authenticated UI or actions.
- Trade-off: the Vite dev server does not apply `vercel.json` headers; the header rules are covered by a unit test that applies them in order.

## Alternatives rejected
- Starting AR inside the iframe: unreliable or blocked cross-origin on both platforms, and would record AR attempts that never open.
- An allow-list of embedding domains per business: needs schema and admin UI; any site may embed a public product.
- A JavaScript widget instead of an iframe: more code on the owner's site and a new public API surface.
