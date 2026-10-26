# 23 · Email (Resend)

Status 2026-10-20:
- **Applied and deployed** on the client project: the `email_log` migration and the `send-test-email` function.
- **Not set yet:** the Edge Function secrets. They need a client-org Administrator; until then the function answers `email_not_configured` with the missing names.
- **Verified:** a test email sent by `_shared/email.ts` was delivered, according to Resend's own record.
- There is no client domain yet, so sending uses Resend's test sender.

## How it works
- **Only server-side code sends email.**
  - Shared module: `supabase/functions/_shared/email.ts`. It calls the Resend REST API with `fetch` (no SDK, no new dependency) and uses the `Idempotency-Key` header against double sends.
  - Templates: `supabase/functions/_shared/email-templates.ts`. Owner invitation, invitation resend, application confirmation, admin notification and test, each in EN and PT. Inline-styled HTML plus text, inserted values escaped, links must be `https://`.
  - The Resend key is an Edge Function secret. It is never a `VITE_` variable and never reaches a browser.
- **Every attempt is logged** in `public.email_log` (migration `20261020084414_email_log`).
  - Only the service role writes; platform admins read.
  - `status` records evidence only:

| Status | Meaning |
|---|---|
| `blocked` | Refused before sending (invalid address, or a recipient the test sender cannot reach) |
| `failed` | Resend rejected the request, or the network failed; `error` holds the message |
| `accepted` | Resend returned a message id. **Not proof of delivery** |
| `sent`, `delivered`, `delayed`, `bounced`, `complained` | Only from Resend's own event data for that message id (webhook or lookup); a status only moves forward |

- Since migration `20261020091428`, each row also carries `application_id`, `workflow` (one logical email, e.g. `invite:<business id>` or `application:<id>:application_confirmation`) and `attempt` (1, 2, … for resends). The workflows themselves are in design/24.

**Limit found 2026-10-20:** a **sending-only** API key cannot read message status (`GET /emails/:id` answers "This API key is restricted to only send emails"). The server keeps the sending-only key (least privilege), so automatic delivery evidence needs a Resend webhook (step 5 below). Until then, the `status` action reports `provider_lookup_failed`, and delivery is checked in the Resend dashboard or through the Resend MCP.

- **Test endpoint `send-test-email`** is for platform admins only (JWT checked by the gateway and again in the handler):
  - `{action:"send", to, lang}` sends the test template.
  - `{action:"status", providerMessageId}` fetches Resend's `last_event` and updates the log.
- **Test workflow** (`scripts/email/check-resend.mjs`):
  - Direct with the key in `.env.qa`, or `--function` through the deployed function.
  - Prints Resend's evidence and never prints keys.
- **Planned for owner invitations** (Phase 2): the server creates the invite link with `auth.admin.generateLink({ type: 'invite', redirectTo })` and sends it through this module. Supabase's own mailer is not involved, so every invitation is logged with provider evidence.

## Restrictions while there is no domain
Resend docs: "403 error using resend.dev domain".
- The `resend.dev` test sender only delivers to **the email address of the Resend account** and to the simulation addresses: `delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev`.
- The guard in `recipientAllowed()` blocks other recipients up front and logs them as `blocked`, instead of collecting provider 403s.
- **Real owners and admins cannot receive email until a domain is verified.**
- Free plan: 100 emails a day, 3,000 a month, 10 requests a second.
- Supabase Auth's own emails (password reset, sign-up confirmation) still go through Supabase's built-in mailer. It only delivers to members of the client's Supabase organisation and is heavily rate-limited. They move to Resend SMTP once the domain is verified (below).

## Secrets and redirect URLs per environment
| Secret (Edge Functions) | Development / Preview | Production |
|---|---|---|
| `RESEND_API_KEY` | Resend key with "Sending access" | Separate key, ideally on the client's Resend account |
| `EMAIL_FROM` | `Sanctus <onboarding@resend.dev>` | `Sanctus <no-reply@mail.<client-domain>>` |
| `APP_BASE_URL` | The Preview URL | `https://<client-domain>` |
| `EMAIL_TEST_RECIPIENTS` | The Resend account's own email | Unused (any recipient allowed) |
| `ADMIN_NOTIFICATION_EMAIL` | The Resend account's own email | The client's admin inbox |

- **Supabase Auth → URL Configuration:**
  - Site URL = the production URL once it exists.
  - Additional redirect URLs must list each environment's `/login`, `/reset-password` and `/accept-invite` (owner invitations, ADR-0024). Preview URLs and the production domain are listed separately; Preview links never point at production.

## When the client has a domain
1. In Resend, add the domain, ideally a subdomain such as `mail.<client-domain>`, so the root domain's mail is unaffected.
2. The client adds the records Resend shows. **Copy the exact values from Resend; do not use these placeholders:**
   - DKIM: TXT at `resend._domainkey.mail…`
   - SPF: TXT at `send.mail…` (`v=spf1 include:amazonses.com ~all`)
   - Return path: MX at `send.mail…` pointing to Resend's feedback host
   - DMARC (recommended): TXT at `_dmarc.<client-domain>`, starting at `p=none` with a reporting address
3. Verify in Resend. Then:
   - change `EMAIL_FROM` to the domain sender
   - clear `EMAIL_TEST_RECIPIENTS`
   - set `APP_BASE_URL` to the production domain
4. **Supabase custom SMTP** (Authentication → Emails → SMTP settings):
   - host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key
   - sender `no-reply@mail.<client-domain>`, name "Sanctus"
   - Then brand the reset and confirmation templates in EN/PT, and raise the auth email rate limit.
5. **Webhook (built, ADR-0024):** in Resend → Webhooks, add `https://<project-ref>.supabase.co/functions/v1/resend-webhook` for the `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained` and `email.failed` events, then save its signing secret as the Edge Function secret `RESEND_WEBHOOK_SECRET`. The function refuses unsigned or stale requests and processes each event id once.
6. **Retention:** `email_log` holds recipient addresses (personal data). Agree a retention period with the client (compliance checklist, docs/PRODUCTION_AUDIT_AND_PLAN.md §5.4).
## S1.5 changes (ADR-0033)
- **Kinds.** `email_log_kind_check` allows the earlier nine kinds plus `application_decision` (rejection of an application, sent by `review-application`), `business_notice` (a platform change to a business, sent by `notify-business-owner`, workflow `business_notice:<audit id>`) and `team_notice` (a team member left, sent by `account-security`). All three have EN and PT templates in `_shared/email-templates.ts` (`team_notice` is English only).
- **Status ranks.** blocked 0, failed 1, accepted 1, sent 2, delayed 3, delivered 4, bounced 5, complained 5. `service_record_email_event` and `service_apply_provider_status` write only when the new status has a higher rank, or the same rank with a changed status. `opened`, `clicked`, `scheduled` and unknown events write nothing. A late `delivered` never replaces `bounced`.
- **Suppressed.** The Resend event `email.suppressed` maps to `bounced` with `error = 'suppressed'`. The webhook must be subscribed to it (runbook, "Business-logic fixes (S1.5)").
- **Events before their row.** An event that matches no `email_log` row is stored in `private.email_provider_events` with `applied = false`. A trigger on `email_log` applies pending events, oldest first, when the row's `provider_message_id` is set.
- **Team invitations.** A `bounced`, `complained` or `failed` event for a `team_invitation` row sets the member's newest `sent` invite to `email_failed`, and the Team pages show "Email failed".
- **Notices.** `account-security` actions `owner_reset_2fa`, `restore_closure` and `complete_closure` return `notice: {status, error?}`, and the toasts say "emailed" only when the status is `accepted`. A `blocked` send of an action code returns `email_blocked` and the dialog stops offering Resend.
- **Callers are gated.** `send-test-email` checks the 2FA rule and `is_platform_admin()` through the caller's token, and its status check goes through `service_apply_provider_status`.
