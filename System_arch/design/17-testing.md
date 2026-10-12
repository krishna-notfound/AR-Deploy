# 17 · Testing strategy & definition of done
Read when: writing tests, verifying a task, or doing the QA phase.

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | slug, format, urls, files (magic bytes), userAgent, resolveTenant, i18n fallback, scale-check math, isValidDb |
| Service | Vitest | Every CatalogService method: happy path, NOT_FOUND, VALIDATION (publish rules), CONFLICT (slug), duplicate suffixing, cascade delete, analytics aggregation, persistence round-trip, corrupt-storage fallback |
| Component | Vitest + RTL | ConfirmDialog, ImageUpload validation, ProductEditor validation, LanguageSwitcher |
| E2E | Playwright | One spec per group in the brief's §19 list (see `tasks/P7-qa.md`). Projects: desktop 1280×800, Pixel 7, iPhone 14 |
| Manual | Real devices | AR on iOS and Android, plus in-app browsers. If no device was tested, say so in the report |

## Definition of done (every task)
1. `npm run typecheck && npm run lint && npm test && npm run build` all pass.
2. The touched route has been checked, manually or with Playwright, at desktop **and** mobile widths.
3. No dead buttons. Loading, empty, and error states exist where data loads.
4. Task ticked in its `tasks/*.md` file with a short note.
