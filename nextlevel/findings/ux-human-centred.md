# Sanctus web app: UX audit (2026-10-20)

## Human-Centred Design & Friction Audit

**Scope and method.** The app ran locally in demo mode only (`VITE_DATA_MODE=demo`, Supabase variables blanked, port 5231, branch `feature/sanctus-brand-design-system`). Playwright (Chromium) drove it at 1440x900, 390x844 and 360x740 (mobile runs used `isMobile`, touch and an Android user agent), in EN and PT (`?lang=pt`). The scripts are in `scratchpad/ux/*.js`, raw results in `sweep.json` and `admin.json`, and the 205 screenshots in `scratchpad/ux/shots/`.

**How to read this.** "Observed" means it was seen in a screenshot or measured by a script. "Estimate" is a judgement about how often real users will hit something; it was not measured. Severity scale:
- **P0:** blocks a core task or loses data.
- **P1:** a core task fails or misleads, with a workaround.
- **P2:** real friction or a likely mistake.
- **P3:** polish.

**Not testable in demo mode:**
- `/login` wrong password and `/reset-password`. In demo mode both redirect to `/demo` by design (`LoginPage.tsx:25`, `ResetPasswordPage.tsx:40`). They need a Supabase-mode run, which was out of scope.
- Real AR launch. Headless Chromium cannot start Scene Viewer or Quick Look.

**Checks that passed:**
- **Accessibility markup:** no images without `alt` on any page. No inputs without labels. No unnamed buttons on public pages (switches are labelled with `label[for]`).
- **Focus:** a visible focus ring on every element reached with Tab on `/apply`, the product page, `/demo`, the landing page and the product editor. Tab order follows the visual order.
- **Unsaved changes in the product editor:** in-app navigation shows a "Leave without saving?" dialog, and browser Back and reload trigger the guard (`beforeunload`).
- **Upload errors** are clear and name the file ("notes.txt: unsupported file type. Use .jpg, .jpeg, .png, .webp.", "huge.png is 12.0 MB. Maximum is 5.0 MB.").
- **Apply wizard:**
  - Reloading mid-flow keeps the current step and the data.
  - The invalid-website message is specific.
  - Consent is enforced ("Please confirm to send your application.").
- **Reduced motion:** the global `prefers-reduced-motion` rule in `src/index.css:136` shortens all animations and transitions. `auto-rotate` is never turned on.
- **Demo honesty:** sample data, demo URLs and "Demo mode: no email is sent." are labelled.

---

### A. Functional defects

**UX-01 · P1 · Site navigation anchors do nothing, or jump to the top (landing page, any visitor)**
- **Screen and role:** Sanctus header, footer and phone menu links (Collections, Projects, About, Contact). Public visitor.
- **User goal:** jump to the About, Projects or Collections section.
- **Flaw (observed):** clicking a header link changes the URL to `/#sobre` etc., but `scrollY` stays at 0 for all four links. After scrolling to y=900 and clicking About, the page jumped back to y=0 while `#sobre` sits at y=1234. This happens from `/apply` and from the phone menu too.
  - Likely cause (not confirmed): plain `<a href="/#…">` combined with `<ScrollRestoration/>` in `RootLayout.tsx`.
  - A direct page load of `/#sobre` did scroll (1154).
- **Why people get confused:** the click looks broken, or sends them backwards. They decide the site has no About page.
- **Frequency (estimate):** most visitors who use the top navigation.
- **Recommended change:** handle hash links in the router (scroll to `getElementById(hash)` after navigation, honouring `scroll-mt-20`), or exclude hash changes from ScrollRestoration. Keep the current smooth/instant behaviour under reduced motion.
- **Acceptance:**
  - From the top and from mid-page, each nav link scrolls so that its section heading sits under the header.
  - Same behaviour from `/apply` and from the phone menu (the menu closes).
  - An e2e test asserts the section heading is in the viewport.

**UX-02 · P2 · Field errors stay after the field is fixed (product editor, owner and admin)**
- **User goal:** fix the flagged fields and publish.
- **Flaw (observed):** after a Publish attempt, Width/Height/Depth show "Dimensions must be greater than zero to publish." They still show it after valid values (83/69/57) are typed in. The section nav also keeps its error icons. See `shots/owner-unit-switch-desktop.png`.
- **Why people get confused:** they think the values were rejected and keep retyping, or think the unit is wrong.
- **Frequency (estimate):** every owner who publishes a new product with missing data.
- **Recommended change:** re-validate a field on change or blur once it has shown an error, and clear its message and the section icon when it becomes valid.
- **Acceptance:** typing a valid value removes that field's error within one input event, and the error summary count goes down.

**UX-03 · P2 · The 404 page ignores the language and drops the brand (public)**
- **Flaw (observed):** `/<unknown>?lang=pt` renders "Page not found / Go to the home page" in English with `<html lang="en">` at every viewport. There is no Sanctus header or footer, and the heading is bold Jost instead of the serif. See `shots/404-phone.png` and `shots/404-desktop-pt.png`.
- **Why people get confused:** a Portuguese visitor who follows a bad QR or link lands on an English, unbranded page and may think they left the site.
- **Frequency (estimate):** low, but it is the moment trust is most fragile.
- **Recommended change:** wrap the standalone `NotFoundPage` in the language provider and SiteChrome. Use `t()` and the `text-headline` serif.
- **Acceptance:** `?lang=pt` shows PT copy and `lang="pt-PT"`. The page has the Sanctus header and footer, and the heading uses `font-display`.

**UX-04 · P2 · 6px horizontal overflow at 360px (landing page and /apply, EN and PT)**
- **Flaw (observed):** `scrollWidth - clientWidth = 6`. The offender is the header actions group (`DIV.ml-auto…`, `BUTTON size-9 lg:hidden`, right edge 365 against a 360 viewport). The hamburger icon is visibly clipped at the right edge (`shots/landing-small-top.png`), and the page can be dragged sideways.
- **Frequency (estimate):** every user on 360px Android phones, which are a common size.
- **Recommended change:** reduce `gap-4` to `gap-2` below `sm`, or hide the "Open the demo" icon in the phone header (it is already in the menu).
- **Acceptance:** no horizontal overflow on `/` and `/apply` at 320, 360 and 390 widths.

**UX-05 · P3 · Mixed and untranslated PT copy (public, PT)**
- **Flaw (observed):**
  - `/apply` in PT shows "Website **(optional)**" and "Há mais alguma coisa… **(optional)**" in English (`shots/apply-small-pt-step1-errors.png`, `shots/apply-small-pt-step4.png`).
  - The PT footer and nav show "HOME".
  - Brazilian forms ("Contato", "Conheça nossa história") sit next to pt-PT UI copy ("Contactar vendedor", "Candidatura").
  - Note: the landing copy is the client's reference text (design/21), so the client should confirm the variant.
- **Recommended change:** translate "(optional)" in the shared field label. Ask the client whether the landing copy should be pt-PT, then align it.
- **Acceptance:** with `?lang=pt`, no English UI words remain on `/` or `/apply`, and one PT variant is used throughout.

**UX-06 · P3 · Dashboard logo link has no accessible name on phone (admin and owner)**
- **Flaw (observed):** the ARIA snapshot of the phone header shows `link: /url: /admin` (and `/dashboard`) with no name. It is a 24x24 icon-only link on every dashboard page at 390px.
- **Recommended change:** add `aria-label="Sanctus admin home"` (or the business name for owners).
- **Acceptance:** the axe/ARIA snapshot shows a named link at every width.

**UX-07 · P3 · Heading levels skip (admin)**
- **Flaw (observed):** `/admin/applications` and `/admin/activity` go from h1 to h3. `/admin/products/new` goes from h2 to h4.
- **Recommended change:** promote the card titles to h2 and the editor sub-groups to h3.
- **Acceptance:** no level is skipped on these routes.

---

### B. UX problems

**UX-10 · P2 · Three overlapping "3D / AR" entry points, and the primary button promises AR it doesn't start (product page, shopper)**
- **User goal:** see the piece in 3D, or in their own room.
- **Flaw (observed):**
  - **Desktop:** the primary button reads "VIEW IN 3D / AR", and a second "3D · View in 3D" button sits in the media rail. Clicking the primary button opens the 3D viewer only; a box below then explains that AR needs a phone (`shots/product-sheen-desktop-en.png`, `shots/pd-velvet-desktop-variant.png`).
  - **Phone:** three controls appear: "3D View in 3D", "AR View in AR" and "VIEW IN 3D / AR". Tapping the primary button showed the 3D viewer, not AR (`shots/product-velvet-phone-pt.png`, `shots/pd-velvet-phone-after-primary.png`).
- **Why people get confused:** they tap the big "AR" button, get a spinning model, and either think AR failed or don't know they need a second tap. On desktop the label promises something the device can't do.
- **Frequency (estimate):** high. This is the product's headline feature.
- **Recommended change:**
  - Use one clear action per capability. On desktop the primary button says "View in 3D", with the existing phone hand-off box underneath.
  - On AR-capable phones the primary button says "View in your room" and starts AR, with "3D" as the secondary rail button.
  - Drop the duplicate rail button that repeats the primary action.
  - Copy, layout and label changes only. No AR mode changes (ADR-0021).
- **Acceptance:**
  - Desktop shows no "AR" wording on any button.
  - On a phone, each visible control does what its label says.
  - The owner has device-tested this on iOS and Android.

**UX-11 · P2 · Choosing a finish changes the price but not the picture (product page, shopper)**
- **Flaw (observed):** on Glam Velvet Sofa, selecting Emerald (+€150) changes the price to €2,049.00 and the label to "Emerald". The photo and 3D model stay sapphire-blue (`shots/pd-velvet-desktop-emerald.png`). Variants are colour and price only (`seed.ts`, `variant()` has no image).
- **Why people get confused:** they think the green option looks blue, or buy expecting the photo.
- **Frequency (estimate):** every product with colour variants.
- **Recommended change:** show the note "Photos show {first variant}" under the swatches when a variant has no images of its own. Later, allow an optional photo per variant in the ProductEditor.
- **Acceptance:** whenever the selected variant has no own media, a visible note says which finish is pictured. The note is localised (EN and PT).

**UX-12 · P2 · Publish rules are revealed one round at a time (product editor, owner)**
- **User goal:** publish a new product.
- **Flaw (observed):** on an empty product, Publish showed:
  - **Round 1:** "Fix these 2 issues" (name, slug).
  - **Round 2,** after entering the name: a toast "Cannot publish yet. Complete the highlighted fields first." with no list (price was the problem).
  - **Round 3,** after the price: "Fix these 4 issues" (image, and "Dimensions must be greater than zero" repeated 3 times).
  - Screenshots: `shots/owner-new-publish-errors-phone.png`, `shots/owner-publish-round3-desktop.png`.
- **Why people get confused:** each fix uncovers new rules. The duplicated lines make the list look longer than it is.
- **Frequency (estimate):** every new product.
- **Recommended change:**
  - Validate everything that publishing needs in a single pass.
  - Show a persistent "Ready to publish: 4 of 7" checklist near the Publish button (name, URL, price, ≥1 image, width/height/depth), with one line for the dimensions.
  - Rename "Product URL slug" to "Product URL".
- **Acceptance:**
  - The first Publish click lists every missing requirement, each once.
  - The toast never says "highlighted fields" without listing them.

**UX-13 · P2 · The unit switch reinterprets the numbers silently (product editor, owner)**
- **Flaw (observed):** after entering 83/69/57 with Centimetres selected and switching to Inches, the values stay 83/69/57 but become "in" (83 in = 211 cm). The help text admits this ("it does not convert them"), but it sits in the section intro, away from the switch. See `shots/owner-unit-switch-desktop.png`.
- **Why people get confused:** most people expect a unit switch to convert. This produces wrong sizes on the public page, and possibly AR "scale unverified" warnings.
- **Frequency (estimate):** low to medium, but each mistake reaches customers.
- **Recommended change:** put the unit choice before the fields ("Measured in: cm / in"). When values already exist, switching asks "Convert 83 cm to 32.7 in?" with the options Convert and Keep numbers.
- **Acceptance:** switching units with values present never changes the meaning without an explicit choice.

**UX-14 · P2 · After approving, the required next step is out of sight (admin application detail, super admin)**
- **User goal:** onboard an approved business.
- **Flaw (observed):**
  - The Approve dialog says "Then invite the owner." After approval, the Owner/Invite card is the last card, at about y=1180 on a 900px viewport (`shots/admin-app-approved-desktop.png`). The toast only says "Application approved".
  - "Approve" can be clicked straight from "Submitted" without "Start review", while the list subtitle says "Review each one before it can be approved."
- **Why people get confused:** the admin thinks onboarding is finished, and the owner is never invited.
- **Frequency (estimate):** every approval.
- **Recommended change:** after approval, scroll or focus the Owner card, or add "Next: invite owner →" to the toast and the status header. Either enforce review-before-approve or change the subtitle.
- **Acceptance:**
  - After approval, the invite form is in the viewport, or one click away from a visible CTA.
  - The copy and the allowed transitions agree.

**UX-15 · P2 · Audit log rows don't say which business (super admin)**
- **Flaw (observed):** rows read "Application submitted · Submitted — Application — System". After two applications were submitted, the two rows were identical, and no row named Atelier Norte (`shots/admin-audit-desktop.png`).
- **Why people get confused:** the log can't answer "who did what to which business" without opening each item.
- **Recommended change:** add the subject name and reference ("Atelier Norte #AYITWHAO") as a link to the record.
- **Acceptance:** every row shows the subject's name, and rows for different subjects are distinguishable.

**UX-16 · P2 · Pending applications are invisible on the admin overview (super admin)**
- **Flaw (observed):** with 2 submitted applications, the Overview showed products, businesses and charts but no applications count. The sidebar "Applications" has no badge (`shots/admin-overview-with-apps-desktop.png`). The bell lists product activity only (`shots/admin-bell-desktop.png`, a separate context).
- **Frequency (estimate):** daily for the admin; applicants wait longer.
- **Recommended change:** add an "Applications awaiting review: N" tile linking to the filtered list, and a count badge on the nav item.
- **Acceptance:** a new submission shows on the Overview and in the nav without opening Applications.

**UX-17 · P2 · Browser Back exits the apply wizard (public, applicant)**
- **Flaw (observed):** pressing browser Back on step 2 left `/apply` entirely (here to `about:blank`, the previous history entry). The steps are not history entries. The saved draft brought the user back to step 2 on Forward.
- **Why people get confused:** on phones, the back gesture is the natural way to correct the previous step.
- **Recommended change:** put the step in the URL (`/apply?step=location`) or push a history entry for each step, so Back goes to the previous step.
- **Acceptance:** Back from step N shows step N−1 with the data intact. Back from step 1 leaves the page.

**UX-18 · P2 · The success screen doesn't explain what happens next, and overpromises in demo (applicant)**
- **Flaw (observed):**
  - "Thank you. Your application is saved and our team will review it. We will reply by email… REFERENCE: GSVEQEVH".
  - There is no timeframe, nothing on what the reference is for, and no mention that approval leads to an invitation email to set a password.
  - In demo mode the copy promises an email that is never sent.
  - Reloading resets to an empty step 1, so the reference is lost (`shots/apply-desktop-success.png`, `shots/apply-small-pt-success.png`).
- **Recommended change:** add three short "What happens next" steps (review → decision by email → invitation link to set up your catalogue), plus "Keep this reference if you contact us" and a copy button. In demo mode add "Demo: no email will be sent." Keep the confirmation after a reload.
- **Acceptance:**
  - The success screen states the next steps and the reference's purpose.
  - The demo label is present in demo mode.
  - A reload within the session still shows the reference.

**UX-19 · P3 · /accept-invite is a dead end in demo mode**
- **Flaw (observed):** "Owner invitations work only with the live service. In this demo, sign in from the demo page instead." The same text appears with no token or an invalid token, and there is no link (`shots/accept-bad-phone-en.png`).
- **Recommended change:** link "the demo page" to `/demo`.
- **Acceptance:** one click leads to `/demo`.

**UX-20 · P3 · "Catalog not found" and "Product not available" give no way forward (public)**
- **Flaw (observed):**
  - "Catalog not found" has no link or button at all (`shots/catalog-missing-phone-pt.png`).
  - "Product not available" under an existing business (`/products/nordhaus/does-not-exist`) shows no business name or logo in the header (`shots/product-missing-phone-en.png`).
- **Recommended change:** keep the business header when the business exists. On "Catalog not found", add a "Go to Sanctus" link.
- **Acceptance:** every error state has at least one action, and the business context is kept when it is known.

**UX-21 · P3 · Admin jargon and raw values**
- **Observed:**
  - "Accepted means **Resend** took the message" (vendor name).
  - The category shows the raw value "furniture" in lower case (list and detail).
  - "Encode local preview URL" toggle on Catalogs.
  - "Product URL slug is required." in the editor.
- **Recommended change:** "Accepted = our email provider took it; Delivered = it reached the inbox." Show category labels ("Furniture"). Add an explanation, or internal-only labelling, for the local preview toggle.
- **Acceptance:** no vendor names or raw enum values in the admin UI copy.

**UX-22 · P3 · On the first error the wizard leaves focus on Continue (apply, keyboard and screen-reader users)**
- **Flaw (observed):** after an empty "Continue", focus stays on the button. A `role=alert` summary appears below the form, and the first invalid field may be scrolled out of view at 360px in PT.
- **Recommended change:** move focus to the first invalid field, or to a summary at the top that links to the fields.
- **Acceptance:** after a failed Continue, `document.activeElement` is the first invalid field or a summary with links.

---

### C. Visual polish and accessibility measurements

**UX-30 · P2 · Small touch targets on phone (measured at 390px)**
- **Public pages:**
  - EN/PT language toggle: **19x29 and 16x29 px** on every public page. The width is below the 24px WCAG 2.5.8 AA minimum unless spacing counts.
  - Catalogue category chips: 25–89 x **30 px**.
  - cm/in: 35x28 and 30x28.
  - "AR tips": 350x**20**.
  - "Contact seller" link: 120x**18**.
  - Header logo link: 162x15.
- **Apply review:** "Edit" buttons 52x**20**.
- **Dashboard:** "Copy URL" 106x32, "Remove" 93x32. Inputs and selects are 40px tall.
- **Recommended change:** give the language toggle at least 44x44 hit areas (padding, not a larger glyph). Make chips and inline actions at least 44px tall on `pointer: coarse`.
- **Acceptance:** at 390px, every interactive control on public pages is at least 44x44 CSS px, or at least 24px with spacing per WCAG 2.5.8.

**UX-31 · P3 · The phone header truncates the business name** ("CASA LISBOA INTER…") on catalogue and product pages (`shots/catalog-phone-top.png`). Recommended: allow two lines, or reduce the tracking below `sm`.

**UX-32 · P3 · Inconsistent spelling.** EN public UI mixes "catalog" ("Browse the catalog", "Search this catalog") and "catalogue" ("Catalogue powered by Sanctus", "View catalogue"). Pick one. The brand references suggest "catalogue".

**UX-33 · P3 · System and empty-state screens are off-brand.** 404, "Product not available" and "Catalog not found" use bold Jost headings, not the Cormorant serif tokens required by ADR-0023.

**UX-34 · P3 · Admin applications list on phone.** The filter card (search, status, two dates) fills the first screen, and the results start below the fold (`shots/admin-apps-list-phone.png`). Collapse the filters into a "Filters" button on phones.

**UX-35 · P3 · Desktop product page balance.** The left column (finish, CTA, dimensions, specs) is about three times taller than the media column, which leaves a large empty area on the right (`shots/product-sheen-desktop-en.png`). Make the media column sticky.

**UX-36 · P3 · Brand-button contrast relies on the business accent.**
- `Button variant="brand"` uses `bg-[var(--brand-accent)] text-white hover:brightness-110`.
- With the platform fallback accent `#8A765C`, white text is **4.35:1 (fails AA 4.5)**, and about 3.67:1 on hover (calculated).
- The seeded business accents pass (6.0–8.9:1).
- Owners can choose a custom accent. No contrast guard was observed; this was not tested.
- **Recommended change:** use `accent-hover` (#76644D, 4.99:1) as the fallback, darken on hover instead of brightening, and warn in BusinessForm when the chosen accent falls below 4.5:1 against white.

**UX-37 · P3 · Admin chart colours** (green and orange series, observed) are outside the Sanctus palette. Use bronze and umber or ink tones with distinct markers.

#### Colour contrast of token pairs (WCAG 2.x, calculated from `src/index.css`)
| Pair | Use | Ratio | Needed | Result |
|---|---|---|---|---|
| ink #1d1c1a on canvas #f3f0e9 | body/headings | 14.96:1 | 4.5:1 | pass |
| inkBody #3a352f on canvas #f3f0e9 | body text | 10.66:1 | 4.5:1 | pass |
| inkMuted #5a5148 on canvas #f3f0e9 | secondary text | 6.82:1 | 4.5:1 | pass |
| inkFaint #6e6559 on canvas #f3f0e9 | hints/meta | 5.03:1 | 4.5:1 | pass |
| inkFaint #6e6559 on surface #faf8f3 | hints on cards | 5.39:1 | 4.5:1 | pass |
| inkFaint #6e6559 on subtle #ece7dd | hints on subtle bg | 4.64:1 | 4.5:1 | pass |
| inkMuted #5a5148 on subtle #ece7dd | text on subtle bg | 6.30:1 | 4.5:1 | pass |
| chalk #f3f0e9 on obsidian #1d1c1a | primary button | 14.96:1 | 4.5:1 | pass |
| chalk #f3f0e9 on umber #5a5148 | primary button hover (observed umber bg) | 6.82:1 | 4.5:1 | pass |
| white #ffffff on accent #8a765c | white on bronze fill | 4.35:1 | 4.5:1 | FAIL |
| chalk #f3f0e9 on accentHover #76644d | chalk on bronze hover | 4.99:1 | 4.5:1 | pass |
| obsidian #1d1c1a on accentBright #c9b79b | dark text on bright bronze | 8.70:1 | 4.5:1 | pass |
| accentInk #6e5c45 on canvas #f3f0e9 | bronze text | 5.63:1 | 4.5:1 | pass |
| accentInk #6e5c45 on surface #faf8f3 | bronze text on card | 6.03:1 | 4.5:1 | pass |
| accentInk #6e5c45 on accentSoft #eae3d6 | bronze text on soft chip | 5.02:1 | 4.5:1 | pass |
| accent #8a765c on canvas #f3f0e9 | bronze accent as text (misuse check) | 3.82:1 | 4.5:1 | FAIL |
| accent #8a765c on canvas #f3f0e9 | focus ring / icons (non-text) | 3.82:1 | 3:1 | pass |
| taupe #a49b8e on canvas #f3f0e9 | taupe as text (misuse check) | 2.41:1 | 4.5:1 | FAIL |
| lineStrong #8a8073 on canvas #f3f0e9 | input border (non-text) | 3.41:1 | 3:1 | pass |
| lineStrong #8a8073 on surface #faf8f3 | input border on card (non-text) | 3.65:1 | 3:1 | pass |
| line #d9d3c7 on canvas #f3f0e9 | hairline / card edge (non-text, decorative) | 1.31:1 | 3:1 | FAIL |
| danger #a8362a on canvas #f3f0e9 | error text | 5.72:1 | 4.5:1 | pass |
| danger #a8362a on surface #faf8f3 | error text on card | 6.13:1 | 4.5:1 | pass |
| danger #a8362a on dangerSoft #f8e5e2 | error banner | 5.36:1 | 4.5:1 | pass |
| success #2f6b4f on successSoft #e5f0e9 | success banner | 5.39:1 | 4.5:1 | pass |
| warning #8f5a0b on warningSoft #f8eedc | warning chip | 5.02:1 | 4.5:1 | pass |
| info #33597a on infoSoft #e5edf4 | info chip | 6.23:1 | 4.5:1 | pass |
| inkMuted #5a5148 on accentSoft #eae3d6 | muted on accent-soft | 6.08:1 | 4.5:1 | pass |

Usage check: `text-accent` (3.82:1) is used only on icons (ArSection, DemoAccounts, ResetPassword), where the 3:1 non-text minimum applies, so it passes. Taupe (2.41:1) was not found as a text class. A rendered-text contrast scan of 13 pages (`cscan.js`) found no failing text; its only hits were text over photos, which are false positives.

---

### Flow and observation log
| Flow | Viewport | Language | Result | Evidence |
|---|---|---|---|---|
| Product: 3D on desktop (primary button) | 1440 | EN | 3D opens; no AR (label says AR) → UX-10 | shots/pd-velvet-desktop-variant.png |
| Product: phone controls | 390 | EN, PT | 3 overlapping 3D/AR controls → UX-10 | shots/product-velvet-phone-pt.png, pd-velvet-phone-after-primary.png |
| Product: AR tips sheet | 390 | EN | pass | shots/pd-velvet-phone-artips.png |
| Product: variant switch | 1440 | EN | price updates, image doesn't → UX-11 | shots/pd-velvet-desktop-emerald.png |
| Product: dimensions and cm/in | 1440, 390 | EN, PT | pass (findable, with diagram) | shots/product-sheen-desktop-en.png |
| Product: no model (Fjord), contact dialog | 390 | EN | pass | shots/pd-fjord-phone-top.png, pd-fjord-phone-contact.png |
| More photos (lazy-loaded) | 1440 | EN | pass after scrolling (blank in full-page shots is a capture artefact) | shots/pd-velvet-desktop-scrolled.png |
| Landing nav anchors | 1440, 390 | EN | FAIL → UX-01 | shots/landing-about-click-desktop.png |
| Apply: empty Continue, field errors | 1440, 360 | EN, PT | pass (errors shown), focus stays on button → UX-22 | shots/apply-desktop-step1-errors.png, apply-small-pt-step1-errors.png |
| Apply: invalid website | 1440 | EN | pass (specific message) | shots/apply-desktop-bad-website.png |
| Apply: reload mid-flow | 1440 | EN | pass (step and data kept) | shots/apply-desktop-reload-step2.png |
| Apply: browser Back | 1440 | EN | FAIL (leaves the wizard) → UX-17 | shots/apply-desktop-after-browser-back.png |
| Apply: consent | 1440 | EN | pass | shots/apply-desktop-consent-error.png |
| Apply: success | 1440, 360 | EN, PT | partial → UX-18 | shots/apply-desktop-success.png, apply-small-pt-success.png |
| Apply: PT 360, steps 1–5 | 360 | PT | layout pass; "(optional)" untranslated → UX-05 | shots/apply-small-pt-step1..5.png |
| Accept invite: none or bad token | 390 | EN, PT | dead end → UX-19 | shots/accept-bad-phone-en.png |
| Login wrong password, reset | all | EN | not testable (redirects to /demo in demo mode) | shots/login-phone-en.png |
| Admin: application review → approve → invite → resend | 1440, 390 | EN | works; next step hidden → UX-14; email status clear ("Not sent", "Demo mode: no email is sent.") | shots/admin-app-detail-new-desktop.png, admin-app-approve-dialog-desktop.png, admin-app-approved-desktop.png, admin-app-invited-desktop.png |
| Admin: reject requires a reason | 1440, 390 | EN | pass | shots/admin-app-reject-dialog-desktop.png |
| Admin: audit log | 1440 | EN | rows not identifiable → UX-15 | shots/admin-audit-desktop.png |
| Admin: products empty filter state | 1440 | EN | pass ("No products match these filters", Clear filters) | shots/admin_products_empty-desktop.png |
| Admin: catalogs and QR | 1440, 390 | EN | pass (demo URL labelled) | shots/admin_admin_catalogs-desktop.png |
| Owner: overview, products, catalog, analytics, settings | 1440, 390 | EN | pass (no overflow); sample data labelled | shots/owner-overview-desktop.png, owner_dashboard_*.png |
| Owner: which business or product am I editing | 1440, 390 | EN | pass (business in sidebar and under title; product name as H1) | shots/owner-edit-sheen-top-desktop.png, owner-edit-sheen-top-phone.png |
| Owner: unsaved changes (in-app nav, Back, reload) | 1440, 390 | EN | pass | shots/owner-unsaved-desktop.png |
| Owner: publish rules | 1440, 390 | EN | 3 rounds → UX-12; stale errors → UX-02 | shots/owner-new-publish-errors-phone.png, owner-publish-round3-desktop.png |
| Owner: upload errors (txt, 12 MB) | 1440, 390 | EN | pass (clear messages) | shots/owner-upload-errors-desktop.png |
| Owner: unit switch | 1440 | EN | reinterprets the numbers → UX-13 | shots/owner-unit-switch-desktop.png |

### Automated page sweep (overflow, alt text, control names, labels, heading order, console errors)
Note: "pass" covers these automated checks only. The touch-target measurements are in UX-30. Login and reset results are the `/demo` page.

| Page | Viewport | Language | Result | Screenshot |
|---|---|---|---|---|
| / | desktop | EN | pass | shots/landing-desktop-en.png |
| /catalog/casa-lisboa | desktop | EN | pass | shots/catalog-casa-desktop-en.png |
| /catalog/nordhaus | desktop | EN | pass | shots/catalog-nord-desktop-en.png |
| /products/nordhaus/sheen-lounge-chair | desktop | EN | pass | shots/product-sheen-desktop-en.png |
| /products/casa-lisboa/glam-velvet-sofa | desktop | EN | pass | shots/product-velvet-desktop-en.png |
| /products/atelier-verde/rio-sideboard | desktop | EN | pass | shots/product-rio-desktop-en.png |
| /products/nordhaus/fjord-shell-chair | desktop | EN | pass | shots/product-fjord-desktop-en.png |
| /products/nordhaus/does-not-exist | desktop | EN | pass | shots/product-missing-desktop-en.png |
| /catalog/nope | desktop | EN | pass | shots/catalog-missing-desktop-en.png |
| /catalog/oak-ember | desktop | EN | pass | shots/catalog-suspended-desktop-en.png |
| /this-page-does-not-exist | desktop | EN | pass | shots/404-desktop-en.png |
| /apply | desktop | EN | pass | shots/apply-desktop-en.png |
| /accept-invite | desktop | EN | pass | shots/accept-none-desktop-en.png |
| /accept-invite?token=bogus123 | desktop | EN | pass | shots/accept-bad-desktop-en.png |
| /login | desktop | EN | pass (redirects to /demo in demo mode (by design)) | shots/login-desktop-en.png |
| /reset-password | desktop | EN | pass (redirects to /demo in demo mode (by design)) | shots/reset-desktop-en.png |
| /demo | desktop | EN | pass | shots/demo-desktop-en.png |
| / | desktop | PT | pass | shots/landing-desktop-pt.png |
| /catalog/casa-lisboa | desktop | PT | pass | shots/catalog-casa-desktop-pt.png |
| /catalog/nordhaus | desktop | PT | pass | shots/catalog-nord-desktop-pt.png |
| /products/nordhaus/sheen-lounge-chair | desktop | PT | pass | shots/product-sheen-desktop-pt.png |
| /products/casa-lisboa/glam-velvet-sofa | desktop | PT | pass | shots/product-velvet-desktop-pt.png |
| /products/atelier-verde/rio-sideboard | desktop | PT | pass | shots/product-rio-desktop-pt.png |
| /products/nordhaus/fjord-shell-chair | desktop | PT | pass | shots/product-fjord-desktop-pt.png |
| /products/nordhaus/does-not-exist | desktop | PT | pass | shots/product-missing-desktop-pt.png |
| /catalog/nope | desktop | PT | pass | shots/catalog-missing-desktop-pt.png |
| /catalog/oak-ember | desktop | PT | pass | shots/catalog-suspended-desktop-pt.png |
| /this-page-does-not-exist | desktop | PT | FAIL: ignores ?lang=pt (html lang=en) | shots/404-desktop-pt.png |
| /apply | desktop | PT | pass | shots/apply-desktop-pt.png |
| /accept-invite | desktop | PT | pass | shots/accept-none-desktop-pt.png |
| /accept-invite?token=bogus123 | desktop | PT | pass | shots/accept-bad-desktop-pt.png |
| /login | desktop | PT | pass (redirects to /demo in demo mode (by design)) | shots/login-desktop-pt.png |
| /reset-password | desktop | PT | pass (redirects to /demo in demo mode (by design)) | shots/reset-desktop-pt.png |
| /demo | desktop | PT | pass (demo page is EN-only) | shots/demo-desktop-pt.png |
| / | phone | EN | pass | shots/landing-phone-en.png |
| /catalog/casa-lisboa | phone | EN | pass | shots/catalog-casa-phone-en.png |
| /catalog/nordhaus | phone | EN | pass | shots/catalog-nord-phone-en.png |
| /products/nordhaus/sheen-lounge-chair | phone | EN | pass | shots/product-sheen-phone-en.png |
| /products/casa-lisboa/glam-velvet-sofa | phone | EN | pass | shots/product-velvet-phone-en.png |
| /products/atelier-verde/rio-sideboard | phone | EN | pass | shots/product-rio-phone-en.png |
| /products/nordhaus/fjord-shell-chair | phone | EN | pass | shots/product-fjord-phone-en.png |
| /products/nordhaus/does-not-exist | phone | EN | pass | shots/product-missing-phone-en.png |
| /catalog/nope | phone | EN | pass | shots/catalog-missing-phone-en.png |
| /catalog/oak-ember | phone | EN | pass | shots/catalog-suspended-phone-en.png |
| /this-page-does-not-exist | phone | EN | pass | shots/404-phone-en.png |
| /apply | phone | EN | pass | shots/apply-phone-en.png |
| /accept-invite | phone | EN | pass | shots/accept-none-phone-en.png |
| /accept-invite?token=bogus123 | phone | EN | pass | shots/accept-bad-phone-en.png |
| /login | phone | EN | pass (redirects to /demo in demo mode (by design)) | shots/login-phone-en.png |
| /reset-password | phone | EN | pass (redirects to /demo in demo mode (by design)) | shots/reset-phone-en.png |
| /demo | phone | EN | pass | shots/demo-phone-en.png |
| / | phone | PT | pass | shots/landing-phone-pt.png |
| /catalog/casa-lisboa | phone | PT | pass | shots/catalog-casa-phone-pt.png |
| /catalog/nordhaus | phone | PT | pass | shots/catalog-nord-phone-pt.png |
| /products/nordhaus/sheen-lounge-chair | phone | PT | pass | shots/product-sheen-phone-pt.png |
| /products/casa-lisboa/glam-velvet-sofa | phone | PT | pass | shots/product-velvet-phone-pt.png |
| /products/atelier-verde/rio-sideboard | phone | PT | pass | shots/product-rio-phone-pt.png |
| /products/nordhaus/fjord-shell-chair | phone | PT | pass | shots/product-fjord-phone-pt.png |
| /products/nordhaus/does-not-exist | phone | PT | pass | shots/product-missing-phone-pt.png |
| /catalog/nope | phone | PT | pass | shots/catalog-missing-phone-pt.png |
| /catalog/oak-ember | phone | PT | pass | shots/catalog-suspended-phone-pt.png |
| /this-page-does-not-exist | phone | PT | FAIL: ignores ?lang=pt (html lang=en) | shots/404-phone-pt.png |
| /apply | phone | PT | pass | shots/apply-phone-pt.png |
| /accept-invite | phone | PT | pass | shots/accept-none-phone-pt.png |
| /accept-invite?token=bogus123 | phone | PT | pass | shots/accept-bad-phone-pt.png |
| /login | phone | PT | pass (redirects to /demo in demo mode (by design)) | shots/login-phone-pt.png |
| /reset-password | phone | PT | pass (redirects to /demo in demo mode (by design)) | shots/reset-phone-pt.png |
| /demo | phone | PT | pass (demo page is EN-only) | shots/demo-phone-pt.png |
| / | small | EN | FAIL: h-overflow 6px | shots/landing-small-en.png |
| /catalog/casa-lisboa | small | EN | pass | shots/catalog-casa-small-en.png |
| /catalog/nordhaus | small | EN | pass | shots/catalog-nord-small-en.png |
| /products/nordhaus/sheen-lounge-chair | small | EN | pass | shots/product-sheen-small-en.png |
| /products/casa-lisboa/glam-velvet-sofa | small | EN | pass | shots/product-velvet-small-en.png |
| /products/atelier-verde/rio-sideboard | small | EN | pass | shots/product-rio-small-en.png |
| /products/nordhaus/fjord-shell-chair | small | EN | pass | shots/product-fjord-small-en.png |
| /products/nordhaus/does-not-exist | small | EN | pass | shots/product-missing-small-en.png |
| /catalog/nope | small | EN | pass | shots/catalog-missing-small-en.png |
| /catalog/oak-ember | small | EN | pass | shots/catalog-suspended-small-en.png |
| /this-page-does-not-exist | small | EN | pass | shots/404-small-en.png |
| /apply | small | EN | FAIL: h-overflow 6px | shots/apply-small-en.png |
| /accept-invite | small | EN | pass | shots/accept-none-small-en.png |
| /accept-invite?token=bogus123 | small | EN | pass | shots/accept-bad-small-en.png |
| /login | small | EN | pass (redirects to /demo in demo mode (by design)) | shots/login-small-en.png |
| /reset-password | small | EN | pass (redirects to /demo in demo mode (by design)) | shots/reset-small-en.png |
| /demo | small | EN | pass | shots/demo-small-en.png |
| / | small | PT | FAIL: h-overflow 6px | shots/landing-small-pt.png |
| /catalog/casa-lisboa | small | PT | pass | shots/catalog-casa-small-pt.png |
| /catalog/nordhaus | small | PT | pass | shots/catalog-nord-small-pt.png |
| /products/nordhaus/sheen-lounge-chair | small | PT | pass | shots/product-sheen-small-pt.png |
| /products/casa-lisboa/glam-velvet-sofa | small | PT | pass | shots/product-velvet-small-pt.png |
| /products/atelier-verde/rio-sideboard | small | PT | pass | shots/product-rio-small-pt.png |
| /products/nordhaus/fjord-shell-chair | small | PT | pass | shots/product-fjord-small-pt.png |
| /products/nordhaus/does-not-exist | small | PT | pass | shots/product-missing-small-pt.png |
| /catalog/nope | small | PT | pass | shots/catalog-missing-small-pt.png |
| /catalog/oak-ember | small | PT | pass | shots/catalog-suspended-small-pt.png |
| /this-page-does-not-exist | small | PT | FAIL: ignores ?lang=pt (html lang=en) | shots/404-small-pt.png |
| /apply | small | PT | FAIL: h-overflow 6px | shots/apply-small-pt.png |
| /accept-invite | small | PT | pass | shots/accept-none-small-pt.png |
| /accept-invite?token=bogus123 | small | PT | pass | shots/accept-bad-small-pt.png |
| /login | small | PT | pass (redirects to /demo in demo mode (by design)) | shots/login-small-pt.png |
| /reset-password | small | PT | pass (redirects to /demo in demo mode (by design)) | shots/reset-small-pt.png |
| /demo | small | PT | pass (demo page is EN-only) | shots/demo-small-pt.png |
| /admin | desktop | EN | pass | shots/admin_admin-desktop.png |
| /admin/applications | desktop | EN | FAIL: heading skip h1->h3 | shots/admin_admin_applications-desktop.png |
| /admin/businesses | desktop | EN | pass | shots/admin_admin_businesses-desktop.png |
| /admin/businesses/new | desktop | EN | pass | shots/admin_admin_businesses_new-desktop.png |
| /admin/products | desktop | EN | pass | shots/admin_admin_products-desktop.png |
| /admin/products/new | desktop | EN | FAIL: heading skip h2->h4 | shots/admin_admin_products_new-desktop.png |
| /admin/catalogs | desktop | EN | pass | shots/admin_admin_catalogs-desktop.png |
| /admin/activity | desktop | EN | FAIL: heading skip h1->h3 | shots/admin_admin_activity-desktop.png |
| /admin/analytics | desktop | EN | pass | shots/admin_admin_analytics-desktop.png |
| /admin/settings | desktop | EN | pass | shots/admin_admin_settings-desktop.png |
| /admin/nope | desktop | EN | pass | shots/admin_admin_nope-desktop.png |
| /admin | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin-phone.png |
| /admin/applications | phone | EN | FAIL: logo link has no accessible name; heading skip h1->h3 | shots/admin_admin_applications-phone.png |
| /admin/businesses | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_businesses-phone.png |
| /admin/businesses/new | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_businesses_new-phone.png |
| /admin/products | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_products-phone.png |
| /admin/products/new | phone | EN | FAIL: logo link has no accessible name; heading skip h2->h4 | shots/admin_admin_products_new-phone.png |
| /admin/catalogs | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_catalogs-phone.png |
| /admin/activity | phone | EN | FAIL: logo link has no accessible name; heading skip h1->h3 | shots/admin_admin_activity-phone.png |
| /admin/analytics | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_analytics-phone.png |
| /admin/settings | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_settings-phone.png |
| /admin/nope | phone | EN | FAIL: logo link has no accessible name | shots/admin_admin_nope-phone.png |