# ADR-0053: Site icon and editable landing page texts in the Website Editor
- **Status:** Accepted
- **Date:** 2026-11-09
- **Affects:** design/12 (Website Editor), design/21 (landing), design/19 (site-content functions), `docs/superpowers/specs/2026-11-09-client-requests-round2-design.md` (W1)

## Context
The client (round 2, 2026-11-09, owner: "it have option to change favicon simple") wants to change the site's favicon, and to reword the landing page without a developer. The Website Editor already edits the hero picture, the 3D card, the collections, Terms, Privacy, custom pages, the application form (texts included, ADR-0043) and social links. The landing wording lives in the `landing.*` dictionary keys.

## Decision
**Document.** Two optional additions to the `site_content` document (schema stays 1):
- `chrome.favicon?: SiteAsset`: the site icon.
- `landing.texts?: Record<dictionary key, { en?: string; pt?: string }>`: text overrides for the landing page.

**Favicon is a PNG only, at most 1 MB, square, at least 32 x 32 px.** It is stored as an ordinary uploaded picture: bucket `site-content`, path `landing/<uuid>.png`, validated by `private.site_asset_ok(…, 'image')` plus a `.png` path check. ICO was not chosen: the bucket allows only jpeg/png/webp/glb/usdz and its storage policies match those extensions, so ICO would mean altering a live bucket and its policies; every current browser takes a PNG icon and the apple-touch-icon must be a PNG anyway. The 1 MB cap and the square/32 px rule are checked by the Editor before upload (the bucket cap stays 40 MB, as for the other kinds); the database checks the document, not the object. `SiteAssetKind` gains `'favicon'` for those client-side checks only; `siteAssetKind(path)` still returns `'image'` for a `.png`.

**Runtime.** A tiny hook in the app shell (`src/app/useSiteFavicon.ts`, called by `RootLayout`) reads the published chrome once per page load, without React state. If it has a favicon it replaces the `<link rel="icon">` elements of `index.html` with one PNG icon and points the `apple-touch-icon` at the same file. Without a favicon, or if the read fails, `index.html`'s built-in icons stay. The hook does not run for the Editor's draft preview.

**Landing texts.**
- Whitelist `LANDING_EDITABLE_KEYS` (`src/domain/landingTexts.ts`, 49 keys): the `landing.*` texts the landing renders in Hero (incl. the page title), How it works, Experience, Collections (incl. the four sample cards), About and Partners. Four length classes: eyebrow 60, button 40, title 200, body 600 characters; the same limits per key are repeated in SQL (`private.landing_text_limits()`) and a PGlite test compares the two lists.
- Not editable: navigation, header, footer and the shared apply call to action (`site.*`: they appear on every public page, so editing them only on the landing would be inconsistent), the legal text, the small control labels, the alt texts of built-in photographs, and the labelled sample "Linden" card with its "Illustrative piece" notice. The hero picture's own description keeps its field beside the picture (`landing.hero.alt`).
- The landing renders `override ?? dictionary` per language: the override of a language is used only if that language has a (non-blank) text; the Portuguese original is never replaced by an English override. Implementation: `TextOverrideProvider` (in `LanguageProvider.tsx`) puts the overrides on top of `t` for a subtree; `LandingRoute` wraps `LandingPage` in it, so `LandingPage` and its sections are unchanged and still call `t('landing.…')`. The router and the Editor preview render `LandingRoute`.
- Editor: new "Site" tab (favicon with previews at 16/32/180 px, Upload/Replace/Remove) and a "Texts" block at the end of the Landing tab, grouped by section, EN and PT inputs with the original as placeholder, "Reset to original" per text and per section, and counts of changed texts (also in the publish dialog). Draft, Preview, Publish and History work as before.

**Database (migration `site_content_round2`, one local file, not applied).** New `private.landing_text_limits()`; `private.check_site_content_shape`, `private.validate_site_content` and `public.get_published_site_content` replaced (bodies copied from `landing_hero`). The gate refuses a bad favicon (`chrome.favicon|invalid_value`) and any key outside the list (`landing.texts.<key>|unknown_key`), non-text or over-limit values; the public chrome read returns `favicon` and `landingTexts` (only listed keys, only the published copy). Rollback `supabase/rollback/20261109_site_content_round2_rollback.sql`; test `supabase/tests/siteContentRound2.test.ts`. W6 (`apply_form_round2`) also replaces `private.validate_site_content`; whichever migration runs later must carry both changes.

## Consequences
- Good: the client changes the icon and the landing wording himself, with the same draft, preview, publish and history flow; no new dependency, bucket or storage policy; the landing components are untouched.
- Trade-off: PNG only (an `.ico` is not accepted); the icon's 1 MB and squareness are held by the Editor, not by the database; edited texts bypass the dictionary, so a later change of the dictionary wording does not reach an overridden text until it is reset; an overridden text is only checked for length, so a client can write a headline that no longer fits the design.

## Alternatives rejected
- ICO support (new kind, bucket mime list and storage policy changes): more risk on a live bucket for no browser benefit.
- Make every `landing.*` and `site.*` key editable: the shared header and footer would differ between the landing and other pages, and labels like "Photo / 3D" are controls, not wording.
- A separate `landing_texts` table: the document already has draft, publish, history and restore.
- Per-component `useLandingText()` calls in the landing files: touches every landing file (another workstream restyles the hero in parallel) for the same result.
