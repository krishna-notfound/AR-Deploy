# Client requests, round 2 (2026-11-09)

Source: the client's task list (Maycom Rychard, relayed by the owner on 2026-11-09) plus the owner's earlier request to make the mobile experience friendlier. Audit done the same day (three read-only audits). Owner answers on 2026-11-09 are binding and quoted where they decide something.

Production safety (client): the current site and database (`zggylkbgajamhriebdrg`, `sanctus.warpkit.online`) are the testing environment (ADR-0042). Nothing here changes the domain, production credentials or production data; the future production domain `sanctus.company` on the client's Vercel is set up separately with explicit approval. Migrations and function deploys go to the testing project with the owner's go-ahead; `main` is pushed only when the owner says so.

Every workstream follows CLAUDE.md: EN + PT-PT texts through `t()`, data only through `src/services`, demo mode keeps working, loading/empty/error states, schema changes in new migrations with RLS, explicit grants, a rollback file and a PGlite test, decisions recorded (ADR + `docs/DECISIONS.md` row) in the same change, no new dependency without an ADR.

## Already done and preserved (audit)

- CSV bulk product import (ADR-0051); PDF/AI import is not built (owner 2026-11-05). Item 9 stays "CSV only": Excel users save as CSV; the screen says so. PDF extraction is documented as a limitation (needs an external document service, cost, provider decision).
- QR codes: the catalogue QR (CatalogQrPanel) and per-product QR (ProductQrDialog) already download PNGs. Item 12 is a check plus: the product QR is offered only for products that are publicly visible, and both are reachable from the company dashboard too.
- Archiving (item 13): Unpublish sets the product to Draft and keeps everything; Delete is the only destructive action. No Archive button is added.
- Application form is editable in the Website Editor (steps, fields, custom questions, texts).
- Google sign-in stays removed.

## Workstreams

### W1 — Website Editor: favicon and homepage texts
- Favicon (owner: "it have option to change favicon simple"): Website Editor → new "Site" block with Upload / Remove favicon (PNG or ICO, square, at most 1 MB, stored in the existing `site-content` bucket). The published favicon replaces the `<link rel="icon">` and `apple-touch-icon` at runtime; without one the built-in icons stay. `site_content.chrome.favicon` (SiteAsset), checked by the publish gate and returned by the public chrome read.
- Homepage texts: every `landing.*` text (and the landing-only `site.*` header/footer copy that sits next to the pictures) can be overridden in EN and PT from Website Editor → Landing page → "Texts", grouped by section (Hero, How it works, Experience, Collections, About, Partners), each with "Reset to original". Stored as `landing.texts: Record<key, {en?, pt?}>` for a whitelist of keys; the landing renders `override ?? dictionary`. Draft → Preview → Publish as today.
- Migration `site_content_round2` replaces the site-content gate, shape check and public read (latest versions) for `chrome.favicon` and `landing.texts`.

### W2 — Homepage design and mobile pass (public)
- Hero in the sign-in page's style: full-width photo (the editable hero picture) with a dark veil and white serif headline and text; the hero 3D chip, "See a live example" and the hero texts stay; the rest of the page keeps its sections but uses the sign-in page's eyebrow rule, button component and spacing.
- Mobile pass on the landing, collection, showcase, catalogue and product pages: tap targets ≥ 44 px, no 10 px text, no sideways scroll, readable spacing, sticky actions where it helps, the menu and language switch easy to reach. Checked at 360, 390 and 430 px.

### W3 — Public catalogue rules and product cards
- Prices hidden on every public page (catalogue cards, product page, showcase page, collection page, landing 3D card, embed, variant price differences). Prices stay in the dashboards.
- Product cards redesigned in the Sanctus style (consistent spacing, serif name, category, "3D · AR" chip), images `object-contain` on a neutral ground so the whole piece is visible; same card component on catalogue, collection and showcase "More pieces".
- Share control per company: `businesses.share_enabled boolean not null default true`, changed only by platform staff with `businesses.edit` (guard trigger like the other admin-only fields), toggled in the admin business detail. Off: the Share button is hidden on that company's product pages; Copy link and the AR phone QR stay (owner: "Share button only").
- 3D-only publishing: from now on Publish needs the product's own valid 3D model (GLB). Enforced in `validateForPublish` and in the database publish trigger (refuse the transition to `published` without a model; existing published rows untouched). Owner: "user can publish it or not his choice … we can unpublish it": already-published photo-only products stay published; the admin products list gets a "Published without 3D" filter so staff can unpublish them. Flagged to the client.
- Company description internal: anon can no longer read `businesses.description` (column privileges: revoke table select from anon, grant select on every other column; public service queries use explicit column lists). Removed from the public catalogue header. Staff and the company itself still see and edit it.
- QR (item 12): product QR only for publicly visible products; check downloads in admin and company dashboards.
- Migration `catalogue_rules_round2` (share_enabled + guard, publish trigger, description column privileges) + rollback + PGlite test.

### W4 — Categories and currencies (admin-managed lists)
- `product_categories` table (slug, label_en, label_pt, sort, active), seeded with the current seven plus "Other" (`other`). `products.category` references it (the old check constraint replaced by a foreign key; existing values are all in the seed). Managed in the admin console (new "Categories" page; permission `content.manage`): add, rename EN/PT, reorder, hide; deleting a category in use moves its products to "Other". Read by everyone (public filters show labels); the TypeScript `Category` becomes `string` with the list loaded through a service hook used by the editor, filters, import, catalogue and labels.
- `currencies` table (ISO code, enabled, sort) seeded with EUR, BRL, USD enabled and the common ISO list disabled; `products.currency` and `businesses.default_currency` reference it. Admin console "Currencies" toggles which are available; formatting stays `Intl.NumberFormat`. Public pages still hide prices.
- Migration `managed_lists` + rollback + PGlite test.

### W5 — Notifications (push + in-app)
- Installable web app: `manifest.webmanifest` (name, icons 192/512, theme colour), `sw.js` service worker (push + notificationclick only, no offline caching), served outside the SPA rewrite with no-cache headers.
- In-app: `notifications` table (recipient, kind, title, body, link, read_at, created_at) with RLS (own rows only), a bell with unread count and list in the dashboard header, mark read / all read.
- Push: `push_subscriptions` table (user, endpoint, keys, created_at; own rows), Settings → Notifications: "Turn on phone notifications" (permission prompt only on that tap), per-event switches; iPhone note ("Add to Home Screen first", iOS 16.4+).
- Events: new application (staff with `applications.view`), new 3D model request (staff with `models.manage`), company updates (owner: catalogue paused/activated, product unpublished/deleted, 3D request delivered/rejected). Created where the emails are sent today (Edge Functions) plus the `request_model` path; delivery through a shared `_shared/notify.ts` that writes the in-app row and sends Web Push with VAPID (library `npm:web-push`, ADR), removing dead subscriptions (404/410).
- Secrets (names only): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; the browser needs the public key (`VITE_VAPID_PUBLIC_KEY`, public by design).
- Migration `notifications` + rollback + PGlite test; functions redeployed.

### W6 — Application form: fewer locked fields, deletable built-ins, better design
- Locked: only the applicant's email and the consent tick (owner: "All except Email + Consent"). Business name and applicant name become ordinary built-in fields: rename, move, make optional, hide or delete.
- Built-in fields can be deleted (not only hidden) and built-in steps can be deleted (Review stays last); "Restore a removed field/step" brings them back.
- Approval without a business name: the approve dialog asks for the company name when the application has none (prefilled when it has one). `business_applications.business_name` becomes nullable; `admin_review_application` takes an optional name; the duplicate check works on email when the name is missing.
- Design: the form editor's rows, panels and buttons clearer on desktop and phone (no hidden actions, delete with confirm, drag/move handles); the public application form's steps, fields and review screen tidied on mobile, same visual language.
- Migration `apply_form_round2` + rollback + PGlite test; `submit-application` redeployed.

### W7 — 3D scale control at upload
- Owner: "if very large model … have controller on upload time to fix scale if it over". On GLB upload, after optimization, the measured size is checked: any side over 10 m or under 1 cm, or a size that matches the product's dimensions after ×0.001 / ×0.01 / ×0.0254, opens a "Fix the scale" step before upload: "This model is 801 m tall. It looks like millimetres." with choices Convert from millimetres / centimetres / inches, Custom factor, or Keep as is. The chosen uniform factor is applied to the scene's root nodes (proportions kept, geometry untouched), the result re-measured and shown, then uploaded. Nothing changes without the user's choice.

## Merge order and records
Each workstream merges as its own merge commit (revertible). Records: ADR-0053 (favicon + homepage texts), ADR-0054 (catalogue rules: prices hidden, 3D-only publishing, description internal, share switch), ADR-0055 (managed categories and currencies), ADR-0056 (notifications + PWA + web-push dependency), ADR-0057 (application form round 2), ADR-0058 (upload scale control; amends ADR-0006 "never rescaled": only on the user's explicit choice at upload). Homepage design/mobile pass: a `docs/DECISIONS.md` row.
