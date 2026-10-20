# P11 · Sanctus alignment (client references and requirements)
→ design/11, design/21, ADR-0023. Branch `feature/sanctus-brand-design-system` (from `main`). The work is split into five sub-projects, approved by the owner on 2026-10-20 and done in this order.

## Sub-project 1 · Brand and design system: done (2026-10-20)
- [x] Reference inventory and transcription: every image in `AR-attachment/` mapped to a page or section (design/21)
- [x] Tokens from the moodboard palette; Cormorant Garamond + Jost; eyebrow/label styles; 2px corners (`src/index.css`)
- [x] Wordmark and monogram traced from the brand board (`BrandMark.tsx`, `public/favicon.svg`); "Furnish AR" removed from the UI
- [x] Landing page recreated from R3, with the reference copy (PT verbatim, EN translated); every call to action leads to a real catalogue or product, or is not shown
- [x] Header (overlay/solid, EN/PT, account, `<dialog>` mobile menu) and footer
- [x] Catalogue page: editorial header, text category filters, 4:5 photo-first cards
- [x] Product page opens on the photograph; separate "Visualizar em 3D" and "Ver em AR" actions; thumbnails; native AR unchanged
- [x] Dashboards and sign-in reskinned through the tokens; serif page titles
- [x] typecheck, lint (0 errors), unit tests, e2e (desktop + mobile), build; screenshots compared with the references at 1440 and 390 px
- Note: AR on real phones was not tested in this sub-project (no device). The launch code path is unchanged; the Android intent e2e test passes.

## Next
- [x] Sub-project 2 · Access model: applications with approval states, one owner per business, admin-created owners (Edge Function), self-service removed — done 2026-10-20: ADR-0024, design/24, migration 20261020091428 applied to the client project, 3 Edge Functions deployed; email needs the Resend secrets (org Admin). Configurable categories moved to Discovered D1.
  - Preview QA 2026-10-20 on `71aed48` (Supabase mode, client project): 13/13 browser checks passed (wizard validation, stored application with reference, 409 duplicate, admin search, reject needs a reason, review → approve into a draft, owner invited, resend cooldown 429, audit log, mobile PT layout). The database confirmed the row, draft business, one owner, 6 audit events and 3 emails logged `blocked: email_not_configured`. Anonymous REST reads and writes of applications, audit and email_log were denied. QA record: application `539123DE` ("QA Preview Atelier …", applicant `delivered+qa…@resend.dev`).

## Discovered
- [ ] D1 · Configurable product categories per business (split from sub-project 2)
- [!] D2 · Edge Function secrets and Auth redirect URLs on the client project: needs the org Admin role (Developer gets 403)
- [ ] Sub-project 3 · Variant media: per-variant photos and GLB/USDZ (migration 9, needs approval)
- [ ] Sub-project 4 · EN/PT everywhere (auth pages, dashboards), language persistence
- [ ] Sub-project 5 · Product QR codes; ops pack (client Supabase setup, Vercel env, redirect URLs, Resend checklist, DNS, asset/testing guide)
