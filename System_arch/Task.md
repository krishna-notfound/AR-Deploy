# Task dashboard
Keep this file short. Detailed tasks live in `tasks/PN-*.md`. Update the row here when a phase changes state.

**Current phase:** P9 release. Backend live; Vercel blocked on write access (see tasks/P9-release.md).
**Next action:** [tasks/P9-release.md](tasks/P9-release.md): G6/G7 once Vercel write access exists; then domain, Auth settings, first admin, real-device AR.

| Phase | File | Status | Done / Total | Last update |
|---|---|---|---|---|
| P0 Scaffold | [tasks/P0-scaffold.md](tasks/P0-scaffold.md) | Done | 7 / 7 | 2026-10-12 |
| P1 Data layer | [tasks/P1-data-layer.md](tasks/P1-data-layer.md) | Done | 11 / 11 | 2026-10-12 |
| P2 Design system | [tasks/P2-design-system.md](tasks/P2-design-system.md) | Done | 9 / 9 | 2026-10-12 |
| P3 Shell & auth | [tasks/P3-shell-auth.md](tasks/P3-shell-auth.md) | Done | 7 / 7 | 2026-10-12 |
| P4 Super Admin | [tasks/P4-super-admin.md](tasks/P4-super-admin.md) | Done | 14 / 14 | 2026-10-12 |
| P5 Business Admin | [tasks/P5-business-admin.md](tasks/P5-business-admin.md) | Done | 6 / 6 | 2026-10-12 |
| P6 Public pages | [tasks/P6-public.md](tasks/P6-public.md) | Done (no real-device AR test) | 12 / 12 | 2026-10-12 |
| P7 QA & delivery | [tasks/P7-qa.md](tasks/P7-qa.md) | Mostly done | 8 / 12 | 2026-10-12 |
| P9 Release | [tasks/P9-release.md](tasks/P9-release.md) | Backend live; Vercel blocked | 6 / 8 | 2026-10-13 |
| P8 Design + Supabase | [tasks/P8-design-supabase.md](tasks/P8-design-supabase.md) | DB live on `pmnjchhrgvajtjpadpqo`; Vercel launch pending | 12 / 20 | 2026-10-12 |
| P10 AR Experience 2.0 | [tasks/P10-ar.md](tasks/P10-ar.md) | Built and tested in the browser; real-device pass pending | 8 / 9 | 2026-10-13 |
| Audit 2026-10-13 | [audit/IMPLEMENTATION_PLAN.md](audit/IMPLEMENTATION_PLAN.md) | Audit done; Stage A (contract fixes) next | 0 / 5 stages | 2026-10-13 |

## Conventions (for every task file)
- `[ ]` todo · `[~]` in progress or partial · `[x]` done · `[!]` blocked (add a reason)
- When you finish a task, append ` — done YYYY-MM-DD: <one-line note>`.
- Never delete tasks. If you discover new work, add it under `## Discovered` in that phase file with the next ID.
- Each task names the design file (`→ design/NN`) to read. Read only that.
- A task is done only when it meets the definition of done in `design/17-testing.md`.

## Blockers / notes
- AR can only be verified on a physical iOS or Android device. Headless Chromium reports `canActivateAR = false`, so automated tests cover the fallback only.
