# QA fixes 2026-11-14: group errors-forms

Front-end only. No migration, no edge function changed (nothing to redeploy). ADR: `System_arch/decisions/ADR-0074-error-and-unsaved-work-handling.md` (index row to be added by the controller).

| ID | Verdict | What you found | Fix and test |
|---|---|---|---|
| EF-01 | REAL | Roles were saved one by one; if Team failed after Admin saved, the page said "not saved" and still counted the Admin change as unsaved. | Saved roles become the new base; toast says which roles saved and which did not. `RolePermissionsPage.test.tsx` (partial save). |
| EF-03 | REAL | `UploadButton` (and `EditPictureButton`) showed `error.message`, English. | `uploadErrorText` shows `editor.upload.failed` (EN/PT) or `errorText`. `UploadButton.test.tsx` (PT). |
| EF-04 | REAL | A failed analytics read gave an empty map, so tables showed 0 views / 0 AR attempts. | `StatsNotice` (warning + retry) above the three product tables. The cells still print 0 because `ProductTable` is outside this brief; per-cell "-" is a follow-up. `AdminProductsPage.test.tsx`. |
| EF-05 | REAL | Close or Esc in Settings navigated away from unsaved Preferences, Profile name, email and password drafts. | Sections report drafts (`useUnsavedDraft`); the layout holds the only blocker, a confirm dialog and `beforeunload`. BusinessForm reports through it too (a router honours one blocker). `SettingsLayout.test.tsx`. |
| EF-06 | REAL | No `beforeunload` guard in `BusinessForm` or `RolePermissionsPage`. | New shared `useBeforeUnload` (also used by `EditorLayout`). `BusinessForm.test.tsx`. `ProductEditorForm` has its own copy (other agent's file, left). |
| EF-07 | REAL | A failed chrome read made `/collections/:slug` fall back to built-ins or a 404. | `usePublishedCollection` returns `error` and `reload`; `CollectionPage` shows an error with retry. `contentHooks.test.tsx`. |
| EF-08 | REAL | `useServiceQuery` had no `catch`: a rejected promise left loading forever and an unhandled rejection; `useServiceMutation` threw. | Both turn a rejection or throw into a failed `UNKNOWN` result. New `services/hooks.test.tsx`. |
| EF-09 | REAL | Invite dialog showed "Loading" for ever when the permissions read failed. | Error text with retry. `InviteMemberDialog.test.tsx`. |
| EF-10 | REAL | "Add product" picker opened with an empty select after a failed businesses read. | Picker shows error and retry, loading, or "no businesses"; the default business follows the list. `AdminProductsPage.test.tsx`. |
| EF-11 | REAL | A failed reload after a successful list change was invisible (page kept the old list). | `ListsLayout` shows a "may be out of date" notice with retry (categories and currencies). `lists.test.tsx`. |
| EF-13 | REAL | A failed background refresh on the public catalogue left stale products with no sign. | Products stay; a small neutral notice with retry. `catalogRefresh.test.tsx`. Product page and showcase pages not changed. |
| EF-17 | REAL | One root `errorElement` replaced the whole app on any crash, and used `navigator.language` instead of the chosen language. | `RouteError` uses `t()`; boundaries added inside admin, business, public, settings groups (`shell` variant keeps the sidebar). `RouteError.test.tsx`. |
| EF-19 | REAL | No offline detection. | `OfflineBanner` in `RootLayout` (`navigator.onLine` plus events, EN/PT). `RouteError.test.tsx`. |
| FV-01 | REAL | After a draft conflict "Reload" replaced local edits silently. | Reload asks first (`editor.conflict.discard*`). `editor.test.tsx`. |
| FV-02 | REAL | `changedBusinessFields` compared `contact` as one blob and the service wrote all four columns, so an older tab undid contact edits. | Contact diffed per entry (also when merging fresh values into the form); `fromBusinessInput` writes only entries present. `BusinessForm.test.tsx`, `backend.test.ts`. |
| FV-03 | REAL | Duplicate-slug errors were English strings. | `SLUG_TAKEN` uses the existing `common.validation.*.slugTaken` messages. `backend.test.ts`. Other `DB_RULES` strings (images, variants) are still English: same class, not fixed here. |
| FV-08 | REAL | ApplyForm did not focus the first invalid field; BusinessForm and CategoriesPage kept an error after the field was edited (ApplyForm already cleared per field). | ApplyForm focuses the first invalid field; BusinessForm and CategoriesPage clear the field's error on edit. `ApplyForm.test.tsx`, `BusinessForm.test.tsx`, `lists.test.tsx`. |
| UX-5 | REAL (front end) | `isAllowedLinkHref` and `isAllowedSectionHref` accepted `/\evil.com`. | Backslash refused in site paths. `siteContent.test.ts`, `landingSections.test.ts`. NEEDS DEPLOY: the SQL gate in `20261111083034_landing_sections.sql` (line 124) still accepts a backslash; a hardening migration needs the owner's go-ahead. The TS/SQL parity test still passes (the TS check is now stricter). |

Counts: REAL 18 (UX-5 front end only; its database half is a follow-up), PARTLY 0, NOT REAL 0, NEEDS OWNER DECISION 0.

Edge functions changed: none. Migration: none.

Verification: `npm run typecheck` 0, `npm run lint` 0 errors, vitest on touched areas (i18n, domain, services hooks, app, team, businesses, settings, editor, lists, apply, admin, business, public, marketing, legal): all pass except 3 in `ShowcaseProductPage.test.tsx`, which fail the same way on an untouched HEAD worktree (ModelViewer, environment).
