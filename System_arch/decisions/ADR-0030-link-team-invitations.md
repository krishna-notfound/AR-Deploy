# ADR-0030: Link invitations for platform team members
- **Status:** Accepted
- **Date:** 2026-10-25
- **Affects:** ADR-0027 (business-owner invitations keep their codes), design/23-email.md
- **Spec:** `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md` §5

## Context
ADR-0027 switched business-owner invitations to typed codes, because mail scanners open sign-in links first and use them up. For platform team members, the owner wants the person to click a link, land on a page and create their account there.

## Decision
- **The secret:**
  - the server makes 32 random bytes (base64url);
  - only `sha256(secret)` is stored, in `private.platform_invites`, which the API roles can't read at all;
  - the secret is never returned to the app, logged or put in the audit log.
- **The link:** `https://<site>/join#t=<secret>`. The secret is in the URL fragment, so it never reaches the hosting provider's logs or the referrer header; the page removes it from the address bar after reading it.
- **Opening the link uses nothing.** The page asks the server to *inspect* the invitation (email, role, inviter, expiry). Only pressing **Create account** (or **Accept** for an existing login) uses it up. Scanners that open links therefore can't consume the invitation, which was the problem ADR-0027 solved with codes.
- **Accepting:** the server creates the login with the email marked confirmed (receiving the link proves control of the address). It then activates the membership and marks the invitation used, all at once.
  - If a login already exists for that email, the person signs in first.
  - The server then checks that the signed-in email matches the invited email.
- **Limits:**
  - one use only;
  - expires after 7 days;
  - a new invitation or a resend revokes the previous one;
  - at most 5 invitations per member per rolling hour;
  - inspecting is rate-limited per IP.
- **No "copy link":** only the hash is stored, so no one, the Owner included, can see a sent link again.

## Consequences
- Good: one click for the person invited, and nothing usable is stored or logged.
- Trade-off: two different invitation styles exist, links for team members and codes for business owners. Each email says what to do.
- Trade-off: a lost email means a resend, because a sent link can't be retrieved.

## Alternatives rejected
- **Supabase's own invite or magic link:** consumed on the first GET, and stored in Supabase's logs and URLs.
- **Codes, as in ADR-0027:** the owner asked for a link for team members.
