# ADR-0043: Content Editor in the Admin Console: draft, publish, history
- **Status:** Accepted (owner, 2026-10-29)
- **Date:** 2026-10-29
- **Affects:** ADR-0029 (17th permission), ADR-0032 (2FA gate), ADR-0024 (application form), design/19-supabase.md, design/12-features-admin.md, design/24-applications.md, docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md

## Context
On 2026-10-29 the client asked to edit website text and content himself, and for "a dedicated tab for social media". Today every public text is in code (the `apply.*` dictionary keys and the legal drafts in `src/features/legal/`), so each change needs a developer and a deploy. The owner set the scope: only Terms, Privacy, custom info pages, the business application form and social links are editable. The landing, catalog and product pages are not.

## Decision
- **Editor tab** at `/admin/editor` with Pages, Application form and Social media. New sidebar item "Editor", guarded by the new permission `content.manage` (the 17th key): Owner always, Admin by default, Team no. Business owners have no access.
- **Editable, and only this:**
  - Terms and Privacy (seeded from the built-in text), and custom pages (title, slug at `/pages/:slug`, body, "show in footer", order), EN and PT.
  - Application form, as a full form builder (owner, 2026-10-29):
    - Every `apply.*` text is editable in EN and PT, including the consent sentence, error messages and the thank-you screen. Overrides keep the original `{token}` set. Reset to original per text.
    - Steps can be renamed, reordered and added (8 at most, Review included). Review stays last and cannot be removed. A step with no visible fields is skipped.
    - Built-in fields can be moved to another step, reordered, hidden, or switched optional. Locked, always shown and required: business name, contact name, contact email (approval creates the account from them). The consent and Terms checkboxes stay required; only the consent text is editable.
    - Options of the choice fields can be renamed or hidden (one stays visible); the stored values stay the fixed set.
    - Up to 10 extra questions on any step except Review: short text, long text, yes/no, single choice, multiple choice. Answers go to `answers.custom` with label snapshots.
    - Hidden fields are stored as null. The migration makes `country`, `city` and `category` nullable and raises the `answers` size check to 64 KB. Admin screens and approval show "Not given" for missing values.
  - Social links: Instagram, Facebook, LinkedIn, YouTube, TikTok, Pinterest (https, host must match), shown as icons in the main site footer only.
- **Body format** is a Markdown subset (the existing parser). Raw HTML is not allowed. No new dependency.
- **Draft, then Publish.** Edits save to a draft. Preview renders the draft with the real page components. One Publish makes all Editor content live. Every publish is kept (who, when) and can be restored into the draft. The public site reads published content only. With nothing published, it shows today's built-in text.
- **Storage:** one singleton table `public.site_content` (draft and published) and `public.site_content_versions` (history). No table access for `anon` or `authenticated`: all reads and writes go through `security definer` functions that check 2FA (`caller_mfa_satisfied()`) and `platform_can('content.manage')`. Public reads return small parts (footer links, one page, the application config), never the draft. Draft saves and publishes are conflict-checked. 512 KB limit per document.
- **Application answers** are validated by the `submit-application` Edge Function against the published config, with the shared validator in `supabase/functions/_shared/application.ts`. This needs a function redeploy.
- The migration and the redeploy are applied only with the owner's go-ahead (ADR-0042).

## Consequences
- Good: the client changes legal text, pages, the form and social links without a developer. Nothing goes live half-edited. A bad publish is undone by restoring a version.
- Good: the draft cannot leak, even by a future `select *`, because the tables are closed to the API roles.
- Trade-off: one function per read shape instead of plain table reads; more SQL to test (PGlite suite).
- Trade-off: a published slug change breaks old links (no redirects). Legal text is only as good as what the client publishes; the client's lawyer review stays outside the app.
- Trade-off: the form's structure is now data, so the page, the shared validator and the SQL publish gate must read the same model (one pure file, tested against the SQL gate).
- Trade-off: until the function is redeployed, a required custom question is not enforced. The rollout order prevents this (migration, function, then the app).

## Alternatives rejected
- Edit the dictionary and legal files in Git: needs a developer and a deploy for every change.
- Live editing without a draft: half-finished text could be seen by visitors.
- Column grants on one table (published columns readable by `anon`): one `select *` or new column away from exposing the draft.
- A separate table for each content type: more tables and policies for a handful of small documents.
- A rich-text editor or a CMS dependency: needs a new dependency (and an ADR) for text that Markdown already covers.
- Letting the client edit the landing, catalog and product pages: not asked; the owner kept them out of scope.
