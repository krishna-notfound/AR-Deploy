# Client round 3: homepage sections, About pictures, catalogue and product pages (2026-11-11)

Source: the client's request "Homepage, Website Editor & Catalogue Improvements". Owner answers (2026-11-11):
- simple sections, not a free page builder;
- a Sanctus photo on catalogues;
- the hero keeps its title and buttons, and the QR text gets its own section;
- the database change may be applied to the TESTING database once the tests pass.

The work reuses the existing Website Editor and site content document (ADR-0043/0053). There is no second CMS, no new dependency, and no production change.

## R3-A Homepage sections, QR section, About pictures (Website Editor + public landing)

Code: the landing page is `src/features/marketing/` (`LandingPage.tsx`, `SiteChrome.tsx`, `LandingCollections.tsx`, `LandingShowcase.tsx`, `HeroMedia.tsx`). The editor is `src/features/editor/` (`LandingScreen.tsx`, `LandingTextsBlock.tsx`, `HeroPictureBlock.tsx`, `UploadButton.tsx`, `landingOps.ts`). The model is `src/domain/siteContent.ts` and `src/domain/landingTexts.ts`.

1. **Section list `landing.sections`:** an ordered array saved in the draft, published like everything else. The hero is always first and is not in the list.
   - **Built-in items:** `{ kind: 'builtin', id: 'qr'|'how'|'experience'|'collections'|'about'|'partners', hidden?: boolean }`. They can be moved and hidden, never deleted.
   - **Own items, three designs**, each with `id` (slug), `hidden?` and `anchor?`:
     - `{ kind: 'text', eyebrow?, title, subtitle?, body?, button?: { label, href } }`: centred text block.
     - `{ kind: 'imageText', eyebrow?, title, body?, image: { path, alt }, imageSide: 'left'|'right', button? }`
     - `{ kind: 'banner', image: { path, alt }, title?, body?, button? }`: a full-width picture with a soft dark veil and white text, like the hero.
   - **Fields:** all text fields are EN/PT (`{en, pt?}`). Limits are eyebrow 60, title 200, subtitle 200, body 1200, button label 40.
   - **Links:** `href` is a site path starting with `/` or an `https://` URL, max 300.
   - **Pictures** use the existing site asset upload (`content.uploadSiteAsset`, `landing/…` paths, webp/jpg/png up to 5 MB, same bucket and policies).
   - **Max** 16 sections in all, with at most 10 own sections.
   - **Default** (nothing saved): `qr, how, experience, collections, about, partners`, so the public page looks like today with the QR section added under the hero.
2. **QR section (built-in `qr`):**
   - **Content:**
     - new text keys `landing.qr.eyebrow`, `landing.qr.title` and `landing.qr.body`, with EN and PT dictionary defaults and editable like other landing texts;
     - **the body's default is today's hero body text.** If a saved override of `landing.hero.body` exists, it becomes the `landing.qr.body` value when normalizing;
     - an optional picture plus alt, with layout `imageSide: 'left'|'right'|'none'` (default `none`, which shows centred text).
   - **The hero then shows only the title and buttons:** `landing.hero.body` is no longer rendered or listed in the editor.
   - **Stored as** `landing.qr = { image?, imageSide }`.
3. **About pictures:**
   - `landing.about = { image?: {path, alt{en,pt?}}, detail?: {path, alt{en,pt?}} }`.
   - An empty value shows today's static photos (`public/images/sanctus/v2/coffee-table.webp`, `detail-joinery.webp`) and alt texts.
   - The editor has Upload / Replace / Reset for each picture, with alt texts.
   - Validation and storage are the same as the hero picture.
4. **Editor (Landing tab):**
   - a new "Sections" block at the top: one row per section with the name or design, a Hidden badge, Move up/down, Hide/Show, Edit and Delete (own sections only, with a confirm);
   - an "Add section" button that picks Text / Picture + text / Banner;
   - Edit opens that section's fields inline, including the picture upload with a preview;
   - the built-in sections' texts stay in the existing Texts block, with a new QR group added; the About pictures go in the About group or next to it;
   - everything is bilingual through `t()`, uses tokens only and has a phone layout.
5. **Public page:**
   - `LandingPage` renders the hero, then the sections in order, skipping hidden ones;
   - own sections follow the Sanctus rhythm: serif headings, shared eyebrow and Button, pictures `object-cover` only in banners and contained elsewhere;
   - correct at 1440, 768 and 390 px with no overflow.
6. **Database: a new migration** (`npx supabase migration new landing_sections`, which sorts after `20261109120825`):
   - replaces `private.validate_site_content` with the latest body plus checks for `landing.sections`, `landing.qr` and `landing.about`: shapes, limits, unique ids, known built-in ids, each built-in at most once, the href pattern, and assets through `private.site_asset_ok`;
   - replaces `public.get_published_site_content` so it also returns `landingSections`, `landingQr` and `landingAbout`;
   - adds the new text keys to the allowed landing text list;
   - comes with a rollback script in `supabase/rollback/` and PGlite tests (apply, rollback, re-apply; valid and invalid documents);
   - the TS mirror (`normalizeSiteContent`, `validateSiteContent`, the published read mapping in the services) is updated together, and the mock service too.
   - **The agent does not apply it.** The orchestrator applies it to the testing database after review (owner OK).
7. **Records:** ADR-0061 plus its README row; update `System_arch/design/` (landing/editor) and `docs/CLIENT_HANDOVER.md` (how to add sections and change About pictures).

## R3-B Catalogue and product pages (public, no database change)

Code: `src/features/public/` (`PublicShell.tsx`, `CatalogPage.tsx`, `ProductCard.tsx`, `ProductPage.tsx`, `ProductMedia.tsx`, `ProductParts.tsx`) and `src/components/ui/SmartImage.tsx`.

1. **Header (all `/catalog/**` pages, including the loading and not-found states):**
   - the Sanctus wordmark (`Wordmark`, as on the landing header) links to `/`, with the language switch on the right;
   - **the company name and logo are removed from the header.**
2. **Catalogue top (in the landing/sign-in style):**
   - a full-width Sanctus brand photo (from `public/images/sanctus/v2/`, the same art direction as `AuthLayout` and the landing hero) under a soft dark veil;
   - on it, in white: the company logo (if any), the "Catalogue" eyebrow, the company name as the only `<h1>`, and the piece count;
   - **the company name appears once on the page**, here. The footer keeps "Catalogue powered by Sanctus" without `© name`, and the tab title stays the name.
3. **Catalogue body:**
   - the category chips, search and product grid restyled in the landing's rhythm: spacing, serif section heading and the shared card;
   - all filters, navigation, categories and product links keep working;
   - 2 columns on phones, 3 at `lg`, 4 at `xl`.
4. **Product page pictures:**
   - **the whole piece is always visible:** thumbnails and "More photos" use `object-contain` on the subtle ground with padding (fixing the `SmartImage` default `object-cover` at `ProductMedia.tsx:220` and `ProductParts.tsx:197`; set it per use rather than changing the global default unless every use is checked);
   - better proportions and spacing between the stage, the thumbnails and the text; the stage keeps `object-contain`.
   - The back link may keep the company name ("Back to <name>").
5. **Responsive:** check 1440, 1024, 768 and 390 px with no overflow or overlap, and a sticky bar that doesn't cover content.
6. **Records:** ADR-0062 (amends ADR-0054) plus its README row; update `System_arch/design/` (public pages) and `docs/CLIENT_HANDOVER.md` if a how-to changes.

## Done (both)

- `typecheck`, `lint` (0 errors), `test` and `build` pass.
- Update the e2e and visual baselines that change, and only those.
- Desktop and phone screenshots, looked at and fixed.
- Demo mode for the dev server only.
- Commit as krishna, with no co-author line. No push.
