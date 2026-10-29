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
- Publishing is one action and is undone by restoring an earlier version and publishing again.
- With nothing published, every public page looks exactly as it does today.
- Anyone can switch the whole app between English and Portuguese from any screen, and the choice is remembered on the device.

## 2. Background and decisions

| Date | Decision | Source |
|---|---|---|
| 2026-10-29 | The client asked to edit website text himself, for PT+EN dashboards, and for a social media tab | Client, via the owner |
| 2026-10-29 | Editable: Terms, Privacy, custom info pages, the business application form, social links. **Not editable:** landing, catalog and product pages | Owner |
| 2026-10-29 | Draft then Publish. One Publish makes all Editor content live. Every publish is kept, with Restore | Owner |
| 2026-10-29 | New permission `content.manage`: Owner always, Admin by default, Team no | Owner |
| 2026-10-29 | Storage: one singleton table plus a history table (section 5) | Owner accepted the recommendation |
| 2026-10-29 | "There should be a switch button of Portugal and English everywhere so it's easy for anyone to switch" | Owner |
| 2026-10-29 | The current setup is the testing environment; migrations and function deploys need the owner's go-ahead | ADR-0042 |

## 3. Scope

**In**
- Editor tab at `/admin/editor` (sections: Pages, Application form, Social media) with draft, preview, publish, history.
- Public rendering of published content with built-in fallback; footer links; social icons.
- Application form overrides, hide/show of optional fields, up to 5 extra questions, validation in the Edge Function.
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

**Publish validation (the final gate, in SQL).** The editor validates fully in TypeScript; the database repeats the checks that protect the live site: `schema = 1`; at most 20 custom pages; each slug matches `^[a-z0-9]+(-[a-z0-9]+)*$`, is 60 characters or fewer, is unique and is not reserved; at most 5 custom questions, each with a known `type`; every social value starts with `https://`. Reserved slugs: `admin, api, apply, catalog, dashboard, demo, embed, login, pages, privacy, products, terms`. A PGlite test checks the SQL list refuses each one.

**Audit.** The two new event types fit the existing `event_type` pattern. The audit log page gets two labels.

**Size.** 512 KB for each stored document. The built-in legal text is about 73 KB for both languages and both pages, so real use stays far below. History is not pruned; revisit if it passes 200 versions.

**Database tests** (`supabase/tests/siteContent.test.ts`, PGlite harness): anon cannot select either table; anon gets published parts only; draft never appears in a public answer; Team and a member without 2FA are refused; conflict on stale `p_base`; publish is atomic (a failing validation leaves `published` and history unchanged); restore does not touch `published`; size limit; reserved and duplicate slugs; rollback script removes everything.

## 6. Content document

Defined in `src/domain/siteContent.ts` (pure TypeScript, **no imports**, so the Edge Function can import it, like `supabase/functions/_shared/application.ts`).

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

export interface ApplyFormConfig {
  /** Overrides on top of the `apply.*` dictionary. Key = dictionary key from APPLY_EDITABLE_KEYS. */
  texts: Record<string, Partial<Record<Lang, string>>>
  hiddenOptional: ApplyOptionalField[]              // subset of the four below
  customQuestions: CustomQuestion[]                 // at most 5
}
export type ApplyOptionalField = 'website' | 'applicantRole' | 'applicantPhone' | 'notes'

export type CustomQuestionType = 'short_text' | 'long_text' | 'yes_no' | 'single_choice'
export interface CustomQuestion {
  id: string                                        // crypto.randomUUID()
  type: CustomQuestionType
  label: { en: string; pt?: string }                // 1..200
  help?: { en: string; pt?: string }                // 0..300
  required: boolean
  options?: { id: string; label: { en: string; pt?: string } }[]   // single_choice only, 2..10
}

export type SocialNetwork = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest'

/** Stored in business_applications.answers.custom (section 8). */
export interface CustomAnswer {
  id: string
  type: CustomQuestionType
  label: { en: string; pt?: string }                // snapshot at submit time
  value: string | boolean                           // short/long text, yes_no, or the option id
  valueLabel?: { en: string; pt?: string }          // snapshot of the chosen option
}
```

Exports in the same file: `emptySiteContent()`, `normalizeSiteContent(unknown)` (fills defaults, drops unknown keys), `validateSiteContent(doc)` returning `Record<path, errorKey>`, `summarizeChanges(before, after)` (section 7), `isAllowedSocialUrl(network, url)`, `RESERVED_PAGE_SLUGS`, `APPLY_EDITABLE_KEYS`.

**Page body format.** A Markdown subset: headings (`#` to `###`), bold, italic, lists, links, paragraphs, tables and quotes as `src/features/legal/markdown.ts` already parses. **Raw HTML is not parsed**; it shows as text. Links: `https://`, `mailto:` and site-relative `/...` only; any other scheme (`javascript:`, `data:`) is refused on save and rendered as plain text. No new dependency: the parser exists, and the block and inline renderer inside `LegalPage.tsx` moves to `src/features/legal/MarkdownBody.tsx` so Terms, Privacy and custom pages share it.

**Application text overrides.** `APPLY_EDITABLE_KEYS` is every `apply.*` key except: `apply.err.*`, `apply.done.*`, `apply.choose`, `apply.optional`, `apply.progress`, `apply.stepOf`, `apply.retry`, `apply.failed`, `apply.rateLimited`, `apply.duplicate`, `apply.fixFields`. So these are editable: title, eyebrow, intro, step titles and hints, field labels and hints (`apply.f.*`), choice texts (`apply.cat.*`, `apply.count.*`, `apply.photos.*`, `apply.models.*`), and the buttons Back, Continue, Send. An override is at most 300 characters and may use only the `{n}`-style tokens the original has.

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
- **Change summary.** `summarizeChanges(published ?? emptySiteContent(), draft)` returns counts by group (pages, footer, application texts, hidden fields, questions, social links) for the publish confirm. It is pure and tested.

## 8. Editor UX

**Routes** (all `RequirePermission need="content.manage"`): `/admin/editor` (redirects to Pages), `/admin/editor/pages`, `/admin/editor/pages/:pageKey` (`terms`, `privacy` or a custom page id), `/admin/editor/apply`, `/admin/editor/social`, `/admin/editor/preview/:target` (`page/:pageKey`, `apply`, `footer`).

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

**Preview.** Opens `/admin/editor/preview/...` in the same tab (or a new one): the real public components (`LegalPage`, custom page, `ApplyPage`, `SiteFooter`) inside a `SiteContentProvider` whose source is the draft, under a fixed bar "Preview of the draft. Not live." with an EN | PT switch and a width toggle (desktop, phone). Preview of the application form never submits: the send button shows "Preview" and the service is not called.

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

## 10. Application form

**What the page does today.** `src/features/apply/ApplyPage.tsx` runs five steps (`APPLICATION_STEPS`) with `apply.*` dictionary text. The one validator is `supabase/functions/_shared/application.ts` (pure TypeScript, imported by the page, by the demo service and by the Edge Function). `src/services/applicationRules.ts` is only the review lifecycle and is not involved.

**Behaviour with a published config**
- **Texts.** Each `t('apply.…')` call for an editable key goes through `applyText(key, vars)`: the override for the current language if non-empty, else the dictionary text. An empty override box means "use the original". In the Editor each field shows the original text as the placeholder, and a **Reset to original** link per text.
- **Hide optional fields.** Only `website`, `applicantRole`, `applicantPhone` and `notes` can be hidden. They are the fields `validateApplication` treats as optional. Required fields (business name, description, category, country, city, name, email, language, product count, photo and model readiness, consent, terms) have no switch. A hidden field is removed from the form and from the review step. Stored as `null`.
- **Extra questions** (up to 5). Types: short text (200 characters), long text (1000), yes/no, single choice (2 to 10 options). Label and help in EN and PT; empty PT falls back to EN. Required or optional. They appear at the end of the "Your catalogue" step, in the order set in the Editor, and in the review step. Each question's field id for errors is `custom.<id>`.

**Submission and storage**
- The client sends `custom: { [questionId]: string | boolean }` next to the existing fields. Hidden optional fields are not sent.
- `validateApplication(input, rules?)` gains an optional second argument `rules: { hiddenOptional: string[]; customQuestions: CustomQuestion[] }`. The file stays import-free. For hidden optional fields it ignores any submitted value and stores `null`. For custom questions it checks: required answered, lengths, yes/no is a boolean, a choice is one of the option ids. It returns `value.custom: CustomAnswer[]` (unanswered optional questions are left out) with the label (and chosen option label) copied in as a snapshot.
- Unknown question ids or option ids (the form was republished while the visitor typed) give `form_changed`: HTTP 409, and the page reloads the config, keeps the visitor's answers and shows "The form was updated. Please check the new questions."
- Storage: `business_applications.answers.custom` as the `CustomAnswer[]`. No schema change: `answers` is `jsonb` with a 16,384 byte check. Worst case (5 long answers of 1000 characters and snapshots) is about 8 KB on top of about 3 KB of existing answers.
- **Admin review** (`ApplicationDetailPage`): a section "Extra questions" lists each snapshot label in the viewer's language (`localized()`), then the answer (choice shown by `valueLabel`, yes/no as Yes/No). It reads the snapshot, so it stays correct after the question is edited or removed. `BusinessApplication.answers` in `src/domain/types.ts` gains `custom?: CustomAnswer[]`.

**Edge Function `submit-application`** (needs the owner's go-ahead to redeploy)
- New dependency `loadApplyRules(): Promise<ApplyRules | null>` reading `site_content.published` with the service role and taking `applyForm.hiddenOptional` and `customQuestions`. No published content: `null`, so validation is the current one.
- **A read error is not treated as "no config".** The handler answers 503 `config_unavailable`; the page shows its existing "could not send, try again" state. Otherwise a required question could be skipped while the database is unreachable.
- `MAX_BODY_BYTES` rises from 20,000 to 32,000. `insert` stores `answers.custom`.
- `handler.test.ts` gains cases: required custom missing; choice not in list; too long; hidden field submitted; stale ids give 409; config read error gives 503; no published config behaves as today.
- The demo service (`mockCatalogService.submitApplication`) calls the same validator with the mock's published config.
- **Order of rollout matters:** an old function ignores `custom`, so a required question would not be enforced. Redeploy the function before the Editor can be used (section 14).

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

**Switch.** `LanguageSwitcher` moves from `PublicShell.tsx` to `src/components/ui/LanguageSwitcher.tsx` with three looks: `clear` (on photos), the existing public look, and a **dashboard** look (a two-segment control "EN | PT", Inter, 14 px, no tracking or small caps, ADR-0031). Placement:
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
- `validateApplication` with rules: hidden fields ignored, each custom type, required, choice not in list, snapshot content, no rules equals today's behaviour (existing tests unchanged).
- Mock content service: save, conflict, publish, history, restore (restore does not publish), reset demo data.
- Component tests: `LegalPage` with override, built-in fallback and error line; `CustomPage` PT fallback marker; `LegalLinks` footer pages; `ApplyPage` with texts, hidden fields and questions; editor toolbar inserts Markdown; publish confirm counts; permission guard hides the nav item and route for Team.
- Language: provider order (`?lang`, storage, browser), `sessionStorage` migration, switch present in the dashboard top bar.
- Database: PGlite suite in section 5. Edge Function: `handler.test.ts` cases in section 10.

**Playwright e2e** (desktop and mobile projects, demo mode)
1. Edit Terms, Preview, Publish; `/terms` shows the new text. Before the publish, `/terms` still shows the old text.
2. Create a custom page with "Show in footer"; publish; the link shows on the landing page and on a catalog page; the page opens at `/pages/<slug>`.
3. Add a required question; publish; submit `/apply`; the admin application detail shows the question and the answer.
4. Switch to PT in the dashboard top bar on Overview, Applications, Businesses, Products, Settings: none of the English nav labels remain; switch back; the choice survives a reload.
5. Team cannot see the Editor. Admin can.

**Definition of done** (CLAUDE.md): `typecheck`, `lint`, `test`, `build` pass; each touched route checked at desktop and mobile widths; tasks ticked in `tasks/`, `Task.md` updated.

**Docs updated in phase 7:** `System_arch/HANDOFF.md` (live state after anything is applied), the affected `design/10-i18n.md`, `design/12-features-admin.md`, `design/19-supabase.md` and `design/24-applications.md`, `docs/CLIENT_HANDOVER.md` (new "Editor" section), `docs/TEST_PLAN.md`, `docs/OPERATIONS_RUNBOOK.md` (migration and function steps, rollback), `docs/PRD.md` rows, and the **CLAUDE.md hard rule** "The admin and business dashboards are English-only" replaced by a bilingual rule (ADR-0044). The "English-only" notes in ADR-0004 and ADR-0032 are marked superseded in part by ADR-0044.

## 15. Build order

| Phase | Work | Applies to Supabase? |
|---|---|---|
| 1 | `content.manage` everywhere (section 4), migration + rollback + PGlite tests, `ContentService`, mock, Supabase module, `siteContent.ts` with tests | No (written, not applied) |
| 2 | Pages section, `MarkdownBody` extraction, `LegalPage` overrides, `CustomPage`, `/pages/:slug`, footer links, preview route, publish and history | No |
| 3 | Application form: overrides, hidden fields, questions, shared validator, handler and tests, admin review section | No |
| 4 | Social section and footer icons | No |
| 5 | App-wide `LanguageProvider`, storage migration, `LanguageSwitcher` placements, `tn`, `useFormat`, `errorText`, validation shape | No |
| 6 | Dashboard translation by area (admin, business, businesses/catalogs/products, settings, team/modelRequests/analytics/applications, components), one commit per area | No |
| 7 | E2E, docs, CLAUDE.md rule, ADR index | No |

Each phase ends with typecheck, lint, test and build green and a push to the feature branch.

## 16. Rollout

1. All phases on the feature branch; PGlite and unit tests green; Vercel Preview checked.
2. **Owner's go-ahead (ADR-0042):** apply the migration to `zggylkbgajamhriebdrg` as `docs/OPERATIONS_RUNBOOK.md` describes. Then `npm run db:types` (only after it is applied).
3. **Owner's go-ahead:** redeploy `submit-application`. Before this, no custom question may be published. The redeploy must come after the migration (the function reads `site_content`).
4. Push to `main` only when the owner asks. Until then the live site has no Editor.
5. Rollback: the rollback script for the database; redeploy the previous `submit-application`; revert the merge.
6. Production comes later and fresh, with the client's approval (ADR-0042); this migration is part of that setup.

## 17. Open questions

1. **Who reviews the Portuguese dashboard wording?** Phase 6 produces a large set of new pt-PT strings. The owner or the client should read them before go-live.
2. **Should the consent sentence (`apply.f.consent`) be editable?** It is legal wording. This spec allows it. The owner may want it locked, or reviewed by the client's lawyer.
