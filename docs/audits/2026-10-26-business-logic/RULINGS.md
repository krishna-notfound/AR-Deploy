# Business-logic fixes: rulings (2026-10-26)

The owner asked to audit everything and then implement every fix. These are the rule decisions taken on the owner's
behalf where a finding had more than one reasonable fix. Each line: decision, and why. Duplicates are merged under the
first ID. Items marked **Deferred** are client decisions or known accepted risks; they are not built.

## Duplicates merged
APP-01 = MAIL-01 · PUB-01 = PROD-01 · PUB-02 = BIZ-03 · PUB-03 = PROD-06 (+ BIZ-04 same mechanism) · PUB-06 = BIZ-11 ·
APP-05 = MAIL-06 · BIZ-02 = TEAM-07 · TEAM-08 = MAIL-10 · ANA-01 = TEAM-10 · TEAM-02 = PROD-04 (+ TEAM-03, BIZ-06
storage part) · ANA-06 = BIZ-12 · APP-03 = BIZ-07 (+ LIVE L1) · TEAM-14 = MAIL-17 · APP-09 = MAIL-14 · APP-06 = LIVE L5.

## Rulings
1. **Rejection email (APP-01).** Rejecting an application emails the applicant in the application's language (EN/PT).
   The reviewer can tick "Include the reason" (off by default); without it the email gives no reason. Sent by a new
   Edge Function `review-application` that wraps `admin_review_application` (approve keeps its current path: the owner
   invitation is the approval notice). New email kind `application_decision`.
2. **Approved application whose business was deleted (APP-03).** It shows "Business deleted on <date>" instead of the
   business card, and the reviewer can **Reopen for review** (approved → under_review, only when `business_id is null`),
   audited.
3. **Possible duplicates (APP-04).** The reviewer is warned (not blocked) when the applicant email or the normalized
   business name matches an existing business or another approved/under-review application. The warning links to it.
4. **Owner invitation limit (APP-05).** A rolling limit of 10 sent attempts per 24 hours, per business, counting only
   attempts for the current owner and not counting `blocked` ones. The refusal says when the next attempt is allowed.
   The same check runs in provision and resend. Remove + re-invite no longer resets it.
5. **Owner acceptance (APP-02).** Any successful sign-in of an owner marks the membership accepted (idempotent), not
   only the /accept-invite page.
6. **Owners pending (APP-06, L5).** The businesses list shows "Needs owner" / "Invite pending" / "Owner active" per row.
7. **Closure vs owner removal (BIZ-01).** Removing (or replacing) a business owner voids that owner's open closure
   request for that business, audited (`account_closure_voided`); the business keeps its current status and the
   platform decides. The closure functions act only while the requester is still a member of that business.
8. **Closure visible to staff (BIZ-02).** Everyone with `businesses.view` sees "Closure requested on <date>", read-only.
   While a request is open, the database refuses setting the business to `active` except through the Owner's
   restore/cancel paths; the UI explains that only the Owner can restore or complete it.
9. **Unavailable catalog (PUB-02).** A new `public_catalog_state(slug)` (security definer, anon) returns only whether
   the address exists and is unavailable, plus the business name **only** when it was public before (inactive/paused,
   never for draft). The public page shows "This catalog is unavailable" for those, "not found" otherwise.
10. **Catalog and product address changes (BIZ-04, PUB-03).** Old addresses are remembered: a retired business slug is
    reserved for that business forever and redirects to the new slug; a retired product slug inside a business
    redirects to the product's new slug. A deleted business's slugs stay reserved (no other store can take them).
    Changing the slug of a published product asks for confirmation (like the business slug does).
11. **Permission prerequisites (TEAM-02, PROD-04, TEAM-03).** A permission implies the ones it needs, enforced in SQL
    (saving a role adds the prerequisites) and shown in the role editor ("includes …"). At least: `products.publish` and
    `products.delete` need `products.edit`; `businesses.delete` needs `businesses.edit` and `products.delete`;
    `businesses.status` needs `businesses.view`; every `*.edit` needs its `*.view`. Storage delete policies follow the
    delete permissions so deleting removes the files.
12. **Business deletion leftovers (BIZ-06).** The logo uploaded before the business exists is moved into the business
    folder after creation. A partial file sweep is reported in the toast ("deleted; N files could not be removed").
13. **Concurrent product edits (PROD-02).** Saves carry the `updated_at` they started from; a stale save is refused with
    "Someone else changed this product. Reload to see their changes." and no media cleanup runs for it.
14. **Unsaved uploads (PROD-03).** Files uploaded in the editor and not saved are deleted when the editor is closed or
    the upload is replaced (best effort). No background sweep (no scheduler); the remaining gap is documented.
15. **Default finish (PROD-09).** The first finish stays the default; the editor labels it "Default (shown first)" and
    says that reordering changes what visitors see first. No schema change.
16. **Time zones in analytics (ANA-02).** Day buckets and "last 30 days" follow the viewer's time zone preference
    (server query takes the time zone); dates use the date-format preference.
17. **Embed views (ANA-04).** Embed loads are counted and shown separately ("Embed views"); "Product page views" no longer
    includes them, and an embed visit that opens the product page counts once per surface. The AR rate is AR launches
    over (page views + embed views), capped wording ("per view"). Counting every view (not unique visitors) stays:
    that is open client decision "Analytics".
18. **Past views after deleting a product (ANA-11).** Analytics rows keep their business and survive product deletion
    (shown as "Deleted product").
19. **Recent activity (ANA-10).** Built from audit events (published, unpublished, paused, deleted…), so it can't claim
    "was published" for an unpublished product. Product publish/unpublish/delete are audited.
20. **Staff 2FA everywhere (TEAM-01).** `provision-owner`, `invite-member` (all actions) and `send-test-email` refuse a
    caller whose session does not satisfy the 2FA rule (same check as the database helpers).
21. **Removing a member (TEAM-04).** The Owner can **Remove** a deactivated member: the membership row is deleted, the
    login is deleted when it has no business membership, the audit keeps a hashed email. The address can then be
    invited or become a business owner.
22. **Staff email change (TEAM-05, MAIL-03).** An email change on `auth.users` is copied to `platform_members.email`
    (trigger), audited; staff alerts use the current address.
23. **Staff password length (TEAM-09).** `/join` requires 12 characters, like the rest of the app.
24. **Profiles visibility (TEAM-17).** Staff read a profile only with `members.view` (staff profiles) or for owners of
    businesses they can view. Everyone reads their own.
25. **Owner permissions (TEAM-18).** `my_platform_access` returns all 15 permissions for the Owner.
26. **Security activity privacy (MAIL-09).** `account_*` events of other people are readable only by the Owner; sign-in
    events are left out of the general History by default.
27. **Telling business owners (MAIL-11).** The owner gets an email when the platform pauses or reactivates their
    business, or unpublishes or deletes one of their products, and their dashboard shows a read-only "Changes by the
    platform team" list for their business.
28. **Deleted people and businesses in history (MAIL-08).** Audit rows snapshot the business name and an actor label at
    insert; the UI shows "Deleted user" / the business name instead of "System".
29. **Email failures shown (MAIL-02).** A bounced/complained/failed team invitation shows "Email failed" on the invite;
    a plain Email log page (`records.view`) lists every email with its status.
30. **Link previews (PUB-09).** Embed and preview URLs send `X-Robots-Tag: noindex`; pages set their own title and
    description in the browser. Server-rendered link-preview meta is **Deferred** (needs an edge renderer).
31. **Demo divergences (APP-13, BIZ-10, PROD-12, ANA-08/09, TEAM-19, MAIL-18).** The demo services follow the real rules
    (it is the test harness); fixed last.
32. **Docs (APP-12, PROD-05).** PRD, client guide and design docs corrected to the real behaviour.

## Deferred (not built)
- PROD-13 categories furniture-only vs multi-industry: client decision C10.
- ANA-05 view inflation / `X-Forwarded-For` keying: known SEC-03 and open "Analytics" decision.
- TEAM-20 Team's `products.edit` changes live products without review: owner decision; documented as is.
- PUB-09 server-rendered link-preview meta (see ruling 30).
- PUB-04 the up-to-12 h signed-URL window for already-open pages: accepted and documented; a refetch that returns
  not-found now replaces the stale page.

## Folded into S2, S3 and S4 (owner decision, 2026-10-26)
These findings sit in code that the upcoming projects rebuild, so they are fixed there, not in S1.5.
- **S2** (platform site controls, Business → Catalog & public page): PUB-02 = BIZ-03 (unavailable-catalog page, ruling 9); MAIL-02 part 2 (the Email log page; the "Email failed" status on team invitations stays in S1.5); MAIL-19 (admin inbox notice); PUB-09 per-page title and description (the `noindex` header stays in S1.5).
- **S3** (application form builder): APP-04 (duplicate warning, ruling 3), APP-11 (rate limit before the duplicate check), APP-09 = MAIL-14 (emails lost when an application save half-fails).
- **S4** (3D model requests): PROD-03 (unsaved uploads, ruling 14), ANA-03 (AR readiness per finish), PROD-12 (demo upload rules).

S3 cancelled by the owner on 2026-10-26; its findings are built in S1.5 Tasks 16–18.
