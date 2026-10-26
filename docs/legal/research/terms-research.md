# Terms of Service: legal research (DRAFT for the client's lawyer)

> **Status:** research notes, 2026-10-26. **This is not legal advice.** It is a map of the rules that seem to apply, with official sources, so the client's lawyer can check it and write the final Terms quickly. Every "applies?" call below is a working view for the lawyer to confirm.
>
> **Scope:** two documents. (1) **Terms of Use** for visitors, who browse public catalogs without an account and can open native AR. (2) **Business Terms**, for businesses that apply, are approved by platform staff and publish catalogs. The platform is operated from Portugal. Coverage is Portugal, the EU, and a global baseline.
>
> **How the sources were checked:**
> - EUR-Lex pages can't be machine-read from here. The DSA and P2B article wording was checked against full-text mirrors (eu-digital-services-act.com, lawplayer.com) and is cited to the official EUR-Lex URL.
> - The Portuguese texts were read from the Diário da República PDF of the original publication (DL 7/2004, via WIPO Lex) and of Lei 12-A/2026, or from official regulator pages (AMT, DGC). DRE consolidated versions "não têm valor legal", so the lawyer should confirm the current wording.
> - Items marked **(verify)** could not be confirmed from a primary source in this session.

---

## 0. Facts about the product used in this note

Only these facts come from the repository. Anything else is listed as a question for the client in §7.

| Fact | Where it comes from |
|---|---|
| Businesses apply. Platform staff approve or reject, and a rejection needs a written reason. Sanctus admins create owner accounts, with no public self-registration and exactly one owner per business. | `docs/DECISIONS.md` (2026-10-20), `src/services/applicationRules.ts`, `src/features/admin/ApplicationDetailPage.tsx` |
| Each business has its own separate catalog. There is **no cross-business directory**. | `docs/DECISIONS.md` (2026-10-13) |
| Business status is `active`, `inactive` or `draft`, and product status is `draft` or `published`. The only stored "reason" field in the domain types is for application decisions. | `src/domain/types.ts` (lines 9-10, 250) |
| Businesses can request account closure, and a staff suspension made while a closure is pending survives a cancelled closure. | `supabase/migrations/20261025163627_account_settings.sql` (line ~945), `20261026041731_business_logic_fixes.sql` |
| Visitor analytics store no visitor IP or personal data (stated in the PRD). | `docs/PRD.md` line 104 |
| No public "report this content" mechanism and no `/terms`, `/privacy` or legal-notice route was found in `src/`. | grep of `src/features/public`, `src/lib`, `src/app` |
| Live AR is native only (Scene Viewer / Quick Look). | `CLAUDE.md`, ADR-0021 |

---

## Summary: what applies

| # | Regime | Applies? | One-line reason |
|---|---|---|---|
| 1 | EU Digital Services Act (Reg. 2022/2065) | **Yes** | Sanctus stores business-uploaded content and makes it public, so it is a hosting service and very likely an "online platform". The small-enterprise exemptions remove Arts 15 and 20-28 (except 24(3)) and 30-32, but **Arts 11, 12, 14, 16, 17 and 18 apply whatever the size**. |
| 1a | Portugal Lei 12-A/2026 (DSA enforcement) | **Yes** | ANACOM is the Digital Services Coordinator. There are fines for a missing contact point, missing Terms, or Terms that don't comply with Art 14. |
| 2a | DL 7/2004 (e-commerce) | **Yes** (Art 10, Arts 28-31) | Sanctus is an information society service provider established in Portugal. **Arts 12-19 (the old hosting rules) were repealed by Lei 12-A/2026.** |
| 2b | Código das Sociedades Comerciais Art 171 | **Yes, if the operator is a company** | The company's details must appear on its websites. |
| 2c | Livro de Reclamações Eletrónico (DL 156/2005 / DL 74/2017) | **Maybe** | It covers suppliers dealing with "consumidores e utentes" through digital means. Business users are not consumers, and visitors pay nothing. The cost of complying is low. |
| 2d | RAL information (Lei 144/2015 Art 18; Lei 24/96 Art 14) | **Maybe** | Only consumer relationships are in scope. Whether visitors are in a consumer contract is a question for the lawyer. |
| 2e | Portuguese language (Lei 24/96 Art 7(3); DL 238/86) | **Yes** for consumer-facing text, **advisable** for business text | Consumer information must be given in Portuguese. |
| 2f | Governing law and jurisdiction (Rome I, Brussels I bis) | **Yes** | B2B choice is free. A consumer keeps the protection of the law and courts of their home country. |
| 2g | DL 446/85 (standard terms) | **Yes, for both documents** | Both sets of Terms are standard terms. Arts 15-19 apply B2B and Arts 15-22 apply to consumers. |
| 3 | P2B Regulation 2019/1150 | **Likely yes** | It covers a service that lets businesses offer goods to consumers "with a view to facilitating the initiating of direct transactions … irrespective of where those transactions are ultimately concluded". The Commission proposed repealing it in Nov 2025, but **it is still in force until repealed (verify)**. |
| 4 | IP licence, acceptable use, AR disclaimers, liability caps | **Yes** (contract design) | These are limited by DL 446/85 Art 18, CDADC and product liability law. |
| 5 | European Accessibility Act (Dir. 2019/882; DL 82/2022) | **Probably not** as an "e-commerce service" | No consumer contract is concluded on the platform. A voluntary accessibility statement is recommended. |

---

## 1. EU Digital Services Act: Regulation (EU) 2022/2065

**Official text:** https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng. It has applied to all providers since 17 February 2024 (Art 93(2)).

### 1.1 Does it apply?

**Yes.**
- A **hosting service** is "the storage of information provided by, and at the request of, a recipient of the service" (Art 3(g)(iii)). Businesses upload photos, 3D models, descriptions and prices, and Sanctus stores them.
- An **online platform** is a hosting service that "at the request of a recipient of the service, stores and disseminates information to the public", unless that is a minor and purely ancillary feature (Art 3(i)). Dissemination means making it available to "a potentially unlimited number of third parties" (Art 3(k)). Public catalogs are the core function, not an ancillary one, so Sanctus is **very likely an online platform**.
- **Recipients** are "any natural or legal person who uses an intermediary service" (Art 3(b)). That covers both the business users and the visitors.
- **Terms and conditions** means "all clauses, irrespective of their name or form" governing the relationship (Art 3(u)). Both documents count.

**Is it a marketplace?** Section 4 (Arts 30-32: trader traceability and compliance by design) applies only to online platforms "allowing consumers to conclude distance contracts with traders". Sanctus has no checkout, only a "contact the store" link, so Section 4 likely doesn't apply. It is excluded anyway for micro and small providers (Art 29).

### 1.2 Micro/small enterprise exemptions

Size is defined in Commission Recommendation 2003/361/EC (https://eur-lex.europa.eu/eli/reco/2003/361/oj). A **micro** enterprise has fewer than 10 staff and turnover or balance sheet of €2m or less. A **small** enterprise has fewer than 50 staff and €10m or less. Linked and partner enterprises count towards the totals.

| DSA provision | Applies to a micro/small hosting **platform**? | Basis |
|---|---|---|
| Art 6 hosting liability exemption; Art 8 no general monitoring | Yes (these benefit the provider) | Arts 6, 8 |
| Art 11 point of contact for authorities | **Yes** | Ch. III Section 1 has no size exemption |
| Art 12 point of contact for recipients | **Yes** | same |
| Art 13 legal representative | Only if not established in the EU, so N/A for a Portuguese operator | Art 13 |
| Art 14 terms and conditions (paras 1, 2, 4) | **Yes** | same |
| Art 15 annual transparency report | **No**, exempt under Art 15(2) unless a VLOP | Art 15(2) |
| Art 16 notice and action | **Yes** | Section 2 (hosting) has no size exemption |
| Art 17 statement of reasons | **Yes** | same |
| Art 18 notifying suspected criminal offences | **Yes** | same |
| Arts 20-28 (internal complaint system, out-of-court settlement, trusted flaggers, misuse, dark patterns, ads, recommenders, minors) | **No**, except Art 24(3) | Art 19(1) |
| Art 24(3) average monthly active recipients, on request of the DSC or Commission | **Yes** | Art 19(1) carve-back |
| Art 24(5) sending statements of reasons to the DSA Transparency Database | **No** | Commission legal notice: https://transparency.dsa.ec.europa.eu/page/legal-information |
| Arts 30-32 (marketplaces) | No (not a marketplace, and Art 29 exemption) | Art 29 |

**If the operator is not micro/small** (for example because it is part of a larger group), Art 15 and Arts 20-28 also apply. That would mean a mandatory internal complaint system, an out-of-court dispute settlement clause, transparency reports and database submissions. **Client fact needed** (see §7).

### 1.3 What the Terms must say (DSA)

| Required clause | Source | Text requirement |
|---|---|---|
| Restrictions on content and use (acceptable use, prohibited content) | Art 14(1) | State "any restrictions" imposed on information provided by recipients, including "policies, procedures, measures and tools used for the purpose of content moderation, including algorithmic decision-making and human review". |
| Plain language, public, machine-readable | Art 14(1) | "Clear, plain, intelligible, user-friendly and unambiguous language", publicly available "in an easily accessible and machine-readable format". |
| Internal complaint procedure | Art 14(1) | Describe its "rules of procedure" if one exists. It is not mandatory for micro/small under Art 19/20, but P2B Art 11 may require one (see §3; also exempt for small). |
| Notice of significant changes | Art 14(2) | Recipients must be informed of any significant change. |
| Diligent, objective, proportionate enforcement | Art 14(4) | A contractual commitment to apply restrictions with due regard to fundamental rights, including freedom of expression. |
| Notice-and-action description | Art 16(1)-(2) | Explain how anyone can report illegal content **electronically**. A notice should contain (a) why the content is illegal, (b) its exact URL, (c) the notifier's name and email (except for child sexual abuse offences), and (d) a good-faith statement. |
| Handling of notices | Art 16(4)-(6) | Send a receipt confirmation and a decision "without undue delay", and inform the notifier of redress options. Decisions must be timely, diligent, non-arbitrary and objective, with disclosure if automated means are used. |
| Statement of reasons to the affected business | Art 17(1)-(4) | Required for any removal, disabling or demotion of content, suspension or termination of the service or account, or monetary restriction. It is due **no later than** when the restriction is imposed, and only where electronic contact details are known. Content: (a) the measure, its scope and duration; (b) the facts, including whether it followed a notice or an own-initiative check; (c) any use of automation; (d) the legal ground if the content is illegal; (e) the contractual ground if it breaches the Terms; (f) the redress available. |
| Criminal offence notification | Art 18 | Not a Terms clause as such, but the Terms should say that information suggesting a threat to life or safety will be reported to the competent authorities (or Europol). |
| Point of contact for authorities | Art 11(1)-(3) | Publish an easily accessible, current contact, with the **languages** accepted: one widely understood in the EU plus an official language of the Member State of establishment, so EN + PT. |
| Point of contact for recipients | Art 12(1)-(2) | An electronic, user-friendly contact. Users may choose the means, and it must "not solely rely on automated tools". Publish it and keep it current. |

**Portugal (Lei 12-A/2026, published 15 April 2026, in force 20 April 2026):**
- ANACOM is the Digital Services Coordinator (DSC). ERC supervises DSA Art 14(3), 26(1)-(2) and 28(1). CNPD supervises Art 26(3) and 28(2). Source: https://files.diariodarepublica.pt/1s/2026/04/07301/0000200025.pdf (Arts 5, 18, 20). ANACOM summary: https://www.anacom.pt/render.jsp?contentId=1833941.
- **Offences (Art 18(1)):** e) not designating a point of contact for authorities; f) not publishing it accessibly; g)-h) the same for the recipients' contact point; k) not making Art 14(1) terms available, or making them available in a non-compliant way; l) not informing of changes under Art 14(2).
- **Fines (Art 20):** up to 1% or 6% of worldwide annual turnover depending on the offence, halved for negligence.
- **Duties to authorities (Art 2):** comply with authority orders on illegal content and on information about recipients. This includes a Portugal-specific duty to supply **lists of recipients** on request (Art 2(c)).
- **Recipients may complain to ANACOM** (Art 11). The Terms can mention this as part of redress under Art 17(3)(f).
- ANACOM's provider guidance (pre-2026 page) recommends sending the contact-point designations to `dsc@anacom.pt`: https://www.anacom.pt/render.jsp?categoryId=431109 **(verify against post-Lei 12-A guidance)**.

### 1.4 Product gaps the Terms will depend on (for engineering, not legal text)

- **Art 16:** there is no public electronic "report illegal content" mechanism. The Terms can't describe one until it exists. A visible form or mailto with fields (a)-(d) is the minimum.
- **Art 17:** business status changes (`inactive`) and product unpublishing by staff have **no stored reason** in the domain types. Art 17 needs a reason, sent to the business by the time of the action.

---

## 2. Portuguese law

### 2a. Decreto-Lei 7/2004 (e-commerce): information duties

**Text (original 2004 publication):** WIPO Lex https://www.wipo.int/wipolex/en/legislation/details/5537. Consolidated (2023 ELI, which predates Lei 12-A/2026): https://data.dre.pt/eli/dec-lei/7/2004/p/cons/20230530/pt/html.

**Applies?** **Yes.**
- Art 4(1): a provider established in Portugal is "integralmente sujeit[o] à lei portuguesa".
- **Lei 12-A/2026 Art 35(a) repealed DL 7/2004 Arts 12-19** (the national hosting liability rules and the 48-hour "solução provisória de litígios"). Liability now follows the DSA (new Art 11 wording, Lei 12-A Art 32). Old commentary that relies on DL 7/2004 Art 16/18 is out of date.

| Required clause / notice | Source | Text requirement |
|---|---|---|
| Permanent provider identification (legal notice / imprint) | DL 7/2004 Art 10(1) | "Permanentemente em linha", with easy, direct access: (a) name or company name; (b) geographic address and email "em termos de permitir uma comunicação direta"; (c) public register entries and numbers; (d) tax number (NIF). Failing this is an offence (Art 37(1)(a) as amended by Lei 12-A/2026). |
| Prior authorisation / regulated profession | Art 10(2)-(3) | Only if applicable. Probably N/A. |
| Costs to recipients | Art 10(4) | Any cost beyond telecoms must be clearly stated before use. For visitors: free. For businesses: depends on the fee model (client fact). |
| Online contracting information (business sign-up/application) | Art 28(1) | Before the "ordem de encomenda": (a) how the contract is concluded; (b) whether the provider files the contract and how the recipient can access it; (c) the contract languages; (d) the technical means to correct input errors; (e) the terms and general clauses; (f) any codes of conduct. **Art 28(2): this can be waived between non-consumers**, so the Business Terms may contain a waiver, but it is easier to just comply. |
| Acknowledgement of receipt | Art 29 | Electronic acknowledgement of an order. Can be waived with a non-consumer (Art 29(1)). It fits the application-received email. |
| Terms storable and reproducible | Art 31(1) | Terms and general clauses must be communicated in a way that lets the recipient store and reproduce them, such as a downloadable or printable version with a version date. |
| Product listings: offer vs invitation | Art 32(1) | An online offer is a binding proposal only if it contains every element needed to conclude the contract. Otherwise it is an "convite a contratar". The Business Terms should say that **catalog listings are not offers made by Sanctus** and that any sale is between the visitor and the business. |

### 2b. Company details on the website: Código das Sociedades Comerciais Art 171

**Applies?** **Yes, if the operator is a company.** Art 171(1) requires, in "sítios na Internet" and all external acts: the firm, type, registered office, the commercial registry office, the registration number and the NIPC. Art 171(2) adds share capital for Lda/SA. Secondary text: https://informador.pt/legislacao/lexit/codigos/direito-comercial/codigo-das-sociedades-comerciais/titulo-i-parte-geral-2/capitulo-xiv-publicidade-de-actos-sociais/artigo-171-o-mencoes-em-actos-externos/ (**verify against DRE consolidated CSC**). These details go in the legal notice and in the Terms preamble.

### 2c. Livro de Reclamações Eletrónico: DL 156/2005, as amended by DL 74/2017

**Sources:**
- DRE consolidated text: https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2005-34431675
- DL 74/2017: https://files.diariodarepublica.pt/1s/2017/06/12501/0000200008.pdf
- Platform: https://www.livroreclamacoes.pt
- AMT note on the regime: https://www.amt-autoridade.pt/media/2162/disponibilizacaolre.pdf

**What the law says:**
- The electronic format covers "todos os fornecedores de bens e prestadores de serviços … quer desenvolvam a atividade em estabelecimento … ou através de meios digitais".
- Those with websites must "divulgar nos respetivos sítios na Internet, em local visível e de forma destacada, o acesso à Plataforma Digital" (AMT summary of the DL).
- Replies are due within 15 working days.
- The stated purpose is to secure the right of complaint of "consumidores e utentes" (AMT note).

**Applies?** **Maybe.**
- **Business users:** they are not consumers. The regime is consumer/utente-oriented, so it likely does not apply to the B2B relationship as such **(verify)**.
- **Visitors:** they use a free public service. Whether a free catalog-browsing service makes Sanctus a "prestador de serviços" with "contacto com o público" for these purposes is unclear.
- **Practical view:** registering with the platform and showing the official icon/link in the footer is low cost and removes the risk. The lawyer should decide. The supervising authority would likely be ASAE (residual) **(verify)**.
- **Terms clause:** if the link is used, mention the Livro de Reclamações Eletrónico alongside the support contact.

### 2d. Alternative dispute resolution (RAL): Lei 144/2015, Lei 24/96 Art 14

**Sources:**
- Lei 144/2015 (original): https://files.diariodarepublica.pt/1s/2015/09/17500/0725107258.pdf
- DGC list of RAL entities: https://www.consumidor.gov.pt/parceiros/sistema-de-defesa-do-consumidor/entidades-de-resolucao-alternativa-de-litigios-de-consumo
- Lei 24/96: https://diariodarepublica.pt/dr/detalhe/lei/24-1996-406882

**What the law says:**
- **Art 18 Lei 144/2015:** suppliers established in Portugal must inform **consumers** about the RAL entities they are bound to, by adhesion or by "arbitragem necessária", and give their websites. The information goes on the website and in the general contract terms where they exist. Secondary sources (APCMC; AMT decision https://www.amt-autoridade.pt/media/2178/decisao_sumula_pco2017_15.pdf) say **DL 102/2017 narrowed this** to suppliers that are actually bound **(verify current wording)**.
- **Lei 24/96 Art 14, as amended by Lei 63/2019:** consumer disputes of €5,000 or less go to necessary arbitration or mediation **if the consumer chooses**. This arguably "binds" every supplier and keeps the Art 18 duty alive. **Lawyer to decide.**
- **The EU ODR platform link is no longer required.** Regulation (EU) 2024/3228 repealed Reg. 524/2013 with effect from 20 July 2025: https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng. Do **not** add the old ODR link.

**Applies?**
- **Business Terms:** no. RAL here concerns consumer disputes, and P2B mediation is a separate regime (§3).
- **Visitor Terms of Use:** maybe, only if the lawyer finds a consumer contract (free browsing under Terms of Use).
- **Low-cost option:** a short clause naming a RAL entity with generic competence (for example CNIACC) and the DGC list link. The client must choose the entity, so it is not filled in here.

### 2e. Language

| Rule | Source | What it means for the Terms |
|---|---|---|
| "A informação ao consumidor é prestada em língua portuguesa." | Lei 24/96 Art 7(3) (https://diariodarepublica.pt/dr/detalhe/lei/24-1996-406882) | The visitor Terms of Use and consumer-facing notices must exist in Portuguese. |
| Information on goods and services offered to the public on the national market must be in Portuguese. Contracts for goods and services in the internal market must be in Portuguese, and foreign versions may be added. | DL 238/86 Arts 1-3 (https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1986-137809016) **(verify Art 3 wording)** | Both documents should be in PT, with EN as a convenience version. **Business duty:** product information shown to Portuguese consumers must be in PT. Put this in the Business Terms as the business's responsibility. |
| Authority contact-point languages | DSA Art 11(3) | Publish EN + PT. |
| P2B mediators must work in the language of the T&C | P2B Art 12(2) | Only relevant if Art 12 applies (not for small providers). |
| Ambiguity is read in favour of the adhering party | DL 446/85 Art 11(2) | A "the English version prevails" clause will not override the PT version for PT consumers. Name the PT version as authoritative, or the version in the user's language. |

### 2f. Governing law and jurisdiction

| Relationship | Rule | Source | What the Terms can say |
|---|---|---|---|
| B2B (Business Terms) | Free choice of law | Rome I Reg. 593/2008 Art 3: https://eur-lex.europa.eu/eli/reg/2008/593/oj/eng | Portuguese law. |
| B2B | Choice of court agreements, exclusive unless agreed otherwise, in writing or evidenced in writing (electronic records count if durable) | Brussels I bis Reg. 1215/2012 Art 25(1)-(2): https://eur-lex.europa.eu/eli/reg/2012/1215/oj/eng | For example, the courts of Lisbon (the client chooses). DL 446/85 Art 19(g) bars a forum that causes "graves inconvenientes" without justification, which a Portuguese forum for Portuguese businesses won't. |
| Consumer (visitors) | A choice of law cannot deprive the consumer of the mandatory protection of their habitual residence where the trader directs activities there | Rome I Art 6(1)-(2) | Portuguese law "without prejudice to the mandatory consumer protections of your country of residence". |
| Consumer | The consumer may sue in their own domicile and may be sued only there. A prior forum clause is valid only within narrow limits | Brussels I bis Arts 17-19 | No exclusive-forum clause against consumers. Mention the consumer's home courts. |
| Consumer, PT standard terms | Absolutely prohibited: clauses that exclude or limit access to judicial protection, or that set up arbitration without legal procedural guarantees | DL 446/85 Art 21(h) **(verify)** | No mandatory arbitration or class waiver for consumers. |
| Global baseline (non-EU visitors) | No uniform rule | — | "To the extent permitted by the law of your country". The lawyer to decide whether a US-style arbitration clause is wanted (not recommended for an EU operator). |

### 2g. Unfair standard terms: Decreto-Lei 446/85 (Cláusulas Contratuais Gerais)

**Source:** consolidated text at https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1985-34436475 (note that the DRE says consolidated versions have no legal value).

**Applies?** **Yes, to both documents.** It covers clauses drafted in advance that the other party merely accepts (Art 1). It applies **B2B** (Arts 17-19, between "empresários ou entidades equiparadas") and to **consumers** (Arts 20-22, plus all of Arts 17-19).

| Requirement | Article | Effect on drafting |
|---|---|---|
| Communicate the clauses in full and in good time, and explain them on request | Arts 5-6 | Clickwrap acceptance at business onboarding, with a link and a downloadable copy. For visitors, a prominent link. Whether browse-wrap binds is an open question (§8). |
| Clauses not communicated or explained are **excluded** from the contract | Art 8 | The burden of proof is on the platform. Keep acceptance logs and versions. |
| Ambiguity is read in favour of the adherent | Art 11 | Use plain drafting. This matches DSA Art 14 and P2B Art 3. |
| General good-faith test | Arts 15-16 | — |
| **Absolutely prohibited, B2B and consumer** (selection) | Art 18 | Must not exclude or limit liability for: death, physical or moral injury, or health (a); extra-contractual damage (b); breach, delay or defective performance **in case of dolo or culpa grave** (c), including by representatives or auxiliaries (d). Also not allowed: an exclusive right to interpret the contract (e); excluding the exceptio non adimpleti contractus or termination for breach (f); perpetual obligations or duration at the drafter's sole will (j). **(verify list against consolidated text)** |
| **Relatively prohibited, B2B** (judged case by case) | Art 19 | Disproportionate penalty clauses (c); termination "imediata ou com pré-aviso insuficiente" without compensation where the other side has made significant investments (f); a seriously inconvenient forum (g); unilateral change of performance without compensation (h). This directly affects the platform's suspension and termination clauses. Align with P2B Art 4 notice periods. |
| **Consumer extras** | Arts 21-22 | For example, a unilateral right to change contract terms without a "razão atendível" agreed in the contract (Art 22(1)(c)) **(verify)**. The visitor Terms need a change clause with stated reasons and notice. |

**Related ceilings on liability limits (Portugal):**
- **Civil Code Art 809:** an advance waiver of the creditor's rights is null. Doctrine and case law disagree on how far limitation of liability for **culpa leve** is valid. Lawyer to confirm.
- **Civil Code Art 800(2):** liability for auxiliaries may be excluded only if it does not breach public-order rules.
- **Product liability (DL 383/89 Art 10):** cannot be excluded or limited towards the injured person. The new Product Liability Directive (EU) 2024/2853 (https://eur-lex.europa.eu/eli/dir/2024/2853/oj/eng) applies to products placed on the market from 9 Dec 2026. Lawyer to check whether its online-platform rule, platforms treated like distributors when they present a product so it looks like theirs, could reach Sanctus **(verify article)**.
- **Lei 24/96 Art 16:** consumer rights cannot be waived, and clauses excluding them are null **(verify)**.
- **DL 446/85 Art 34-A ff.** (added by DL 32/2021): the court-declared prohibited-clauses registry and an administrative fine regime **(verify)**.

---

## 3. Platform-to-Business Regulation (EU) 2019/1150

**Source:** official text at https://eur-lex.europa.eu/eli/reg/2019/1150/oj/eng (checked against https://lawplayer.com/eu/act/32019R1150). Applies since 12 July 2020 (Art 19(2)).

### 3.1 Does it apply?

**Likely yes.** An "online intermediation service" must meet three cumulative tests (Art 2(2)):
- (a) It is an information society service. Yes.
- (b) It "allow[s] business users to offer goods or services to consumers, with a view to facilitating the initiating of direct transactions between those business users and consumers, irrespective of where those transactions are ultimately concluded". The catalog plus "contact the store" is designed to start a direct transaction, and the sale happens off-platform. Recitals: no contract between business and consumer is needed, and it doesn't matter whether money changes hands.
- (c) It is "provided to business users on the basis of contractual relationships". Approval plus the Business Terms make a contract, **even if the service is free**. Recital: the intention to be bound is expressed unequivocally.

Territorial scope (Art 1(2)): business users **established in the EU** that offer goods or services to **consumers in the EU**. **It does not apply** if a business user sells only to trade or professional buyers. That is a client fact.

**Status:** the Commission's Digital Omnibus (19 Nov 2025) proposes repealing the Regulation. It is contested, for example by a joint AT/BE/IT/NL non-paper (https://www.kennedyslaw.com/en/thought-leadership/article/2026/repeals-effected-by-the-digital-omnibus-regulation-proposal). **The lawyer must check whether it has been repealed at the time of signing.** Until then, draft to comply. Most of these duties overlap with DSA Arts 14 and 17 anyway.

### 3.2 Small-enterprise exemptions

- **Art 11(5):** the internal complaint-handling system is not required for providers that are **small enterprises** (Annex to Rec. 2003/361/EC).
- **Art 12(7):** naming two or more mediators is not required for small enterprises.
- **Everything else applies whatever the size:** Arts 3, 4, 5, 8, 9 and the others.

### 3.3 What the Business Terms must say (P2B)

| Required clause | Source | Text requirement |
|---|---|---|
| Plain, intelligible language | Art 3(1)(a) | Same standard as DSA Art 14. |
| Easily available at every stage, including before contracting | Art 3(1)(b) | Show them on the application form, before approval. |
| **Grounds** for suspending, terminating or otherwise restricting the service | Art 3(1)(c) | List the grounds concretely: pause catalog, unpublish or delete product, suspend or close account. |
| Additional distribution channels and affiliate programmes | Art 3(1)(d) | For example, whether Sanctus shows catalogs or products elsewhere (social media, partner sites, marketing). |
| How the Terms affect the business's IP | Art 3(1)(e) | General information on ownership of and control over uploaded IP (see §4). |
| Changes: notice on a **durable medium**, at least **15 days** (longer if significant technical adaptation is needed), with a right to terminate | Art 3(2) | Email notice. The business may terminate before the change takes effect. Waiver happens only in writing or by a clear affirmative act (submitting new products during notice counts, unless the period was extended for technical reasons). |
| Exceptions to the notice period | Art 3(4) | Legal or regulatory obligation, or urgent change against an unforeseen, imminent threat (fraud, malware, spam, data breach, cybersecurity). |
| Terms that fail Art 3(1)/(2) are null and void | Art 3(3) | This is a reason to get the drafting right. |
| Business identity clearly visible | Art 3(5) | The catalog must show the business name. That is already the product design; state it. |
| **Restriction or suspension** of individual offers: written reasons on a durable medium **before or when it takes effect** | Art 4(1) | Matches DSA Art 17. A reason must be sent with every unpublish or pause. |
| **Termination** of the whole service: reasons on a durable medium **at least 30 days before** | Art 4(2) | The account-termination clause needs a 30-day notice period. |
| Exceptions to the 30 days | Art 4(4) | (a) legal or regulatory obligation; (b) an imperative reason under national law; (c) the provider can show repeated infringements. Reasons are still due without undue delay, except under Art 4(5). |
| The business can clarify the facts, with reinstatement and data access restored if the decision is reversed | Art 4(3) | Describe how to contest a decision, for example by replying to the notice email. |
| Content of the reasons | Art 4(5) | Specific facts and circumstances (including third-party notices) and the Art 3(1)(c) ground relied on. |
| Main **ranking** parameters | Art 5(1) | There is no cross-business directory. If the business controls the product order in its own catalog, say so. If Sanctus orders anything (featured items, landing page), describe the parameters. Commission ranking guidelines: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52020XC1208(01) **(verify)**. |
| Differentiated treatment | Art 7 | Only if Sanctus or an affiliate offers its own goods next to business users. Client fact. |
| No retroactive changes; how to end the relationship; data access after termination | Art 8(a)-(c) | Account closure procedure, plus what the business can export or download and for how long after closure. |
| **Data access** | Art 9 | Describe what data (catalog analytics, views, AR launches) Sanctus and the business can access, whether it is aggregated, and any sharing with third parties. |
| Internal complaint handling | Art 11 | **Exempt if small.** Recommended anyway, as one support address with a response time. |
| Two or more mediators | Art 12 | **Exempt if small.** |

---

## 4. Content licence, acceptable use, AR disclaimers, liability limits

### 4.1 Licence for uploaded 3D models, photos and text

**Applies?** **Yes (contract design).** Portuguese copyright law governs how far a licence can reach.

| Required clause | Source | Text requirement |
|---|---|---|
| Licence, not an assignment | CDADC Art 41(1): authorising use "não implica transmissão do direito de autor". Consolidated CDADC: https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1985-34475475 | The Business Terms grant Sanctus a non-exclusive licence. The business keeps ownership. |
| Written licence specifying form, time, place and price | CDADC Art 41(2)-(3) **(verify wording)**. Art 43(4)-style presumption that unnamed uses aren't licensed **(verify)** | List each use explicitly: host, store, copy, convert or optimise formats (e.g. GLB compression, thumbnails, posters), display in catalog, product and AR views, generate QR codes, cache via CDN, back up, show in platform marketing (only if the client wants it). Scope: worldwide, for the duration of the account plus a stated wind-down. Price: free (or "included in the fee"). Accept the Terms in writing, i.e. electronically. |
| Moral rights | CDADC Art 56 (inalienable) **(verify)** | No waiver of moral rights. Commit to no distorting edits beyond technical optimisation. |
| Business warranties | DSA Art 14(1) + general law | The business warrants it owns or has licensed all content (including photos of designers' products, third-party 3D models and brand marks) and that product information is accurate. It indemnifies Sanctus for third-party claims, subject to the DL 446/85 Art 19 proportionality test. |
| P2B IP disclosure | P2B Art 3(1)(e) | General statement of how the Terms affect IP ownership and control. |
| After closure | P2B Art 8(c), DSA Art 17 | Say how long content stays after closure or unpublishing, what backups persist, and the deletion timeline. Align with the privacy notice (`docs/legal/research/privacy-research.md`). |
| Visitor licence | — | Visitors get a personal, non-commercial right to view. No scraping or extraction of 3D models (database-right language optional, see Directive 96/9/EC). |

**Copyright DSM Directive Art 17** (online content-sharing service providers, Dir. 2019/790, https://eur-lex.europa.eu/eli/dir/2019/790/oj/eng) is **probably not applicable**. Sanctus's main purpose isn't giving access to large amounts of user-uploaded copyright works to organise and promote for profit; it hosts business product content. The lawyer should confirm.

### 4.2 Acceptable use for uploaded content

**Applies?** **Yes. DSA Art 14(1) requires the restrictions to be stated.** Suggested categories (business content):
- illegal content of any kind (DSA definition, Art 3(h));
- IP infringement;
- counterfeit goods;
- products that are unsafe or banned from sale in the EU;
- misleading product information, including dimensions, materials and prices (Unfair Commercial Practices Directive 2005/29/EC, PT DL 57/2008);
- content not about furniture or home products (if the client wants a scope restriction);
- personal data of third parties;
- malware or malicious files inside model files;
- excessive file sizes or abuse of storage;
- links to phishing or unrelated sites in the "contact the store" field.

For each category the Terms should name the possible measures: unpublish, pause catalog, delete product, suspend or close account. Those are the Art 17 and P2B Art 3(1)(c) grounds.

### 4.3 AR safety and accuracy disclaimers

**No specific statute requires an AR disclaimer.** The basis is general consumer information duties (Lei 24/96 Art 8) and the limits in DL 446/85 Art 18, so the wording must **warn and inform**, not exclude liability for injury.

| Clause | Basis | Text requirement |
|---|---|---|
| Scale and appearance are approximate. Colour, texture and size can differ by device, lighting and tracking quality. **Not a substitute for measuring your space and checking the dimensions with the store.** | Lei 24/96 Art 8 (accurate information); DL 446/85 Art 18(a) (no exclusion for injury) | Plain warning, near the AR button and in the Terms. The product already marks AR scale as verified only when the measured size matches (CLAUDE.md), so the Terms can say "where a model is marked as scale-verified…". |
| Physical safety while using AR | General duty of care | Stay aware of your surroundings, don't use AR while moving or driving, supervise children. |
| AR is provided by the device's native viewer (Google Scene Viewer / Apple Quick Look) | — | Sanctus does not control the third-party AR software. Availability depends on the device. |
| Product information comes from the business, and Sanctus does not sell the products | DSA Art 6(3) logic; DL 7/2004 Art 32 | Any purchase, price, warranty, delivery or withdrawal right is between the visitor and the store. Business identity is visible (P2B Art 3(5)). |

### 4.4 Liability limits that are allowed (Portugal)

- **Allowed** (subject to DL 446/85 Arts 18-19, 21-22, and Civil Code Arts 800 and 809):
  - limits for slight negligence (culpa leve) in B2B, such as a cap tied to fees paid in the last 12 months, or a fixed amount for a free service;
  - excluding indirect or consequential loss and lost profit in B2B **(verify)**;
  - "as available" service-level language;
  - no liability for third-party AR software, for content uploaded by businesses (DSA Art 6 safe harbour), or for the business's products.
- **Not allowed:**
  - excluding or limiting liability for death or personal injury;
  - excluding or limiting liability for **dolo or culpa grave**;
  - excluding product liability (DL 383/89);
  - against consumers, waiving consumer rights (Lei 24/96 Art 16), and broad unilateral changes (DL 446/85 Art 22).

---

## 5. European Accessibility Act: Directive (EU) 2019/882; Portugal DL 82/2022

**Sources:**
- Directive: https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng
- DL 82/2022 (DR n.º 234/2022, Série I, 6 Dec 2022; in force 7 Dec 2022; obligations from 28 June 2025): index page https://informador.pt/legislacao/diploma/requisitos-de-acessibilidade-de-produtos-e-servicos-tendo-em-conta-pessoas-com-deficiencia (secondary; pull the DRE text). Commentary: https://www.garrigues.com/pt/pt-PT/news/primeiro-prazo-do-novo-regime-juridico-da-acessibilidade-termina-em-junho-2025-com-novas
- Technical requirements in Portugal: Portaria 220/2023 **(verify)**.

**Applies?** **Probably not.**
- The only candidate service category is "e-commerce services". Art 3(30) defines these as services provided at a distance through websites and mobile apps, at the individual request of a consumer, "**with a view to concluding a consumer contract**". Sanctus concludes no consumer contract: there is no checkout, and the business's contact link leads off-platform.
- Commentary on product-information-only sites reaches the same reading: https://accessible.org/eaa-cover-product-information-website/ (secondary).
- The **microenterprise exemption for services** (Art 4(5)) is a second, independent reason, if the operator qualifies.
- **If the lawyer finds it does apply:** Annex V requires the service provider to publish information on how the service meets the accessibility requirements "in the general terms and conditions, or equivalent document" (Art 13(2) and Annex V) **(verify)**.
- **Recommendation:** publish a short **voluntary accessibility statement**, separate from the Terms. It should give the target standard (WCAG 2.1 AA / EN 301 549), known limits (for example, 3D/AR views have no non-visual equivalent beyond the text description and dimensions) and a contact address.
- Portugal's DL 83/2018 (web accessibility) applies only to public-sector bodies, so it is N/A.

---

## 6. Other regimes to screen (for the lawyer)

| Regime | Applies? | Note |
|---|---|---|
| GDPR / privacy notice | Yes | A separate document. See `docs/legal/research/privacy-research.md`. The Terms should cross-reference it. |
| Consumer Rights Directive 2011/83 Art 6a and DL 24/2014 ("online marketplace" information) | Likely no | An online marketplace lets consumers "conclude distance contracts". Not the case here. |
| General Product Safety Regulation (EU) 2023/988 Art 22 (online marketplaces) | Likely no | Same definition test (Art 3(14)): https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng. Businesses still owe product safety. Add a business warranty. |
| Digital Content Directive (EU) 2019/770 / PT DL 84/2021 (visitors) | Unclear | It applies where the consumer pays a price **or provides personal data**, except data processed only to supply the service. Analytics reportedly store no personal data. Lawyer to confirm. |
| US DMCA §512 safe harbour (global baseline) | Optional | Needs a designated agent registered with the US Copyright Office: https://www.copyright.gov/dmca-directory/. Only worth it if there is US exposure. |

---

## 7. Facts the client must supply

None of these is invented here. Each is a blank for the client.

1. **Legal entity:** company name (firma), type (Lda / SA / sole trader), registered office, commercial registry office and registration number, NIPC/NIF, share capital (CSC Art 171; DL 7/2004 Art 10).
2. **Contacts:**
   - a support email (DSA Art 12; DL 7/2004 Art 10(1)(b));
   - an authorities contact point with its languages (DSA Art 11);
   - a contact for illegal-content notices (DSA Art 16);
   - optionally, a postal address for legal notices.
3. **Size** under Rec. 2003/361/EC: headcount, turnover and balance sheet, **including linked or partner enterprises**. This decides DSA Arts 15 and 20-28 and P2B Arts 11-12.
4. **Fee model** for businesses: free, subscription or per-catalog. It affects DL 7/2004 Art 10(4) and P2B reading, and drafting of the liability cap. Billing is out of scope for the platform (CLAUDE.md), but the contract may still have a price.
5. **Who the business users sell to:** consumers, trade only, or both (P2B Art 1(2)). Are all business users established in the EU or Portugal?
6. **Does Sanctus or an affiliate offer its own goods** on the platform (P2B Art 7)? Does Sanctus promote catalogs or products in other channels (P2B Art 3(1)(d))?
7. **Moderation practice:**
   - who reviews (human staff only, or any automated checks);
   - the grounds for each measure (pause catalog, unpublish or delete product, suspend or close account);
   - the target response times for notices and complaints.
8. **Content after closure:** retention and deletion periods for products, models, photos and backups, and what the business can export (P2B Art 8(c)).
9. **Choice of courts:** the city (for example, Lisbon or Porto) for B2B disputes.
10. **RAL entity** to name for consumers, if any, and whether the client has already adhered to an arbitration centre.
11. **Livro de Reclamações:** whether the operator is already registered on livroreclamacoes.pt.
12. **Target countries** outside the EU, if any (global baseline, DMCA).
13. **Minimum age** for business account holders (presumably 18 and acting for a business), and whether any visitor age rule is wanted.
14. **Effective date and version numbering** of the Terms, and how existing businesses will accept the first version.

---

## 8. Open questions for the lawyer

1. **DSA classification:** do you agree Sanctus is an "online platform" (Art 3(i)) and not a marketplace (Section 4)? Does the client qualify as micro/small, taking linked enterprises into account?
2. **Lei 12-A/2026:** is there a duty to **notify** ANACOM of the contact points, beyond publishing them? (ANACOM's pre-2026 page recommends a signed communication to `dsc@anacom.pt`.) Should the Terms mention the right to complain to ANACOM (Art 11)?
3. **P2B:** confirm that it applies to a free catalog with an off-platform contact link. Has the Digital Omnibus repeal been adopted? Confirm the small-enterprise status for Arts 11-12.
4. **Livro de Reclamações:** does it apply to a B2B platform whose visitors pay nothing? Which supervising authority? Is displaying the link advisable even if not required?
5. **RAL:** what is the current wording of Lei 144/2015 Art 18 after DL 102/2017? Does Lei 24/96 Art 14 (Lei 63/2019) "bind" Sanctus for this purpose? Is there any consumer contract with visitors at all?
6. **Visitor Terms enforceability:** are browse-wrap Terms of Use binding on visitors under DL 446/85 Arts 5-8 when there is no account or click? Or should the visitor document be framed as a notice (rules of use and information) rather than a contract?
7. **Liability caps:** under Civil Code Art 809 and DL 446/85 Art 18(c)-(d), how far can liability for culpa leve be capped B2B? Is excluding indirect loss enforceable? What cap is suitable for a free service?
8. **Suspension and termination:** confirm the notice periods (P2B 30 days, the Art 4(4) exceptions) and that they pass DL 446/85 Art 19(f) for businesses that invested in 3D models.
9. **Copyright licence:** confirm the CDADC Art 41 formalities (written form, listed uses, time, place, price) are met by electronic acceptance. Can the licence survive termination for a wind-down or backup period?
10. **Product Liability Directive 2024/2853 and GPSR:** is there any exposure for a catalog platform that presents third-party products? Is a business indemnity enough?
11. **Language:** PT authoritative with EN convenience? Does DL 238/86 Art 3 require the Business Terms in Portuguese for Portuguese businesses?
12. **EAA:** confirm the "not an e-commerce service" reading (Art 3(30)) and whether a voluntary statement creates any liability.
13. **Global visitors:** is any clause needed for the US or UK (DMCA agent, UK Online Safety Act), or is "to the extent permitted by local law" enough?
14. **Statements of reasons:** is email to the business owner a sufficient "durable medium" (P2B Art 4) and "clear and specific" (DSA Art 17)? Must the notifier's identity ever be disclosed (Art 17(3)(b): only where strictly necessary)?

---

## Source list (official first)

**EU**
- DSA, Reg. (EU) 2022/2065: https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng (text checked via https://www.eu-digital-services-act.com/)
- DSA Transparency Database legal notice (micro/small exemption from Art 24(5)): https://transparency.dsa.ec.europa.eu/page/legal-information
- P2B, Reg. (EU) 2019/1150: https://eur-lex.europa.eu/eli/reg/2019/1150/oj/eng (text checked via https://lawplayer.com/eu/act/32019R1150)
- SME definition, Rec. 2003/361/EC: https://eur-lex.europa.eu/eli/reco/2003/361/oj
- ODR repeal, Reg. (EU) 2024/3228: https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng
- Rome I, Reg. 593/2008: https://eur-lex.europa.eu/eli/reg/2008/593/oj/eng
- Brussels I bis, Reg. 1215/2012: https://eur-lex.europa.eu/eli/reg/2012/1215/oj/eng
- EAA, Dir. (EU) 2019/882: https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng
- Copyright DSM, Dir. (EU) 2019/790: https://eur-lex.europa.eu/eli/dir/2019/790/oj/eng
- GPSR, Reg. (EU) 2023/988: https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng
- PLD, Dir. (EU) 2024/2853: https://eur-lex.europa.eu/eli/dir/2024/2853/oj/eng

**Portugal**
- Lei 12-A/2026 (DSA enforcement; amends DL 7/2004): https://files.diariodarepublica.pt/1s/2026/04/07301/0000200025.pdf ; ANACOM: https://www.anacom.pt/render.jsp?contentId=1833941
- DL 7/2004: https://www.wipo.int/wipolex/en/legislation/details/5537 ; ELI https://data.dre.pt/eli/dec-lei/7/2004/p/cons/20230530/pt/html
- DL 156/2005 (consolidated): https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2005-34431675 ; DL 74/2017: https://files.diariodarepublica.pt/1s/2017/06/12501/0000200008.pdf ; https://www.livroreclamacoes.pt ; AMT note: https://www.amt-autoridade.pt/media/2162/disponibilizacaolre.pdf
- Lei 144/2015: https://files.diariodarepublica.pt/1s/2015/09/17500/0725107258.pdf ; DGC RAL list: https://www.consumidor.gov.pt/parceiros/sistema-de-defesa-do-consumidor/entidades-de-resolucao-alternativa-de-litigios-de-consumo
- Lei 24/96 (consumer protection): https://diariodarepublica.pt/dr/detalhe/lei/24-1996-406882
- DL 238/86 (Portuguese language): https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1986-137809016
- DL 446/85 (standard terms, consolidated): https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1985-34436475
- CDADC (copyright code, consolidated): https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1985-34475475
- CSC Art 171 (secondary text): https://informador.pt/legislacao/lexit/codigos/direito-comercial/codigo-das-sociedades-comerciais/titulo-i-parte-geral-2/capitulo-xiv-publicidade-de-actos-sociais/artigo-171-o-mencoes-em-actos-externos/

**Secondary (commentary, not authority)**
- VdA on Lei 12-A/2026: https://www.vda.pt/pt/publicacoes/insights/portugals-digital-services-act-implementation-law-what-you-need-to-know/28520/
- Kennedys on the Digital Omnibus repeals: https://www.kennedyslaw.com/en/thought-leadership/article/2026/repeals-effected-by-the-digital-omnibus-regulation-proposal
- APCMC on Lei 63/2019: https://apcmc.pt/legislacao/conflitos-de-consumo-arbitragem-ou-mediacao-obrigatoria/
- accessible.org on EAA scope for product-information sites: https://accessible.org/eaa-cover-product-information-website/
