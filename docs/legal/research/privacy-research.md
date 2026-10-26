# Privacy Policy research: Sanctus platform (Portugal, EU, global baseline)

Status: research input for the client's lawyer, 2026-10-26. It is not legal advice and not the policy text. Every legal claim links to its source; "verify" marks a point taken from a secondary source or one that may change. Facts about the client (entity, address, contacts, retention choices) are not invented here. They are listed under "Facts the client must supply".

Code basis: branch `feature/sanctus-brand-design-system`, migrations up to `20261026041731_business_logic_fixes.sql`, Edge Functions in `supabase/functions/`. Production runs Supabase mode (`VITE_DATA_MODE=supabase`). Demo mode stores sample data only in the visitor's own browser and is out of scope for the policy, except where noted.

---

## A. Data inventory from the code

### A.1 Who the data is about (data subjects)

| Group | How they meet the platform |
|---|---|
| **Visitors** | Browse public catalogs and product pages, open 3D/AR, open embedded viewers (`/embed/*`) on third-party sites. No account. |
| **Applicants** | Fill in the public "apply" wizard (`src/features/apply/ApplyPage.tsx` → `submit-application` Edge Function). |
| **Business owners** | One owner account per business, created by platform staff (ADR-0024). They sign in to `/dashboard`. |
| **Platform staff** | Owner / Admin / Team roles (ADR-0029), `platform_admins` and `platform_members`. They sign in to `/admin`. |
| **Invitees** | People whose email (and for staff, name) is entered by someone else before they act (owner invitations, team invitations). |
| **People named in business contact details** | `businesses.contact_email/phone/address` are public. For a sole trader, or where a named employee's email is used, these are personal data. |
| **Email recipients** | Everyone above who gets a transactional email through Resend. |

### A.2 Inventory table

"Retention in code" says exactly what the code does. "None" means rows stay until someone deletes them, or until a cascade does.

| # | Data set (where) | Personal data fields | Whose | Purpose (from code/comments) | Who can read | Retention in code |
|---|---|---|---|---|---|---|
| 1 | `public.business_applications` (`20261020091428_applications_and_owner_access.sql` l.26–57; fields validated in `supabase/functions/_shared/application.ts` l.21–36) | business name, **applicant_name**, **applicant_email**, **applicant_phone** (optional), website, country, city, category, language, `answers` JSON (description, catalogue readiness, notes, **applicant role**), `submitter_hash`, `decision_reason`, `reviewed_by`, timestamps | Applicants | Review of the application, contact, de-duplication, rate limiting | Platform staff with `applications.view` (RLS). Applicants can't read their own row. | **None.** Rejected and approved applications are kept with no time limit. `business_id` is set to null if the business is deleted. Applicant fields are never removed. |
| 1a | `submitter_hash` (same table; computed in `supabase/functions/submit-application/handler.ts` l.38–40, 64) | `sha256("application|" + IP + "|" + salt)` | Applicants | Rate limit: 5 submissions per hour per hash | Staff (same RLS as row) | **None** (kept with the row). **Discrepancy:** the migration comment says "salted **daily** hash", but the code hashes no date, so the hash is a stable pseudonym of the IP. The salt is `APPLICATION_SALT`, or one derived from the service key (`submit-application/index.ts` l.4,13). |
| 2 | `public.businesses` contact fields (`20261012192143_init_schema.sql` l.22–41) | `contact_email`, `contact_phone`, `contact_address`, `contact_website`, name, logo | Businesses; individuals where a sole trader or named person | Public catalog contact block | **Public** (anon) when the business is `active` (`docs/SECURITY_REVIEW.md`, "Trust boundaries") | Until the business is deleted. Hard delete cascades to products, events and memberships (`System_arch/design/19-supabase.md` l.151). |
| 3 | `public.business_members` (`init_schema.sql` l.49–57, plus `invited_at` and `accepted_at` from `20261020091428…sql` l.20–22) | `user_id`, role, `invited_at`, `accepted_at` | Business owners | Links the owner account to the business (authorisation) | Owner (own rows), staff by permission | Cascades when the user or the business is deleted |
| 4 | `public.platform_admins` (`init_schema.sql` l.44–47) | `user_id` | Staff | Super admin role | Owner only | Cascade on user delete |
| 5 | `public.platform_members` (`20261025070915_platform_team_roles.sql` l.18–30) | **email**, **full_name**, role, status, `invited_by`, `activated_at`, `deactivated_at` | Staff and staff invitees | Team roles and invitations | Owner (RLS; see the migration notes in `20261026041731…sql` l.37–40) | Cascade on user delete. **A deactivated member row stays** (status only). No purge. |
| 5a | `private.platform_invites` (same file l.54–69) | `token_hash` (SHA-256 of the link secret), `last_email_result`, `created_by`, `revoked_by`, timestamps | Staff invitees | Single-use invitation links | Service role only | Cascade with the member row. No time-based purge (expiry is a column, not a deletion). |
| 6 | Supabase Auth `auth.*` (managed by Supabase, not in our migrations) | Email, password hash, sign-in timestamps, MFA factors, sessions. Supabase Auth also keeps its own session and audit records, which may include IP and user agent (**verify** for this project). | All account holders | Authentication, 2FA | Supabase; the Owner through the dashboard | Until the user is deleted. Supabase's own Auth audit log retention depends on the plan: 1 hour Free, 7 days Pro, 28 days Team ([Supabase pricing](https://supabase.com/pricing), **verify**). The project appears to be on Free, because `docs/SECURITY_REVIEW.md` says Pro-only features "stay off". |
| 7 | `public.profiles` (`20261025163627_account_settings.sql` l.21–34) | `display_name`, `avatar_path`, `timezone` (default Europe/Lisbon), date format, clock, `notify_new_applications`, onboarding timestamps | Account holders | Personalisation, notification opt-in | Own row. Staff only when their role needs it (`20261026041731…sql` l.37–40). | Cascade on user delete |
| 7a | Storage bucket `avatars` (`account_settings.sql` l.533–538) | Profile photo (JPEG/PNG/WebP, ≤512 KB, resized to 256 px in the browser) | Account holders | Profile photo | **Public bucket**: anyone with the URL | **Unclear.** No code in the account closure path (`supabase/functions/account-security/handler.ts` l.257–290) deletes avatar files. Whether Supabase removes them with the user is unverified (open question). |
| 8 | `public.audit_events` (`20261020091428…sql` l.70–90, extended in `account_settings.sql`) | `actor_id`. `metadata` may hold: **`ip`** (account events written by `account-security`, ≤64 chars, from `X-Forwarded-For`, `account_settings.sql` l.753–773; not stored for events about another person, handler l.375), **`user_agent`** (≤200 chars, `record_sign_in`, l.329–349), `subject_id`, `email_sha256` of a deleted user (**unsalted** SHA-256 of the lowercased email, handler l.395), business and application ids, status changes | Account holders, applicants (through `application_id`) | Security activity shown to the user (last 50), audit trail, abuse detection | The user reads their own `account_*` events (2FA-gated). Other people's `account_*` events: Owner only (`20261026041731…sql` l.24–26). Other events: staff by permission. | **None.** Append-only. `actor_id` is set to null when the user is deleted, but the metadata (IP, user agent, email hash) stays. Rows linked to an application are deleted only if the application is deleted (`on delete cascade`). |
| 9 | `public.email_log` (`20261020084414_email_log.sql`, extended in `20261020091428…sql` l.97–104) | **recipient** email, subject, status, provider error, `triggered_by`, `business_id`, `application_id` | Email recipients | Proof of what was sent and its delivery status | Platform admins | **None.** The file's own comment says "recipient is personal data: keep it only as long as needed (retention to be set with the client)" (l.9). See also `System_arch/design/23-email.md` §6. |
| 9a | `private.email_provider_events` (`20261020091428…sql` l.108–114) | Svix id, Resend message id, event type (no address) | Indirectly, email recipients | Idempotency for Resend webhooks | Service role | None |
| 10 | `public.product_analytics` (`init_schema.sql` l.147–156, plus `model_interaction` from `20261012200810…sql`) | `business_id`, `product_id`, `event_type` (`view`, `ar_activation`, `model_interaction`), `created_at`. **No visitor identifier.** | Visitors (only as aggregate counts) | Product statistics in the business and admin dashboards | Business owner (own business), staff | **None.** A 13-month proposal exists (`docs/PRODUCTION_AUDIT_AND_PLAN.md` §5.4) but is not implemented. Rows cascade when the product is deleted. |
| 10a | `private.analytics_hits` (`20261012200810_analytics_rate_limit.sql` l.41–47; function updated in `20261024065538_security_hardening.sql` l.183–196) | `visitor_key` = `sha256(network | UTC date | salt)`, where network is the IPv4 address or the IPv6 /64 prefix (`supabase/functions/track-event/handler.ts` l.32–55); `window_start` (minute); hit count | Visitors | Rate limit of 30 events per minute per visitor key | Service role only (private schema) | **About 1 hour, but not guaranteed:** rows older than 1 hour are deleted by an *opportunistic* cleanup that runs on about 2% of calls (`random() < 0.02`). On a low-traffic site, old keys can stay much longer. The salt is `ANALYTICS_SALT`, or one derived from the service key (`track-event/index.ts` l.19–20). The date in the hash makes keys change daily. |
| 11 | `public.account_closure_requests` (`account_settings.sql` l.815–823) | `user_id`, `business_id`, `requested_at`, previous status | Business owners | Two-step account closure | The user, staff with `businesses.view` | Deleted on completion or cancellation (l.910), and by cascade with the user |
| 12 | `private.action_codes` / `private.recovery_codes` (`account_settings.sql` l.558–590) | Salted SHA-256 of 6-digit codes and recovery codes, purpose, timestamps | Account holders | Step-up confirmation, 2FA recovery | Service role only | Action codes: expire after 10 minutes. Rows over 1 day old are deleted when the next code is created (l.614). Recovery codes: replaced or deleted on regeneration or redemption (l.684, 725). |
| 13 | Storage `business-logos` (public) and `product-media` (private, signed URLs) (`20261012192159_storage.sql`) | Normally not personal data. A logo or photo could show a person. | Businesses | Catalog content | Logos are public. Media are public only for published products. | Until deleted. Deleting a product leaves orphan files (`System_arch/design/19-supabase.md` l.130). |
| 14 | Edge Function memory | Raw IP from `X-Forwarded-For` (first entry) in `track-event`, `submit-application`, `account-security`, `accept-member-invite` (an in-memory per-IP limiter, `accept-member-invite/index.ts` l.17–29) | Visitors, applicants, account holders | Hashing and rate limits | n/a | Not persisted, except as described in rows 1a, 8 and 10a |

### A.3 What Resend (email processor) receives

`supabase/functions/_shared/email.ts` l.83–93 sends `from`, `to` (one address), `subject`, `html` and `text` to `https://api.resend.com/emails`. No open or click tracking options are set in the payload. Whether account-level tracking is off in the Resend dashboard needs checking (open question). Email kinds (`email.ts` l.3–17):

| Kind | Recipient | Personal data in the body (`_shared/email-templates.ts`) |
|---|---|---|
| `application_confirmation` | Applicant | No applicant-supplied text, by design (l.178) |
| `admin_notification` | Admin inbox, plus opted-in staff | Business name and **applicant email** (l.196, 202) |
| `owner_invitation` / `invitation_resend` | Owner invitee | Business name, a one-time code (expires in 1 hour) |
| `team_invitation`, `team_notice` | Staff | Invitation link and secret, notices |
| `security_code` | Account holder | A 6-digit code (expires in 10 minutes) |
| `security_notice`, `closure_request`, `application_decision`, `business_notice`, `test` | Various | Account and security notices. Decision emails may carry the decision reason (verify the template). |

Resend's EU sending region (`eu-west-1`) changes only where mail is sent from. Resend states that message content, delivery logs, webhook payloads and account records are stored in the **US** ([Resend: choosing a region](https://resend.com/docs/dashboard/domains/regions), [Resend GDPR page](https://resend.com/security/gdpr)). Resend webhooks (`supabase/functions/resend-webhook/`) send back delivery, bounce and complaint events, which update `email_log.status`.

### A.4 Browser storage used by the app (production, Supabase mode)

No `document.cookie` use anywhere in `src`. Storage found:

| Key | Storage | Set by | Content | When set | Lifetime |
|---|---|---|---|---|---|
| `sb-<project-ref>-auth-token` (supabase-js default) | localStorage | `src/services/supabase/client.ts` l.9 (`createClient` with defaults, so `persistSession` is on) | Access token (JWT: user id, email, aal) and refresh token | On sign-in (staff and owners only) | **Persists across browser restarts** until sign-out or expiry |
| `sanctus-password-check` | none (`persistSession: false`) | `client.ts` l.17–21 | — | — | not stored |
| `arfurn:sign-in-pending` | sessionStorage | `src/auth/AccountProvider.tsx` l.118 | Flag used to record the sign-in once | Sign-in | Tab session |
| `arfurn:invitePasswordSaved` | sessionStorage | `src/features/auth/AcceptInvitePage.tsx` l.152–165 | User id | Invitation acceptance | Tab session |
| `sanctus:apply:draft` | sessionStorage | `src/features/apply/ApplyPage.tsx` l.18, 48, 110, 168 | **The application draft: name, email, phone, answers** | While the wizard is filled in | Cleared on submit; otherwise ends with the tab |
| `arfurn:lang` | sessionStorage | `src/i18n/LanguageProvider.tsx` l.6, 38 | `en` or `pt` | When the user picks a language (the default follows `navigator.language`) | Tab session |
| `arfurn:arTipsDismissed` | localStorage | `src/features/public/ArTips.tsx` l.7, 24 | `1` | When a visitor dismisses the AR tips | Persistent |
| `arfurn:inAppNoticeDismissed` | sessionStorage | `src/features/public/InAppNotice.tsx` | `1` | When the in-app-browser notice is dismissed | Tab session |
| `arfurn:sidebar` | localStorage | `src/components/layout/DashboardShell.tsx` l.25, 60 | `0`/`1` | When a dashboard user collapses the sidebar | Persistent |
| `arfurn:reloadedForNewBuild` | sessionStorage | `src/main.tsx` l.8–11 | Timestamp | After a deploy, to avoid a reload loop | Tab session |
| `arfurn:account`, mock store, fail-rate key | localStorage | `AccountProvider.tsx` l.10; `src/services/mock/*`; `PlatformSection.tsx` | **Demo mode only** | Demo | Persistent |

The `track-event` endpoint uses no cookies and no browser storage (`track-event/handler.ts` l.18). However, the page's JavaScript sends a POST with the product id and event type for each view, AR launch and model interaction (`ProductPage.tsx`, `EmbedProductPage.tsx` l.97, 103). This matters for ePrivacy (see B.4).

### A.5 Third-party requests made from visitors' browsers

| Host | Why | Evidence | Personal data exposed |
|---|---|---|---|
| `fonts.googleapis.com`, `fonts.gstatic.com` (Google) | Web fonts (Cormorant Garamond, Jost, Inter) on **every page**, including `/embed/*` | `index.html` l.9–14; CSP `style-src`/`font-src` in `vercel.json` | IP, user agent, referer go to Google. Google says the Fonts API sets no cookies but receives IPs and logs requests ([Google Fonts privacy FAQ](https://developers.google.com/fonts/faq/privacy)). |
| `www.gstatic.com` | model-viewer's default Draco and KTX2 decoders, fetched **only if a model is Draco or KTX2 compressed** | `node_modules/@google/model-viewer/dist/model-viewer-module-umd.js` (`…/draco/versioned/decoders/1.5.6/`, `…/basis-universal/…`); no override in `src`; CSP `connect-src` allows it | IP and user agent go to Google |
| `*.supabase.co` | All catalog data, signed media URLs, Edge Functions | `vercel.json` CSP | IP and user agent are seen by Supabase (processor). API and database logs are kept 1 day on Free, 7 days on Pro ([Supabase pricing](https://supabase.com/pricing), verify). |
| Vercel edge network | Serves the app | `vercel.json` | IP, user agent, URL in Vercel request logs (processor) |
| Google Scene Viewer (Android), Apple Quick Look (iOS) | Native AR, started by the user (ADR-0021) | — | On Android, the model URL is handed to Google's app, which fetches the model. Google's own terms apply. Quick Look runs on the device. |
| `raw.githubusercontent.com`, `images.unsplash.com` | Sample data in demo mode only | `src/services/mock/seed.ts` l.19 | Demo only |

No analytics SDK, tag manager, ads or session replay is present (no such packages in `package.json`, and no such hosts in the CSP). The CSP is report-only (`vercel.json`).

### A.6 Processors and transfers (facts gathered)

| Vendor | Role | Where | Transfer mechanism (vendor's statement) |
|---|---|---|---|
| Supabase (contracting entity Supabase Pte. Ltd., Singapore; Supabase, Inc., US, for support) | Processor: database, Auth, Storage, Edge Functions | The project region the customer chooses (brief and `docs/PRODUCTION_AUDIT_AND_PLAN.md` §5.4: `eu-west-1` Ireland; **confirm for `zggylkbgajamhriebdrg`**). Account and billing data, support access, telemetry and CDN-cached storage may be processed outside the region. | **SCCs** (2021/914, Module 2 or 3) in the DPA. The DPA does not mention the DPF. Supabase notifies incidents "without undue delay … where feasible, within 48 hours" ([Supabase DPA](https://supabase.com/legal/dpa), [Data residency and transfers FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq), [Subprocessor list](https://supabase.com/legal/customer-resources/subprocessor-list)) |
| Vercel Inc. (US) | Processor: hosting and CDN | Global edge | **EU-US DPF certified**, plus SCCs in the DPA ([Vercel DPF](https://vercel.com/kb/guide/is-vercel-certified-under-dpf), [Vercel DPA](https://vercel.com/legal/dpa)) |
| Resend (US) | Processor: transactional email | Data stored in the US | **EU-US DPF and UK Extension certified**, and the DPA was updated for it ([Resend changelog](https://resend.com/changelog/data-privacy-framework-certification), [DPA](https://resend.com/legal/dpa), [subprocessors](https://resend.com/legal/subprocessors)) |
| Google (Fonts, gstatic) | Not under contract. Arguably an independent recipient, not a processor. | US / global | None in place. See B.4 and the recommendation to self-host. |

Check each certification on the official list before publishing: [dataprivacyframework.gov/list](https://www.dataprivacyframework.gov/list).

### A.7 Code facts the policy must not overstate

- `docs/SECURITY_REVIEW.md` says "analytics store no IP and no personal data". That is true of `product_analytics`. But `analytics_hits` holds a keyed hash of the IP for about an hour, and possibly longer (A.2 #10a), and the platform holds the salt. Hashing an IPv4 address with a known salt is easy to reverse by brute force. Under the CJEU's *EDPS v SRB* reasoning, pseudonymised data stays personal data for whoever can re-identify it ([C-413/23 P](https://curia.europa.eu/juris/liste.jsf?num=C-413/23)). IP addresses can be personal data ([C-582/14 Breyer](https://curia.europa.eu/juris/liste.jsf?num=C-582/14)). The policy should say "a short-lived pseudonymised key derived from the IP address", not "no personal data".
- `docs/PRODUCTION_AUDIT_AND_PLAN.md` §5.4 mentions "unique counts" from the hash. The code does **not** count unique visitors. The hash is used only for rate limiting.
- The deleted user's email in `audit_events` is an **unsalted** SHA-256, which is easy to match against a known address. It is pseudonymised, not anonymous.
- The application form's checkbox (`apply.f.consent`: "…agree that Sanctus may contact me about this application") is not a privacy notice. There is no privacy policy link anywhere in `src` today (grep `privacy|política` finds none).
- Portuguese copy is mixed: the UI is pt-PT ("contacte", "candidatura"), but email templates are pt-BR ("equipe", "você", "senha"). Choose the language variant for the policy deliberately (see open questions).
- `default_currency` allows `BRL` (`init_schema.sql` l.37), which suggests Brazilian businesses may be expected. That is relevant to LGPD (B.9).

---

## B. The law

### B.1 Instruments and authority

- **GDPR**, Regulation (EU) 2016/679: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **Lei n.º 58/2019** (national execution of the GDPR): [official PDF, DR 1.ª série n.º 151, 8 Aug 2019](https://files.dre.pt/1s/2019/08/15100/0000300040.pdf) · [DR page](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982).
  - Art. 3: the **CNPD** is the national supervisory authority.
  - Art. 13: when private entities must have a DPO (mirrors GDPR Art. 37).
  - Art. 16: consent of minors from **13 years**.
  - Art. 18: portability covers only data the person provided, in an open format where possible.
  - Art. 21: retention is the period set by law or, failing that, what the purpose needs. Data may be kept until limitation periods expire where needed to prove compliance with obligations (n.º 3). When the purpose ends, data is destroyed or anonymised (n.º 4).
- **The CNPD does not apply some provisions of Lei 58/2019** (Deliberação 2019/494, 3 Sept 2019), relying on the primacy of EU law. Secondary sources: [Garrigues](https://www.garrigues.com/en_GB/new/cnpd-issued-deliberation-deliberation-no-4942019-september-3-stating-they-will-not-apply-some), [VdA](https://www.vda.pt/xms/files/05_Publicacoes/2019/Flashes_Newsletters/Flash_VdA__CNPD_decide_desaplicar_algumas_disposicoes_da_Lei_de_Execucao_do_RGPD.pdf). Verify the article list against the primary text. None of the provisions cited above is reported among them.
- **ePrivacy**: Directive 2002/58/EC Art. 5(3) ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/oj)), transposed in Portugal by **Lei n.º 41/2004** ([DR](https://diariodarepublica.pt/dr/detalhe/lei/41-2004-480710)). Art. 5 was reworded by **Lei n.º 46/2012** ([DR](https://diariodarepublica.pt/dr/detalhe/lei/46-2012-174793)). Lei 41/2004 was amended again by Lei 16/2022; whether that changed Art. 5 is unverified.

### B.2 Lawful bases (GDPR Art. 6) mapped to our processing

[GDPR Art. 6(1)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

| Processing | Proposed basis | Note |
|---|---|---|
| Application review and contact (A.2 #1) | Art. 6(1)(b), steps at the applicant's request before a contract | Do not rely on the checkbox as "consent"; consent would be withdrawable and is the wrong tool. |
| Owner and staff accounts, profiles, 2FA, invitations, transactional email (#3–7, 9, 11, 12) | Art. 6(1)(b) contract (owners). For staff: contract, or employment / legitimate interests, depending on their status (client fact). | Staff who are employees are also covered by labour rules (Lei 58/2019 Art. 28). |
| Security logs: IP and user agent in `audit_events`, rate-limit hashes (#1a, 8, 10a, 14) | Art. 6(1)(f), network and information security ([GDPR recital 49](https://eur-lex.europa.eu/eli/reg/2016/679/oj)) | Needs a legitimate interests assessment (LIA) and a retention limit |
| Visitor product statistics (#10) | Art. 6(1)(f) as far as the GDPR is concerned. ePrivacy may separately require consent (B.4). | LIA in B.6 |
| Public business contact details (#2) | Art. 6(1)(b) (the business's contract) or (f) | Tell owners that these fields are public |
| Keeping audit and email logs after an account closes | Art. 6(1)(f) or (c), legal claims and accountability; Lei 58/2019 Art. 21(3) | The period must be stated |
| Google Fonts (A.5) | No sound basis identified: an IP transfer to Google without consent. A German court held this unlawful ([LG München I, 20.01.2022, 3 O 17493/20](https://www.gesetze-bayern.de/Content/Document/Y-300-Z-BECKRS-B-2022-N-612)). This is not binding in Portugal but widely followed. | **Recommend self-hosting the fonts and decoders**, which removes the issue (Google's own FAQ suggests self-hosting). |

### B.3 Information duties (Arts. 12–14) and rights (Arts. 15–22)

- **Art. 13** content, required when data is collected from the person ([GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)):
  - controller identity and contact details; DPO contact if there is one
  - purposes and lawful basis, and the legitimate interests relied on
  - recipients or categories of recipients
  - transfers and the safeguard used
  - retention periods or the criteria for them
  - the rights in Arts. 15–22, the right to withdraw consent, and the right to complain to a supervisory authority
  - whether providing the data is a statutory or contractual requirement and what happens if it is not provided
  - automated decision-making
- **Art. 14** applies where data comes from someone else: staff invitees entered by the Owner, owner invitees, and people named in business contact details. Their information must be given within one month, or at first contact.
- **Art. 12**: the notice must be concise, transparent and in plain language. Requests are answered within **one month**, extendable by two months, and free of charge. The EDPB-endorsed transparency guidelines: [WP260 rev.01](https://ec.europa.eu/newsroom/article29/items/622227).
- **Rights**: access (15), rectification (16), erasure (17), restriction (18), portability (20; limited by Lei 58/2019 Art. 18 above), objection (21, especially to the (f)-based processing), and the Art. 22 safeguard. Application decisions are made by people, not automatically, so the policy can say so. The CNPD's guidance to citizens: [cnpd.pt/cidadaos/direitos](https://www.cnpd.pt/cidadaos/direitos/).
- **Complaint route**: the CNPD's "Participações" forms at [cnpd.pt/cidadaos/participacoes](https://www.cnpd.pt/cidadaos/participacoes/). Use the general form for matters other than spam, video surveillance or biometrics. Address: to be taken from cnpd.pt at drafting time.

### B.4 ePrivacy / cookies in Portugal

- **The rule**: storing information on, or reading it from, the user's device needs prior consent based on clear and complete information. The exceptions are storage whose sole purpose is to transmit a communication, and storage *strictly necessary* for a service the user has expressly requested (Lei 41/2004 Art. 5, as amended by [Lei 46/2012](https://diariodarepublica.pt/dr/detalhe/lei/46-2012-174793); Directive Art. 5(3)). Consent has the GDPR meaning.
- **localStorage and sessionStorage are covered**, not just cookies ([EDPB Guidelines 2/2023 v2.0](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en), ¶44 lists "cookies, local storage, WebSQL").
- **Which exemptions apply to our keys** ([WP29 Opinion 04/2012, WP194](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf)):

  | Our key | WP194 category | Exempt? |
  |---|---|---|
  | `sanctus:apply:draft`, `arfurn:sign-in-pending`, `arfurn:invitePasswordSaved` | "user-input" / session (§3.1) | Likely exempt |
  | `arfurn:lang` (sessionStorage) | "UI customisation, … language preference" (§3.6), set when the user picks a language | Exempt |
  | `arfurn:arTipsDismissed`, `arfurn:sidebar`, `arfurn:inAppNoticeDismissed` | UI customisation set by a user click. WP194 limits the persistent form to "a session (or slightly more)". These localStorage keys persist indefinitely. | Low risk; counsel should confirm, or the code could add an expiry or move them to sessionStorage |
  | Supabase auth token in **localStorage that persists across browser sessions** | WP194 §3.2: authentication storage is exempt "for the duration of a session", but "**persistent login cookies which store an authentication token across browser sessions are not exempted**"; WP194 suggests a "remember me" checkbox as consent | **Gap.** Options: session-only storage by default, a "keep me signed in" choice, or counsel accepts the risk for a B2B login. This is a code change and needs an owner decision. |

- **The analytics beacon**: the EDPB says JavaScript that "instructs the browser of the user to send asynchronous requests with the targeted information" falls within Art. 5(3) ([EDPB 2/2023 ¶33](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en)). IP-based tracking can also be in scope (¶54–56), although the guidelines leave exemptions open. WP194 notes that first-party analytics are **not** covered by the exemptions, though low-risk. Portugal has no published CNPD audience-measurement exemption (unlike France's CNIL), as far as was found; a 2021 summary reported no CNPD cookie guidance ([Bird & Bird cookie review, Portugal](https://cm.twobirds.com/en/trending-topics/global-cookie-review/portugal), verify for updates). So counting product views from the browser *may* need consent in Portugal. **This is a key question for counsel** (see Open questions).
- **No cookie banner today**: the app sets no cookies. If counsel concludes that only exempt storage is used, a notice (a "cookies and storage" section in the policy) is enough. If the beacon or persistent login needs consent, a consent mechanism must be built.
- **Reform watch**: the Commission's "Digital Omnibus" (Nov 2025) proposed moving device-access rules into the GDPR (Art. 88a/88b). Reports say the Council removed these and kept the rules in ePrivacy Art. 5(3) ([Osborne Clarke](https://www.osborneclarke.com/insights/digital-omnibus-reshapes-eu-cookie-rules-leaves-banner-fatigue-largely-intact), secondary; [EDPB-EDPS Joint Opinion 2/2026](https://www.edpb.europa.eu/system/files/documents/2026-02/edpb_edps_jointopinion_202602_digitalomnibus_en.pdf)). It is not law yet. Draft against the current rules.

### B.5 Controller, processor and joint controllership

- **Tests**: [EDPB Guidelines 07/2020](https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf). Joint controllership means joint participation in determining purposes and means. Using a common platform does not by itself make the parties joint controllers.
- **The platform (Sanctus entity) is controller** for: applications, all accounts and profiles, security and audit logs, the email log, the analytics pipeline (it alone designs `track-event` and decides what is collected), and the public catalog infrastructure.
- **Visitor analytics**: businesses receive only aggregate counts (no identifiers) and set no parameters. That distinguishes them from the Facebook fan-page administrator in [C-210/16 Wirtschaftsakademie](https://curia.europa.eu/juris/liste.jsf?num=C-210/16), who was a joint controller because they set parameters for the statistics. **Recommendation**: the platform is sole controller, and the policy says so. Counsel should confirm.
- **Embedded viewers (`/embed/*`)**: a business that embeds the viewer on its own site causes the visitor's browser to contact Sanctus, Google Fonts and Supabase. Under [C-40/17 Fashion ID](https://curia.europa.eu/juris/liste.jsf?num=C-40/17), the embedding site operator can be **joint controller for the collection and transmission stage only**. **Recommendation**: the business Terms should state this and require the embedding business to mention the embed in its own privacy notice. An Art. 26 arrangement may be needed (counsel).
- **Business content**: businesses decide the contact details and catalog content they publish. For personal data in that content (a named contact person, photos of people), the business is controller and the platform hosts it as **processor** (an Art. 28 clause in the business Terms or DPA), or as controller of the publication. Counsel to choose; the Terms must match.
- **Vendors**: Supabase, Vercel and Resend are processors under their DPAs. [GDPR Art. 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj) needs a written contract, which their click-through DPAs supply. Confirm each DPA is accepted for the client's own accounts, not the developer's (see facts below).
- **Art. 30 records**: the exemption for under 250 staff does not apply where processing is not occasional ([GDPR Art. 30(5)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Account and log processing here is continuous, so a record of processing activities is advisable or required. Section A of this file is a starting point.

### B.6 Legitimate interests assessment: visitor analytics and security logs

Follows the three-step test in [EDPB Guidelines 1/2024](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf): a legitimate interest, necessity, and balancing, documented before processing.

1. **Interest**
   - Platform: protecting a public, unauthenticated endpoint against abuse (recital 49 security).
   - Platform and businesses: knowing which products are viewed or launched in AR, to run and improve the catalog service.
2. **Necessity**
   - `product_analytics` rows hold no identifier. The IP is used only in memory to derive a key.
   - The key mixes in a server secret and the UTC date, so it changes daily and cannot be linked across days.
   - IPv6 is cut to /64.
   - Aggregates only are shown to businesses.
   - Weak points to fix or disclose:
     - (a) The cleanup of `analytics_hits` is probabilistic, so the 1-hour retention is not guaranteed.
     - (b) An IPv4 key can be reversed by whoever holds the salt.
     - (c) Supabase and Vercel request logs also hold raw IPs for their log retention period.
3. **Balancing**
   - No cookies, no cross-site tracking, no profiling, no sale.
   - Visitors reasonably expect a public catalog to count page views.
   - Low impact.
   - An objection route (Art. 21) must be described.
   - **The result depends on the ePrivacy answer** (B.4). The GDPR LIA cannot cure an Art. 5(3) consent requirement.

**Security logs** (IP and user agent on account events): the interest is account security and showing users their own sign-in activity. These are necessary, and users can see them. **No retention limit exists, so one must be set** (for example 12 months, as a client choice) and implemented.

**Applicant `submitter_hash`**: necessary only for the 1-hour rate limit, yet kept forever and not rotated daily. Recommend nulling it after the rate-limit window, or disclosing it.

### B.7 Transfers outside the EEA (Arts. 44–49)

- **Adequacy**: the EU-US Data Privacy Framework ([Commission Implementing Decision (EU) 2023/1795](https://eur-lex.europa.eu/eli/dec_impl/2023/1795/oj)) covers transfers to certified US organisations ([GDPR Art. 45](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Vercel and Resend state they are certified (A.6).
- **Litigation**: the General Court upheld the DPF on 3 Sept 2025 ([T-553/23 Latombe](https://curia.europa.eu/juris/liste.jsf?num=T-553/23)). An appeal is pending at the Court of Justice as C-703/25 P ([WilmerHale summary](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework), secondary; check [curia](https://curia.europa.eu/juris/liste.jsf?num=C-703/25)). The policy should name a fallback: the SCCs that both vendors' DPAs also include.
- **SCCs**: [Commission Implementing Decision (EU) 2021/914](https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj) ([GDPR Art. 46(2)(c)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Supabase relies on SCCs for Singapore and the US, with a transfer impact assessment (A.6).
- **Google Fonts and gstatic**: no transfer safeguard is in place for the visitor's IP. Self-hosting removes the transfer.
- **The policy must state**: which recipients are outside the EEA, the mechanism (adequacy/DPF or SCCs), and how to get a copy (Art. 13(1)(f)).

### B.8 DPO, representative, breach notification

- **DPO is likely not mandatory.** GDPR Art. 37(1) and Lei 58/2019 Art. 13 require one only where core activities consist of regular and systematic monitoring on a large scale, or large-scale special-category or criminal data. Lei 58/2019 Art. 12 makes it mandatory only for public entities. Sanctus processes B2B account data and non-identifying analytics, with no profiling and no special categories ([GDPR Art. 37](https://eur-lex.europa.eu/eli/reg/2016/679/oj); [WP243 DPO guidelines](https://ec.europa.eu/newsroom/article29/items/612048) on "core activities", "large scale" and "regular and systematic monitoring"). A voluntary DPO is allowed, but then all the DPO rules apply. If none is appointed, the policy gives a privacy contact instead.
- **EU representative (Art. 27)**: not needed if the controller is established in Portugal. It would be needed if the operating entity is outside the EU (a client fact).
- **Breach**:
  - Notify the CNPD within **72 hours** of becoming aware, unless the breach is unlikely to result in a risk ([GDPR Art. 33](https://eur-lex.europa.eu/eli/reg/2016/679/oj)), using the CNPD form ([CNPD breach page](https://www.cnpd.pt/organizacoes/outras-obrigacoes/violacao-de-dados-ou-data-breach/), [form](https://www.cnpd.pt/databreach/)).
  - Inform individuals without undue delay if the risk is high (Art. 34).
  - Document every breach (Art. 33(5)).
  - [EDPB Guidelines 9/2022](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en) cover phased notification.
  - Supabase's DPA promises notice within 48 hours where feasible (A.6). The runbook should name who decides and who notifies.
  - The policy need not describe the procedure, but it is good practice to say breaches are handled under Arts. 33–34.

### B.9 Global baseline

| Regime | Applies? | Why | Recommendation |
|---|---|---|---|
| **UK GDPR** | Only if Sanctus offers services to people in the UK or monitors them there ([UK GDPR Art. 3](https://www.legislation.gov.uk/eur/2016/679/article/3); [ICO: who it applies to](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/who-does-the-uk-gdpr-apply-to/)). EU targeting criteria: [EDPB Guidelines 3/2018](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en). | EN/PT, EUR/BRL/USD, Portugal-based approvals. UK targeting is not evident. | No UK-specific sections. If UK businesses are onboarded, check the need for a UK representative ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/receiving-personal-information-from-the-eea/)). Keep the rights text general enough to cover UK readers. |
| **CCPA/CPRA** (California) | Very likely **not**. It applies to for-profit businesses doing business in California that meet one of: over **$25M revenue (CPI-adjusted to $26,625,000 from 1 Jan 2025)**, buying, selling or sharing personal information of **100,000+** consumers or households, or **50%+** of revenue from selling or sharing ([Cal. Civ. Code §1798.140(d)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140); adjusted figure per [Jackson Lewis](https://www.jacksonlewis.com/insights/navigating-california-consumer-privacy-act-30-essential-faqs-covered-businesses-including-clarifying-regulations-effective-1126), verify against the CPPA). | No sale or sharing, small scale | Add one sentence: "We do not sell or share personal information" (true per A.5). No CCPA section. |
| **LGPD** (Brazil, Lei 13.709/2018) | **Possibly.** Art. 3 applies where processing aims to offer goods or services to, or process data of, people in Brazil, or where data is collected in Brazil ([Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)). The BRL currency option and Portuguese copy suggest Brazilian businesses or visitors. | Depends on whether Sanctus onboards Brazilian businesses | If yes: a short LGPD annex listing legal bases (Art. 7), rights (Art. 18), the *encarregado* contact (Art. 41) and the ANPD as authority. International transfers need an LGPD mechanism. ANPD Resolution CD/ANPD 19/2024 standard clauses were mandatory from 23 Aug 2025 ([Lefosse summary](https://lefosse.com/noticias/transferencia-internacional-de-dados-prazo-para-adocao-das-clausulas-padrao-da-anpd-se-encerra-em-23-de-agosto/), secondary). Consider a pt-BR version. |
| Others (Swiss FADP etc.) | Not evident | — | General "wherever you are, these rights apply" wording |

**Recommendation**: one GDPR-standard policy in **pt-PT and EN**. It applies to everyone. Add short annexes only where a real market exists: LGPD now if Brazil is in scope, UK later.

---

## Required clause → legal basis → what our text must say

| Required clause | Legal basis | What our text must say (based on Section A) |
|---|---|---|
| Who we are / controller | GDPR Art. 13(1)(a) | Legal entity name, NIPC, registered address, privacy email (client facts). That Sanctus is the controller for platform data. |
| DPO or privacy contact | Art. 13(1)(b); Art. 37; Lei 58/2019 Art. 13 | "We have not appointed a DPO (not required); contact …", or the DPO's contact details |
| Scope and roles | Arts. 4(7), 26, 28; EDPB 07/2020 | Covers visitors, applicants, business owners and staff. Businesses decide the content they publish. Embedding businesses are responsible for their own sites. |
| Data we collect, per group | Arts. 13(1)(c), 14(1)(d) | **Visitors**: IP (transient), a daily-rotating pseudonymised key (≈1 h), product view, AR and 3D events without identifiers, device storage for preferences. **Applicants**: the A.2 #1 fields, an IP-derived key. **Accounts**: email, name, photo, preferences, 2FA data, security activity (sign-in time, device/browser, IP). **Email**: address, subject, delivery status. |
| Purposes and lawful bases | Arts. 6, 13(1)(c)–(d) | Table per B.2. Name the legitimate interests: security, abuse prevention, aggregate product statistics. |
| Public information | Art. 13 transparency | Business contact details and logos are public on the catalog. Profile photos are stored at a public URL (A.2 #7a). |
| Recipients / processors | Art. 13(1)(e); Art. 28 | Supabase (hosting, database, auth, storage; EU region), Vercel (hosting/CDN), Resend (email). Google (fonts, 3D decoders), unless self-hosted. Google Scene Viewer or Apple Quick Look when the user starts AR. Businesses receive only aggregate statistics. |
| International transfers | Arts. 13(1)(f), 44–46; Dec. 2023/1795; Dec. 2021/914 | US (Vercel, Resend: DPF + SCCs), Singapore and US support (Supabase: SCCs), Google (if not self-hosted). How to get a copy of the safeguards. |
| Retention | Art. 13(2)(a); Lei 58/2019 Art. 21 | Per data set: rate-limit keys ≈1 h, action codes ≤1 day, accounts until closure, applications X, audit and security logs X, email log X, analytics X. The X values are client decisions; today the code has no limit (A.2). |
| Rights | Arts. 12, 15–22; Lei 58/2019 Art. 18 | List the rights, how to exercise them (privacy email), one-month response time, free of charge, identity check. Objection to legitimate interests. Portability limited to data the person provided. |
| Complaint to the CNPD | Art. 13(2)(d); Lei 58/2019 Art. 3 | CNPD name, website, complaint route [cnpd.pt/cidadaos/participacoes](https://www.cnpd.pt/cidadaos/participacoes/); the right to complain in one's EU country of residence too (Art. 77) |
| Statutory or contractual requirement | Art. 13(2)(e) | Application and account fields are needed to review the application or run the account. Optional fields are marked. |
| Automated decisions | Arts. 13(2)(f), 22 | None. Application decisions are made by people. |
| Children | Art. 8; Lei 58/2019 Art. 16 | The service is for businesses. Accounts are for adults acting professionally. No consent-based processing of children's data. |
| Cookies and device storage | Lei 41/2004 Art. 5 (as amended by Lei 46/2012); ePD Art. 5(3) | No cookies. List the storage keys from A.4 and their purposes. Explain the sign-in token and the consent position decided by counsel (B.4). |
| Security | Arts. 5(1)(f), 32 | Summary: EU hosting, encryption in transit, row-level access controls, 2FA, hashed codes. No absolute promises. |
| Breach | Arts. 33–34 | Optional sentence: we notify the CNPD and affected people as the law requires |
| Changes to the policy | Art. 12 (transparency) | Version date. How material changes are announced (email to account holders). |
| Language | Art. 12 (intelligibility) | pt-PT and EN versions with equal standing, or one prevailing version (counsel). |
| LGPD annex (if Brazil is in scope) | LGPD Arts. 3, 7, 18, 33, 41 | Bases, rights, *encarregado*, ANPD, transfer mechanism |

---

## Facts the client must supply

1. **Legal entity**: full name and legal form (Lda., Unipessoal Lda., S.A., or other), **NIPC**, registered office address, Conservatória registration if they wish to show it.
2. **Country of establishment** of the entity that operates Sanctus. If outside the EU, an Art. 27 representative is needed.
3. **Privacy contact email**, and whether it differs from general support. A postal address for rights requests.
4. **DPO**: appointed or not. If appointed, name or role and contact.
5. **Retention choices** (each must be implemented in code afterwards):
   - (a) approved, rejected and withdrawn applications
   - (b) `audit_events` security activity (IP and user agent)
   - (c) `email_log`
   - (d) `product_analytics` (13 months was proposed)
   - (e) data after account closure (audit, email log)
   - (f) inactive or deactivated staff records
   - (g) backups (the Supabase plan sets this)
6. **Markets**: EU only? Brazil (onboarding Brazilian businesses or using BRL)? UK? This drives the LGPD and UK annexes and the pt-BR version.
7. **Vendor accounts and DPAs**: confirm that the Supabase, Vercel and Resend accounts are held by the client's entity, and that each DPA is accepted in the client's name. Confirm the **Supabase project region** for `zggylkbgajamhriebdrg`, and the **Supabase plan** (log retention).
8. **Resend**: sending domain, sender address, region, and whether open and click tracking are off in the dashboard.
9. **Staff status**: are platform staff employees, contractors or the founders? This decides the lawful basis and whether a separate employee notice is needed.
10. **Fonts and decoders**: approve self-hosting Google Fonts and the model-viewer decoders. This is a code change, but no new dependency is needed.
11. **Business Terms**: whether the business Terms will include a DPA/Art. 28 clause and embed obligations (B.5).
12. **Production domain(s)** where the policy will be published, and where it will be linked: footer, apply form, sign-in, emails.
13. **Language** of the authoritative version (pt-PT and/or EN).
14. **Breach owner**: who at the client decides on and files CNPD notifications.

---

## Open questions (for counsel unless marked "code")

1. **Analytics beacon and consent** (B.4): does the JavaScript `track-event` POST fall within Lei 41/2004 Art. 5 under EDPB 2/2023 ¶33, and if so, does any exemption apply in Portugal? If not: consent, or switch to server-side counting (code).
2. **Persistent sign-in token** (B.4): does the localStorage session that survives browser restarts need consent ("keep me signed in") under WP194 §3.2? Code options: session storage by default, or a checkbox.
3. **Persistent UI keys** (`arfurn:arTipsDismissed`, `arfurn:sidebar`): are they acceptable as exempt UI customisation without an expiry?
4. **Google Fonts and gstatic**: confirm the recommendation to self-host. Until then, what lawful basis, if any, does counsel accept?
5. **Roles**: is the platform sole controller for visitor analytics (recommended)? Is the embedding business joint controller for the embed stage (Fashion ID)? Is the platform controller or processor for personal data in business content?
6. **Retention not enforced in code** (code): `analytics_hits` cleanup is probabilistic. No purge exists for applications, audit events, the email log or analytics. `submitter_hash` is permanent and not daily (contrary to the migration comment). The policy must not promise periods the code does not enforce.
7. **Account closure completeness** (code): avatar files in the public `avatars` bucket are not removed by the closure flow. `email_log` and `audit_events` keep the address and IP (pseudonymised email for deleted users, unsalted SHA-256). Confirm what the policy promises on erasure.
8. **Pseudonymisation wording**: the IP-derived keys and the unsalted email hash are personal data for Sanctus. Agree the wording ("pseudonymised", not "anonymous").
9. **Application form** (code and copy): replace or supplement the "agree that Sanctus may contact me" checkbox with a link to the privacy notice at the point of collection (Art. 13). Avoid presenting it as consent.
10. **Public avatars**: should profile photos be public URLs, or move to a private bucket? Disclose either way.
11. **Rights tooling**: there is no self-service export. Access and portability requests will be handled by staff (SQL or RPC, per `docs/PRODUCTION_AUDIT_AND_PLAN.md` §5.4). Is a manual process within one month acceptable to the client?
12. **DPF fallback wording** while the Latombe appeal (C-703/25 P) is pending.
13. **LGPD**: is Brazil in scope now? If so: *encarregado*, ANPD standard clauses for transfers, and a pt-BR text. The email templates are already pt-BR.
14. **Lei 41/2004 after Lei 16/2022**: confirm the current consolidated text of Art. 5.
15. **CNPD Deliberação 2019/494**: confirm that none of the disapplied provisions affects the clauses above.
