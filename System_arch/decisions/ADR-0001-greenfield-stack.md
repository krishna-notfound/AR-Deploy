# ADR-0001: Greenfield stack
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/02-tech-stack.md, tasks/P0-scaffold.md

## Context
The repository was empty: no package.json and no code. The brief (§1) says that for an empty project we should use React, TypeScript, Vite, and Tailwind CSS, with React Router and Lucide.

## Decision
Use Vite with React 19 and strict TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`, with tokens defined in `@theme`), React Router v7 (`createBrowserRouter` with lazy routes), and lucide-react.

## Consequences
- Good: the stack matches the brief exactly, the dev server is fast, and design tokens live in one CSS file.
- Trade-off: Tailwind v4 configures through CSS rather than a JS config file, so v3 tutorials may not apply.

## Alternatives rejected
- Next.js: we don't need SSR, and the brief names Vite.
