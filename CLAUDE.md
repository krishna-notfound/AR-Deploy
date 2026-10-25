# AR Furniture Platform (frontend)

This project is a multi-tenant 3D furniture catalog with AR. It has three surfaces:
- Super Admin (`/admin`)
- Business Admin (`/dashboard`, scope pending)
- Public EN/PT catalog and product pages

It runs in **demo mode** by default (a mock service layer, no setup). A **Supabase mode** is prepared behind the same service interface (`VITE_DATA_MODE=supabase`); its 7 migrations in `supabase/migrations/` and the `track-event` Edge Function are live on project `pmnjchhrgvajtjpadpqo` (2026-10-13). Never re-apply or roll back without the owner's approval. All architecture docs live in `System_arch/`.

**Start here:** `System_arch/HANDOFF.md` (live state, AR, accounts, gotchas), then `docs/PRODUCTION_READINESS.md` (release gate). Live AR is **native only** (`scene-viewer quick-look`, ADR-0021, owner decision): never re-add WebXR or change AR modes without the owner's go-ahead and a device test.

**Status:** production is live from `main` (GitHub default branch). Do feature work on branches cut from `main`; pushing to `main` deploys production, so do it only when the owner asks. The phase table is in `System_arch/Task.md`. The release gate, open findings and next steps are in `docs/PRODUCTION_READINESS.md`.

## Where to look (open only what the task needs)
| Topic | File |
|---|---|
| Index of all architecture docs | `System_arch/README.md` |
| Live state, accounts, gotchas | `System_arch/HANDOFF.md` |
| Requirements matrix, client questions | `docs/PRD.md` |
| Environments, migrations, rollback, domain | `docs/OPERATIONS_RUNBOOK.md`, `System_arch/design/20-deployment.md` |
| Tests: automated vs real device | `docs/TEST_PLAN.md` |
| Security boundaries and open items | `docs/SECURITY_REVIEW.md` |
| Client user guide | `docs/CLIENT_HANDOVER.md` |
| ADRs | `System_arch/decisions/README.md` (owner scope decisions: `docs/DECISIONS.md`) |
| Supabase schema and RLS | `System_arch/design/19-supabase.md`, `supabase/migrations/` |

`System_arch/audit/` is a historical 2026-10-13 snapshot (every file is marked "superseded in part"). Don't treat it as current.

## Session start (keep context small)
1. Read `System_arch/Task.md` to find the current phase and the next task.
2. Open **only** that phase's file in `System_arch/tasks/`.
3. Open **only** the `design/NN-*.md` files that the task names (the `→ design/NN` reference).
4. Look things up in `System_arch/README.md` (the index) only when you're unsure which file you need.
5. Don't read `MASTER_PROMPT.md` in full. Grep for one section; see the README for how.

## Hard rules
- Never build: a custom backend server, GLB→USDZ conversion, AI 3D, DNS or SSL setup, billing, or business-side team roles (platform Owner/Admin/Team roles: ADR-0029). Supabase (DB, Auth, Storage) is the only backend (ADR-0015).
- Supabase rules:
  - Demo mode must keep working with no env vars.
  - Never fall back to demo data after a Supabase error.
  - Never put secret/service_role keys in `VITE_*`.
  - Schema changes go in a new file made with `npx supabase migration new`, with RLS and explicit grants, verified before claiming they work.
  - Never apply migrations to the linked project without the user's go-ahead.
- Be honest in the UI:
  - Label sample data, demo URLs and session-only uploads as such.
  - Mark AR scale as verified only when the measured size matches.
  - The role guard is not a security boundary.
- Components get data only through `src/services` (`service`, `auth`, hooks). Never import `services/mock/*` or `services/supabase/*` into the UI.
- URLs are built only in `src/lib/urls.ts`. The catalog QR code always encodes the **catalog** URL.
- The admin and business dashboards are English-only. The landing page, tenant catalog and product pages use `t()` and `localized()` (landing copy is the client's reference text, design/21).
- Design tokens live in `src/index.css` (ADR-0023, Sanctus palette from the client's brand board). Use `accent-ink` for bronze text and `accent-bright` only under dark text. The primary button is obsidian. Headings use the serif through `text-display`/`text-headline`/`text-title` or `font-display`.
- Shared features (ProductEditor, ProductTable, CatalogQrPanel, AnalyticsView, BusinessForm) are never duplicated per dashboard.
- No dead buttons. Every data view has loading, empty and error states.
- No new dependency without a new ADR in `System_arch/decisions/`.

## Commands
```
npm run dev          # Vite dev server (http://localhost:5173)
npm run typecheck    # tsc -b (strict)
npm run lint         # oxlint src tests (0 errors required; warnings are advisory)
npm test             # vitest run (unit + component)
npm run test:e2e     # playwright (desktop + mobile projects; dev server on :5199)
npm run build        # tsc -b && vite build
npm run db:types     # SUPABASE_PROJECT_REF=<ref>; only after the schema is applied (design/19)
```
Stack: Vite 8, React 19, TypeScript 6, Tailwind 4, React Router 8 and oxlint (see ADR-0010).

## Definition of done (per task)
1. `typecheck`, `lint`, `test` and `build` pass.
2. The touched route has been checked at desktop and mobile widths.
3. The task is ticked in its `tasks/PN-*.md` file with a note.
4. The phase row in `Task.md` is updated.

## Changing the design
Add an ADR (`System_arch/decisions/_template.md`), update the affected `design/` file, and add a row to `decisions/README.md`.
