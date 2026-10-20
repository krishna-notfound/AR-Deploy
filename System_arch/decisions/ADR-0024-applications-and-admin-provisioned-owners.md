# ADR-0024: Business applications, admin review and admin-provisioned owners
- **Status:** Accepted 2026-10-20 (owner scope decision; supersedes ADR-0022)
- **Date:** 2026-10-20
- **Affects:** design/24-applications.md, design/23-email.md, design/19-supabase.md, supabase/migrations/20261020091428_applications_and_owner_access.sql, supabase/functions/{submit-application,provision-owner,resend-webhook}, tasks/P11-sanctus.md

## Context
The client wants businesses to ask to join, and the platform team to decide. ADR-0022 allowed self-registration and claim links. The client's requirements now exclude public self-registration and business self-claiming. Every business has exactly one owner, and that owner is created by a platform admin.

## Decision
- **Applications, not accounts.** The public `/apply` wizard (EN/PT) sends answers to the `submit-application` Edge Function. The function validates them with the same rules as the wizard (`_shared/application.ts`) and rate-limits by a salted IP hash (5 per hour). It is idempotent per wizard `submission_key`, refuses a second open application for the same business and email, and stores the row with the service role. Browsers cannot read or write `business_applications` (RLS: admins read; no browser writes).
- **Lifecycle** submitted → under_review → approved | rejected; rejected can be reopened. `admin_review_application()` records the actor and the reason, which a rejection requires. Approval creates the business as a **draft** (never public until an admin activates it).
- **One owner per business**, enforced by a unique index on `business_members(business_id)`. Owners come only from the admin-only `provision-owner` Edge Function. It calls `auth.admin.generateLink` (an invite link for a new or unconfirmed account, a magic link once confirmed) and emails the link through Resend. The link is never stored, logged or returned to the browser. The `/accept-invite` page lets the owner set a password, and `complete_owner_onboarding()` records acceptance.
- **Resend invitation:** 60-second cooldown and at most 10 attempts per business. Every attempt is a new `email_log` row (`workflow = invite:<business>`, `attempt` n).
- **Audit:** `audit_events` is append-only. The service role can only insert, admins can only read, and triggers record status changes and owner removals.
- **Email truth:** a status changes only on evidence (provider response, Resend webhook, provider lookup). The `resend-webhook` function verifies svix signatures and processes each event id once, and a status only moves forward.
- Demo mode runs the same flow in the browser session, and every email shows as "Not sent (demo mode)".

## Consequences
- Good: no ownership by email match or link-sharing. Nothing becomes public without an admin decision, and every decision has an actor and an audit row. Applying needs no account.
- Trade-off: invitations need the Resend secrets and the Auth redirect allow-list (`/accept-invite`), and both need org Admin access. Until a domain is verified, Resend's test sender reaches only the account owner and `@resend.dev` simulation addresses; other recipients are logged as `blocked`.
- Trade-off: if an owner is removed, a new owner needs a new invitation; the old account keeps no access.

## Alternatives rejected
- Keep ADR-0022 self-registration and claim links: excluded by the client's requirements.
- `inviteUserByEmail` with Supabase SMTP: Supabase's default mailer is rate-limited and unbranded. `generateLink` plus Resend gives one email pipeline with logged outcomes.
- Store applications as draft businesses: rejected applicants would leave business rows behind, and the answers do not belong on a catalogue record.
