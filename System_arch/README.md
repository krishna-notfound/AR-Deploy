# System_arch: index (read this first, then only what you need)

Every file here is small on purpose. **Don't read whole folders.** Pick the files your task needs from the table below.

## What's here
| Path | What | Size |
|---|---|---|
| `Task.md` | Phase dashboard: current phase and next action | tiny |
| `plan.md` | Phase order, dependencies, risks, how to run a phase | small |
| `tasks/PN-*.md` | Checklist for one phase (IDs, acceptance criteria, design refs) | small |
| `design/NN-*.md` | One architecture topic per file | small |
| `decisions/README.md` | ADR index. Open an ADR only when a task links to it | tiny |
| `MASTER_PROMPT.md` | Original client brief, verbatim | **large**: read one section only (see below) |

## Which design file for which work
| Working on… | Read |
|---|---|
| Anything, first time | `design/01-overview.md` (non-goals + honesty rules) |
| Dependencies, scripts, config | `design/02-tech-stack.md` |
| Where to put a file | `design/03-folder-structure.md` |
| Entity types, invariants | `design/04-domain-model.md` |
| Service methods, hooks | `design/05-services.md` |
| localStorage, uploads | `design/06-persistence.md` |
| Routes, guards, accounts | `design/07-auth-routing.md` |
| URLs, QR codes, subdomains | `design/08-tenancy-urls.md` |
| 3D viewer, AR, scale, in-app notice | `design/09-3d-ar.md` |
| PT/EN translations | `design/10-i18n.md` |
| UI components, tokens, a11y | `design/11-design-system.md` |
| Super Admin pages, demo entry | `design/12-features-admin.md` |
| Business Admin pages | `design/13-features-business.md` |
| Public catalog / product page | `design/14-features-public.md` |
| Product editor | `design/15-product-editor.md` |
| Analytics and charts | `design/16-analytics.md` |
| Tests, definition of done | `design/17-testing.md` |
| Limitations copy, delivery report | `design/18-mock-vs-backend.md` |
| Supabase setup, migrations, RLS, storage, demo vs Supabase mode | `design/19-supabase.md` (SQL in `supabase/migrations/`) |
| Landing page (`/`) | `design/14-features-public.md` → ADR-0016 |
| Unclear client requirement | `design/open-questions.md` |

## Reading MASTER_PROMPT.md cheaply
Read only the section you need. Grep for its heading, then read that range:
`Grep pattern="^## 12\." path="System_arch/MASTER_PROMPT.md" -n` → `Read offset=<line> limit=60`.
Section map:
- §1–2: inspect / vision
- §3–9: Super Admin
- §10: Business Admin
- §11–13: Public pages
- §14–15: Design and interactions
- §16–17: Architecture and routes
- §18–20: Quality, tests, report

## Keeping docs in sync
- When you finish a task: tick it in `tasks/PN-*.md` and update the row in `Task.md`.
- When you change a decision: add a new ADR in `decisions/`, edit the affected `design/` file, and add a row to `decisions/README.md`.
- Keep each design file under about 100 lines. If one grows, split it and update this index.
