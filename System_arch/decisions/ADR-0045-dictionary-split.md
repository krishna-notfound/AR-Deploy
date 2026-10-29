# ADR-0045: Dashboard text loads with the dashboard, not with every page
- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** design/10-i18n.md (dictionaries), design/20-deployment.md (bundles)

## Context
Both full dictionaries (about 2,700 keys each, mostly dashboard text) were in the shared first-load chunk, so a customer opening a catalog or product page from a QR code downloaded the admin, settings, team and editor text first. The shell, 2FA setup and onboarding checklist were in the entry chunk too.

## Decision
- `en.ts` / `pt.ts` (`enCore` / `ptCore`) hold the first-load text: public pages, `common`, `site`, `auth` and `shared` (the few ui, admin.activity and applications.apply strings that public pages or app-wide providers name). `en.dashboard.ts` / `pt.dashboard.ts` hold admin, products, business, settings, team, editor, applications and the rest of ui. `TranslationKey` is still derived statically from both parts; only the loading is lazy.
- The admin, business, settings and Editor-preview routes render inside `DashboardDictionaries`, which shows the page skeleton until the dashboard text is loaded: English always (the fallback), Portuguese on top only when the language is Portuguese. Dashboard screens therefore never show a raw key. The sign-in page starts the download early.
- Switching to Portuguese inside a dashboard keeps showing the current language until the Portuguese text has arrived (the choice is saved at once).
- The role guard, 2FA gate and shell moved into a lazy `DashboardFrames` chunk, loaded in parallel with the text.
- `translate()` reads the loaded dashboard text first, then the first-load text, then English. Code that needs "is this key known" uses `hasTranslation()`, not the dictionary object.
- Tests install both dashboard dictionaries in `src/test/setup.ts` and read the full dictionaries from `dictionaries/full.ts`, so the language tests (every English key has Portuguese, same tokens, no empty values) cover all keys. `publicKeys.test.ts` fails when a file a public page imports names a dashboard-only key; the fix is to move that key into `en.shared.ts` / `pt.shared.ts`.

## Consequences
- Good: the shared chunk dropped from 776 KB to 505 KB and the entry from 301 KB to 241 KB (supabase-mode build); a product page's JS fell from 1273 KB to 947 KB (372 to 294 KB gzip).
- Trade-off: the first dashboard visit makes one more request (the dictionary, in parallel with the frame). A new public component must not use a dashboard-only key (the guard test says so).
- Not done: `services/mock` (about 170 KB of source) and supabase-js are still in the shared chunk in the live build; removing the mock from Supabase builds is a separate change.

## Alternatives rejected
- One dictionary per route: far more files to keep in step; the area split already follows the routes.
- Loading Portuguese text on every dashboard visit: wastes 35 KB gzip for English users.
