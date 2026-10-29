# Content Editor and bilingual dashboards: implementation plan

> **For agentic workers:** owner-chosen execution (2026-10-29): **parallel Sonnet subagents in git worktrees**, in three waves, merged by the controller. Each agent owns ONLY the files of its track (ownership table). Steps use checkbox (`- [ ]`) syntax. TDD: write the failing test, see it fail, implement, see it pass, commit.

**Goal:** the client edits Terms, Privacy, custom pages, the application form (full builder) and social links from an Editor tab with draft → publish, and every screen of the app switches between English and Portuguese.

**Architecture:** one singleton `site_content` row (draft + published jsonb) and a version history, reached only through `security definer` RPCs; a `ContentService` (mock + Supabase) behind `src/services`; pure, import-free document models shared by the page, the demo service and the Edge Function; one app-wide `LanguageProvider` and per-area dictionary files.

**Tech stack:** Vite 8, React 19, TypeScript 6 strict, Tailwind 4, React Router 8, Supabase (Postgres RLS, Edge Functions on Deno), vitest, PGlite tests, Playwright. **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md` (section numbers below refer to it). Decisions: ADR-0043, ADR-0044, ADR-0042.

## Global constraints
- Commit as `krishna <krishnagtkr@gmail.com>` (`git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit ...`), no co-author line.
- Never edit `src/features/marketing/LandingPage.tsx`, `.claude/*`, `skills-lock.json`.
- Never apply migrations, deploy functions, run `supabase config push`, or push any branch. Never touch Supabase project `pmnjchhrgvajtjpadpqo`. The controller merges and pushes.
- No new npm dependency. No `dangerouslySetInnerHTML`. No secrets in `VITE_*`.
- Components get data only through `src/services` (`service`, `content`, `auth`, hooks `useServiceQuery`/`useServiceMutation` in `src/services/hooks.ts`). Never import `services/mock/*` or `services/supabase/*` into UI.
- Demo mode must work with no env vars. Never fall back to demo data after a Supabase error.
- URLs are built only in `src/lib/urls.ts` (add `customPagePath(slug)` etc. there).
- Every data view has loading, empty and error states. No dead buttons.
- Dashboard UI: tokens from `src/index.css`, Inter inside `data-surface="dashboard"` (ADR-0031). Public UI keeps its serif/brand styles.
- All new user-facing text goes through `t()` with keys in the track's own dictionary area files (EN + pt-PT). Portuguese is Portugal Portuguese, consistent with `src/i18n/dictionaries/pt.ts`.
- Per-track verification before reporting: `npm run typecheck`, `npm run lint` (0 errors), `npx vitest run <your test paths>` then `npm test`, `npm run build`. **Do not run Playwright** (one shared port); the controller runs e2e in wave 3.
- Worktree setup (first step of every agent): from the worktree root run `cmd //c mklink /J node_modules "C:\Users\krishna\Desktop\AR-Furniture-for-businesses\node_modules"` (if that fails, `npm ci`).

## Review focus (failure modes no single task's happy path covers)
1. A draft must never reach a visitor: anon calling every public RPC and selecting both tables gets only published data (T1 PGlite test `draft never appears in a public answer`).
2. A hidden or optional built-in field must not break approval, admin list/detail or emails when its column is null (T4 tests `approve with hidden country/city/category`, `list shows no stray comma`).
3. Stale form config: a visitor submits after the form was republished → 409 `form_changed`, page reloads config and keeps answers (T4 handler + component test).
4. Before the first publish every public page is unchanged (T3 tests `LegalPage with no published content renders LEGAL_CONTENT`, `footer with chrome error renders Privacy and Terms only`).
5. A component that forgets the language: formatters default to `'en'` silently (T2 test `useFormat formats dates in pt-PT`; T5–T7 must use `useFormat`, checked by the controller's PT e2e).

## Waves and ownership

| Wave | Track | Owns (creates/edits only these) |
|---|---|---|
| 1 | **T1 Foundation** (spec 4, 5, 6, 7) | `src/domain/types.ts` (Permission union + `BusinessApplication.answers.custom` + nullable country/city/category types), `src/domain/permissions.ts`(+test), `src/features/team/permissions.ts`(+test), `supabase/functions/_shared/team.ts`, `src/services/mock/mockTeam.ts`, `teamSeed.ts`, new `supabase/migrations/<ts>_site_content.sql` (**all** SQL of the project: tables, RPCs, gate, `validate_apply_form`, `business_applications` nullable columns + answers size 65,536, permission constraint, `my_platform_access()`, Admin backfill), `supabase/rollback/<date>_site_content_rollback.sql`, `supabase/tests/siteContent.test.ts`, `src/domain/siteContent.ts`(+test), `supabase/functions/_shared/applyForm.ts`(+test), `src/services/contentService.ts`, `src/services/index.ts`, `src/services/mock/mockContent.ts`(+test), mock store slice, `src/services/supabase/supabaseContent.ts`, `src/services/supabase/database.types.ts` (hand-add the new RPC/table types; `db:types` runs after apply) |
| 1 | **T2 Language** (spec 12 except translating feature screens) | `src/i18n/**` (provider to app root, storage migration, `tn`, `localeOf`, per-area files), `src/app/router.tsx` **only** to move `LanguageProvider` into `RootLayout`, `src/components/ui/LanguageSwitcher.tsx` (moved from `PublicShell.tsx`; same design as the landing switch), switch placement in `src/components/layout/*` shell `Topbar` + mobile menu, `SettingsLayout`, `AuthLayout`, `JoinPage`, `DemoEntryPage`; `src/lib/format*`/`useFormat`, `src/lib/preferences.tsx` wiring, `src/services/validation.ts` (message → `{key, vars}`) and the forms that render those messages, `errorText(error)` helper, `src/components/layout/nav.ts` (`label` → `labelKey`, keys `nav.*`), `Charts.tsx` locale |
| 2 | **T3 Editor + Pages + Social** (spec 8, 9, 11) | `src/features/editor/**` except `src/features/editor/apply/**`; `src/features/legal/**` (`MarkdownBody.tsx` extraction, overrides, `CustomPage`), `src/features/marketing/SiteChrome.tsx`, `SocialIcon.tsx`, `src/features/public/PublicShell.tsx` footer + `LegalLinks`, `SiteContentProvider`, routes `/pages/:slug` and `/admin/editor/*` in `router.tsx`, `nav.ts` Editor item, `src/lib/urls.ts` additions, audit-log labels for the two new events, `en.editor.ts`/`pt.editor.ts`, `en.site.ts`/`pt.site.ts` for new public strings |
| 2 | **T4 Application form builder** (spec 10) | `supabase/functions/_shared/application.ts`(+test), `supabase/functions/submit-application/**`, `src/features/apply/**`, `src/features/applications/**` (incl. translating them), `src/features/editor/apply/**` (the builder screen, exported as `ApplyFormEditor`), `src/services/mock/mockCatalogService.ts` `submitApplication` only, `en.applications.ts`/`pt.applications.ts` |
| 2 | **T5 Translate A** | `src/features/{admin,businesses,catalogs,analytics}/**`, `en.admin.ts`/`pt.admin.ts` |
| 2 | **T6 Translate B** | `src/features/{products,business,modelRequests,shared}/**`, `en.products.ts`/`pt.products.ts`, `en.business.ts`/`pt.business.ts` |
| 2 | **T7 Translate C** | `src/features/{settings,team,auth,join,demo}/**` (not the switch placement T2 did), `src/components/**` except files T2 or T3 own, `en.settings.ts`/`pt.settings.ts`, `en.team.ts`/`pt.team.ts`, `en.auth.ts`/`pt.auth.ts`, `en.ui.ts`/`pt.ui.ts` |
| 3 | **Controller + T8 Docs/E2E** | merge, conflicts, e2e (spec 14), docs (spec 14 "Docs updated"), CLAUDE.md rule, `Task.md`/tasks file |

Shared files: `src/app/router.tsx` (T2 wave 1, then T3 only in wave 2), `nav.ts` (T2 wave 1, then T3 adds one item). `en.ts`/`pt.ts`: **T2 creates every area file listed above (empty `{}` objects typed `as const`) and spreads them**, so wave-2 tracks edit only their own area files. `common.*` keys belong to T2 (seed: save, cancel, delete, edit, close, retry, loading, saving, saved, back, continue, search, yes, no, notProvided, required, optional, actions, status, name, email, created, updated, error.generic). A wave-2 track that needs another shared word adds it in its own area file under its own prefix.

## Contracts between tracks

- **Document model:** exactly spec section 6 (`SiteContent`, `CustomPage`, `ApplyFormConfig`, `ApplyStep`, `ApplyFieldPlacement`, `CustomQuestion`, `CustomAnswer`, `SocialNetwork`) and the export lists of `siteContent.ts` and `applyForm.ts` (spec 6 last two paragraphs). T1 writes them all; T3/T4 consume.
- **Service:** `export const content: ContentService` from `src/services/index.ts`, interface exactly spec section 7 (`getPublishedChrome`, `getPublishedPage`, `getPublishedApplyForm`, `getContentDraft`, `saveContentDraft`, `publishContent`, `listContentVersions`, `restoreContentVersion`). Errors: `PERMISSION`, `CONFLICT` (`reason: 'draft_conflict'`), `VALIDATION` (`fieldErrors` by document path), `NOT_FOUND`.
- **Mock seed:** mock content starts with nothing published (version 0) and `emptySiteContent()` draft; "Reset demo data" clears it.
- **Validator:** T1 writes `rulesFromConfig(config | null): ApplyRules | null` in `applyForm.ts`; T4 adds `validateApplication(input, rules?)` in `application.ts` consuming `ApplyRules` (T1 defines the `ApplyRules` type in `applyForm.ts`: `{ fields: Record<ApplyBuiltinField, { hidden: boolean; required: boolean }>; questions: CustomQuestion[]; hiddenOptions: Partial<Record<ApplyChoiceField, string[]>>; version: number }`).
- **Editor shell ↔ form builder:** T3 renders `/admin/editor/apply` with `<ApplyFormEditor draft={SiteContent} onChange={(next: SiteContent) => void} />` imported from `src/features/editor/apply/ApplyFormEditor.tsx`. T3 creates that file as a one-line stub (`export function ApplyFormEditor() { return null }` with the props type); T4 replaces it (merge: take T4's). T3 owns autosave, publish, history; the builder only edits `draft.applyForm` through `onChange`.
- **Preview:** T3 provides `SiteContentProvider` with `source: 'published' | 'draft'` and hook `useSiteContent(): { chrome, loading, error }` plus `usePublishedApplyForm()` returning `{ config: ApplyFormConfig | null, loading, error, reload }`; T4's `ApplyPage` uses `usePublishedApplyForm()` (T1 can ship this hook in `src/services/contentHooks.ts` so T4 does not wait for T3 — **T1 owns `contentHooks.ts`**: `usePublishedChrome`, `usePublishedPage(slug)`, `usePublishedApplyForm()`, `useContentDraft()`; T3's provider passes a draft override through React context `SiteContentSourceContext` that those hooks read — T1 defines the context with default `'published'`).
- **i18n:** `useI18n()` returns `{ lang, setLang, t, tn, localized }`; `useFormat()` returns `{ date, dateTime, relative, number, money }` bound to `lang`; `errorText(error: ServiceError, t)` in `src/i18n/errorText.ts`. Wave-2 tracks use these names.

---

## Wave 1

### Task T1.1: permission `content.manage`
**Files:** see ownership (permissions, team, mockTeam/teamSeed, `_shared/team.ts`).
- [ ] Update tests first: `permissions.test.ts` expects 17 keys and `PERMISSION_PREREQUISITES['content.manage']` = `[]`; team permissions test expects four groups, new group "Website content" / item "Edit website content". Run → fail.
- [ ] Implement (spec 4 table). Admin default set includes `content.manage`; Team does not. Mock one-time Admin backfill like the S4 `models.manage` flag.
- [ ] Run tests → pass. Commit `T1: content.manage permission`.

### Task T1.2: document models (pure)
**Files:** `src/domain/siteContent.ts`, `supabase/functions/_shared/applyForm.ts`, tests beside them.
- [ ] Tests: `validateSiteContent` refuses reserved slug `admin`, duplicate slug, slug `Bad Slug`, 21 custom pages, `javascript:` link, override with an extra `{token}`, `apply.done.reference` override without `{ref}`; accepts `emptySiteContent()`. `isAllowedSocialUrl('instagram','instagram.com.evil.example')` false, `'http://instagram.com/x'` false, `'instagram.com/sanctus'` true. `summarizeChanges` counts per group. `resolveApplyForm(null)` equals today's 5 steps/15 fields; `validateApplyForm` refuses a hidden locked field, Review not last, 9 steps, 11 questions, a choice field with all options hidden; `BUILTIN_FIELDS` option values equal the constants in `application.ts`; `rulesFromConfig(null)` is `null`.
- [ ] Implement per spec 6 and 10 (import-free `applyForm.ts`; `siteContent.ts` imports only types from it and re-exports). Run → pass. Commit.

### Task T1.3: migration, rollback, PGlite tests
- [ ] `npx supabase migration new site_content`. Write spec 5 in full + spec 10 SQL (`validate_apply_form`, nullable `country/city/category`, answers check 65,536) + permission constraint (17 keys), `my_platform_access()` replacement, Admin backfill + audit row, gate `private.require_content_manage()` (2FA then permission, like `require_models_manage`), grants/revokes exactly as spec 5.
- [ ] Rollback script (spec 16.5: fill nulls with "Not given" before restoring NOT NULL).
- [ ] `supabase/tests/siteContent.test.ts`: the spec 5 "Database tests" list + `validate_apply_form` agrees with `validateApplyForm` on 6 shared fixtures. Run with the repo's PGlite command (see `package.json`/other `supabase/tests/*.test.ts`). Commit.

### Task T1.4: ContentService, mock, Supabase, hooks
- [ ] Mock tests: save → conflict on stale base → publish → version 1 + history → restore loads into draft and leaves published → reset clears. Run → fail.
- [ ] Implement `contentService.ts`, `mockContent.ts`, `supabaseContent.ts` (one `rpc` per method, error mapping spec 7), `index.ts` export `content` + `unavailableContent`, `contentHooks.ts` + `SiteContentSourceContext` (contracts). Run → pass; full verification. Commit.

### Task T2.1: app-wide provider and storage
- [ ] Tests: order `?lang` > localStorage > browser; sessionStorage `arfurn:lang` migrates once to localStorage; `tn('x', 1)` picks `.one`; a component under `/admin` can call `useI18n()`.
- [ ] Implement (spec 12 Provider). Move provider to `RootLayout`; replace `useMaybeI18n` fallbacks. Commit.

### Task T2.2: switch everywhere, same design as the landing page
- [ ] Test: `LanguageSwitcher` renders in the dashboard Topbar, mobile menu, `SettingsLayout`, `AuthLayout`, `JoinPage`, `DemoEntryPage`; clicking PT sets `lang` and `document.documentElement.lang = 'pt-PT'`.
- [ ] Implement: move the component to `src/components/ui/LanguageSwitcher.tsx`, keep the landing design (variant `clear` only for photos). Commit.

### Task T2.3: area files, common keys, nav keys, formatting, errors, validation messages
- [ ] Create all area files from the ownership table (empty except `common`), spread in `en.ts`/`pt.ts`; seed `common.*` (list above) EN + PT. `nav.ts` `label` → `labelKey` with `nav.*` keys for every item, shell renders `t(labelKey)`; test fails if `nav.ts` has a literal `label`.
- [ ] `useFormat()` + `localeOf` + formatter `lang` param; test `useFormat formats dates in pt-PT`. `Charts.tsx` uses it.
- [ ] `errorText` maps `ServiceError` code/reason → `common.error.*` keys, generic fallback; `validation.ts` returns `{ key, vars }`; update every form that renders these messages to `t(key, vars)`; keys under `common.validation.*`.
- [ ] i18n test: same `{token}` set in EN and PT per key, no empty values. Full verification. Commit.

**Wave-1 exit (controller):** merge T1 and T2 into `feature/sanctus-brand-design-system`, resolve, full verification green, push the feature branch.

## Wave 2 (starts from the merged wave-1 commit)

### Task T3.1: Editor shell, autosave, publish, history
- [ ] Tests: nav item hidden for Team; autosave calls `saveContentDraft` 2 s after a change with the last base; `draft_conflict` shows the reload banner; Publish disabled with "No changes"; confirm shows counts from `summarizeChanges`; history Restore calls `restoreContentVersion` and shows the restored notice.
- [ ] Implement spec 8 routes/layout/top bar/unsaved-change blocker; stub `ApplyFormEditor` (contract). Commit.

### Task T3.2: Pages, custom pages, MarkdownBody, preview
- [ ] Tests: toolbar inserts Markdown at the cursor; slug validation messages; delete asks confirmation; `LegalPage` with override / with nothing published renders `LEGAL_CONTENT` / on error shows the retry line; `CustomPage` empty PT falls back with `lang="en"`; unknown slug → not-found; preview bar "Preview of the draft. Not live." and apply preview never submits.
- [ ] Implement spec 8 Pages + spec 9 (MarkdownBody extraction, link scheme filter on render). Commit.

### Task T3.3: footer links and social
- [ ] Tests: `LegalLinks` renders Privacy, Terms, then published footer pages in order; on chrome error only Privacy and Terms; social icons only for filled networks, accessible names, `rel="noopener noreferrer"`; none in `PublicShell` catalog footer.
- [ ] Implement spec 9 footer + spec 11 (SocialIcon inline SVG, Social screen with `isAllowedSocialUrl` messages). Full verification. Commit.

### Task T4.1: validator with rules + Edge Function
- [ ] Tests (`application.test.ts`, `handler.test.ts`): no rules = today's behaviour (existing tests unchanged); hidden field ignored and stored null; required flip; each custom type incl. multi_choice; choice not in list; unknown id → `form_changed` 409; config read error → 503 `config_unavailable`; body up to 32,000 bytes; snapshots stored in `answers.custom`.
- [ ] Implement spec 10 Submission/Edge Function. Commit.

### Task T4.2: ApplyPage driven by the config; admin review
- [ ] Tests: steps/fields/questions follow `resolveApplyForm`; overrides via `applyText`; hidden choice options absent; empty step skipped; Review last; 409 reload keeps answers; admin detail "Extra questions" card from snapshots; list without stray comma; approve works with null country/city/category; translate `src/features/applications/**`.
- [ ] Implement. Mock `submitApplication` uses the mock's published config. Commit.

### Task T4.3: builder screen `ApplyFormEditor`
- [ ] Tests: move field up/down and to another step; add step (max 8); add question on step 2 (max 10); locked fields show lock + reason and no hide/required switch; hide option keeps ≥1 visible; Messages panel edits `apply.err.*`/`apply.done.*` with reset to original; EN|PT preview toggle.
- [ ] Implement spec 10 builder UX (buttons, no drag-and-drop). Full verification. Commit.

### Tasks T5 / T6 / T7: translate owned areas
For each owned file: replace every user-facing literal (text, toasts, errors, empty states, confirm dialogs, table headers, `aria-label`, `title`, placeholders, page titles) with `t()`/`tn()`; dates/numbers via `useFormat()`; service errors via `errorText`. Business/product data is not translated. Keys `area.screen.thing`, EN + pt-PT.
- [ ] Per area: update or add one component test asserting a key screen renders Portuguese when `lang = 'pt'` (e.g. page title + one button), then translate, run the area's tests, commit `T5: translate admin` etc.
- [ ] Final: `grep` the owned folders for JSX text nodes / string props starting with an uppercase English word that are not `t(` calls; fix leftovers. Full verification.

## Wave 3 (controller + T8)
- [ ] Merge T3, T4, T5, T6, T7 (stub conflict → T4's `ApplyFormEditor`). Full verification green.
- [ ] T8: Playwright e2e spec 14 (1–5, plus builder: reorder + hide + add question on step 2 in PT); fix failures. Docs per spec 14 "Docs updated" + CLAUDE.md hard rule (dashboards bilingual, ADR-0044) + HANDOFF + `System_arch/Task.md` and the P12 tasks file.
- [ ] Controller: final review of the diff, push the feature branch, report. Migration apply and `submit-application` redeploy wait for the owner's go-ahead (ADR-0042); `main` only when asked.
