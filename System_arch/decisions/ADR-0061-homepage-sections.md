# ADR-0061: Homepage sections, the QR section and the About pictures
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/12-features-admin.md, design/21-sanctus-reference-map.md, docs/CLIENT_HANDOVER.md, migration `landing_sections` (written, not applied)

## Context
Client round 3 asks for a homepage the Owner/Admin can arrange: add sections, change their order, hide them, and change the About photographs; the hero text should move out of the hero into its own QR section. The owner chose simple sections, not a free page builder (docs/DECISIONS.md, 2026-11-11). The Website Editor already stores one site content document (ADR-0043, ADR-0053) with a SQL publish gate that repeats the checks.

## Decision
- **One ordered list in the document, `landing.sections`.** Absent means the default: `qr, how, experience, collections, about, partners` (so the page looks as before, plus the QR section under the hero). The hero is always first and not in the list. Entries are built-in (`{kind:'builtin', id, hidden?}`, movable and hideable, never deleted, each at most once) or own, in three designs: `text` (centred), `imageText` (picture left or right) and `banner` (full-width picture under a veil, white text). Own sections have a slug `id` (unique, not a built-in id), an optional unique `anchor` (a slug that is not one of the page's own ids), EN/PT texts (eyebrow 60, title 200, subtitle 200, body 1200, button label 40), pictures that are ordinary site assets with an alt text (120), and an optional button whose link is a site path starting with one `/` or an `https://` address (300, no spaces). At most 16 sections, 10 of them own.
- **QR section** (built-in `qr`): new editable texts `landing.qr.eyebrow/title/body`; the body's original is the old hero text. `landing.qr = { image?, imageSide: 'left'|'right'|'none' }` (default `none`: centred text). `landing.hero.body` is no longer rendered or listed; a saved override is moved to `landing.qr.body` (per language, an existing QR text wins) when a document is normalized, and the database keeps accepting the old key so older drafts still publish.
- **About pictures:** `landing.about = { image?, detail? }`, each `{ path, alt }`, same validation and storage as the hero picture; empty shows the built-in photos.
- **Database:** migration `landing_sections` replaces `private.landing_text_limits`, `private.check_site_content_shape`, `private.validate_site_content` and `public.get_published_site_content` from their latest bodies (round2), adds four helper functions in `private` (`check_lang_text`, `check_site_image`, `check_section_button`, `check_landing_layout`), keeps every earlier check and every grant, and the public read also returns `landingSections`, `landingQr`, `landingAbout`. The TypeScript mirror (`normalizeSiteContent`, `validateContentShape`, `validateSiteContent`, `summarizeChanges`) is changed in step; a PGlite test runs the same documents through both. Rollback script in `supabase/rollback/`. Not applied by the change; the orchestrator applies it to the testing database after review.
- **Editor:** a "Sections" block at the top of the Landing tab (one row per section with Move up/down, Hide/Show, Edit for own sections and for the QR and About rows, Delete with a confirm for own sections; "Add section" offers the three designs). The wording of built-in sections stays in the Texts block, which gains a QR group.
- **Public page:** `LandingPage` renders the hero, then the list in order, skipping hidden sections; header and footer links to a hidden built-in section are left out. Own pictures are contained except in the banner.

## Consequences
- Good: the client arranges the page without a developer; one document, one gate, no new dependency, no new storage.
- Good: a hidden or reordered page needs no code change; the default keeps today's page.
- Trade-off: the demo service keeps uploaded pictures only for the session (as for the hero), so reloaded demo pages show text-only picture sections.
- Trade-off: `landing_text_limits` is now two `jsonb_build_object` calls joined with `||` (one call takes at most 100 arguments).

## Alternatives rejected
- A free page builder (blocks, columns, styling): the owner chose simple sections.
- A separate table of sections: the document, its draft/publish flow and history already exist.
- Dropping `landing.hero.body` from the database whitelist: an older draft would then be unpublishable with no way to fix it in the Editor.