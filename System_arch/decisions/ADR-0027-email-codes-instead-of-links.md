# ADR-0027: Email codes instead of links for invitations and password reset
- **Status:** Accepted
- **Date:** 2026-10-24
- **Affects:** design/19-supabase.md, design/23-email.md, ADR-0024

## Context
Owner invitations and password resets sent a one-time sign-in link. Mail scanners (Outlook Safe Links, corporate filters) and in-app browsers can open such a link first and use it up, or open it in a browser where the owner is not working. The owner asked for codes instead of links.

## Decision
- **Invitations:** `provision-owner` takes only the `email_otp` from `auth.admin.generateLink` ('invite' for a new account, 'magiclink' once it is confirmed) and discards the action link. The email shows the code and links to the plain `/accept-invite` page, with no token. The owner types their email and the code; the page calls `verifyOtp` with type `'email'`, which accepts both kinds of code. The code is never returned, stored or logged.
- **Password reset:** the hosted Auth recovery template shows `{{ .Token }}` and no link. On `/reset-password`, the person enters the code, which the page verifies with `verifyOtp` type `'recovery'`. They then set the new password as before. They can ask for a new code or use a different email.
- **Code shape:** 8 digits (`mailer_otp_length`), expiring after 1 hour (`mailer_otp_exp`). The email copy says "an hour", so changing the expiry means changing that copy. A new code replaces the old one.
- **Old links:** links from invitations sent before this decision still land on `/accept-invite`. An expired or used one shows a notice that points to the code.

## Consequences
- Good: scanners can't use up a code, and the owner can read the code on one device and type it on another.
- Good: no token appears in URLs, browser history or logs.
- Trade-off: one more step (typing the code), and invitations still expire after 1 hour. The admin resends from the business page.
- Trade-off: 8-digit codes rely on Supabase's verify rate limit (30 per 5 minutes per IP) against guessing.

## Alternatives rejected
- Keep links and add a code: two ways in, and the link problem stays.
- Longer expiry for invitations only: Supabase has one OTP expiry for all email codes.
