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
- [ ] Sub-project 2 · Access model: approval states, one owner per business, admin-created owners (Edge Function), self-service removed, configurable categories (migration 8, needs approval)
- [ ] Sub-project 3 · Variant media: per-variant photos and GLB/USDZ (migration 9, needs approval)
- [ ] Sub-project 4 · EN/PT everywhere (auth pages, dashboards), language persistence
- [ ] Sub-project 5 · Product QR codes; ops pack (client Supabase setup, Vercel env, redirect URLs, Resend checklist, DNS, asset/testing guide)
