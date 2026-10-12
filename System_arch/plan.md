# Build plan
Read when: starting a new phase or deciding what comes next. For the individual tasks, open the phase's `tasks/` file.

## Phases
| Phase | Goal | Task file | Design files to read | Depends on |
|---|---|---|---|---|
| P0 | Scaffold Vite, TS strict, Tailwind v4, Router, ESLint, Vitest and Playwright; set up the `@/` alias, npm scripts and `git init` | [tasks/P0-scaffold.md](tasks/P0-scaffold.md) | 02, 03 | – |
| P1 | Domain types, seed data, mock service, persistence, hooks, unit tests | [tasks/P1-data-layer.md](tasks/P1-data-layer.md) | 04, 05, 06, 08 | P0 |
| P2 | Design tokens, UI primitives, Toast/Confirm providers | [tasks/P2-design-system.md](tasks/P2-design-system.md) | 11 | P0 |
| P3 | Shells, navigation, mock accounts, guards, demo entry, router | [tasks/P3-shell-auth.md](tasks/P3-shell-auth.md) | 07, 11, 12 (demo entry) | P1, P2 |
| P4 | Super Admin screens and the shared product editor, QR and analytics | [tasks/P4-super-admin.md](tasks/P4-super-admin.md) | 12, 15, 16, 08 | P3 |
| P5 | Business Admin dashboard, built from the shared features with scoping | [tasks/P5-business-admin.md](tasks/P5-business-admin.md) | 13 | P4 |
| P6 | Public catalog and product pages: i18n, 3D, AR, scale check, notices | [tasks/P6-public.md](tasks/P6-public.md) | 14, 09, 10 | P3 |
| P7 | QA against the brief's §19 list, responsive and a11y pass, E2E, build, delivery report | [tasks/P7-qa.md](tasks/P7-qa.md) | 17, 18 | P4, P5, P6 |

```
P0 ─┬─ P1 ─┐
    └─ P2 ─┴─ P3 ─┬─ P4 ── P5 ─┐
                  └─ P6 ───────┴─ P7
```
- P1 and P2 can run in parallel.
- P4 and P6 can run in parallel as subagents once P3 is done. Give each agent only its own task file and the design files listed for it.

## How Claude should run a phase
1. Open `Task.md` and find the current phase. Then open **only** that phase's task file and the design files listed for it in the table above.
2. Skills to load:
   - large phases: `superpowers:executing-plans`, or `superpowers:subagent-driven-development` when tasks are independent
   - UI work in P2, P4 and P6: `frontend-design`
   - charts: `dataviz`, loaded before writing any chart code
   - before ticking a phase: `superpowers:verification-before-completion`
3. Work one task (or a small group) at a time, and tick it off in the task file using the conventions in Task.md.
4. Phase exit: the definition of done in `design/17-testing.md` passes, every task in the phase is `[x]`, and the Task.md dashboard row is updated.
5. If you change an architectural decision, add an ADR in `decisions/` and update the affected design file.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| localStorage quota | Store images only up to 1.5 MB each and keep models session-only (ADR-0007). Show a quota toast. |
| Remote sample GLBs fail or are blocked by CORS | Check them in P1-03 and fall back to `public/models/` |
| No licensed USDZ available | Leave `usdz` empty, show the editor warning, and let model-viewer handle Quick Look (but don't advertise that) |
| In-app browser detection is unreliable | Use "may" wording and make the notice dismissible |
| Can't test AR on a real device | Report it honestly in the delivery report. Playwright can only cover the fallback states. |
| Context bloat across sessions | Use the small-file docs (ADR-0009). Read only what the task needs. |
