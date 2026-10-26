**DRAFT — to be reviewed and approved by the client's lawyer before publication.**

Last updated: [[DATE]]

# Legal page drafts: Privacy Policy and Terms

These are drafts for the client's lawyer. No lawyer has reviewed or approved them. They are based on `docs/legal/research/privacy-research.md`, `terms-research.md` and `benchmark.md` (all dated 2026-10-26), and on the code inventory in those files.

## What each draft covers

| File | Covers |
|---|---|
| `privacy-policy.en.md` / `privacy-policy.pt-PT.md` | One GDPR policy for every group: visitors, applicants, business owners, platform team members, invited people, people named in catalogs. Data, purposes and legal bases per group (tables); what is public; every browser storage item (no cookies); processors and transfers; a retention table; rights; CNPD complaints; security; children; embedded viewers; changes. |
| `terms.en.md` / `terms.pt-PT.md` | One document. Legal-notice block (DL 7/2004 art. 10, CSC art. 171) and acceptance by "I agree" ticks. **Part A** (everyone): what Sanctus is, use rules, the AR accuracy and safety notice (informs, does not exclude), liability to visitors with the consumer carve-out. **Part B** (businesses): application and start of contract (DL 7/2004 art. 28), the content licence listing each use (CDADC art. 41), business promises, acceptable content, moderation with statements of reasons and notice (DSA art. 17, P2B art. 4), P2B ranking/data/channels, closure, liability within DL 446/85 limits. **Part C** (common): notice-and-action "Report content" channel (DSA art. 16), DSA points of contact (arts. 11–12), changes with notice, Portuguese law and courts with the consumer carve-out, language, general clauses. |

**Conventions.** `[[TOKEN]]` marks a fact the client or counsel must supply (40 tokens, listed below). Italic "Drafting note" blocks are for counsel and must be removed before publication. The PT and EN texts mirror each other section by section; keep them in step and give both the same date and version.

**Drafting choices to confirm** (not facts about the client): 30 days' notice for changes to the Business Terms (P2B minimum is 15); human-only moderation; the visitor-facing text states the current AR labels ("True-to-size model" / "Modelo à escala real", 5% or 1 cm tolerance), taken from `src/i18n/dictionaries`.

---

## Facts the client must supply

1. **Legal name and legal form** of the operating entity (Lda., Unipessoal Lda., S.A., other) — `[[LEGAL_NAME]]`, `[[LEGAL_FORM]]`
2. **NIPC / NIF** — `[[NIPC]]`
3. **Registered office**, also used as the postal address for rights requests. The drafts assume the entity is established in Portugal; if not, an EU representative (GDPR art. 27) is needed — `[[ADDRESS]]`
4. **Commercial registry office and registration number** (CSC art. 171) — `[[REGISTRY]]`
5. **Share capital** (Lda./S.A.) — `[[SHARE_CAPITAL]]`
6. **Production domain(s)** where the pages will be published — `[[DOMAIN]]`
7. **Privacy contact email** (and whether it differs from support) — `[[PRIVACY_EMAIL]]`
8. **Support email**, the DSA art. 12 point of contact for users — `[[SUPPORT_EMAIL]]`
9. **Authorities' point of contact** (DSA art. 11), languages PT + EN — `[[AUTHORITY_CONTACT_EMAIL]]`
10. **Report-content channel**: the form address and a reports email (DSA art. 16) — `[[REPORT_URL]]`, `[[REPORT_EMAIL]]`
11. **DPO**: appointed or not; if not, suggested text "We have not appointed a Data Protection Officer, as the law does not require one; write to [[PRIVACY_EMAIL]]" — `[[DPO]]`
12. **Status of platform staff** (employees, contractors, founders), which sets their legal basis and whether a separate employee notice is needed — `[[STAFF_BASIS]]`
13. **Retention: applications** (approved, rejected, withdrawn) — `[[RETENTION_APPLICATIONS]]`
14. **Retention: security activity** (IP and browser in `audit_events`; 12 months was suggested) — `[[RETENTION_SECURITY_LOG]]`
15. **Retention: email log** — `[[RETENTION_EMAIL_LOG]]`
16. **Retention: product statistics** (13 months was proposed) — `[[RETENTION_ANALYTICS]]`
17. **Retention: records kept after an account closes** (audit and email log) — `[[RETENTION_AFTER_CLOSURE]]`
18. **Retention: deactivated team members' records** — `[[RETENTION_STAFF]]`
19. **Retention: backups** (set by the Supabase plan) — `[[RETENTION_BACKUPS]]`
20. **Retention: business content after closure** (products, models, photos, logos) — `[[RETENTION_CONTENT_AFTER_CLOSURE]]`
21. **Supabase and Vercel plans**, which set provider request-log retention. Also confirm that project `zggylkbgajamhriebdrg` is in `eu-west-1` (Ireland), as the drafts state — `[[PROVIDER_LOG_RETENTION]]`
22. **Vendor accounts and DPAs**: confirm the Supabase, Vercel and Resend accounts are held by the client's entity and each DPA is accepted in its name; check the DPF certifications on dataprivacyframework.gov — no token (the drafts assume this)
23. **Resend**: sending domain, sender address, and confirmation that open and click tracking are off — no token (the drafts state "no tracking")
24. **Enterprise size** under Rec. 2003/361/EC (headcount, turnover, balance sheet, including linked or partner enterprises). It decides DSA arts. 15 and 20–28 and P2B arts. 11–12 — `[[ENTERPRISE_SIZE]]`
25. **Fee model** for businesses (free, subscription, per catalog) — `[[FEES]]`
26. **Liability cap** for slight negligence (for example fees paid in the last 12 months, or a fixed sum for a free service) — `[[LIABILITY_CAP]]`
27. **Who business users sell to** (consumers, trade only, both) and whether all are established in the EU; this decides P2B scope — no token (counsel question 16)
28. **Own goods**: does Sanctus or an affiliate offer its own products next to businesses (P2B art. 7)? — `[[OWN_GOODS]]`
29. **Other channels**: will Sanctus show catalogs or products elsewhere (social media, partner sites, marketing)? This is also a licence use (CDADC art. 41) — `[[OTHER_CHANNELS]]`
30. **Ranking**: who orders products within a catalog, and whether Sanctus features anything (landing page) — `[[RANKING_PARAMETERS]]`
31. **Moderation practice**: human review only or any automated checks, and who reviews — `[[MODERATION_PRACTICE]]`
32. **Target response time** for reports — `[[RESPONSE_TIME]]`
33. **Export after closure**: how long a business can ask for a copy of its product information — `[[EXPORT_WINDOW]]`
34. **Court seat** for B2B disputes (for example Lisbon or Porto) — `[[COURT_SEAT]]`
35. **RAL entity** for consumers, if any, and whether the client has joined an arbitration centre — `[[RAL_ENTITY]]`
36. **Livro de Reclamações Eletrónico**: is the operator registered? Show the link or remove the line — `[[LIVRO_RECLAMACOES]]`
37. **Minimum age** for business account holders (presumably 18) — `[[MIN_AGE]]`
38. **Prevailing language** (recommended: Portuguese, or the version in the user's language) — `[[PREVAILING_LANGUAGE]]`
39. **Role for personal data in business content** (Sanctus as processor under an art. 28 clause, or as controller of publication) and whether the Business Terms include a DPA and embed obligations — `[[CONTENT_DATA_ROLE]]`
40. **Effective date, version number**, and how existing businesses accept the first version — `[[DATE]]`, `[[VERSION]]`
41. **Markets**: EU only, Brazil (BRL is an allowed currency), UK, others. This decides an LGPD annex, a pt-BR version and UK points — no token yet (counsel question 12)
42. **Breach owner**: who decides on and files CNPD notifications — no token (internal runbook)

---

## Open questions for counsel

1. **Cookie and consent position.** No consent banner is planned. The drafts disclose all device storage plainly (privacy policy §5). Is a notice enough, or does any item below need consent under Lei 41/2004, art. 5 (as amended by Lei 46/2012) and ePrivacy art. 5(3)? If consent is needed, which mechanism?
2. **Product-event message.** The page's JavaScript sends a POST for each view, AR launch and 3D interaction (EDPB Guidelines 2/2023 ¶33). Does an exemption apply in Portugal, or is consent (or server-side counting) needed?
3. **Persistent sign-in token** in localStorage that survives browser restarts (WP194 §3.2). Is it acceptable for a B2B login, or is a session-only default or a "keep me signed in" choice needed?
4. **Persistent UI keys** (`arfurn:arTipsDismissed`, `arfurn:sidebar`) with no expiry: exempt as UI customisation?
5. **Google Fonts and gstatic decoders.** The drafts are written as if both are self-hosted (app requirement 16–17). Confirm, and say what applies until that ships.
6. **Controller roles.** Is Sanctus sole controller for visitor statistics? Is an embedding business joint controller for the embed stage (C-40/17 Fashion ID), and is an art. 26 arrangement needed? Controller or processor for personal data in business content (`[[CONTENT_DATA_ROLE]]`)?
7. **Pseudonymisation wording** for the IP-derived keys and the email hash kept after account deletion: "pseudonymised", not "anonymous". Agree.
8. **Application form tick.** The drafts replace the "agree that Sanctus may contact me" checkbox with an "I agree" tick to the Terms and a link to the privacy policy. Confirm the tick is a contract acceptance, not GDPR consent.
9. **Public profile photos.** Keep them at public URLs (as disclosed) or move them to a private bucket?
10. **Rights requests** are handled by staff, without self-service export. Is a manual process within one month acceptable?
11. **Transfers.** Wording of the DPF fallback while the Latombe appeal (C-703/25 P) is pending. Exact data flows when AR starts (Google Scene Viewer, Apple Quick Look) for the recipients section.
12. **Other regimes.** Is Brazil in scope (LGPD annex, *encarregado*, ANPD clauses, pt-BR text)? The UK? US visitors (DMCA agent, UK Online Safety Act), or is "to the extent permitted by local law" enough?
13. **Portuguese texts.** Confirm the current text of Lei 41/2004 art. 5 after Lei 16/2022, and that none of the provisions the CNPD disapplied (Deliberação 2019/494) affects the privacy clauses.
14. **DPO.** Confirm none is required (GDPR art. 37; Lei 58/2019 art. 13).
15. **DSA classification.** Online platform (art. 3(i)) and not a marketplace (Section 4)? Micro or small enterprise, counting linked enterprises (`[[ENTERPRISE_SIZE]]`)? If not small, the internal complaint system and out-of-court settlement must be added (drafting note in B7).
16. **P2B scope.** Does the Regulation apply to a free catalog with an off-platform contact link? Has the Digital Omnibus repeal been adopted? Does it apply if some business users sell only to trade buyers?
17. **Lei 12-A/2026.** Must the contact points be notified to ANACOM (e.g. `dsc@anacom.pt`) as well as published? The drafts mention the right to complain to ANACOM. Keep it?
18. **Livro de Reclamações and RAL.** Does either apply to a B2B platform whose visitors pay nothing? Current wording of Lei 144/2015 art. 18 after DL 102/2017, and whether Lei 24/96 art. 14 "binds" Sanctus. Is there any consumer contract with visitors?
19. **Visitor Terms enforceability.** Are browse-wrap terms binding under DL 446/85 arts. 5–8 without a click, or should Part A be framed as rules and information?
20. **Liability.** How far can liability for slight negligence be capped B2B (Civil Code arts. 800 and 809; DL 446/85 art. 18(c)–(d))? Is excluding indirect loss enforceable? What cap suits a free service?
21. **Termination notice.** Do the 30-day notice and the P2B art. 4(4) exceptions pass DL 446/85 art. 19(f) for businesses that invested in 3D models?
22. **Copyright licence.** Does electronic acceptance meet the CDADC art. 41 formalities (written form, listed uses, time, place, price)? Can the licence survive closure for the backup period? Is DSM Directive art. 17 out of scope?
23. **Product liability and safety.** Any exposure under the Product Liability Directive 2024/2853 (online-platform rule) or the GPSR for a catalog of third-party products? Is the business indemnity enough?
24. **Statements of reasons.** Is email to the owner a durable medium (P2B art. 4) and "clear and specific" (DSA art. 17)? When must a reporter's identity be disclosed?
25. **Changes.** Confirm 30 days' notice for businesses and the visitor change clause ("valid reasons", DL 446/85 art. 22(1)(c)).
26. **Language.** Portuguese authoritative with English as a convenience? Does DL 238/86 art. 3 require the Business Terms in Portuguese for Portuguese businesses? (DL 446/85 art. 11(2) reads ambiguity in the adherent's favour.)
27. **Accessibility and digital content.** Confirm the EAA does not apply (no consumer contract, art. 3(30)) and whether a voluntary accessibility statement is advisable. Does the Digital Content Directive (DL 84/2021) reach visitors?

---

## What the app must do so the text is true (S2 build)

Each line is a statement in the drafts that the app does not yet make true.

**Publishing and acceptance**

1. Add static `/privacy` and `/terms` routes in EN and pt-PT, showing date and version, printable, with earlier versions kept at stable URLs.
2. Add footer links to both pages and the legal-notice block (name, form, address, registry, NIPC) on the landing, catalog, product and embed pages, and link them from the apply form, sign-in, dashboards and email footers.
3. On the apply form, add an "I agree" / "Concordo" tick to the Terms with links to the Terms and the privacy policy, replace the current "may contact me" consent checkbox, and store the accepted version and time on the application.
4. Make sure the apply wizard lets the applicant review and correct every answer before submitting, and marks required and optional fields.
5. At owner onboarding, require an "I agree" tick to the Terms before the dashboard opens, store version and time, and ask again when a new version takes effect.

**Retention and deletion**

6. Add a scheduled purge (pg_cron or a scheduled Edge Function) for applications, security metadata (IP, user agent) in `audit_events`, `email_log`, `product_analytics`, deactivated `platform_members` and their invites, and post-closure records, each at its `[[RETENTION_…]]` period.
7. Delete `private.analytics_hits` rows older than 1 hour on a schedule, replacing the 2% opportunistic cleanup.
8. Clear `business_applications.submitter_hash` 1 hour after submission, and correct the "salted daily hash" migration comment.
9. Purge `private.action_codes` older than 1 day on a schedule, not only when the next code is created.
10. On account deletion, replace `email_log.recipient` with the pseudonymised code used in `audit_events`, and consider a salted hash in place of the unsalted SHA-256.
11. Delete the old avatar file when a profile photo is replaced, and all of a user's avatar files when the account is closed or deleted.
12. Delete storage files (product media, variant media, logos) when a product is deleted and when a business's content is deleted after closure, within `[[RETENTION_CONTENT_AFTER_CLOSURE]]`.
13. Make sure completing a closure takes the catalog offline at once (verify the current flow).
14. Set backup retention to `[[RETENTION_BACKUPS]]` in the Supabase plan.

**Third parties**

15. Confirm open and click tracking are off for the sending domain in the Resend dashboard, and keep the API payload without tracking.
16. Self-host Google Fonts (Cormorant Garamond, Jost, Inter), and remove `fonts.googleapis.com` and `fonts.gstatic.com` from `index.html` and the CSP.
17. Self-host the model-viewer Draco and KTX2 decoders (set the decoder locations), and remove `www.gstatic.com` from the CSP `connect-src`.

**Moderation, DSA and P2B**

18. Add a "Report content" / "Denunciar conteúdo" link on every catalog, product and embed page, opening a form (or a prefilled mailto) with the four DSA art. 16 fields, the URL prefilled, and name and email optional only for child sexual abuse reports.
19. Send the reporter an automatic receipt, log each report with its decision, and email the decision and redress options to the reporter.
20. Require a reason (ground, facts, report or own check, automated or not) for every staff restriction (unpublish product, delete product, pause or suspend catalog, close account), store it with the action, and email the owner a statement of reasons with redress text by the time it takes effect.
21. Make staff account termination take effect at least 30 days after the reasoned notice, unless staff record a P2B art. 4(4) exception.
22. Email all owners at least 30 days before a new Terms version applies, with a change summary, and email account holders before a significant privacy policy change.

**Rights and contacts**

23. Give staff a way (an admin tool or a documented SQL/RPC) to export one person's data for access and portability requests, and a business's product information after closure until `[[EXPORT_WINDOW]]`.
24. Set up the `[[SUPPORT_EMAIL]]`, `[[AUTHORITY_CONTACT_EMAIL]]`, `[[REPORT_EMAIL]]` and `[[PRIVACY_EMAIL]]` mailboxes, each read by a person.
