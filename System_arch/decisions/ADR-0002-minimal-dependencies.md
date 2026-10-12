# ADR-0002: Minimal dependencies
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/02-tech-stack.md, design/05-services.md, design/10-i18n.md

## Context
Brief §18 says "Avoid unnecessary dependencies". The data comes from mock services in memory, and the app only needs two languages.

## Decision
The only runtime libraries beyond the core stack are `@google/model-viewer`, `recharts`, and `qrcode`. Data fetching uses custom `useServiceQuery`/`useServiceMutation` hooks that refetch when the store emits a change event. Translation uses a small custom `t()` function. Validation is hand-written.

## Consequences
- Good: a small bundle, nothing hidden, and the backend can be swapped in at a single file.
- Trade-off: no built-in caching or retries. If the real API needs them, add TanStack Query then, via a new ADR.

## Alternatives rejected
- TanStack Query, Zustand, zod, i18next, a UI kit: too much weight for a demo backed by mock data.
