# ADR-0010: Follow the current Vite template (TS 6, oxlint, React Router 8)
- **Status:** Accepted (refines ADR-0001)
- **Date:** 2026-10-12
- **Affects:** design/02-tech-stack.md, tasks/P0-scaffold.md

## Context
When P0 was scaffolded, the current releases were newer than the ones the docs assumed:
- Vite 8
- React 19.2
- React Router 8.4
- TypeScript 7 (native compiler)
- Vitest 5
- ESLint 10

The official `create-vite` react-ts template now pins TypeScript ~6.0 and ships **oxlint** instead of ESLint.

## Decision
- Follow the official template: TypeScript ~6.0 and oxlint, with the react, typescript, oxc and jsx-a11y plugins.
- Use React Router 8. Its `createBrowserRouter`, `RouterProvider`, `useBlocker` and `useSearchParams` APIs are unchanged from v7.
- Use Vitest 5, Testing Library and jsdom for unit tests, and Playwright 1.64 for E2E.
- Lazy-load route modules with `React.lazy` and `Suspense`, not the router's `lazy`, so the code stays independent of the router version.

## Consequences
- Good: the toolchain is known to work together, and oxlint is fast with zero config.
- Trade-off: oxlint lacks a few ESLint plugins. Two advisory rules are disabled: `prefer-tag-over-role`, which flags valid ARIA roles on divs, and `only-export-components`. Warnings don't fail the build; errors do.

## Alternatives rejected
- TypeScript 7 plus ESLint 10: typescript-eslint support for TypeScript 7 was not confirmed, so the risk wasn't worth taking.
