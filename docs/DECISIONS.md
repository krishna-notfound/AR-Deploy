# Decisions

Architecture decision records live in `System_arch/decisions/` (index: `System_arch/decisions/README.md`). This file lists the owner-approved scope changes and product decisions taken during the production-readiness programme.

| Date | Decision | Approved by | Record |
|---|---|---|---|
| 2026-10-13 | AR uses native viewers only: Google Scene Viewer (Android), Apple Quick Look (iOS/iPadOS), interactive 3D viewer elsewhere. No WebXR, custom AR session or physics | Owner | ADR-0021 |
| 2026-10-13 | Business owners may self-register; new businesses are drafts until an admin activates them; existing businesses are claimed only via admin-issued single-use links. Scope change: the contract excluded self-service accounts | Owner | ADR-0022 |
| 2026-10-13 | Production sign-ups stay disabled; email confirmation stays on | Owner | ADR-0022 |
| 2026-10-13 | A separate free Supabase staging project is approved; production is changed only with per-change approval | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | "AR activation" analytics means a launch attempt (one per tap, 2 s guard), never a successful placement | Owner | docs/PRD.md R-29 |
| 2026-10-13 | No separate staging project: the live project `pmnjchhrgvajtjpadpqo` is used for staging tests until launch, then cleared. Every change there is approved one by one; public sign-ups stay off (test users are created in the dashboard) | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | Kept: admin approval before a business goes public, one pending draft per account (ADR-0022); separate per-business catalogs, no cross-business directory; variants stay colour + price until the client answers A-3 | Owner | this file |
| 2026-10-13 | No new Supabase project, plan upgrade, or pausing/deleting projects without approval; no Preview connected to production | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | Onboarding: display name (optional, skippable) stored in the account's own Auth metadata, no new table; then register a draft business or redeem a claim link | Owner (no-migration route) | src/features/auth/DisplayNameStep.tsx |
| 2026-10-13 | No analytics date-range picker: design/16 explicitly excludes it | Existing spec | System_arch/design/16 |
| 2026-10-13 | Variant price differences must be whole, non-negative amounts (parser and "+" display already assume this; 0 of 10 live variants negative) | Engineering | src/services/validation.ts |
| 2026-10-20 | Access model: Sanctus admins create owner accounts; no public self-registration or self-claim; exactly one owner per business; manual approval before listing. Supersedes ADR-0022 (to be recorded as ADR-0024 with the Phase 2 migration) | Owner | docs/PRODUCTION_AUDIT_AND_PLAN.md (C1) |
| 2026-10-20 | The client Supabase project `zggylkbgajamhriebdrg` (Sanctus AR, org `vxoqgtqqvgqlmfggxhdu`) is the development and integration target; no separate staging project for now (2026-10-20; as of 2026-10-27 it is the project the live site uses, see HANDOFF Live state). The old project `pmnjchhrgvajtjpadpqo` stays untouched (not used) | Owner | docs/PRODUCTION_AUDIT_AND_PLAN.md (C14) |
| 2026-10-24 | Invitations and password reset use emailed one-time codes instead of links | Accepted, see ADR | ADR-0027 |
| 2026-10-25 | Dashboards redesigned from the owner's Stitch screens | Accepted, see ADR | ADR-0028 |
| 2026-10-25 | Platform team roles: Owner, Admin and Team, with per-role permissions enforced in the database | Accepted, see ADR | ADR-0029 |
| 2026-10-25 | Platform team members are invited by link (`/join`); only a hash of the secret is stored | Accepted, see ADR | ADR-0030 |
| 2026-10-25 | Dashboard type and density (Inter, `--text-ui-*`, inside the dashboard shell only) | Accepted, see ADR | ADR-0031 |
| 2026-10-26 | Account settings hub and authenticator-app 2FA, enforced in the database helpers | Accepted, see ADR | ADR-0032 |
| 2026-10-26 | Business-logic fixes (S1.5) from the 2026-10-26 audit | Accepted, see ADR | ADR-0033 |
| 2026-10-26 | 3D model requests (S4): `models.manage` permission, per-business own-upload switch | Accepted, see ADR | ADR-0034 |
| 2026-10-26 | Android AR opens inside Chrome first (WebXR), Scene Viewer only as fallback; iPhone uses Quick Look. Replaces the native-only rule of 2026-10-13 | Owner | ADR-0035 |
| 2026-10-26 | Nothing on the live site says demo or sample (catalog footer label, sample credits, Settings General, `/demo`, upload hint removed or hidden) | Owner | commit 38bed33 |
| 2026-10-26 | Model upload limits: GLB 30 MB, USDZ 40 MB | Owner | commit 0add24e; ADR-0037 |
| 2026-10-26 | Public catalog and product pages: the Stitch redesign (ADR-0036) is dropped; back to the original look with slightly soft corners; the product's own link is a real button | Owner | ADR-0037 |
| 2026-10-26 | AR audit fixes: model files load straight from storage, the viewer retries, AR is re-checked after load, failed hand-offs say so | Owner | ADR-0041 |
| 2026-10-26 | Automatic model lightening on upload is on (client question A-2 answered): about 100,000 triangles and 2048 px textures, no compression, true size checked | Owner | ADR-0038 |
| 2026-10-27 | The editor may build the iPhone USDZ from the GLB ("Build from GLB", in the browser); replaces the "never convert GLB to USDZ" rule | Owner | ADR-0039 |
| 2026-10-27 | `main` is the live branch; `sanctus.warpkit.online` serves Production; Production uses the client database, which holds real client data (no writes without the owner's OK) | Owner | ADR-0040 |
| 2026-10-27 | `invite-member` redeployed on the client project so team invitation emails list "Handle 3D model requests" | Owner | System_arch/HANDOFF.md |
| 2026-10-27 | Every decision is recorded when it is taken: an ADR for design or architecture, a row here for every owner decision (CLAUDE.md "Recording decisions") | Owner | CLAUDE.md |
| 2026-10-29 | No separate dev Supabase project; keep working on the current setup, which is the testing environment (test data); when everything works, production is set up fresh. The client's condition: no final production deployment or significant production change without the client's explicit approval | Owner; condition from the client | ADR-0042 |
| 2026-10-29 | The client may edit website content himself in a new Admin Console tab "Editor". Editable: Terms, Privacy, custom info pages, the business application form, social media links. Not editable: landing, catalog and product pages | Owner; request from the client | ADR-0043 |
| 2026-10-29 | New permission `content.manage`: Owner always, Admin by default, Team no | Owner | ADR-0043 |
| 2026-10-29 | Editor content works as draft then Publish: Preview shows the draft, one Publish makes everything live, every publish is kept with Restore; before the first publish the site shows today's built-in text | Owner | ADR-0043 |
| 2026-10-29 | Editor storage: one singleton table (draft and published) plus a history table, read and written only through security-definer functions with the 2FA gate (recommended option accepted) | Owner | ADR-0043 |
| 2026-10-29 | Application form: the client can edit every text in EN and PT, hide the optional fields only, and add up to 5 extra questions (short text, long text, yes/no, single choice); answers are kept with the question text and checked by the Edge Function (needs a redeploy, owner's go-ahead) (superseded the same day by the full form builder row) | Owner | ADR-0043 |
| 2026-10-29 | Social media links (Instagram, Facebook, LinkedIn, YouTube, TikTok, Pinterest) show as icons in the main site footer, not in business catalog footers | Owner | ADR-0043 |
| 2026-10-29 | A PT \| EN switch on every screen, including the Admin Console, the company dashboard and the sign-in pages; the whole dashboard text is translated to Portuguese of Portugal. Supersedes "the dashboards are English-only" | Owner; request from the client | ADR-0044 |
| 2026-10-29 | Out of this project: the demo landing collections fix, the application section redesign, the test company, logo and favicon (client sending files), Portuguese transactional emails | Owner | docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md |
| 2026-10-29 | Application form is a full form builder: client edits all text in EN and PT (incl. consent, errors, thank-you screen), reorders fields and steps, hides fields or makes them optional, adds up to 10 questions on any step; business name, contact name and contact email stay locked | Owner | ADR-0043 |
| 2026-10-29 | The PT/EN switch has the same design as the landing page's switch everywhere (public pages, dashboards, settings, sign-in). Dashboard text is not client-editable; its Portuguese is written in this project with no separate review step | Owner | ADR-0044 |
| 2026-10-29 | Spec approved; build it now with parallel Sonnet subagents in git worktrees (3 waves), target 4-5 hours | Owner | docs/superpowers/plans/2026-10-29-content-editor-and-bilingual-dashboards.md |
| 2026-10-29 | Apply the Editor migration (`20261029074648_site_content.sql`) to `zggylkbgajamhriebdrg` and redeploy `submit-application` (done and checked the same day) | Owner | System_arch/HANDOFF.md |
| 2026-10-29 | Make it live: merge the Content Editor and bilingual dashboards to `main` (`179b4c3`) and redeploy `invite-member` (done and checked the same day) | Owner ("make it live and do it") | System_arch/HANDOFF.md |
| 2026-10-29 | Fix the 7-8 s Editor open delay: draft request and chunks start together and on menu hover/touch, skeletons replace the spinner in the dashboards; pushed live (`main` f71f141). Next: split the dictionaries so each page loads only the text it needs | Owner | commit f71f141 |
