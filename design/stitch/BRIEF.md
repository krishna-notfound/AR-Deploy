# Stitch redesign brief (2026-10-25)

The owner redesigned key screens in Google Stitch (project 16545430197078633171). The exports are in this folder: each screen has `code.html` and a screenshot. The owner's instruction is to **use the designs and generated photos as the direction, apply the look across every page, and not copy them literally.**

Previews (scaled, easier to read than the full-size screenshots) are in the session scratchpad. Reading the full-size `screenshot.*` with the Read tool also works.

| Folder | Screen | Use for |
|---|---|---|
| `03-sanctus-landing-page-desktop-refined` | Landing page | Landing, site header and footer, the overall public look |
| `10-sanctus-forgot-password-desktop` | Forgot password (3-step, split photo panel) | Reset password, accept invite, login |
| `17-sanctus-sign-up-onboarding-full-bleed-left` | Sign-up (full-bleed photo left, form right) | Apply as a business, login |
| `12-sanctus-platform-admin-overview-redesigned` | Admin overview (dark sidebar) | Dashboard shell, both overviews, analytics |
| `18-sanctus-platform-admin-applications-redesigned` | Admin applications table | Every dashboard table and list page |
| `06-...` | Older version of 18 | Ignore unless 18 is unclear |

## New photos (owner-generated in Stitch, already converted)

The photos are in `public/images/sanctus/v2/` and are served at `/images/sanctus/v2/<name>.webp`.

| File | Subject |
|---|---|
| `hero-living.webp` (1376×768) | Concrete living room, curved bouclé sofa, travertine table, mountain view. **Landing hero** |
| `interior-villa.webp` (1376×768) | Wide villa living room, mountain view. Auth panels, about |
| `sofa-travertine.webp` | Curved cream sofa in a travertine room. "Sofás" collection |
| `coffee-table.webp` | Raw travertine round coffee table. "Mesas" collection, about |
| `armchair-walnut.webp` | Walnut and bouclé armchair. "Poltronas" collection, 3D section |
| `lamp-vase.webp` | Bronze pendant and ceramic vase on stone (dark). "Iluminação & Objetos" / Decoração |
| `dining-table.webp` | Travertine dining table and walnut chairs |
| `lounge-chair.webp` | Sculptural bouclé lounge chair in a gallery space |
| `detail-joinery.webp` (1024²) | Walnut joinery close-up. Texture, detail |
| `ar-phone.webp` | Hands holding a phone with AR placement. AR explainer |
| `showroom-qr.webp` | Travertine counter with a QR placard. QR / showroom explainer |
| `model-wireframe.webp` | Chair half wireframe, half render. 3D explainer (has small overlay text) |

The original reference photos in `public/images/sanctus/*.webp` stay available. Use whichever fits best.

## What to take from the designs

- **Public:**
  - a solid light header (no blur) with a letter-spaced "S A N C T U S" wordmark and small uppercase tracked nav;
  - a hero as a **split card** (text panel left, photo right, hairline frame) with a small photo caption chip;
  - numbered collection cards ("01 // COLEÇÃO" chip on the photo, serif title, one line, "VER COLEÇÃO →");
  - a **dark obsidian 3D/AR section** with a numbered feature list and a framed viewer card;
  - a quote card;
  - an editorial about section with a photo collage;
  - a **business CTA band** ("Para marcas…" → /apply);
  - a 4-column footer.
- **Auth:**
  - full-height split: a photo panel left with a dark overlay, wordmark, eyebrow, serif statement and footer labels; the form panel right on the surface colour;
  - a **step indicator** (1. Solicitação · 2. Validação · 3. Nova senha) for the code-based reset and invitation flows;
  - eyebrow labels over serif headings;
  - inputs on a subtle fill with a hairline;
  - a full-width obsidian primary button with an arrow.
- **Dashboards:**
  - **dark obsidian sidebar**: the wordmark plus a small "ADMIN CONSOLE" / business name label, line icons, the active item highlighted, a count badge on Applications, and the user block at the bottom with a sign-out icon;
  - a light top bar with breadcrumbs ("Sanctus Admin / Overview");
  - page header: small eyebrow path, a large serif title, one useful sentence, action buttons right-aligned;
  - a **priority notice band** (soft bronze) when applications are pending;
  - stat cards with an uppercase label, a small line icon top right, a big serif number and a muted sub-line;
  - a chart card with a segmented filter;
  - a ranked "Most viewed" list with thumbnails and an index;
  - an activity list with icon tiles;
  - tables with monogram avatars (initials in a hairline square), status pills, tabs with counts, row actions and pagination.

## What NOT to take (hard rules; these come from the project rules and the owner's decisions)

- **No invented features or dead controls:**
  - no search box or ⌘K, notification bell, cart or bag, wishlist, or social links;
  - no hero slider "01 02 03";
  - no "Apple ID" or "Google Workspace" sign-up;
  - no architect/brand role toggle;
  - no "Export audit", "Batch sign" or "Inspect 3D" buttons unless the action really exists in the code;
  - no material swatches that do nothing;
  - no carousel arrows;
  - no "Concierge" link;
  - no resend countdown timer unless one is implemented.

  Every button and link must do something real. Check the existing page for what is real.
- **No false claims or made-up numbers:**
  - no "+20 anos / +500 projetos / 15 países";
  - no SOC-2, "256-bit", TLS, HSM or "end-to-end encryption" claims;
  - no "Spatial Engine v3.4", cluster names, telemetry and checksum jargon or version labels;
  - no city lists ("São Paulo — Lisboa — Milão");
  - no "certificados";
  - no unconfirmed contact email (keep the existing labelled placeholder).

  Dashboard numbers come from real data only.
- **AR is native only** (ADR-0021): Scene Viewer and Quick Look. Never write "WebXR" anywhere. "WebGL" is fine but say it plainly: "3D no navegador". Do not change AR behaviour or the AR modes, only styling around them.
- **No AI-sounding copy**: no "curatorial telemetry", "spatial dossier", "cryptographic tokens", "ecosystem", "immersive curation". Copy is short, plain and specific. Dashboards are in English and use the existing terms: Applications, Businesses, Products, Catalogs & QR Codes, Audit log.
- **The landing copy is the client's reference text** (`System_arch/design/21-sanctus-reference-map.md`). Keep the existing `landing.*` wording for every section that already exists. New sections (the 3D/AR section, the business CTA band) may use new short copy in **both** `pt.ts` and `en.ts`, written plainly and taken from the Stitch wording minus the claims above.
- **No blur or glass**, no gradients except a plain dark overlay on photos for text legibility, no glow, no emoji.
- **Fonts:** keep Cormorant Garamond (display) and Jost (sans) from `src/index.css`. The Stitch auth and dashboard screens use EB Garamond and Manrope; map them to our two fonts. **No new dependencies, no icon font** (use `lucide-react`, which is already installed).
- **Tokens:** use the existing tokens in `src/index.css` (canvas, surface, subtle, line, ink, obsidian, chalk, accent, accent-ink and so on). Do **not** edit `src/index.css`, `src/components/ui/Button.tsx`, `Form.tsx` or `Card.tsx`; the orchestrator owns those. Style locally with Tailwind classes if a variant is missing. Bronze text uses `text-accent-ink`; `accent-bright` only under dark text.
- **Project rules:**
  - data only through `src/services` (hooks);
  - URLs only from `src/lib/urls.ts`;
  - the public pages use `t()` / `localized()`;
  - the admin and business dashboards stay English-only;
  - shared features (ProductEditor, ProductTable, CatalogQrPanel, AnalyticsView, BusinessForm) are never duplicated;
  - every data view keeps its loading, empty and error states;
  - labels and roles stay accessible (`aria-*`, focus rings, 44px touch targets on mobile);
  - no horizontal scroll at 390px.
- **Tests:**
  - don't break existing unit tests: if you change visible text that a test asserts, update the test to match;
  - e2e specs in `tests/e2e/` assert some text too; grep them and update the selectors you change;
  - **do not run Playwright or `npm run test:e2e`** (another agent may be using port 5199). The orchestrator runs e2e at the end.

## Working rules for agents

- Edit only the files your task owns. Other agents edit other files at the same time.
- `src/i18n/dictionaries/en.ts` and `pt.ts` are shared. Edit only your own key groups, with small targeted Edit calls, and re-read the file right before each edit.
- Verify with:
  - `npx tsc -b` (report only errors in your files; others may be mid-edit);
  - `npx oxlint <your files>`;
  - `npx vitest run <your related test files>`.
- For a visual check, run a demo-mode dev server on **your own port**: `VITE_DATA_MODE=demo npx vite --port <PORT> --strictPort`. Never use 5199 or 5173. Look at desktop (1440) and mobile (390) screenshots with a quick Playwright script via `node`. Kill the server when you're done.
- **Do not commit or push.** The orchestrator commits.
- Finish with a short report: the files changed, what you adopted, what you deliberately left out and why, the test results, and anything you were unsure about.
