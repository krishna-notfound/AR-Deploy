# ADR-0033: Business-logic fixes (S1.5)
- **Status:** Accepted
- **Date:** 2026-10-26
- **Affects:** design/19-supabase.md, design/23-email.md, design/24-applications.md, docs/SECURITY_REVIEW.md, docs/OPERATIONS_RUNBOOK.md, ADR-0024, ADR-0029, ADR-0032
- **Spec:** `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md` (slimmed by the owner on 2026-10-26; the plan's "Moved out of S1.5" lists what went to S2 and S4)

## Context
A business-logic audit on 2026-10-26 (`docs/audits/2026-10-26-business-logic/`, 99 findings) found places where the dashboards, the database and the emails disagreed: a role could hold a permission it could not use, history disappeared with a deleted business, analytics lost data or mixed meanings, and several Edge Functions checked a permission but not the 2FA rule. The owner asked for the audit to be fixed. Part of it moved to S2 and S4, and the S3 form builder was cancelled, so its application findings came back into S1.5.

## Decision
- **One migration, with a rollback script.** `supabase/migrations/20261026041731_business_logic_fixes.sql`, one section per task. `supabase/rollback/20261026_business_logic_fixes_rollback.sql` restores earlier bodies and policies, drops the new objects, and keeps every audit and email row.
- **Permission prerequisites.**
  - A permission now brings what it needs. `businesses.status` and `businesses.delete` need `businesses.edit`; `businesses.delete` also needs `products.delete`; `owners.manage` needs `businesses.view`; `applications.approve` and `applications.reject` need `applications.view`; `products.edit` needs `products.view`; `products.publish` and `products.delete` need `products.edit`.
  - The map is `private.permission_prerequisites()`, mirrored by `PERMISSION_PREREQUISITES` in `src/domain/permissions.ts` and pinned by a test. The role editor shows the implied ones ticked and locked.
  - `admin_set_role_permissions` stores the closure and answers `{ok, added}`. A one-off backfill normalises every stored role set and writes one audit row per changed role (`reason: 'prerequisites'`). **The backfill can widen a role**, so the runbook shows the owner a read-only pre-flight first.
  - The storage delete policies follow the permission that deletes the row (media: `products.edit`, `products.delete` or `businesses.delete`; logos: `businesses.edit` or `businesses.delete`).
  - The Owner always has all 15 permissions, whatever the Admin and Team sets hold.
- **2FA before permission on every function a person calls.** `_shared/gate.ts` builds a caller client, checks `caller_mfa_satisfied()`, then the gated helper. The functions are `provision-owner`, `invite-member`, `send-test-email`, `review-application` and `notify-business-owner`. `service_user_can` is no longer used for caller checks. `manage-member` is not wrapped by the gate: its permission checks already run in SQL through the gated helpers.
- **Audit snapshots, and the dropped business foreign key.**
  - A `BEFORE INSERT` trigger on `audit_events` (`private.snapshot_audit_event`) adds `business_name` and `actor_label` (Owner, Admin, Team, Business owner or User) to the metadata. No email or personal name is stored.
  - The foreign key `audit_events.business_id → businesses` is dropped, so history keeps the id after a delete and still filters by business. The UI shows "{name} (deleted)" and "Deleted user ({label})". The rollback re-adds the key `NOT VALID`.
  - Other people's `account_*` rows are readable only by the Owner. Business owners can read a fixed list of platform changes to their own business, which `notify-business-owner` also emails (best effort, deduped by `email_log.workflow`).
- **Profile visibility.** Staff read a profile only when their role needs it. This uses `public.platform_can_read_profile(uuid)`, which is one definer function beyond the spec's list. It was needed to enforce the rule once the Owner-only membership reads were in place, and it uses the gated `platform_can`. It answers "is this user staff or an owner" only for callers who can already list those people.
- **Embed views.** The embed sends `embed_view`, stored apart from `view`. `product_analytics_daily` appends `embed_views`. Embed loads before the release cannot be split from page views and are counted as page views. The analytics page says so from `EMBED_VIEWS_SINCE` (`src/services/analytics.ts`), which is set to the apply date at release.
- **Deleted-product analytics.** `product_analytics.product_id` is nullable and its foreign key is `on delete set null (product_id)` (**needs Postgres 15 or later**). A new foreign key on `business_id` cascades, so deleting a business still removes its events. Deleted products show as one "Deleted products" row. Counts are exact (`business_product_counts`), days are bucketed in the viewer's time zone (`analytics_daily`), and the overview numbers follow the viewer's permissions. Restoring the old cascade deletes every row kept for a deleted product (data loss, stated in the rollback header).
- **Closures follow the owner's membership.** Removing an owner voids that owner's closure request. Nothing can activate a business around an open closure (`closure_pending`), and only the Owner restores or completes it.
- **Applications and owner invitations** (the cancelled S3 findings).
  - Reviews go through `review-application`, which sends the rejection email (the reason only when the reviewer ticks it). An approved application whose business was deleted can be reopened (`business_deleted_at`, `reopen_not_allowed`).
  - `admin_application_duplicates` warns about possible duplicates by email and by a normalised business name. It never blocks a decision and never returns an owner's email.
  - Owner invitations use `private.owner_invite_attempts`: 60 s between sends and at most 10 per business and recipient in a rolling 24 h, reserved under an advisory lock before the link is made. A blocked attempt does not count. `admin_list_owner_states` shows "Needs owner", "Invite pending" or "Owner active" on every business. Any successful owner sign-in accepts a pending membership. A concurrent provision gives `business_has_owner` and leaves no orphan login.
  - `submit-application` counts attempts, not stored rows, in `private.application_attempts` (5 per hour per submitter, checked before the duplicate lookup). The submitter hash includes the UTC date, so it changes daily. A key replay is never rate limited and completes any missing audit row or email.
- **Email integrity.** Status changes follow a rank rule (blocked 0, failed or accepted 1, sent 2, delayed 3, delivered 4, bounced or complained 5), so a late `delivered` never hides a bounce. `email.suppressed` maps to `bounced`. Events that arrive before their log row are stored and applied when the row appears. Three kinds are added: `application_decision`, `business_notice` and `team_notice`.
- **Documented as is (TEAM-20).** Team members with "Create and edit products" change published products directly; there is no review step. The permission is the control.

## Alternatives rejected
- **Show the prerequisites as a warning only.** A saved role that cannot use its own permission is the bug, so the database stores the closure.
- **Keep the audit foreign key and null the business.** History would lose which business a row belonged to.
- **Snapshot the actor's name or email in audit rows.** That puts personal data in a log that outlives the account. A role label is enough.
- **Count analytics rows for deleted products as zero or hide them.** Totals would stop matching the events that were recorded.
- **Re-implement the 2FA check in each function.** The gate is one helper, so the rule cannot drift.

## Consequences
- The backfill can widen access for an existing role. The owner approves it from the pre-flight before the migration is applied.
- The migration needs Postgres 15 or later (`on delete set null (column)`). The runbook checks the version first.
- Rollback loses analytics rows kept for deleted products and drops the new tables. Audit and email rows stay.
- Business address history and redirects (BIZ-04, PUB-03), the stale-save check on products and the Email log page are not in this ADR. They moved to S2 and S4.
