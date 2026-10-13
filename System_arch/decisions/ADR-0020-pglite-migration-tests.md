# ADR-0020: Test SQL migrations in PGlite (dev-only)
- **Status:** Accepted
- **Date:** 2026-10-13
- **Affects:** design/17-testing.md, design/19-supabase.md

## Context
Schema changes must be verified before they are applied to the live project (CLAUDE.md). This machine has no Docker, so `supabase start` (a local Supabase) can't run. A Supabase branch is a paid feature.

## Decision
- **Dev dependency:** `@electric-sql/pglite` 0.5.9 (Apache-2.0), dev-only, pinned exactly. It is Postgres compiled to WASM and runs in-process in Vitest.
- **Test:** `supabase/tests/migrations.test.ts` creates minimal stand-ins for Supabase's `auth` and `storage` schemas and its API roles, applies **every** migration in order, and checks the rules as `anon` or `authenticated`. The rules covered:
  - the publish rules
  - owner linking
  - row-level security isolation between businesses
  - anonymous read-only access
- **Scope:** part of `npm test`. No network and no live project are involved.

## Consequences
- **Good:** migrations and RLS policies are exercised on every test run, as the API roles.
- **Trade-off:** the stand-ins aren't Supabase. PostgREST, Storage API behaviour and Auth are not covered, so the live integration test (`live.integration.test.ts`) is still needed against an approved project.

## Alternatives rejected
- **Local Supabase with Docker:** not available here; still the better option when Docker exists.
- **Paid Supabase branch:** no paid services without approval.
