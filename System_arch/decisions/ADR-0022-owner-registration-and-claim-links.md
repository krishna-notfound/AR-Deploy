# ADR-0022: Owner self-registration, draft businesses and claim links
- **Status:** Accepted (owner-approved scope change, 2026-10-13); migration applied to staging only once staging exists
- **Date:** 2026-10-13
- **Affects:** design/19-supabase.md, supabase/migrations/20261013144121_owner_registration_and_claims.sql, src/features/auth/

## Context
The contract excluded self-service accounts; owners were linked by a platform admin by email. The owner now wants business owners to self-register eventually. Linking by email alone is unsafe once sign-ups are open: anyone could register an owner's address first.

## Decision
An account proves control of an email inbox, never ownership of a business. Owner links come only from: (1) a platform admin, for a confirmed account; (2) a single-use claim link an admin issues for one business (random token, only its SHA-256 stored, 7-day expiry, a new link cancels the old one, carried in the URL fragment); (3) registering a NEW business, which the database creates as a draft (invisible to the public; only an admin can activate it), one pending registration per account, confirmed email required. Enforced in SECURITY DEFINER database functions and existing RLS; the UI is not a boundary. Production sign-ups stay off until the owner approves, with custom SMTP in place first.

## Consequences
- Good: no ownership by name or email match; admin approval gate before anything is public; tested in PGlite and (when available) on staging.
- Trade-off: claim links are only as safe as the channel the admin sends them through; a pending-claim token lives in one browser tab (sessionStorage), so confirming the email in another tab means reopening the link.

## Alternatives rejected
- Auto-link by matching the business contact email: contact emails are public and often shared.
- Supabase `inviteUserByEmail`: needs the service-role key in an Edge Function and SMTP; claim links work without either.
