# P9 · Production release (working checklist, survives context compaction)
→ design/19, design/20. Branch `feature/design-supabase-foundation` → `main` on `origin` (github.com/krishna-notfound/AR-Deploy).

## Audit (2026-10-13)
- **Git:**
  - remote `origin` added by the owner, empty before the first push
  - no `main` yet (`master` was never committed)
  - history scanned: no keys or secrets
- **Supabase `pmnjchhrgvajtjpadpqo`:**
  - 3 migrations applied (`init_schema`, `storage`, `save_product`)
  - the analytics migration is pending locally
  - no Edge Functions, no data, no users
- **Vercel team `track0`:** no project for this app, no domains. The Vercel CLI is installed but not logged in, so the MCP is used instead.
- **Baseline:** typecheck 0, lint 0 errors, unit 63 pass + 10 live skipped, e2e 22/22, build OK.

## Gaps
- [x] **G1 Analytics:** (done 2026-10-13: model_interaction, function + migration live, live tests pass)
  - add `model_interaction` (3D viewer) to the pending migration
  - set `ANALYTICS_SALT`, deploy `track-event`, apply the migration
  - live verify; show interactions in the dashboards
- [x] **G2 Auth:** (done 2026-10-13: /reset-password + link from /login; account-loading race fixed; email delivery blocked on SMTP)
  - forgot / reset password flow
  - expired-session redirect
  - no sign-up UI (sign-ups off by decision)
- [x] **G3 Memberships:** (done 2026-10-13: Owners tab + migration 20261012200813; live + UI tests) platform admin links, lists and removes business owners in the UI (trusted RPCs, platform admins only).
- [x] **G4 Storage cleanup:** (done 2026-10-13: verified live: replaced and deleted files gone, business folder emptied) remove unreferenced files after product delete, image or model replacement, and business delete.
- [x] **G5 Viewer:** (done 2026-10-13: 45 s no-progress timeout, Reset view, interaction event) a load timeout, so a stalled model never spins forever.
- [!] **G6 Vercel:** (BLOCKED 2026-10-13: create_project returns 403 for team `track0`; the MCP token lacks write scope and the CLI is not logged in)
  - project `ar-furniture`
  - env vars: production = Supabase; preview / development = demo
  - preview deploy verified, then production
- [ ] **G7 Release:** (waits for G6)
  - create `main` from the verified commit (no force)
  - production deploy from `main`
  - live suite plus production smoke test
- [x] **G8 Docs:** (design/20 release runbook, rollback, troubleshooting; design/19 status) design/20 runbook (deploy, rollback, troubleshooting), DELIVERY_REPORT.

## Blocked on the owner
- **Production domain:** not chosen.
- **Supabase Auth dashboard settings:** no Management API access from here.
- **Paid features:** custom SMTP provider, and the Pro plan for leaked-password protection.
- **First real platform admin:** email address needed.
- **Real-device AR:** testing on an iPhone and an Android phone.

## Also fixed during P9
- **Public URLs:** production (Supabase mode, no domain) used `https://{slug}.example.com`. They now use real `/catalog/...` URLs on the deployment; "Demo URL" labels appear only in demo mode.
- **Account race:** a signed-in owner opening `/admin` (or any guarded deep link on a fresh load) was briefly treated as signed out.
- **Settings:** the demo-only capability table is now hidden in Supabase mode.
