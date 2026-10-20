# Final test run (2026-10-20, after all fixes)

Run on the final working tree of `feature/sanctus-brand-design-system`. Demo mode only: the e2e server runs with the Supabase variables blanked. No live system was called.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0: 0 errors, advisory warnings only |
| `npm test` | 215 passed, 15 skipped (the live integration tests). Green on 3 consecutive full runs. |
| `npx vitest run supabase/tests` | 25 passed (PGlite migrations and RLS) |
| `npm run build` | exit 0 |
| `npm audit` | 0 vulnerabilities |
| `npm run test:e2e` | **31 passed** (desktop and mobile), 3.1 min |

Baseline before this pass: 174 unit tests passed, 31/31 e2e, 25/25 PGlite. All gates green.
