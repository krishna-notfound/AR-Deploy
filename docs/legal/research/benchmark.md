# Legal-text benchmark for Sanctus (Privacy Policy and Terms)

Research date: 2026-10-26. Method: each page was fetched through a summarising fetch tool, so section lists and wording below are paraphrased from that summary, not read verbatim. Where a page could not be read (403, login wall, truncated), the gap is stated rather than filled. This is drafting research, not legal advice; items marked VERIFY need a Portuguese lawyer or the primary source before they go into a draft.

Sanctus context used for the comparison: Portugal-based B2B platform; approved furniture businesses publish public 3D/AR catalogs; no payments; visitors browse without accounts; native AR through Scene Viewer / Quick Look.

---

## 1. Coverage and reliability

| Platform | Documents read | Gaps |
|---|---|---|
| Shopify | Merchant Terms of Service; Privacy Policy | Terms page was 100,037 chars and the last 37 were not read |
| Squarespace | Terms of Service; Privacy Policy | Privacy Appendix II body truncated; Cookie Policy not read |
| Wix | Terms of Use | Only the intro and the Israel addendum came through; no liability, governing-law or DSA text |
| Sketchfab | Terms (`/terms`); Privacy (`/privacy`) | `/tos` is a user profile, not the terms |
| Threekit | Privacy Statement | Terms not read |
| Cylindo (Chaos) | Privacy Policy | Several section bodies (retention, updates, cookies) collapsed and unread |
| Vntana | Privacy Policy | Terms not read |
| Emersya | Not attempted | Substituted by Threekit, Cylindo, Vntana |
| IKEA Portugal | Terms index page; privacy page | Privacy body not extracted; terms page is only an index of separate documents |
| Worten.pt, Vinted.pt (privacy) | Page shells | Body text not extracted |
| Moloni, Idealista, OLX.pt, Sage PT, Etsy | Fetch failed (login page, 403, 404) | None of these were read |
| Vinted (EN and PT-PT terms) | Full terms in both languages | Used as the DSA-style benchmark instead of Etsy |
| Dlubal PT (a German vendor's pt-PT privacy page) | Read | Useful for pt-PT terminology only |
| CNPD | Rights page | Read |

Consequences: no Portuguese SaaS privacy policy was read in full. The pt-PT terminology in section 5 comes from the Vinted PT terms, the Dlubal PT privacy page, the CNPD rights page, the Portuguese-language search snippets and general knowledge of the RGPD wording. Etsy's DSA pages could not be fetched; search only showed that the Irish regulator (Coimisiu na Mean) has queried Etsy on its reporting tool and contact point, and that a German body is suing Etsy Ireland on seller-transparency grounds.

The "last updated" dates the tool reported are all in 2026, so treat them as the pages' own claims on the research date.

---

## 2. Per-platform findings

### 2.1 Shopify (merchant terms and privacy policy)

URLs: https://www.shopify.com/legal/terms and https://www.shopify.com/legal/privacy

Terms structure, in order: Account Terms; Account Activation (store owner, staff accounts, payment methods, domain names); Shopify Rights; Your Responsibilities; Payment of Fees and Taxes; Confidentiality; Limitation of Liability and Indemnification; IP and Your Materials; Additional Services (a long list of optional products, each with its own sub-terms); Feedback and Reviews; IP Infringement; Privacy and Data Protection; Shopify Contracting Party and Forum; Term and Termination; Modifications; General Conditions.

- Liability: no fixed monetary cap in the portion read. It excludes indirect and consequential loss (lost profit, data, goodwill) "to the extent permitted" and disclaims warranties ("as is", "as available").
- Governing law: Ontario and Canadian federal law, CISG excluded. Forum depends on the merchant's billing address: Ontario for US/Canada, Singapore for Asia-Pacific, Ireland for everyone else.
- Suspension/termination: fee-based suspension after 28 days unpaid, termination after 60 more days. Separately, Shopify may suspend or terminate for any reason without notice unless law requires notice; fraud is named. On termination the store goes offline and no refund of incurred fees.
- Moderation/notice-and-action: a separate IP infringement section; DSA not found in the part read.
- Language: English prevails over translations.
- Versioning: a single "last updated" date. Material adverse changes get advance notice, except legal/fraud/security changes.
- Readability: every section opens with a bold "Which means" plain-language summary, expressly non-binding. Longer summary box for the data-heavy add-on service.

Privacy structure: Introduction; Our values; Why we process your information; Your rights; Where we send your information; How long we retain; Machine learning; How we protect; Cookies and tracking; Contact; US regional notice.

- Roles: controller for its own relationships (merchants, visitors, partners); processor/service provider when handling a merchant's store data. People are told to go to the merchant for requests about store data.
- Cookies: summarised, with details in a separate Cookie Policy; states it does not react to Do Not Track.
- Sub-processors: not inline; linked to a help-centre list; transfers rely on contractual clauses (typically SCCs); function categories named (hosting, CDN, analytics, logging, email).
- Retention: purpose-based and criteria-based; merchant sets retention for store data; US notice gives a concrete two years after closure.
- Versioning: one date, no version number; significant changes announced in admin or by email. Language/region selector with many localised versions.

### 2.2 Squarespace

URLs: https://www.squarespace.com/terms-of-service and https://www.squarespace.com/privacy

Terms structure: Creating Accounts; Your Content; Your Responsibilities; Third Party Services/Sites/User Content/Experts/Extensions; Our IP; Our Rights; Privacy; Copyright; Paid Services and Fees; Services Details and Product Specific Terms; Term and Termination; Warranty Disclaimers; Limitation of Liability; Indemnification; Dispute Resolution; Additional Terms.

- Liability: exclusions for indirect loss; cap at the greater of a small fixed sum (USD 20) or fees paid in the previous 12 months. A separate carve-out for EU consumers keeps statutory liability for intent and gross negligence.
- Governing law: New York (US users), Irish law and courts (non-US), with mandatory consumer protections of the user's home country preserved for EU consumers.
- Suspension/termination: broad right to restrict or suspend "without liability or notice" except where law requires it; says it will "endeavor" to give notice for violations.
- Moderation: copyright report form (US DMCA style); states it is not a publisher of user content. No DSA mention, no appeal route, no transparency report in the part read.
- Language: English controls; a language selector lists eight languages, each on a different domain.
- Versioning: effective date plus rule that changes are not retroactive and material reductions in rights get notice.
- Readability: grey-box plain-language note before each section (no legal effect), numbered sections, bold/caps for warnings, a conversational greeting, linked related policies at top and bottom.

Privacy structure: How does this policy apply; Information we collect; How we collect; How we use (legal bases in a table); How we disclose; Your rights and choices; Protection; Retention; Data transfers; Data privacy frameworks; Updates; Who is Squarespace; Contact; US state appendices.

- Roles: controller for "Squarespace Controlled Information"; processor/service provider for "Customer Controlled Information" (site content and visitor data on customer sites); customers are told they are responsible for their own compliance. This is the closest analogue to Sanctus (the business is the publisher, the platform hosts and measures).
- Cookies: separate Cookie Policy; customers choose which optional cookies run on their sites.
- Sub-processors: the word is not used; vendors are grouped by function and a DPA is linked.
- Retention: "as long as the account is active" plus legal needs; inactive customer data kept for a reasonable period; de-personalised data may be kept indefinitely.
- Readability: table of contents with anchors, short definitions list (User, Customer, End User), tables for legal bases and for California categories.

### 2.3 Wix

URL: https://www.wix.com/about/terms-of-use

Only the introduction came through. Useful devices seen: "#ItsThatEasy" callout boxes summarising each section in plain language; a capitalised notice flagging the arbitration clause and class waiver; a "last revised" date with a link to the previous version and a banner for effective dates. Liability, governing law, DSA and language handling were not read. Do not cite Wix for those points.

### 2.4 Sketchfab (3D model hosting; closest content model)

URLs: https://sketchfab.com/terms and https://sketchfab.com/privacy

Terms structure: General Conditions; Subscriptions and Purchases; Ownership of Sketchfab Content; User Content; User Restrictions and Obligations; Warranty Disclaimers, Limitations of Liability, Indemnity; International Data Processing; Intellectual Property Claims; Modifying and Terminating the Services; Other Websites and Services; Applicable law and jurisdiction, Arbitration; Amendment; Miscellaneous; Suggested Content; Artificial Intelligence.

- Moderation: may pre-review content, may remove it at any time without notice; takedown by US DMCA notice and counter-notice; account termination after repeated infringement notices (stated as more than two). Points to a Safety and Security Center. No DSA wording.
- Termination: service changes with one month's notice; immediate termination without notice for conduct it believes violates the terms or harms others.
- Liability: outside the EU, capped at fees paid for the period, up to a USD 10,000 maximum, and zero if nothing was paid. EU residents get a split regime: unlimited for intent, gross negligence, and injury to life/body/health; for slight negligence only for breach of material obligations and limited to foreseeable damage. A good model for a EU-facing B2B cap.
- Governing law: North Carolina plus AAA arbitration outside the EU; EU residents get their home-country law and no arbitration or class waiver.
- Language: English only. Versioning: "Effective" date, one month's notice to registered users before changes.
- Readability: table of contents, bold lead-ins, capitalised key notices, separate EU/non-EU conditional text.

Privacy structure: Introduction; Information We Collect; How We Use; Recipients; Privacy Settings/Controls; Children; Global Operations (transfers, EEA/UK/CH, California); Cookies; Security; Changes; Contact.

- Roles: Sketchfab is simply "the controller"; no processor concept.
- Cookies: three purposes (required, analytics, third-party interactive features); browser controls; local storage not mentioned.
- Recipients: grouped by category (related companies, partners/subcontractors, analytics, regulators, corporate transactions, advisers); no named list.
- Retention: "as long as reasonably needed"; no fixed periods.
- Versioning: effective date and last-updated date; notice within thirty days before publication for material changes.

### 2.5 3D/AR commerce platforms (Threekit, Cylindo/Chaos, Vntana)

URLs: https://www.threekit.com/privacy-policy, https://www.cylindo.com/privacy-policy/, https://www.vntana.com/privacy-policy

- Threekit (13 numbered sections): Processing activities covered; Responsible Threekit entity; Data collected; Device and usage data (log files, cookies in three categories, behavioural advertising, opt-out, social features); Purposes and legal bases; Sharing; International transfers; Children; Retention; Rights; Security; Changes; Contact. Controller for its own data, "may act as processor" for cloud products, with requests referred to the customer. Retention is criteria-based (amount, sensitivity, risk, alternatives, limitation periods) and mentions blocking use where deletion is technically hard. No named sub-processors. Dated January 2019 and not refreshed, which shows what stale looks like.
- Cylindo (under Chaos Software GmbH, 15 sections): Scope; Who is responsible; Contact; Under 18; Types of data; Legal bases; Why we process; How we process; Retention; Sharing; Transfers; Rights; Updates; Jurisdiction-specific rights; a product-specific section (Cylindo Stager). Note the "Who is responsible for the processing" section placed second, and a short scope-and-governing-law summary near the top. Effective July 2024. Processor role for furniture brands was not visible in the text read.
- Vntana: 15 plain-language, sentence-style headings ("We use standard security measures"), a table of data categories, GDPR section with EU/UK representative, "no" to Do Not Track, US data storage disclosed. Dated 2019. No controller/processor vocabulary: it calls its vendors "service providers". Not a model for EU compliance.

Takeaway: the 3D/AR vendors publish thin, privacy-only documents aimed at their own marketing sites, and say little about visitor data collected inside embedded viewers. Sanctus will be clearer than all three by treating visitor data on catalog pages explicitly.

### 2.6 IKEA Portugal and Portuguese retailers

URLs: https://www.ikea.com/pt/pt/customer-service/terms-conditions/ and the privacy page under the same path.

- The terms page is an index: headings are "Termos de utilização" and "Sobre estes Termos de Utilização", with the separate documents listed (IKEA Family conditions, Business Network, services). One umbrella page with per-service terms.
- The footer links to "Reclamações e resolução de litígios" and to the official Livro de Reclamações site; the complaints book is a footer link, not a section of the terms.
- No applicable-law or liability wording appeared on the index page; no last-updated date (only a copyright range).
- Worten.pt footer groups "Legal" links: "Política de Cookies", "Exercicio de Direitos e Stop SMS". Rights exercise has its own page/link.
- Vinted PT terms (a full Portuguese-language document, Lithuanian operator) was the most complete pt-PT text read; see 2.7.

Limitation: the privacy bodies of IKEA and Worten were not extracted, so their ordering of controller, CNPD and retention sections is unverified.

### 2.7 Vinted (EU marketplace; DSA-style benchmark; Etsy substituted)

URLs: https://www.vinted.com/terms-and-conditions and https://www.vinted.pt/terms-and-conditions

Structure (EN): About you and us; About these Terms; Some ways you can contact us; What all our users should know; Becoming our User; Using information you share with us; What you must and must not do; Our rights to handle concerns; Wallet; Payments; Shipping; Refund; Messages and reviews; Ending our relationship; Selling; Buying; Optional services; Final important terms (disclaimer, liability, arbitration, "final bits").
Structure (PT-PT): "Sobre si e nós"; "Sobre estes Termos"; "Algumas formas de nos contactar"; "Tornar-se nosso Utilizador"; "O que deve e não deve fazer"; "Os nossos direitos de resolver preocupações"; "Terminar a nossa relação"; "Como serão tratados os litígios"; "Atualizações destes Termos"; "Aspetos finais que deve saber".

- Notice-and-action: Section 3 lists reporting routes, including a form for illegal items and a copyright notice route.
- Moderation and statement of reasons: "Our rights to handle concerns" lists the possible actions (remove listings, restrict features, block temporarily or permanently, cancel pending transactions, notify authorities where safety is at risk). It promises written notice with reasons, the legal or contractual basis and how to appeal, except where notice would be unlawful or would hamper a fraud investigation. The PT version heads this with a term closest to "Fundamentação". Appeals reviewed by qualified staff. No out-of-court body named in the English text; the PT text points to EU alternative dispute resolution bodies and national consumer authorities.
- Termination: user can leave any time by deleting the account; Vinted may end the contract with 30 days' written notice; pending transactions continue.
- Liability: excludes indirect loss; cap at the greater of one month's payments or USD 100 in the English text, with carve-outs for death, personal injury and fraud. The PT text distributes limitation across sections rather than a headed clause.
- Governing law: the English page names Delaware plus AAA arbitration; the PT page says the law of the user's country of habitual residence. Same operator, two regimes, so regional versions can differ materially; check which one binds EU users.
- Versioning: "new version applicable from" date plus a notice table by change type (none for typos, 30 days for most changes). Prospective only.
- Readability: plain-language, second-person headings ("Ready to shop?"), group banners, tables for refunds and notice periods, bold defined terms, all-caps blocks for waivers (called out as hard to scan).

Gap: neither Vinted nor Etsy DSA pages (point of contact, transparency report, Article 21 body) were retrieved.

---

## 3. Cross-cutting patterns

| Topic | What comparable platforms do |
|---|---|
| Controller/processor | Two-hat model is standard for site builders: controller for account and marketing data, processor for the customer's site content and end-user data (Shopify, Squarespace, Threekit). Third-party end users are told to contact the merchant for store data. |
| Cookies / local storage | Separate Cookie Policy is the norm; Policy page just summarises. Local storage is rarely named (Sketchfab does not mention it). |
| Sub-processors | Three formats: linked live list (Shopify), grouped-by-function in-policy (Squarespace, Sketchfab), none named (Threekit, Vntana). Only the first satisfies the customer's right to know. |
| Retention | Criteria-based wording is universal; concrete figures are rare (Shopify's two-year US note). Merchant-set retention for processor data. |
| Notice-and-action | Mostly copyright-only (DMCA style) among SaaS builders. Vinted is the only one read with reasons, appeal and reporting forms. |
| Suspension/termination | Broad "any reason, without notice unless law requires" in Shopify, Squarespace, Sketchfab; user-friendlier 30 days' notice in Vinted. EU variants soften with statutory notice. |
| Liability cap | Fees paid in the last 12 months with a floor (Squarespace), fixed ceiling (Sketchfab USD 10,000), or one month's payments with a floor (Vinted). Sketchfab and Squarespace add a separate EU regime that cannot cap intent or gross negligence. |
| Governing law | US-state or Canadian law for the global company; Irish law for non-US Squarespace; EU consumer protections preserved. For a Portugal-based B2B operator, Portuguese law and Portuguese courts are the natural choice. |
| Languages | English prevails (Shopify, Squarespace). Sketchfab, Threekit, Vntana are English-only. Sanctus needs EN and PT-PT, so state which prevails. |
| Versioning | One "last updated" or "effective" date is universal; version numbers and changelogs are rare. Wix links the previous version. Notice periods: 30 days (Sketchfab, Vinted). |
| Readability | Per-section plain-language boxes (Shopify "Which means", Squarespace grey boxes, Wix #ItsThatEasy), tables for legal bases and notice periods, second-person headings, defined-terms lists, table of contents with anchors. |

---

## 4. Regulatory points that shape the outline (VERIFY with counsel)

These come from general knowledge of EU/Portuguese law plus the search results above, not from the benchmarked sites.

1. DSA Article 14 applies to all intermediary services: the terms must describe restrictions on content and the moderation measures and tools used, including the internal complaint rules. A sourced statement that Article 14 has no small-enterprise carve-out was not found; Article 19's micro/small exemption sits in the online-platform section (the search result confirms that scope). Likely position: Sanctus stores content for business users and shows it to the public, so it is at least a hosting service (notice mechanism, reasons for removals, single point of contact) and probably an online platform, where only the micro/small-enterprise exemption would lift the extra duties.
2. Portugal's DSA coordinator is believed to be ANACOM. VERIFY.
3. RGPD Article 28 requires prior specific or general written authorisation for sub-processors; the search result quoting it also shows that the EDPB expects controllers to have sub-processor identities readily available. That favours a named, versioned list.
4. Livro de Reclamações: the search results show that Decreto-Lei 74/2017 made the electronic complaints book mandatory for most suppliers of goods and services to consumers, and that sites must show a visible link to livroreclamacoes.pt. Whether a B2B-only service with free public browsing is covered is unclear; the sources are from 2017-2019. VERIFY, and consider including the link anyway.
5. Consumer dispute resolution: visitors are consumers only in the sense of reading the catalog; there is no sale. Do not promise ADR participation unless the company is registered with a consumer arbitration centre. The EU Online Dispute Resolution platform was, to my knowledge, shut down in July 2025. VERIFY before mentioning it.
6. CNPD is the supervisory authority; its rights page lists the six rights (access, rectification, erasure, restriction, portability, objection) and says to exercise them first with the controller.

---

## 5. pt-PT terminology (observed vs. from knowledge)

Observed in the PT sources read (Vinted PT, Dlubal PT, CNPD, search snippets):

| English | pt-PT term | Source |
|---|---|---|
| Privacy Policy | Política de Privacidade | Vinted PT page title; IKEA, Worten page titles (as "Política de privacidade") |
| Terms and Conditions | Termos e Condições (Vinted PT); Termos de Utilização (IKEA PT) | Both in use; "Termos e Condições" is more common for a contract |
| Cookie Policy | Política de Cookies | Worten, Vinted |
| Controller | Responsável pelo Tratamento | Dlubal PT, Publitas DPA snippet |
| Processor | Subcontratante | Dlubal PT, Publitas DPA snippet, RGPD PT text |
| Sub-processor | Subcontratante ulterior (RGPD "outro subcontratante") | Article 28 PT wording in a search snippet |
| Data subject | Titular dos dados; Dlubal uses "pessoa em causa" | Dlubal PT, CNPD |
| Rights headings | Direito de acesso / retificação / apagamento / limitação do tratamento / portabilidade / oposição | CNPD rights page |
| Supervisory authority | Autoridade de controlo; CNPD (Comissão Nacional de Proteção de Dados) | Dlubal PT, CNPD |
| Complaints book | Livro de Reclamações; Livro de Reclamações Eletrónico | IKEA, Vinted PT footers; search results |
| Complaints and dispute resolution | Reclamações e resolução de litígios | IKEA PT footer |
| Alternative dispute resolution | Resolução alternativa/extrajudicial de litígios | Vinted PT |
| Applicable law | Legislação aplicável (Vinted PT); Lei aplicável e foro (common, not observed) | Vinted PT |
| Updates to terms | Atualizações destes Termos | Vinted PT |
| Rights request page | Exercício de Direitos | Worten footer |
| Account holder | Utilizador | Vinted PT uses "Utilizador" throughout |

From general knowledge, not observed on a benchmarked page (VERIFY or confirm in review): Prestador de serviços intermediários / Serviço de alojamento virtual (DSA terms); Regulamento dos Serviços Digitais (RSD); Mecanismo de notificação e ação; Declaração de fundamentação (statement of reasons; Vinted PT uses a "fundamentação" heading); Sistema interno de tratamento de reclamações; Ponto de contacto único; Limitação de responsabilidade; Prazo de conservação; Transferências internacionais de dados; Cláusulas contratuais-tipo; Foro competente; Rescisão or Cessação do contrato.

Conventions seen: pt-PT uses "Utilizador", "ecrã", "ficheiro", "Termos"; Vinted's privacy title uses informal "tu" ("os teus Dados") while its terms use the formal "si" ("Sobre si e nós"). For B2B legal text use the formal form (3rd person "o Utilizador", imperative "deve"). The entity block should include the company name, NIF/NIPC, registered address, and contact email, which Portuguese sites typically place at the foot of the document or in a "Quem somos" section. Use "pt-PT" spelling after the Acordo Ortográfico ("atualização", "ação", not pre-1990 "actualização").

---

## 6. Recommendations

### 6.1 Privacy Policy outline

Goal: one policy, covering the platform's own data and the visitor data collected on public catalogs, with a plain summary at the top.

1. Summary at a glance (box or small table): who we are, what we collect (business accounts; visitor analytics and AR events, no visitor accounts), what we never do (sell data, run ads, take payments), how to reach us.
2. Who is responsible (identity, contact, roles table):
   - Sanctus is controller for business-account data, staff access, security logs, platform analytics.
   - For visitor data on a business's own catalog the roles need a decision with counsel: either Sanctus as controller of anonymous aggregated catalog analytics and AR events, or processor for the business. Squarespace's two-hat model is the template; state which data fall in which column in a table.
3. What data we collect, by group: business users (name, work email, company, role, authentication, support messages); catalog visitors (no account; page views, product events, approximate region, device type, language; AR launch events); uploads (models, images); technical logs. State plainly that tracking is first-party and anonymous if that is true.
4. Why we use it, with the lawful basis per purpose in a table (contract, legitimate interests, legal obligation, consent where cookies or non-essential storage require it).
5. Cookies, local storage and similar technologies: a table naming each item (name, purpose, who sets it, duration, essential or not). Include local/session storage items and the AR hand-off to Google Scene Viewer / Apple Quick Look, noting that the AR viewer is a third-party app with its own privacy policy and that Sanctus does not receive camera or room-scan data (confirm for each platform).
6. Who we share data with: category list, plus link to a separate live sub-processors page (see 6.4); regulators and legal requests; corporate transactions.
7. International transfers: where hosting is outside the EEA, name the safeguard (adequacy decision, standard contractual clauses).
8. How long we keep it: a retention table by data class with a concrete period or deletion trigger (as Shopify does for closed accounts), not only "as long as necessary".
9. Your rights and how to use them: list the six rights plus withdrawal of consent; one email or form; 1-month response; for visitor data on a business catalog, say when to ask Sanctus and when to ask the business.
10. Complaints: right to complain to the CNPD (with its address), without prejudice to other routes.
11. Security.
12. Children (the service is not directed at children).
13. Changes to this policy (versioning, notice period, link to previous versions).
14. Contact (company block with NIPC, address, email, DPO if appointed).

Annex A: Sub-processors (name, purpose, location, safeguard, date added). Annex B: Cookie and storage table (can be a separate Cookie Policy page, as Worten, Shopify and Squarespace do).

### 6.2 Terms outline

Two audiences, so use one document with a short visitor part and a longer business part, or two linked documents with a shared "Common provisions" part. Sketchfab's EU / non-EU conditional text and Squarespace's mix of site and customer terms show this is manageable. Recommended single document:

Part A - Overview
1. Summary box: what Sanctus is, that browsing is free and needs no account, that Sanctus charges no visitor and processes no payments, that business accounts are by approval.
2. Who we are and how to contact us (company block, contact point for DSA and legal notices).
3. About these Terms (parts, which applies to whom, order of precedence, language: pt-PT and EN, say which prevails and what the translation is for).

Part B - Visitors (catalog browsing)
4. Using the catalogs: permitted use; no scraping; no unlawful use.
5. 3D models and AR: AR runs in the phone's own viewer; device and OS requirements; sizes shown are the business's declared dimensions, Sanctus gives no guarantee of exact scale or colour (the project's "verified scale" rule); try-before-you-buy is indicative.
6. Product information, prices and availability are supplied by the businesses; Sanctus is not the seller and takes no payments; contact the business for sales and warranty claims.
7. Reporting illegal or infringing content (visitor-facing notice-and-action).
8. Visitor liability and warranty disclaimers, with an EU-consumer carve-out.

Part C - Business accounts
9. Eligibility, approval and accounts: approval by Sanctus, accurate company data, security of credentials, no business-side team roles (reflect actual product).
10. Your content and licence: you keep ownership; you grant a licence to host, process, show and convert to AR; you warrant you have the rights to models, photos, trademarks and descriptions.
11. Acceptable use: prohibited content list (illegal goods, infringing, misleading, malware, personal data of third parties, AI-generated misrepresentation), plus consumer-law duties of the business (price, identity, product information).
12. Content moderation and DSA terms: what we review, what triggers action (reports, automated checks, authority orders), the actions available (remove or disable content, suspend, terminate), a statement of reasons for each decision, how to appeal (internal complaint within a stated period, reviewed by a person), out-of-court dispute settlement body if applicable, repeat-infringer policy. Write this once and cross-reference it from the visitor section.
13. Data protection roles for business data: Sanctus as processor where applicable; DPA is part of the Terms; sub-processor list and objection right; assistance with requests; breach notice; deletion or return at end.
14. Service levels, changes and availability: best-effort, planned maintenance, right to change features with notice; free versus paid (if no paid plan now, say none).
15. Fees: state that currently there are none, or point to the order form; no consumer payments.
16. IP and feedback.
17. Confidentiality (short).
18. Suspension and termination: user termination at any time; Sanctus termination for breach, security risk, or legal order, with a notice period and a reasoned notice; immediate suspension limited to serious cases; data export window and deletion date; surviving clauses.
19. Warranty disclaimer and limitation of liability: exclude indirect loss; cap at fees paid in the preceding 12 months with a defined floor if the service is free; no cap for wilful misconduct, gross negligence, death or personal injury, or anything law does not permit to be capped. Sketchfab's EU split is the best template.
20. Indemnity by the business for its content (proportionate).

Part D - Common
21. Changes to the Terms: effective date, 30 days' notice to business users, prospective only, link to previous versions.
22. Governing law and courts: Portuguese law; Portuguese courts at a named seat; mandatory consumer rights preserved for visitors; mention ADR only if a registered centre applies (VERIFY).
23. Complaints: Livro de Reclamações link if applicable (VERIFY), contact for complaints.
24. General (entire agreement, assignment, severability, notices by email).
25. Contacts and legal details.

### 6.3 Plain-language devices worth copying

- A short "At a glance" box at the top of both documents (Shopify and Squarespace both lead with plain language).
- A one- or two-line non-binding plain-language summary before each Terms section, labelled as such (Shopify "Which means", Squarespace grey boxes, Wix callouts). For a small platform, add them only to the long or risky sections to avoid doubling length.
- Tables: legal bases (Squarespace), notice periods and refunds (Vinted), cookies (Threekit style grouping), sub-processors, retention.
- A short defined-terms list near the top (Squarespace: User, Customer, End User) so "Visitor", "Business", "Catalog", "Content" mean one thing.
- Anchored table of contents (Squarespace, Sketchfab).
- Second-person headings that match the question a reader has ("What happens to my catalog if my account is closed?").
- A "who to contact for what" mini-table, so visitors aren't sent to Sanctus for a business's product questions.
- Visible effective date, a link to the previous version and a change summary (Wix's previous-version link; Vinted's notice table). Avoid the all-caps walls that Vinted and Sketchfab use; keep emphasis for the liability and termination clauses only.
- Avoid the stale-document problem seen at Threekit and Vntana (2019 dates): set a review date.

### 6.4 Sub-processor list format

Publish a separate page and version it, since the RGPD sub-processor authorisation model expects it. Suggested columns: name and entity; purpose; data categories; location; transfer safeguard; date added. Add a way to subscribe to changes and a stated objection period for business customers (for example 30 days before a new sub-processor starts). This is stronger than any 3D/AR vendor read and matches Shopify's separate-list approach.

### 6.5 Versioning

Visible "Effective from" and "Last reviewed" dates; a version history at the bottom with date and one-line change summary; keep prior versions at stable URLs. Both PT and EN texts carry the same dates and version number so one version is never ahead of the other. Business users get an email 30 days before material changes (matches Sketchfab and Vinted).

### 6.6 Language handling

Publish pt-PT and EN. Decide which is authoritative (Portuguese is the natural choice for a Portugal-based provider and for consumer-facing parts; Shopify and Squarespace make English prevail because their drafting language is English). Say so in both versions. Do not machine-translate legal text; Vinted's EN and PT terms differ in governing law, which is a warning about letting the versions drift.

---

## 7. Open questions for counsel or the owner

1. Controller or processor for visitor analytics on a business's catalog (and who tells visitors).
2. Whether Sanctus is a hosting service or an online platform under the DSA, and whether the micro/small exemption applies on current headcount and turnover.
3. Whether the Livro de Reclamações obligation applies to a B2B service with free public browsing.
4. Whether any consumer ADR centre should be named.
5. Exact third-party data flows when AR is launched (Google Scene Viewer, Apple Quick Look) for the cookie and recipient tables.
6. Whether a paid plan or fee will exist (affects the liability cap wording).
7. Whether a DPO is required or voluntary.

---

## 8. Source URLs

- https://www.shopify.com/legal/terms
- https://www.shopify.com/legal/privacy
- https://www.squarespace.com/terms-of-service
- https://www.squarespace.com/privacy
- https://www.wix.com/about/terms-of-use
- https://sketchfab.com/terms
- https://sketchfab.com/privacy
- https://www.threekit.com/privacy-policy
- https://www.cylindo.com/privacy-policy/
- https://www.vntana.com/privacy-policy
- https://www.ikea.com/pt/pt/customer-service/terms-conditions/
- https://www.worten.pt/politica-de-privacidade
- https://www.vinted.com/terms-and-conditions
- https://www.vinted.pt/terms-and-conditions
- https://www.dlubal.com/pt/nota-legal/privacy-policy-other
- https://www.cnpd.pt/cidadaos/direitos/
- https://www.valueaddedresource.net/irish-regulator-etsy-digital-services-act-compliance-review/
- https://apcmc.pt/legislacao/livro-de-reclamacoes-eletronico-obrigatorio-a-partir-de-1-de-janeiro-ja-se-registou/
- https://www.garrigues.com/pt/pt-PT/news/obrigatoriedade-de-dispor-de-um-livro-de-reclamacoes-eletronico
- https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-19/
- https://gdpr-text.com/pt/read/article-28
