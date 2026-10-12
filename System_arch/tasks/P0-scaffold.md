# P0 · Scaffold
→ design/02-tech-stack.md, design/03-folder-structure.md

- [x] **P0-01** `git init`, `.gitignore` (node, dist, playwright reports, .env*). Accept: repo initialised. — done 2026-10-12: initialised; nothing committed yet.
- [x] **P0-02** Create a Vite React-TS app in the repo root without overwriting `System_arch/`, `.claude/` or `CLAUDE.md`. Accept: `npm run dev` serves the default page. — done 2026-10-12: scaffolded the official template in the scratchpad and copied its configs in (ADR-0010).
- [x] **P0-03** TS `strict`, `noUncheckedIndexedAccess`, `@/` alias in tsconfig and vite. Accept: `npm run typecheck` passes. — done 2026-10-12
- [x] **P0-04** Tailwind v4 via `@tailwindcss/vite`; `src/index.css` with an `@theme` block. Accept: a utility class renders. — done 2026-10-12
- [x] **P0-05** Install `react-router`, `lucide-react`, `@google/model-viewer`, `recharts`, `qrcode` (+ `@types/qrcode`). Accept: installed, nothing else added. — done 2026-10-12: React Router 8.4.
- [x] **P0-06** Lint, unit tests and Playwright (desktop + mobile projects, `webServer`). Accept: `lint`, `test` and `test:e2e` run. — done 2026-10-12: oxlint instead of ESLint (ADR-0010).
- [x] **P0-07** Create the folder skeleton from design/03 and fill in the real commands in `CLAUDE.md`. Accept: typecheck, lint, test and build all pass. — done 2026-10-12

## Discovered
