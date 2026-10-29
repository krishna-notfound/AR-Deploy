# Content Editor and bilingual dashboards: design

- **Date:** 2026-10-29
- **Status:** Approved in conversation (owner, 2026-10-29). Awaiting written-spec review.
- **Branch:** a new feature branch off the current one (name chosen when work starts). `main` only when the owner asks.
- **Supabase:** client project `zggylkbgajamhriebdrg`, the testing environment (ADR-0042). The migration and the `submit-application` redeploy need the owner's go-ahead for each action.
- **Decision records:** ADR-0043 (Content Editor), ADR-0044 (bilingual dashboards; supersedes the CLAUDE.md rule "The admin and business dashboards are English-only").

## 1. Goal

Two things the client asked for on 2026-10-29:

1. **Content Editor.** The client edits parts of the website himself, in the Admin Console, in Portuguese and English, and publishes when ready. No developer is needed for a text change.
2. **Portuguese and English everywhere.** A visible PT | EN switch on every screen, including the Admin Console, the company dashboard and the sign-in pages.

The client also asked for "a dedicated tab for social media". It is one section of the Editor (section 11).

**Success criteria**
- A person with `content.manage` edits Terms, adds a page, changes the application form and sets social links. The public site shows none of it until they press **Publish**.
- The client rebuilds the application form without a developer: all its text in EN and PT, step names and order, field order and placement, hidden or optional fields, and up to 10 own questions. An application sent with any allowed layout can be reviewed and approved, and shows "Not given" for what it did not ask.
- Publishing is one action and is undone by restoring an earlier version and publishing again.
- With nothing published, every public page looks exactly as it does today.
- Anyone can switch the whole app between English and Portuguese from any screen, and the choice is remembered on the device.

## 2. Background and decisions

| Date | Decision | Source |
|---|---|---|
| 2026-10-29 | The client asked to edit website text himself, for PT+EN dashboards, and for a social media tab | Client, via the owner |
| 2026-10-29 | Editable: Terms, Privacy, custom info pages, the business application form, social links. **Not editable:** landing, catalog and product pages | Owner |
| 2026-10-29 | Draft then Publish. One Publish makes all Editor content live. Every publish is kept, with Restore | Owner |
| 2026-10-29 | The application form is a full form builder: all text editable in EN and PT (consent sentence, errors, thank-you screen included); steps renamed, reordered, added; fields reordered, moved, hidden or optional; up to 10 questions on any step. Business name, contact name and contact email stay locked | Owner |
| 2026-10-29 | Recommended in this spec, owner may change: 8 steps at most (Review included); choice options can be hidden (one stays visible); question types are the four plus multiple choice, no file upload; the consent checkbox and the Terms checkbox cannot be hidden, and only the consent text is editable | Spec |
| 2026-10-29 | New permission `content.manage`: Owner always, Admin by default, Team no | Owner |
| 2026-10-29 | Storage: one singleton table plus a history table (section 5) | Owner accepted the recommendation |
| 2026-10-29 | "There should be a switch button of Portugal and English everywhere so it's easy for anyone to switch" | Owner |
| 2026-10-29 | The current setup is the testing environment; migrations and function deploys need the owner's go-ahead | ADR-0042 |

## 3. Scope

**In**
- Editor tab at `/admin/editor` (sections: Pages, Application form, Social media) with draft, preview, publish, history.
- Public rendering of published content with built-in fallback; footer links; social icons.
- Application form builder (section 10): all text in EN and PT, steps, field placement, hide and required switches, option labels, up to 10 questions, validation in the Edge Function, the `business_applications` column changes.
- App-wide language provider, PT | EN switch, translation of `/admin` and `/dashboard`.

**Out of scope** (separate items, not built here)
- Editing the landing, catalog or product pages.
- The demo landing collections that do not open. Cause found: only the small "View collection" link navigates; the card image and title are not clickable, and Decor has no seeded product, so it has no link. A separate small fix.
- Redesign of the application section; the test company.
- Logo and favicon (the client is sending files; the letters "A" and "N" need adjusting).
- Transactional emails in Portuguese (Edge Function email templates). Follow-up.
- Rich-text editing, images in pages, redirects when a slug changes, scheduled publishing.

## 4. Users and permissions

- `content.manage` is the 17th platform permission. The Owner passes every check. Admin gets it by default. Team does not. Business owners have no access to the Editor.
- It has no prerequisites. It needs no other permission to be usable.
- Every Editor call goes through the same two gates as the S4 functions: the 2FA step first (`public.caller_mfa_satisfied()`, ADR-0032), then `public.platform_can('content.manage')`. A session without 2FA gets `aal2_required`, then `forbidden` (both 42501).

**Where the new key must be added** (all in one change)

| Place | Change |
|---|---|
| `src/domain/types.ts` | Add `'content.manage'` to the `Permission` union |
| `src/domain/permissions.ts` | `ALL_PERMISSIONS` (17), `PERMISSION_PREREQUISITES['content.manage'] = []`; `DEFAULT_ROLE_PERMISSIONS.admin` follows `ALL_PERMISSIONS`; `team` unchanged |
| `src/features/team/permissions.ts` | New group "Website content" with one item: label "Edit website content", description "Edit pages, the application form and social links, and publish them." |
| `src/domain/permissions.test.ts`, `src/features/team/permissions.test.ts` | 16 becomes 17; "three groups" becomes four |
| `supabase/functions/_shared/team.ts` | Key list and label (the invitation email lists permissions) |
| New migration | Replace `platform_role_permissions_permission_check` with the 17 keys; replace `public.my_platform_access()` (its Owner list is hard-coded); backfill the stored Admin set with `content.manage` and one `access_permissions_changed` audit row, as S4 did for `models.manage`. `private.permission_prerequisites()` gets no row; the PGlite test that pins it to the TS map stays green |
| `src/services/mock/mockTeam.ts`, `teamSeed.ts` | One-time Admin backfill for demo data saved before this change, like the S4 flag |
| `src/components/layout/nav.ts` | `adminNav` item `{ to: '/admin/editor', label: 'Editor', icon: PenLine, requires: 'content.manage' }`, placed after "Catalogs & QR Codes" |
| `src/app/router.tsx` | Routes under `adminRoutes`, each wrapped in `<RequirePermission need="content.manage">` |

The role guard is UX only. The database refuses the same calls.

## 5. Data model

One migration, made with `npx supabase migration new site_content`, plus a rollback script `supabase/rollback/<date>_site_content_rollback.sql` (the repo convention). Applied only after the owner's go-ahead.

```sql
create table public.site_content (
  id                boolean primary key default true check (id),        -- exactly one row
  draft             jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_updated_at  timestamptz not null default now(),
  draft_updated_by  uuid references auth.users on delete set null,
  published         jsonb check (published is null or (jsonb_typeof(published) = 'object' and octet_length(published::text) <= 524288)),
  published_version integer not null default 0,
  published_at      timestamptz,
  published_by      uuid references auth.users on delete set null
);
insert into public.site_content (id) values (true);

create table public.site_content_versions (
  version           integer primary key,
  content           jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 524288),
  published_at      timestamptz not null default now(),
  published_by      uuid references auth.users on delete set null,
  published_by_name text not null          -- display name at the time, so history survives account deletion
);
```

**Access: all through functions, none through the tables.**
- Both tables: RLS enabled, no policies, and `revoke all on ... from public, anon, authenticated` (Supabase grants new tables to those roles by default). `service_role` keeps `select` (the Edge Function reads `published`).
- **Why RPCs and not column grants or a view:** the draft sits in the same row as the published text. A column grant for `anon` works until someone runs `select *` or adds a column. With no table access at all, a mistake cannot expose the draft, and size, 2FA and permission checks live in one place. The cost is one function per read shape.

| Function | Who | Does |
|---|---|---|
| `public.get_published_site_content(p_part text, p_slug text default null) returns jsonb` | anon, authenticated, service_role | `p_part` is `'chrome'` (footer pages: slug and title only; social links; version), `'page'` (one page by slug: `terms`, `privacy` or a custom slug) or `'apply'` (the application form config). Returns `{ version, content }`; `content` is null when nothing is published or the slug does not exist. Reads only `published`. Small answers: a public page never downloads the whole document |
| `public.admin_get_site_content()` | authenticated, gated | `{ draft, draftUpdatedAt, published, version, publishedAt, publishedByName }` |
| `public.admin_save_site_content_draft(p_content jsonb, p_base timestamptz) returns timestamptz` | gated | Writes the draft if `draft_updated_at = p_base`; otherwise raises `draft_conflict`. Checks the document is an object, `schema = 1`, size, and array caps. Returns the new `draft_updated_at` |
| `public.admin_publish_site_content(p_base timestamptz) returns jsonb` | gated | Same `p_base` check. Runs the publish validation below, then in one transaction: version + 1, copy draft to `published`, insert the `site_content_versions` row, write audit event `site_content_published` (metadata: version). Returns `{ version, publishedAt }` |
| `public.admin_list_site_content_versions() returns table (...)` | gated | Newest first, at most 100: version, published_at, published_by_name. No content |
| `public.admin_restore_site_content_version(p_version int, p_base timestamptz) returns timestamptz` | gated | Copies that version's content into the draft (same `p_base` check) and writes audit event `site_content_draft_restored`. Does not publish |

All are `security definer`, `set search_path = ''`, `revoke execute ... from public, anon`, then an explicit `grant execute`. The shared gate is `private.require_content_manage()`, modelled on `private.require_models_manage()` (migration `20261026120000_s4_model_requests.sql`): 2FA first, then permission.

**Publish validation (the final gate, in SQL).** The editor validates fully in TypeScript; the database repeats the checks that protect the live site: `schema = 1`; at most 20 custom pages; each slug matches `^[a-z0-9]+(-[a-z0-9]+)*$`, is 60 characters or fewer, is unique and is not reserved; every social value starts with `https://`. Reserved slugs: `admin, api, apply, catalog, dashboard, demo, embed, login, pages, privacy, products, terms`. A PGlite test checks the SQL list refuses each one. The application form is checked by `private.validate_apply_form(jsonb)`, called by publish:
- `steps`: 1 to 8 entries, unique ids, exactly one `builtin = 'review'` and it is last.
- `customQuestions`: at most 10, unique ids, known `type`, 2 to 10 options for `single_choice` and `multi_choice`, none for the other types.
- `fields`: each `key` is one of the 15 built-in keys or `custom:<id>` of an existing question; each key appears once; each `stepId` exists and is not the Review step; every question has one placement.
- Locked keys `businessName`, `applicantName`, `applicantEmail`: never `hidden`, never `required: false`. (A key missing from `fields` means its default placement: visible, default step, default required.)
- `hiddenOptions`: only for `category`, `productCount`, `photoReadiness`, `modelReadiness`; values from the fixed set; at least one option stays visible.
- `texts`: an object of strings, each 600 characters or fewer, keys matching `^apply\.`. SQL does not check `{token}` sets; the editor does, and the page ignores unknown keys.

**Changes to `business_applications`** (same migration, applied with it; rollback restores them):
- `country`, `city` and `category` lose `not null`. Their length checks stay and pass on null. A hidden or optional field is stored as null, not as a fake "Not provided" string, so search and reports stay honest. Rollback first sets null values to "Not given", then restores `not null`, and restores the 16,384 limit only if no row is larger (otherwise it stops with a message).
- `language` stays `not null default 'en'`. A hidden language field stores the visitor's page language, so the applicant's emails still come in the language they used. The decision emails read `business_name`, `applicant_email` and `language`, all still always set.
- The `answers` check (`business_applications_answers_check`, 16,384 bytes) becomes 65,536. Worst case, 10 multiple-choice questions with 10 options each, bilingual labels and all options chosen: about 2.4 KB each, 24 KB, plus about 3 KB of fixed answers, so 27 KB; the validator also refuses a `custom` block over 40,000 bytes (`too_long`). Descriptions and notes are unchanged. The PGlite test inserts the worst case.
- Not changed: `business_name`, `applicant_name`, `applicant_email` (locked fields), the `description`, `productCount`, `photoReadiness`, `modelReadiness`, `applicantRole` and `notes` answers (they live in `answers` jsonb with no constraint), `submission_key`, `submitter_hash`, indexes.
- `database.types.ts` and `ApplicationRow` follow after `npm run db:types`; `BusinessApplication` gets `country?`, `city?`, `category?`.

**Audit.** The two new event types fit the existing `event_type` pattern. The audit log page gets two labels.

**Size.** 512 KB for each stored document. The built-in legal text is about 73 KB for both languages and both pages, so real use stays far below. History is not pruned; revisit if it passes 200 versions.

**Database tests** (`supabase/tests/siteContent.test.ts`, PGlite harness): anon cannot select either table; anon gets published parts only; draft never appears in a public answer; Team and a member without 2FA are refused; conflict on stale `p_base`; publish is atomic (a failing validation leaves `published` and history unchanged); restore does not touch `published`; size limit; reserved and duplicate slugs; each `validate_apply_form` rule refuses a bad document (nine cases); null `country`, `city`, `category` accepted; the 27 KB worst-case `answers` accepted and 66 KB refused; `admin_review_application` approves an application with no description; rollback script removes everything.

## 6. Content document

Defined in `src/domain/siteContent.ts` (pure TypeScript, no imports except types from the form model below). The application form model lives in a second pure file, `supabase/functions/_shared/applyForm.ts` (**no imports**, like `_shared/application.ts`), so the page, the demo service and the Edge Function share it without the function reaching into `src/`. The Edge Function never imports `siteContent.ts`; it reads `published.applyForm` and calls `rulesFromConfig`.

```ts
export const SITE_CONTENT_SCHEMA = 1
export type Lang = 'en' | 'pt'

export interface SiteContent {
  schema: 1
  /** Terms and Privacy. Absent key or absent language = show the built-in text for it. Markdown. */
  builtinPages: { terms?: Partial<Record<Lang, string>>; privacy?: Partial<Record<Lang, string>> }
  customPages: CustomPage[]                         // at most 20
  applyForm: ApplyFormConfig
  social: Partial<Record<SocialNetwork, string>>    // https URL per network
}

export interface CustomPage {
  id: string                                        // crypto.randomUUID(); stable when the slug changes
  slug: string                                      // route /pages/:slug
  title: { en: string; pt?: string }                // 1..80 characters
  body: { en: string; pt?: string }                 // Markdown subset, at most 60,000 characters each
  showInFooter: boolean
  order: number                                     // footer order, ascending, then title
}

// ---- supabase/functions/_shared/applyForm.ts (re-exported by siteContent.ts) ----
export interface ApplyFormConfig {
  /** Overrides on top of the `apply.*` dictionary. Key = dictionary key from APPLY_EDITABLE_KEYS. */
  texts: Record<string, Partial<Record<Lang, string>>>
  /** 1..8 steps in display order. The last one is the Review step. Array order is the order; there is no `order` number. */
  steps: ApplyStep[]
  /** One placement per built-in field and per question. Array order is the order inside a step. A built-in key left out gets its default placement. */
  fields: ApplyFieldPlacement[]
  customQuestions: CustomQuestion[]                 // at most 10
  /** Option values to hide in a built-in choice field. At least one stays visible. */
  hiddenOptions: Partial<Record<ApplyChoiceField, string[]>>
}
export type ApplyStepKey = 'business' | 'location' | 'contact' | 'catalogue' | 'review'
export interface ApplyStep {
  id: string                                        // built-in: the ApplyStepKey; new step: crypto.randomUUID()
  builtin?: ApplyStepKey
  title?: { en?: string; pt?: string }              // empty = original text (built-in) or EN fallback (new: EN required), 1..60
  hint?: { en?: string; pt?: string }               // 0..200
}
export type ApplyBuiltinField =
  | 'businessName' | 'website' | 'category' | 'description' | 'country' | 'city'
  | 'applicantName' | 'applicantRole' | 'applicantEmail' | 'applicantPhone' | 'language'
  | 'productCount' | 'photoReadiness' | 'modelReadiness' | 'notes'
export type ApplyChoiceField = 'category' | 'productCount' | 'photoReadiness' | 'modelReadiness'
export const LOCKED_FIELDS = ['businessName', 'applicantName', 'applicantEmail'] as const
export interface ApplyFieldPlacement {
  key: ApplyBuiltinField | `custom:${string}`      // custom:<question id>
  stepId: string                                    // an existing step, never Review
  hidden?: boolean                                  // built-in only; locked keys never. Delete a question instead of hiding it
  required?: boolean                                // omitted = the default below; locked keys always true; `language` has no switch
}

export type CustomQuestionType = 'short_text' | 'long_text' | 'yes_no' | 'single_choice' | 'multi_choice'
export interface CustomQuestion {
  id: string                                        // crypto.randomUUID()
  type: CustomQuestionType
  label: { en: string; pt?: string }                // 1..200
  help?: { en: string; pt?: string }                // 0..300
  options?: { id: string; label: { en: string; pt?: string } }[]   // single_choice and multi_choice only, 2..10, label 1..80
}

export type SocialNetwork = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest'

/** Stored in business_applications.answers.custom (section 8). */
export interface CustomAnswer {
  id: string
  type: CustomQuestionType
  label: { en: string; pt?: string }                // snapshot at submit time
  value: string | boolean | string[]                // text, yes_no, one option id, or the chosen option ids (multi_choice)
  valueLabels?: { en: string; pt?: string }[]       // snapshot of the chosen option labels, same order
}
```

Exports of `siteContent.ts`: `emptySiteContent()`, `normalizeSiteContent(unknown)` (fills defaults, drops unknown keys), `validateSiteContent(doc)` returning `Record<path, errorKey>`, `summarizeChanges(before, after)` (section 7), `isAllowedSocialUrl(network, url)`, `RESERVED_PAGE_SLUGS`.

Exports of `applyForm.ts`: `DEFAULT_APPLY_FORM` (today's five steps and 15 fields, today's required flags), `APPLY_EDITABLE_KEYS`, `BUILTIN_FIELDS` (per key: default step, default required, `locked`, the option values of choice fields), `resolveApplyForm(config | null)` (effective steps with their visible fields in order, filling defaults; used by the page, the preview and the review step), `validateApplyForm(config)` (the TS twin of the SQL gate, called by `validateSiteContent`), `rulesFromConfig(config | null)` (the validator's rules, section 10). A unit test checks the option values equal the constants in `application.ts`, and a PGlite test checks `validate_apply_form` agrees with `validateApplyForm` on the same documents.

**Page body format.** A Markdown subset: headings (`#` to `###`), bold, italic, lists, links, paragraphs, tables and quotes as `src/features/legal/markdown.ts` already parses. **Raw HTML is not parsed**; it shows as text. Links: `https://`, `mailto:` and site-relative `/...` only; any other scheme (`javascript:`, `data:`) is refused on save and rendered as plain text. No new dependency: the parser exists, and the block and inline renderer inside `LegalPage.tsx` moves to `src/features/legal/MarkdownBody.tsx` so Terms, Privacy and custom pages share it.

**Application text overrides.** `APPLY_EDITABLE_KEYS` is **every** `apply.*` dictionary key (89 today) except two groups with another home: `apply.step.*` (kept on the step: `title`, `hint`) and `apply.done.demo` (the demo-mode notice stays, so demo data is always labelled). It includes the consent sentence `apply.f.consent`, all `apply.err.*`, all `apply.done.*`, `apply.progress`, `apply.stepOf`, buttons, `apply.retry`, `apply.failed`, `apply.rateLimited`, `apply.duplicate`, `apply.fixFields`, `apply.notGiven`, `apply.optional`, `apply.choose`, field labels and hints, and option labels (`apply.cat.*`, `apply.count.*`, `apply.photos.*`, `apply.models.*`). Rules for an override: 600 characters or fewer; it may use only the `{token}`s the original has; `apply.done.reference` must keep `{ref}` so the applicant always sees the reference. Not editable because they are not `apply.*` keys: the Terms checkbox sentence (`legal.agree.*`, shared with other pages) and the language names "English" and "Português".

## 7. Service API

A new `ContentService` in `src/services/contentService.ts`. It is separate from `CatalogService` (already about 60 methods) and from `AccountService` (per-user settings). Exported from `src/services/index.ts` as `content`, with an `unavailableContent` proxy for a half-configured build, like `account`.

```ts
export interface PublishedChrome { version: number; footerPages: { slug: string; title: LocalizedText }[]; social: SiteContent['social'] }
export type PublishedPage =
  | { kind: 'builtin'; body: Partial<Record<Lang, string>> }          // terms | privacy overrides
  | { kind: 'custom'; title: LocalizedText; body: LocalizedText }
export interface PublishedApplyForm { version: number; config: ApplyFormConfig }
export interface ContentDraftState {
  draft: SiteContent
  draftUpdatedAt: ISODate
  published: SiteContent | null
  version: number                      // 0 = never published
  publishedAt: ISODate | null
  publishedByName: string | null
}
export interface ContentVersionSummary { version: number; publishedAt: ISODate; publishedByName: string }

export interface ContentService {
  // Public (no sign-in)
  getPublishedChrome(): Promise<Result<PublishedChrome>>
  getPublishedPage(slug: string): Promise<Result<PublishedPage | null>>   // null: nothing published for it (use built-in); custom slug unknown: NOT_FOUND
  getPublishedApplyForm(): Promise<Result<PublishedApplyForm | null>>      // null: nothing published
  // Editor (content.manage + 2FA)
  getContentDraft(): Promise<Result<ContentDraftState>>
  saveContentDraft(content: SiteContent, baseUpdatedAt: ISODate): Promise<Result<{ draftUpdatedAt: ISODate }>>
  publishContent(baseUpdatedAt: ISODate): Promise<Result<{ version: number; publishedAt: ISODate }>>
  listContentVersions(): Promise<Result<ContentVersionSummary[]>>
  restoreContentVersion(version: number, baseUpdatedAt: ISODate): Promise<Result<{ draftUpdatedAt: ISODate }>>
}
```

- **Errors** use `Result<T>` and `ServiceError`. `aal2_required` and `forbidden` map to `PERMISSION`; `draft_conflict` to `CONFLICT` with `reason: 'draft_conflict'`; size and publish-validation failures to `VALIDATION` with `fieldErrors` keyed by document path.
- **Supabase** (`src/services/supabase/supabaseContent.ts`): one `rpc` call per method. **Mock** (`src/services/mock/mockContent.ts`): the same rules over a new demo-store slice (draft, published, versions), so demo mode works with no env vars and "Reset demo data" clears it. The mock runs the same `validateSiteContent`.
- **Hooks.** The repo does not use React Query. Use `useServiceQuery` and `useServiceMutation` from `src/services/hooks.ts`.
- **Change summary.** `summarizeChanges(published ?? emptySiteContent(), draft)` returns counts by group (pages, footer, application texts, application steps and field placement, hidden or optional fields, questions, social links) for the publish confirm. It is pure and tested.

## 8. Editor UX

**Routes** (all `RequirePermission need="content.manage"`): `/admin/editor` (redirects to Pages), `/admin/editor/pages`, `/admin/editor/pages/:pageKey` (`terms`, `privacy` or a custom page id), `/admin/editor/apply` (tabs `?tab=form` and `?tab=messages`, section 10), `/admin/editor/social`, `/admin/editor/preview/:target` (`page/:pageKey`, `apply`, `apply/done`, `footer`).

**Layout.** A left list (Pages, Application form, Social media) and the editing area on the right. Under `lg` the list becomes a row of tabs above the editor. EN and PT are two columns side by side; under `md` they stack. Dashboard rules apply: tokens from `src/index.css`, Inter for UI text inside `data-surface="dashboard"` (ADR-0031), no dead buttons, loading, empty and error states on every view.

**Top bar of the Editor** (always visible): save status ("Saving…", "Draft saved 14:32", "Not saved. Retry"), **Preview**, **History**, **Publish**.

**Draft.**
- One in-memory document edited by all sections; autosaved 2 seconds after the last change through `saveContentDraft` with the last known `draftUpdatedAt`.
- `draft_conflict` (another staff member saved first): a banner "Someone else changed the draft. Reload to see their changes." Reload replaces the local state; nothing is overwritten silently.
- Unsaved-change warning: React Router `useBlocker` plus `beforeunload` while a change is pending or the last save failed.

**Pages.**
- A table: Terms, Privacy, then custom pages (title, slug, "In footer", state: Original / Edited / New). "New page" opens the form.
- Page editor: title EN/PT (custom only), slug (custom only; typed through `slugInput`, checked with `isValidSlug`, reserved list, uniqueness), **Show in footer** switch, order (move up/down), body EN/PT.
- Body field: a textarea with a toolbar (Bold, Heading, List, Link) that inserts Markdown at the cursor, and a per-language Edit | Preview toggle using `MarkdownBody`. Toolbar buttons have `aria-label`s.
- Terms and Privacy start from today's built-in text (`LEGAL_CONTENT`, drafting notes already removed). **Reset to original** per language removes the override.
- Changing a published custom slug shows: "Links to the old address will stop working."
- Deleting a custom page asks for confirmation through `ConfirmProvider`.
- `[[PLACEHOLDER]]` tokens in the text still show as "to be completed" chips on the public page. The publish confirm lists how many remain. It warns and does not block.

**Footer links.** A panel on the Pages screen lists custom pages with "In footer" on, in order, with a live footer preview. Terms and Privacy stay fixed where they are.

**Application form** (section 10), **Social media** (section 11): each its own screen in the same layout.

**Preview.** Opens `/admin/editor/preview/...` in the same tab (or a new one): the real public components (`LegalPage`, custom page, `ApplyPage`, `SiteFooter`) inside a `SiteContentProvider` whose source is the draft, under a fixed bar "Preview of the draft. Not live." with an EN | PT switch and a width toggle (desktop, phone). Preview of the application form never submits: the send button shows "Preview" and the service is not called. `preview/apply/done` shows the thank-you screen with a sample reference.

**Publish.**
1. Disabled with "No changes" when the draft equals the published content.
2. Opens a confirm dialog: "Publish N changes to the live site?" with the counts by group and the remaining-placeholder warning. The draft is saved first.
3. Calls `publishContent(draftUpdatedAt)`. On `draft_conflict`: "The draft changed since you opened this. Review and try again."
4. Success: toast, status "Published version N", history list refreshed.

**History drawer.** Versions newest first: "Version 7, 29 Oct 2026 14:32, Sample Admin". Each has **Restore this version**; confirm; `restoreContentVersion` loads it into the draft (not live) and the bar shows "Restored version 7 into the draft. Publish to make it live."

## 9. Public rendering and fallback

- `SiteContentProvider` wraps the public routes (in `PublicLayout`, path mode and hostname mode). It loads the chrome once per page load and shares it. Pages and the apply form load on demand. Source is `published` (default) or `draft` (preview).
- **Nothing published:** the three reads return null content; every consumer shows today's built-in text (dictionary + `LEGAL_CONTENT`). This is the state before the first publish.
- **Terms and Privacy** (`LegalPage`): per language, the override if present, else the built-in text. While loading: a page skeleton (no flash of old text). On error: the built-in text plus one line "We could not check for a newer version of this page." with a retry link. Built-in text is the shipped legal draft, not demo data. Nothing is ever written back.
- **Custom pages** (`/pages/:slug`, new `CustomPage` component, also routed on business subdomains): title and body through `localized()` and `LocalizedSpan`, so an empty PT falls back to EN with `lang="en"` on the span. The page uses the same chrome as `LegalPage` (`SiteHeader`/`SiteFooter` on the platform domain, `PublicShell` on subdomains). Unknown slug: `PublicNotFoundPage`. Error: an error state with Retry (there is no built-in text to fall back to). Page title and meta description come from the title and the first paragraph (160 characters).
- **Footer links.** `LegalLinks` (used by `SiteFooter`, `PublicShell` and the Apply page footer) renders Privacy, Terms, then the published footer pages. One change reaches landing, apply, legal and custom pages, the catalog and product pages, and `PublicNotFoundPage`, on the platform domain and on business subdomains. **Embed pages** (`/embed/products/...`) have no footer; no change. Chrome loading or failing renders Privacy and Terms only.
- **Cache.** One request per page load, reused during in-app navigation. No other caching, so a publish is visible on the next load. The reads are small by design (section 5).

## 10. Application form builder

**Today.** `src/features/apply/ApplyPage.tsx` runs five fixed steps (`APPLICATION_STEPS`) with `apply.*` dictionary text. The one validator is `supabase/functions/_shared/application.ts` (pure TypeScript, used by the page, the demo service and the Edge Function). `src/services/applicationRules.ts` is only the review lifecycle and is not involved.

**Defaults** (`DEFAULT_APPLY_FORM`) reproduce today's form: steps `business`, `location`, `contact`, `catalogue`, `review`; the 15 fields on their current steps. Required: businessName, description, category, country, city, applicantName, applicantEmail, productCount, photoReadiness, modelReadiness. Optional: website, applicantRole, applicantPhone, notes. `language` is always preselected (the page language), so it has no required switch. `categoryOther` ("Describe your category") travels with `category`.

| Part | The client can | The client cannot |
|---|---|---|
| Steps | Rename (title, hint, EN and PT; empty = original); reorder; add (7 new at most, 8 with Review); delete a step he added (its fields move to the previous step) | Delete a built-in step (it is skipped when empty); move or remove Review; put fields or questions on Review |
| Built-in fields | Reorder; move to another step; hide; switch required or optional; edit label and hint | Hide or make optional **business name, contact name, contact email** (approval creates the company account from them; lock icon and reason); hide the consent or Terms checkbox (fixed on Review, required) |
| Choice options (`category`, `productCount`, `photoReadiness`, `modelReadiness`) | Rename (EN, PT); hide, one stays visible | Change the stored value (it stays the fixed set the database and review screen know) |
| Questions | Up to 10 on any step but Review; short text (200 characters), long text (1000), yes/no, single choice, multiple choice (2 to 10 options); label and help EN and PT; required switch; reorder, move, delete | File upload; hide (delete instead) |
| Text | Every `apply.*` key (section 6), EN and PT, with Reset to original | Add a `{token}` the original lacks |

**Page behaviour**
- Config: `getPublishedApplyForm()`. Loading: a form skeleton. Nothing published: the defaults. Read error: the default form plus "We could not check for a newer version of this form. Retry." The server stays the authority: a stale form gets 409 `form_changed` and the page reloads the config.
- Texts go through `applyText(key, vars)`: the override for the current language if non-empty, else the dictionary text.
- Steps come from `resolveApplyForm`. A step with no visible fields is skipped by Continue, Back and the progress bar; "Step n of N" counts shown steps. The URL is `?step=<stepId>`; an unknown id opens the first shown step. A saved session draft drops answers for ids that no longer exist.
- Step validation runs the shared validator with the rules and keeps the errors of that step's visible fields. Choice fields show the required mark only when required; optional ones show `apply.optional`. A hidden option is not rendered.
- Review lists the visible fields by step with Edit links. An empty optional field shows `apply.notGiven`; hidden fields do not appear; questions show label and answer (choices by option label). Consent and Terms checkboxes sit below, always required. Honeypot and rate limit are unchanged.

**Validator.** `validateApplication(input, rules?)`; `rules` come from `rulesFromConfig`: per built-in field `{ hidden, required }`, `hiddenOptions`, and the questions with their placement's `required`. The file stays import-free.
- No rules: today's behaviour; the existing tests stay unchanged.
- Locked fields, consent and Terms are required whatever the rules say.
- Hidden field: the submitted value is ignored and stored as null (`language`: the submitted page language if `en` or `pt`, else `en`). Visible optional field: empty is null; if filled, today's length and format checks apply.
- Questions: required answered; text lengths; yes/no is a boolean; single choice is a known option id; multiple choice is distinct known ids, at least one if required. `value.custom: CustomAnswer[]` follows form order, leaves out unanswered optional questions and copies label (and option labels) as a snapshot. A `custom` block over 40,000 bytes is `too_long`.
- An unknown question id, unknown option id, or a hidden built-in option gives `{ ok: false, stale: true }`; the handler answers 409 `form_changed`; the page reloads the config, keeps the answers and says "The form was updated. Please check the highlighted fields." Question errors use the field id `custom.<id>`.
- `NormalizedApplication`: `description`, `country`, `city`, `category`, `productCount`, `photoReadiness`, `modelReadiness` become `string | null`.

**What reads an application, and what a missing value does** (checked in the code 2026-10-29)

| Reader | Reads | Missing or hidden field |
|---|---|---|
| `admin_review_application` (approve) | `business_name`, `answers->>'description'` | No description: the draft business gets an empty one (the SQL already uses `coalesce`). Nothing else is read |
| `review-application` (decision email), `submit-application` (confirmation, staff alert), `notify-business-owner` / `ownerRecipient` | `business_name`, `applicant_email`, `language` | Always set (locked fields; `language` not null) |
| Duplicate detection (`findOpenDuplicate`, `admin_application_duplicates`) | `applicant_email`, `business_name` | Locked, always set |
| Rate limit | Salted IP hash | None |
| `ApplicationsPage` list and search | `city`, `country`, `category` in the subtitle; search on name, applicant, email, reference | The subtitle joins only the present parts, no stray comma; search unaffected |
| `ApplicationDetailPage` | Every field | `Answers` already shows "Not given"; the Location row joins the present parts; new "Extra questions" card (below) |

- **Storage.** `answers.custom` is the `CustomAnswer[]`; `answers.formVersion` records the published version used (0 = built-in form). Hidden fields are null or absent. Column changes are in section 5.
- **Admin review.** "Extra questions" lists each snapshot label (`localized()`), then the answer: choices by `valueLabels` joined with commas, yes/no as Yes or No. It reads the snapshot, so it stays correct after the question is edited or removed. `BusinessApplication.answers` gains `custom?` and `formVersion?`; `country`, `city`, `category` become optional.
- **Edge Function `submit-application`** (owner's go-ahead to redeploy): `loadApplyRules()` reads `site_content.published` with the service role, then `rulesFromConfig`; nothing published gives no rules. **A read error is not "no config"**: 503 `config_unavailable` and the page's existing "could not send" state. `MAX_BODY_BYTES` 20,000 becomes 48,000. `insert` writes the nullable columns, `answers.custom` and `formVersion`. The demo service calls the same validator with the mock's published config.
- **Rollout order matters:** an old function ignores `custom` and the new rules, so a required question or field would not be enforced. Redeploy the function before the Editor is used (section 16).

**Builder screen** (`/admin/editor/apply`; tabs **Form** and **Messages**)
- **Form tab.** On `lg`, the builder on the left and a live preview on the right (the real `ApplyPage` components with the draft; EN | PT toggle; desktop and phone width); below `lg`, the preview opens from the top bar. The builder is a list of step cards. Each card: title and hint (EN | PT), Move up, Move down, Delete (new steps only), then its field rows in order, then **Add question** (disabled at 10: "10 of 10 used"). **Add step** below the last card (disabled at 8). The Review card is last and fixed, with the consent and Terms rows shown locked.
- **Field row:** name, badges (Required, Optional, Hidden, lock), **Move up**, **Move down**, **Move to step…** (a select of the steps) and **Edit**. A hidden field stays in its step, greyed, with a Show button.
- **Drag and drop:** none. `package.json` has no drag-and-drop library and a new one needs an ADR. The buttons work with keyboard and screen readers; focus stays on the moved row and a live region says "Moved to step 2, position 3".
- **Field panel** (side drawer; full screen on phones): label and hint EN | PT with the original as placeholder and Reset; Required switch; Hidden switch; for choice fields each option with EN | PT label and a Show switch. Locked fields show the lock icon, the reason "Approval creates the company account from this field." and disabled switches. The last visible option's switch is disabled with its reason. A question panel adds type, options (add, remove, reorder) and the required switch; changing the type of a published question is allowed because old answers keep their snapshots.
- **Messages tab.** Every other `apply.*` text in groups: Page, Buttons, Sending problems, Validation errors, Consent, Thank-you screen. Each has EN | PT boxes, the original as placeholder, token chips (a typed unknown `{token}` is an error), Reset, and a search box. The Thank-you group links to `preview/apply/done`.
- Errors from `validateSiteContent` show on the row or step they belong to; Publish stays disabled with the list.

## 11. Social links

- Networks: Instagram, Facebook, LinkedIn, YouTube, TikTok, Pinterest. One URL each, all optional.
- `isAllowedSocialUrl(network, url)`: input is trimmed; a missing scheme gets `https://`; an explicit `http://` is refused ("Use an https link"); no spaces, no user info (`user@`), 300 characters or fewer; the host must be the network's domain or a subdomain of it:

| Network | Domains |
|---|---|
| Instagram | `instagram.com` |
| Facebook | `facebook.com`, `fb.com` |
| LinkedIn | `linkedin.com` |
| YouTube | `youtube.com`, `youtu.be` |
| TikTok | `tiktok.com` |
| Pinterest | `pinterest.com`, `pinterest.pt` |

- Filled networks show as icons in the main site footer, in the order above: `SiteFooter` (landing, legal pages, custom pages, not-found) and the Apply page footer (which uses `AuthLayout`, not `SiteFooter`). **Not** in business catalog footers (`PublicShell`).
- Icons are inline SVG in `src/features/marketing/SocialIcon.tsx` (no dependency, one consistent style). Each link has an accessible name ("Instagram, opens in a new tab", translated), `target="_blank"` and `rel="noopener noreferrer"`, and a 44 px tap target (`TAP_TARGET`).
- No icons when nothing is set, so the footer is unchanged before the first publish.

## 12. Portuguese and English everywhere

**Provider.**
- `LanguageProvider` moves from `PublicLayout` to the app root (`RootLayout`), so it covers `/admin`, `/dashboard`, the settings hub, `/login`, `/demo`, `/join`, `/reset-password`, `/accept-invite`, in path mode and hostname mode. The comment "admin stays English" goes. The `useMaybeI18n` fallbacks (`SiteChrome`, `LegalLinks`, `AuthLayout`) become plain `useI18n` once nothing renders outside the provider.
- **Order of choice:** `?lang=` for that visit (as now, not stored), then the device's saved choice, then the browser language (`pt*` is Portuguese, else English).
- **Remembering:** `localStorage` key `arfurn:lang` (`'en' | 'pt'`), written when the person uses a switch. Migration: on first load, if `localStorage` is empty and `sessionStorage` `arfurn:lang` exists, copy it to `localStorage` and remove the session entry. Reads and writes are wrapped in try/catch. Storage is per origin: the platform domain and each business subdomain remember separately.
- Side effect: staff whose browser is set to Portuguese now see Portuguese dashboards by default. They can switch back.
- `document.documentElement.lang` keeps being set (`pt-PT` / `en`).

**Switch.** `LanguageSwitcher` moves from `PublicShell.tsx` to `src/components/ui/LanguageSwitcher.tsx` and is **the same switch as on the landing page everywhere** (owner, 2026-10-29: "same as every for site"): same design and wording on public pages, the dashboards, settings and sign-in pages. The only variant is the existing `clear` colouring for use on photos. Placement:
- `DashboardShell` `Topbar` (admin and business), left of the user menu; in the mobile menu as well.
- `SettingsLayout` header (full-screen hub, outside the shell).
- `AuthLayout` (login, reset, accept-invite, apply), `JoinPage`, `DemoEntryPage`.
- Public pages keep theirs.

**Translation.**
- Scope: every user-facing string in `src/features/{admin,business,businesses,catalogs,products,settings,team,modelRequests,analytics,applications,shared}` (74 files), `auth`, `join`, `demo` (9 files) and `src/components` (27 files; counted 2026-10-29, test files excluded). Nav labels in `nav.ts` become keys (`NavItem.label` becomes `labelKey`). Toasts, errors, empty states, confirm dialogs, table headers, `aria-label`s, `title`s, placeholders and page titles are included. **Business and product data are not translated.**
- Language: Portuguese of Portugal (pt-PT).
- Keys: `src/i18n/dictionaries/en.ts` and `pt.ts` stay the entry points and spread per-area files (`en.admin.ts`, `en.business.ts`, `en.settings.ts`, `en.team.ts`, `en.products.ts`, `en.common.ts` and the same for `pt`), so `TranslationKey` stays `keyof typeof en`. Prefix by area: `admin.applications.title`, `settings.security.title`, `common.save`. Reuse `common.*` instead of repeating "Save" and "Cancel".
- Counts: a helper `tn(key, n, vars)` on the i18n context picks `key.one` or `key.other` with `Intl.PluralRules`.
- **Validation and service messages.** `src/services/validation.ts` returns English strings today. It changes to `{ key: TranslationKey; vars?: Vars }` per field, and the forms render `t(key, vars)`. `ServiceError.message` stays English for logs; the UI shows `t()` of a message chosen from `error.code` and `error.reason` through one helper `errorText(error)`, and a generic translated sentence for anything unmapped. Raw English from a service is never shown.
- **Dates, numbers, money.** `formatDate`, `formatDateTime`, `formatRelative`, `formatMoney`, `formatNumber` take `lang` with a default of `'en'`, so a caller that forgets it silently stays English. A `useFormat()` hook binds the current language and the profile date preferences (`src/lib/preferences.tsx`); dashboard code uses it, and `Charts.tsx` takes the locale from it. Locale mapping lives in one `localeOf(lang)` (Portuguese is `pt-PT`).
- **Checks.** `i18n.test.ts` already requires a Portuguese entry for every English key. Add: same `{token}` set in both languages per key; no empty values; a test that fails if `nav.ts` has a literal `label`.
- **Out of scope:** emails from Edge Functions (follow-up); the landing copy (already bilingual).

## 13. Error handling and security

- Every Editor and public read shows loading, empty and error states. Errors offer Retry. Permission errors reload the platform access (`onPermissionError`), as other admin pages do.
- Draft saves are conflict-checked (`p_base`). A failed autosave keeps the local text and the "Not saved. Retry" status; the blocker keeps the person from leaving by mistake.
- No raw HTML anywhere: the Markdown subset parses to React elements, never `dangerouslySetInnerHTML`. Link schemes are filtered on save and on render. Social URLs are host-checked on save and again on publish (HTTPS prefix in SQL).
- The draft can never be read by the public: no table access for `anon`, and the public function reads only `published`.
- Writers are trusted staff with 2FA and an explicit permission; every publish and restore is in the audit log with who and when.
- The Edge Function validates custom answers against the published config on the server. A client cannot add or skip questions.
- No secrets in `VITE_*`. No demo data after a Supabase error. In Supabase mode the Editor never uses the mock.

## 14. Testing and delivery

**Unit (vitest)**
- `siteContent`: `validateSiteContent` (slugs, reserved words, lengths, link schemes, option counts, text override tokens), `normalizeSiteContent`, `summarizeChanges`.
- `isAllowedSocialUrl`: each network, `http://`, look-alike hosts (`instagram.com.evil.example`), user info, long input.
- `applyForm`: `validateApplyForm` (step cap 8, question cap 10, Review last and only once, locked fields hidden or optional refused, a field on Review refused, last visible option, token sets, `{ref}` kept), `resolveApplyForm` (defaults equal today's form; a built-in key missing from `fields` gets its default; empty steps dropped), option values equal the constants in `application.ts`.
- `validateApplication` with rules: hidden fields ignored and null, optional empty and filled, each question type, required, choice not in list, hidden option gives `stale`, snapshot content, size cap, locked fields still required with hostile rules, no rules equals today's behaviour (existing tests unchanged).
- Approval with hidden fields: the demo service and the PGlite test approve an application with no description, country, city or category; the decision email inputs are still set.
- Mock content service: save, conflict, publish, history, restore (restore does not publish), reset demo data.
- Component tests: `LegalPage` with override, built-in fallback and error line; `CustomPage` PT fallback marker; `LegalLinks` footer pages; `ApplyPage` with texts, reordered and moved fields, a skipped empty step, hidden options and questions on a later step; Review with missing optional and hidden fields; `ApplicationsPage` and `ApplicationDetailPage` with null city, country and category (no stray comma, "Not given"); builder: Move up, Move down and Move to step change the document and keep focus, locked rows have disabled switches, Add question stops at 10, Add step at 8, Review cannot move; editor toolbar inserts Markdown; publish confirm counts; permission guard hides the nav item and route for Team.
- Language: provider order (`?lang`, storage, browser), `sessionStorage` migration, switch present in the dashboard top bar.
- Database: PGlite suite in section 5. Edge Function `handler.test.ts` gains: required question missing; choice not in list; too long; hidden field submitted (ignored, null); hidden `country` accepted; locked field missing refused; stale ids and a hidden option give 409 `form_changed`; config read error gives 503 `config_unavailable`; no published config behaves as today; honeypot and rate limit unchanged.

**Playwright e2e** (desktop and mobile projects, demo mode)
1. Edit Terms, Preview, Publish; `/terms` shows the new text. Before the publish, `/terms` still shows the old text.
2. Create a custom page with "Show in footer"; publish; the link shows on the landing page and on a catalog page; the page opens at `/pages/<slug>`.
3. Form builder: move a field to another step, hide "Phone", add a required multiple-choice question on step 2, edit the consent text in PT; publish; open `/apply` in EN and in PT (`?lang=pt`): order, hidden field, question and PT consent text show; submit; the admin application detail shows the question and answer, "Not given" for the hidden field, and the application can be approved.
4. Switch to PT in the dashboard top bar on Overview, Applications, Businesses, Products, Settings: none of the English nav labels remain; switch back; the choice survives a reload.
5. Team cannot see the Editor. Admin can.

**Definition of done** (CLAUDE.md): `typecheck`, `lint`, `test`, `build` pass; each touched route checked at desktop and mobile widths; tasks ticked in `tasks/`, `Task.md` updated.

**Docs updated in phase 7:** `System_arch/HANDOFF.md` (live state after anything is applied), the affected `design/10-i18n.md`, `design/12-features-admin.md`, `design/19-supabase.md` and `design/24-applications.md`, `docs/CLIENT_HANDOVER.md` (new "Editor" section), `docs/TEST_PLAN.md`, `docs/OPERATIONS_RUNBOOK.md` (migration and function steps, rollback), `docs/PRD.md` rows, and the **CLAUDE.md hard rule** "The admin and business dashboards are English-only" replaced by a bilingual rule (ADR-0044). The "English-only" notes in ADR-0004 and ADR-0032 are marked superseded in part by ADR-0044.

## 15. Build order

| Phase | Work | Applies to Supabase? |
|---|---|---|
| 1 | `content.manage` everywhere (section 4), migration + rollback + PGlite tests, `ContentService`, mock, Supabase module, `siteContent.ts` with tests | No (written, not applied) |
| 2 | Pages section, `MarkdownBody` extraction, `LegalPage` overrides, `CustomPage`, `/pages/:slug`, footer links, preview route, publish and history | No |
| 3a | Form model: `_shared/applyForm.ts` (types, defaults, `resolveApplyForm`, `validateApplyForm`, `rulesFromConfig`), the SQL `validate_apply_form` and `business_applications` changes added to the unapplied migration, shared validator with rules, `submit-application` handler and tests, `ApplyPage` driven by the config, admin list and detail with missing values, "Extra questions" card | No |
| 3b | Builder UI: Form tab, field and question panels, Messages tab, live preview, builder tests and the e2e | No |
| 4 | Social section and footer icons | No |
| 5 | App-wide `LanguageProvider`, storage migration, `LanguageSwitcher` placements, `tn`, `useFormat`, `errorText`, validation shape | No |
| 6 | Dashboard translation by area (admin, business, businesses/catalogs/products, settings, team/modelRequests/analytics/applications, components), one commit per area | No |
| 7 | E2E, docs, CLAUDE.md rule, ADR index | No |

Each phase ends with typecheck, lint, test and build green and a push to the feature branch.

## 16. Rollout

1. All phases on the feature branch; PGlite and unit tests green; Vercel Preview checked.
2. **Owner's go-ahead (ADR-0042):** apply the migration to `zggylkbgajamhriebdrg` as `docs/OPERATIONS_RUNBOOK.md` describes. It creates `site_content` and also alters `business_applications` (nullable `country`, `city`, `category`; `answers` limit 64 KB). The old function and the live site keep working with it, because it only loosens constraints. Then `npm run db:types` (only after it is applied).
3. **Owner's go-ahead:** redeploy `submit-application`. Before this, no application form change may be published (hiding `country` would make the old function refuse every application). The redeploy must come after the migration (the function reads `site_content`).
4. Push to `main` only when the owner asks. Until then the live site has no Editor.
5. Rollback: the rollback script for the database (fills null `country`, `city`, `category` with "Not given" first); redeploy the previous `submit-application`; revert the merge.
6. Production comes later and fresh, with the client's approval (ADR-0042); this migration is part of that setup.

## 17. Open questions

None. Decided 2026-10-29 by the owner: the dashboard text is not client-editable, so there is no separate review step; the pt-PT dashboard strings are written in this project (Portuguese of Portugal, consistent with the existing public pt dictionary) and ship with it.

Decided in section 2 and not open: consent sentence editable (the checkbox stays required); steps capped at 8; choice options may be hidden; multiple choice added, no file upload.
