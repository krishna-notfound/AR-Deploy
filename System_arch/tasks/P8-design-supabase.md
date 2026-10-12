# P8 · Design refinement + Supabase foundation
→ design/11, design/14, design/19, ADR-0014/0015/0016

- [x] **P8-01** Inspect the repo and summarise the architecture, visual gaps, data flow and Supabase strategy. — done 2026-10-12
- [x] **P8-02** Design tokens: orange accent split by contrast job, charcoal primary, hairline cards, type scale, BrandMark. → design/11 — done 2026-10-12
- [x] **P8-03** Landing page at `/` with real 3D hero, showcase from the service and the demo picker; `/demo` route; `/?next` redirect. → design/14 — done 2026-10-12
- [x] **P8-04** Apply the refresh to the public catalog, product page and dashboard shell (nav indicator, page titles, links). — done 2026-10-12: screens checked at 390 px and 1280–1440 px
- [x] **P8-05** Service layer: `backend.ts` mode switch, `uploadAsset`, `subscribe`, shared validation and analytics. Upload components go through the service. — done 2026-10-12
- [x] **P8-06** Supabase client (singleton), `SupabaseCatalogService`, `AuthService`, `/login`, Supabase `AccountProvider`, misconfiguration screen. → design/19 — done 2026-10-12
- [x] **P8-07** Migrations: schema + RLS + grants, storage buckets + policies, `save_product` RPC. — done 2026-10-12: 55/55 PGlite checks; NOT applied to a live project
- [x] **P8-08** Tests: backend config, service selection (demo never creates a client), error mapping (no fake success), save args. Landing e2e. — done 2026-10-12
- [x] **P8-09** Docs: ADR-0014–0016, design/19, 18 matrix, CLAUDE.md, README, .env.example, delivery report. — done 2026-10-12
- [x] **P8-16** Pre-deployment security review of the migrations. — done 2026-10-12: 7 issues fixed in the unapplied files (cross-business file reference, forged analytics columns, unsafe URL schemes, size caps, trigger blocking trusted roles, public-bucket abort, trigger function execute); 80/80 PGlite checks; rollback script and read-only pre-flight added. Nothing applied.

## Discovered
- [x] **P8-10** Apply the migrations to the approved project. — done 2026-10-13: applied to `pmnjchhrgvajtjpadpqo` via MCP; local files renamed to the recorded versions; advisors clean for our objects; types generated, with a drift check.
- [ ] **P8-17** Decide on public analytics flooding: accept for a pilot, or move to an Edge Function with rate limiting before public launch.
- [x] **P8-11** End-to-end Supabase run. — done 2026-10-13: live suite 10/10 and UI smoke 8/8; found and fixed the GLB/USDZ upload MIME bug; QA data deleted.
- [ ] **P8-12** Admin UI for memberships and invitations (currently SQL only).
- [ ] **P8-13** Port the PGlite RLS cases to pgTAP (`supabase test db`).
- [ ] **P8-14** Clean up orphaned Storage files after a product is deleted; rate-limit public analytics inserts.
- [ ] **P8-15** Move the remaining direct `services/mock` imports (`RootLayout` store notices, Settings `FAIL_RATE_KEY` / credits) behind the service interface.

- [ ] **P8-18** Add the index `product_analytics (product_id, business_id)` for the composite FK (performance advisor INFO).
- [ ] **P8-19** Decide whether to revoke anon/authenticated EXECUTE on the platform function `public.rls_auto_enable()`. It is advisor-flagged but only runs as an event trigger. Coordinate with Supabase defaults.
- [ ] **P8-20** Before launch: Vercel project, env vars, domains (design/20), Supabase Auth settings, custom SMTP, first real admin account.
