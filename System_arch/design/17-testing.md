# 17 · Testing strategy & definition of done
Read when: writing tests, verifying a task, or doing the QA phase.

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | slug, format, urls, files (magic bytes), userAgent, resolveTenant, i18n fallback, scale-check math, isValidDb |
| Service | Vitest | Every CatalogService method: happy path, NOT_FOUND, VALIDATION (publish rules), CONFLICT (slug), duplicate suffixing, cascade delete, analytics aggregation, persistence round-trip, corrupt-storage fallback |
| Component | Vitest + RTL | ConfirmDialog, ImageUpload validation, ProductEditor validation, LanguageSwitcher |
| E2E | Playwright | One spec per group in the brief's §19 list (see `tasks/P7-qa.md`). Projects: desktop 1280×800, Pixel 7, iPhone 14 |
| Manual | Real devices | AR on iOS and Android, plus in-app browsers. If no device was tested, say so in the report |

## Database tests (ADR-0020)
`supabase/tests/migrations.test.ts` applies every migration to PGlite (an in-process Postgres) with stand-ins for Supabase's `auth` and `storage` schemas. It checks these rules as `anon` and `authenticated`:
- publish rules
- owner linking
- RLS isolation between businesses
- anonymous read-only access

It runs in `npm test`. It does not replace the live integration test (`live.integration.test.ts`, which needs the `SUPABASE_IT_*` variables and writes data).

## E2E notes
- **Model optimization:** on by default (ADR-0038); E2E covers it with the default setting and with `VITE_MODEL_OPTIMIZATION=off`.
- **Network dependency:** sample models load from raw.githubusercontent.com, so model tests depend on the network. Their budgets are sized for that.

## Definition of done (every task)
1. `npm run typecheck && npm run lint && npm test && npm run build` all pass.
2. The touched route has been checked, manually or with Playwright, at desktop **and** mobile widths.
3. No dead buttons. Loading, empty, and error states exist where data loads.
4. Task ticked in its `tasks/*.md` file with a short note.
