# ADR-0046: Landing collections are editable in the Website Editor
- **Status:** Accepted (owner, 2026-11-03)
- **Date:** 2026-11-03
- **Affects:** ADR-0043 (supersedes in part: "the landing page is not editable"), design/12-features-admin.md, design/19-supabase.md, design/21 (landing), migration `landing_collections`

## Context
The "Collections" section of the landing page was four fixed cards (Sofas, Tables, Armchairs, Decor) that sit on the platform categories. The first thing a furniture business owner sees there should show what Sanctus does: 3D and AR catalogues. ADR-0043 kept the landing page out of the Editor. The owner decided on 2026-11-03 that these cards become editable by the Owner and Admin (`content.manage`), as a first-impression showcase and nothing more.

## Decision
- The Website Editor document gets `landing.collections`: at most 8 cards. A card has an id, a title (EN required, PT optional, 1 to 60 characters), an optional short text (0 to 160), a picture, a link and a hidden flag.
- The picture is a key into a built-in list of 12 photos that already ship with the site (`LANDING_IMAGE_KEYS`, labels and EN/PT alt text in `features/marketing/landingImages.ts`). No uploads, no new assets.
- The link is one of: a published product (3D/AR page), a business catalogue with an optional category, the application form, or no link. A product or catalogue is stored by business and product slug, and the Editor picks only published products of active businesses. A link to something that no longer exists is dropped on the page, so a card never opens an error page.
- Editing, draft, autosave, Preview, Publish and History are the existing Editor mechanics. The screen is `/admin/editor/landing`, after Pages. Preview opens the whole landing page with the draft (`/admin/editor/preview/landing`).
- While nothing is published, or no cards are published, the page shows its built-in four, so nothing changes before the first publish. "Start from the current collections" copies them into the draft. If cards are published and all are hidden, the section keeps its heading and shows no cards.
- Public read: `get_published_site_content('chrome')` also returns `landingCollections` (hidden ones included; the page skips them). The publish gate and the draft shape check in SQL repeat the limits (migration `landing_collections`, rollback in `supabase/rollback/`).
- On the page the whole card is one link (photo, title and text), keyboard-focusable with a visible focus ring and a small lift on hover. The "01 // COLLECTION" counter label is removed.
- No collection pages of their own: a card leads to something that already exists.

## Consequences
- Good: the owner can change the first showcase without a developer or a deploy; cards can lead straight to a product's 3D/AR page.
- Good: no new table, route, dependency or permission; the existing draft, history and 2FA gate apply.
- Trade-off: pictures are limited to the 12 built-in photos until the client sends or approves more (a later ADR can add uploads).
- Trade-off: the photo key list and the category list repeat in SQL; a PGlite test checks both against the TypeScript lists.
- Trade-off: the four built-in texts stay in the landing dictionary; the Editor copies them (EN and PT) on request.
- Needs the owner's go-ahead to apply: migration `supabase/migrations/20261103095519_landing_collections.sql` (three function replacements, no data change). Until it is applied, the live public read ignores cards and an Editor publish with cards is not checked by SQL; do not publish cards before applying it.

## Alternatives rejected
- A fixed list of more built-in cards: the owner wants to choose what is shown.
- Free image upload for cards: needs storage, review and image checks; the built-in photos cover the showcase.
- A page per collection: the owner said no new collection pages.
- Free-text links: could send visitors anywhere; slugs of real products and catalogues are checked and dropped when gone.
