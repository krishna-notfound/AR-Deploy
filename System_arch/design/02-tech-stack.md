# 02 · Tech stack & scripts
Read when: adding a dependency, or changing build/lint/test config.
Decisions: [ADR-0001](../decisions/ADR-0001-greenfield-stack.md), [ADR-0002](../decisions/ADR-0002-minimal-dependencies.md), [ADR-0010](../decisions/ADR-0010-tooling-versions-oxlint.md)

| Concern | Choice (installed) |
|---|---|
| Build | Vite 8 + React 19.2 + TypeScript ~6.0, `strict` and `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS 4.3 (`@tailwindcss/vite`, `@theme` tokens in `src/index.css`) |
| Routing | React Router 8 (`createBrowserRouter`). Route modules are lazy-loaded with `React.lazy`. |
| Icons | `lucide-react` |
| 3D/AR | `@google/model-viewer` 4.4, loaded with a dynamic import in `components/three/ModelViewer.tsx`. Pulls in `three` as a dependency. |
| Charts | `recharts` 3 |
| QR | `qrcode` |
| Unit tests | `vitest` 5, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` |
| E2E | `@playwright/test` with two projects: `desktop` (1280×800) and `mobile` (Pixel 7, `*.mobile.spec.ts` only) |
| Lint | `oxlint` (react, typescript, oxc and jsx-a11y plugins), configured in `.oxlintrc.json` |

**Do not add** UI kits, Redux/Zustand, TanStack Query, zod, i18n libraries or date libraries. Any other new dependency needs a new ADR first.

**Path alias:** `@/` maps to `src/`. It is set in `tsconfig.app.json` (`paths`) and in `vite.config.ts`.

**npm scripts**
```
dev        vite                        (http://localhost:5173)
build      tsc -b && vite build
preview    vite preview
typecheck  tsc -b
lint       oxlint src tests
test       vitest run
test:e2e   playwright test             (starts/reuses a dev server on :5199)
```
Run `npx playwright install chromium` once before the first E2E run.

**Env:** `VITE_ROOT_DOMAIN` is optional and defaults to `example.com`. See `.env.example` and [08-tenancy-urls.md](08-tenancy-urls.md).
