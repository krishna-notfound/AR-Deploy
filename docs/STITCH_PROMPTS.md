# Stitch prompts: Sanctus UI redesign

These prompts are for generating client-approvable screens in Google Stitch. The approved exports are then built into the existing React app. Stitch output is a design reference, not code to paste in. The app keeps its own components, design tokens, `t()` translations, data services and loading, empty and error states.

## How to run it

1. In one Stitch project, upload the brand references from `AR-attachment/`:
   - the brand board `PHOTO-2026-10-12-18-35-54.jpg`;
   - the homepage `PHOTO-2026-10-16-23-05-50 (2).jpg`;
   - the moodboard `Sanctus Luxury Furniture Website Moodboard (2).png`;
   - `Sanctus_ Beyond What Is Seen (1).png` and `(2).png`.
2. Paste **Prompt 0 (master)** first. Every later screen inherits it.
3. Paste one screen prompt at a time, in the order below. Generate **desktop (1440)** first, then ask for the **mobile (390)** version of the same screen.
4. If a screen drifts (blur, gradients, rounded pills, invented buttons), reply with: "Re-apply the master rules: no blur, no gradients, 2px corners, hairline borders, only the listed actions."
5. Show the client one group at a time (A, then B, and so on) and get approval per group.
6. For each approved screen, export the PNG and the HTML/Tailwind code into `design/stitch/<group>-<screen>/`, for example `design/stitch/A1-landing/desktop.png`, `mobile.png` and `code.html`. Then tell Claude: "Group A approved, implement it."

---

## Prompt 0: master (paste first)

```
You are designing the UI for SANCTUS, a luxury furniture brand platform. It is a multi-tenant 3D/AR furniture catalogue: furniture businesses get a public catalogue where shoppers can view each product in 3D and place it in their room with AR on their phone. There are three surfaces:
1. Public site (Portuguese first, English second): Sanctus landing page, each business's catalogue, product pages with 3D/AR.
2. Business owner dashboard (English): manage their products, 3D models, catalogue QR code, analytics.
3. Super admin dashboard (English): review business applications, manage businesses, all products, catalogues, analytics, audit log.

Use the uploaded brand board and mockups as the visual source of truth. Match their editorial, quiet-luxury feel: generous whitespace, large serif headlines, small uppercase tracked labels, full-bleed photography, flat colour panels.

DESIGN SYSTEM (use these exact values):
Colours
- Canvas (page background) #F3F0E9
- Surface (cards, inputs) #FAF8F3
- Subtle panel #ECE7DD
- Line (hairline borders) #D9D3C7, strong line #8A8073
- Ink (headings, primary text) #1D1C1A, body text #3A352F, muted #5A5148, faint #6E6559
- Obsidian (dark panels, primary button) #1D1C1A on Chalk text #F3F0E9
- Bronze accent #8A765C, hover #76644D, bronze text on light backgrounds #6E5C45, soft bronze fill #EAE3D6, light bronze only under dark text #C9B79B
- Status: success #2F6B4F on #E5F0E9, warning #8F5A0B on #F8EEDC, danger #A8362A on #F8E5E2, info #33597A on #E5EDF4
- Charts use only palette colours: obsidian #1D1C1A, bronze #8A765C, taupe #A49B8E, limestone #D9D3C7
Type
- Headings: Cormorant Garamond, regular weight (400), never bold, tight leading
- Everything else: Jost. Labels and eyebrows in UPPERCASE, 11-12px, letter-spacing 0.18em
- Body 15-16px, line height 1.6
Shape
- Corner radius 2px on everything (buttons, inputs, cards, images, dialogs). No pills, no fully rounded cards.
- Borders are 1px hairlines #D9D3C7. Cards are flat: hairline border, no drop shadow. Only menus, popovers and dialogs get one soft shadow.
- Primary button: solid obsidian #1D1C1A, chalk uppercase tracked label. Secondary: transparent with a 1px ink border. Text link: bronze #6E5C45 with an arrow, for example "VER COLEÇÃO →".
- Icons: thin line icons (1.5px stroke), ink or muted colour, never inside tinted circles or coloured squares.

HARD RULES (never break)
- NO blur, NO backdrop-blur, NO frosted glass, NO translucent sticky headers. Sticky bars are solid #F3F0E9 with a bottom hairline.
- NO gradients, NO glows, NO neon, NO coloured shadows, NO decorative blobs or orbs.
- NO emoji, NO sparkle or AI icons, NO "✨", NO stock 3D illustrations.
- NO filler subtitles under headings ("Manage everything in one place", "Your all-in-one…"). A heading stands alone unless the text says something specific.
- NO lorem ipsum. Use the real copy given in each prompt.
- NO controls for features that do not exist: no cart, bag, checkout, wishlist or heart, site search, social media icons, hero slider dots or arrows, "personalise", "change room", chat widget or notification bell.
- Every list or data view also needs an empty state and an error state, designed in the same style (one line of ink text, one muted line, at most one action).
- Accessible: text contrast at least 4.5:1, visible focus rings (2px ink outline), touch targets at least 44px on mobile.
- Desktop frame 1440px wide, mobile frame 390px wide. Mobile has no horizontal scroll and a 16-20px side gutter.

Confirm the design system, then wait for the first screen prompt.
```

---

## Group A: public site (client sees this first)

### A1: Landing page (Portuguese)
```
Screen: Sanctus landing page, desktop. Follow the uploaded full homepage mockup section by section, using this exact copy:
1. Header over the hero photo (chalk text on the photo): SANCTUS wordmark left; nav HOME · COLEÇÕES · PROJETOS · SOBRE · CONTATO; a language switch "PT / EN"; an account icon. No search and no bag icons.
2. Hero: full-bleed dark interior photograph with an obsidian overlay at the bottom left. Eyebrow "MOBILIÁRIO". Serif heading over two lines "Beyond / What Is Seen.". Body "Design atemporal que transcende o visível e transforma espaços em experiências.". A short 40px rule, then the link "EXPLORAR COLEÇÕES →". One photo, no slider.
3. Collections: eyebrow "COLEÇÕES", heading "Formas que / conectam.", body "Cada peça da Sanctus é um convite à contemplação, unindo materiais nobres, formas orgânicas e um design que se mantém atual por gerações.", link "VER TODAS AS COLEÇÕES →". Four photo cards in a row: SOFÁS "Conforto em forma de arte." · MESAS "O encontro entre forma e função." · POLTRONAS "Ergonomia e elegância." · DECORAÇÃO "Elementos que inspiram.", each with "VER COLEÇÃO →".
4. Four-column row: vase photo | subtle panel: "SOBRE A SANCTUS", "Mais do que móveis, / criamos atmosferas.", "A SANCTUS nasceu da crença de que o verdadeiro luxo está nos detalhes. Nossas curadorias unem tradição artesanal, design contemporâneo e materiais autênticos, para transformar espaços em experiências sensoriais.", "CONHEÇA NOSSA HISTÓRIA →" | interior photo | obsidian panel: "PROJETOS", "Espaços que / inspiram.", "Descubra como nossas peças transformam ambientes em experiências únicas.", "VER PROJETOS →".
5. Quote band: large centred serif quote "“O design é a ponte entre o visível e o intangível.”", "— SANCTUS", with a stone photo beside it.
6. Featured piece: eyebrow "POLTRONA", serif "Linden", "R$ 28.900", description "A Poltrona Linden combina linhas orgânicas e materiais nobres, criando uma peça atemporal que traz conforto e elegância para qualquer ambiente.", spec rows DIMENSÕES "A. 76 cm / L. 85 cm / P. 76 cm" and MATERIAIS "Madeira maciça, linho e espuma de alta densidade.", primary button "VER CATÁLOGO", a small muted note "Peça ilustrativa: imagem e preço das referências da marca.", a texture photo captioned "Texturas que contam histórias.".
7. Photo band of four tiles: a lake photo with the wordmark, "Coleções que atravessam o tempo.", "VER CATÁLOGO →"; fabric, bench and card photos.
8. Footer: wordmark, nav, a contact placeholder "contato@sanctus.example", "© 2026 SANCTUS. TODOS OS DIREITOS RESERVADOS."
Then the mobile version: the header becomes a wordmark plus a menu icon that opens a full-height obsidian panel listing the nav; sections stack.
```

### A2: Business catalogue
```
Screen: a business's public 3D catalogue, desktop, Portuguese. This is a page of ONE furniture business on the platform, not Sanctus itself.
- Solid light header (no blur): the business logo and name left, "PT / EN" right.
- Title block: the business name as a serif headline, one line of business description, a muted count "12 peças".
- Sticky filter bar below the header (solid #F3F0E9, hairline top and bottom): category chips TODOS · SOFÁS · MESAS · POLTRONAS · DECORAÇÃO · ILUMINAÇÃO (2px corners, the selected chip in obsidian); a sort select "Mais recentes".
- Product grid, 4 columns on desktop and 2 on mobile: photo at a 4:5 ratio, name in serif, category in small caps, price (or "Preço sob consulta"), and a small "3D model" tag in bronze on products that have one.
- Footer: "Catálogo criado com SANCTUS".
Also design: the empty state ("Ainda não há peças publicadas." plus one muted line), the empty filter result ("Nenhuma peça nesta categoria." plus "Ver todas"), and the loading state (hairline skeleton cards, no shimmer gradient).
```

### A3: Product page with 3D/AR
```
Screen: public product page, desktop, Portuguese, based on the uploaded "Beyond What Is Seen" product mockups.
- Back link "← Catálogo".
- Left column: category eyebrow "POLTRONA", serif name "Linden", price, a short description; finish swatches as small 2px squares with the selected name below under the label "ACABAMENTO"; the primary obsidian button "VER EM 3D / AR".
- Centre: a large stage that opens on the product photograph, with thumbnails below it. In 3D mode it shows the model on a plain #ECE7DD backdrop with the muted hint "Arraste para girar".
- Right rail: two round outline actions stacked, "3D · Visualizar em 3D" and "AR · Ver em AR" (the only round elements allowed).
- Below: DIMENSÕES with a simple line drawing (width, depth, height in cm) and a "Tamanho real verificado" check with a success tick; MATERIAL; PESO; DESCRIÇÃO; more photos in a hairline grid.
- An "AR not supported on this device" inline notice in the warning palette, for desktop browsers: "Abra esta página no celular para ver em AR." with a small QR code.
Mobile: stage first and full width, the name and price under it, the 3D/AR buttons as a sticky bottom bar (solid, not blurred).
```

### A4: Apply as a business
```
Screen: "Apply as a business" form, desktop, Portuguese and English versions. A single centred column, max width 560px.
- Serif heading "Candidate sua empresa" with one specific line: "Analisamos cada pedido e respondemos por e-mail."
- Fields: business name, contact name, email, phone (optional), website or Instagram (optional), city, product categories (checkbox list), "Conte sobre sua empresa" (textarea), terms checkbox.
- Primary button "Enviar candidatura".
- States: inline field errors in danger text under each field; a submitted success page "Candidatura enviada" with "Respondemos em até 3 dias úteis." and a link back to the home page.
```

### A5: Public 404
```
Screen: public not-found page. A serif "Página não encontrada", one muted line, the link "Voltar ao início →". No illustration.
```

---

## Group B: sign-in screens (English)

### B1: Sign in
```
Screen: sign in, desktop and mobile. A solid light header with the wordmark. A centred column of 384px: serif "Sign in", the muted line "For platform admins and business owners.", Email and Password fields, the primary "Sign in" button at full width, an "or" divider with hairlines, a secondary "Continue with Google" button with the Google G logo, shown DISABLED with a small muted "Coming soon" under it, then the links "Forgot your password?" and "New to Sanctus? Apply as a business". Also design the error state: a warning notice above the fields, "Email or password is incorrect."
```

### B2: Reset password (3 steps)
```
Screens: password reset with an emailed code (no magic links), three steps in the same 384px column:
1. "Reset your password": email field, "Send code".
2. "Enter your code": "We sent an 8-digit code to name@business.com. It expires in an hour.", a single code input (large monospace digits, letter-spaced, 2px corners), "Verify code", the text buttons "Resend code" and "Use a different email". Error state "That code is invalid or has expired."
3. "Choose a new password": new password and confirm fields with a strength hint, "Save password". Then a success toast "Password updated".
```

### B3: Accept invitation
```
Screens: accept an owner invitation with an emailed code.
1. "Accept your invitation": intro "Enter the email address the invitation was sent to and the code from the email.", Email field, Code field (same monospace style as B2), "Verify", help text "The code expires after an hour. Ask the Sanctus team for a new invitation if it has expired.", the link "Already have an account? Sign in".
2. "Set your password" for business "Atelier Lagoa": password and confirm fields, "Open my dashboard".
Also an expired-link notice in the warning palette at the top of step 1.
```

### B4: Invitation email
```
Design an HTML email, 600px wide, on the canvas background. SANCTUS wordmark at the top; serif heading "You're invited to Sanctus"; body "The Sanctus team has created an owner account for Atelier Lagoa. Open the invitation page, enter this email address and the code below, then choose your password."; the label "YOUR CODE" and "48213907" in large letter-spaced monospace; an obsidian button "Open the invitation page"; a muted note "The code works once and expires after an hour."; a hairline footer. No images apart from the wordmark.
```

---

## Group C: business owner dashboard (English)

### C0: Dashboard shell (do this first; C1-C6 reuse it)
```
Screen: the dashboard layout shell for a business owner, desktop and mobile.
- Left sidebar, 248px, on the surface colour with a right hairline: wordmark at the top, the business name and its logo below, then the nav with thin line icons: Overview · My Products · Analytics · My Catalog & QR · Business Settings. The active item has an ink left bar and ink text; the others are muted.
- Top bar: solid, no blur, a bottom hairline. The page title in serif on the left; "View catalogue ↗" and the account menu (email, "Log out") on the right.
- Content area max width 1200px, 32px padding.
- Mobile: the sidebar becomes a menu button opening a full-height panel.
```

### C1: Overview
```
Screen: business owner Overview. A row of four flat stat cards (hairline border, no icons in circles): "Published products 12", "Drafts 3", "Product views (30 days) 1,284", "AR launches (30 days) 212". Then a "Needs attention" list (for example "2 products have no 3D model", "Portuguese translation missing on 1 product", each with a text link). Then "Most viewed products": a compact table of five rows (thumbnail, name, views, AR launches). Then a catalogue card with the QR code thumbnail, the catalogue URL and "Download QR". Design the empty state for a new business: "No products yet" plus the primary "Add your first product".
```

### C2: My Products
```
Screen: My Products table. Header actions: primary "Add product". Toolbar: a search field, status filter (All · Published · Draft), category filter. Table columns: thumbnail, name (with the category under it), status badge (Published = success palette, Draft = neutral), 3D (GLB ✓ / USDZ ✓ or "Missing" in warning), updated date, a row menu (Edit, Preview, Unpublish, Delete). Pagination at the bottom. On mobile the table becomes stacked cards. Plus the empty, no-results and error states, and a "Delete product?" confirm dialog with a danger button.
```

### C3: Product editor (the most important dashboard screen)
```
Screen: create/edit product, a long form with a left section index (sticky, solid) and a sticky bottom publish bar (solid #FAF8F3, top hairline, no blur) holding "Save draft" (secondary) and "Publish" (primary), plus a status "Draft · saved 2 min ago".
Sections, each a flat card with a serif title:
1. Basic information: name EN and name PT (side-by-side tabs "EN | PT"), category select, price plus "Price on request" toggle, short description EN/PT, slug with the URL preview.
2. Images: a drag-and-drop zone (dashed hairline, 2px corners), a grid of uploaded photos with reorder handles, a "Cover" badge on the first, remove buttons.
3. 3D models: two upload slots, "GLB (Android, web)" and "USDZ (iPhone)", each with the file name, size and replace/remove actions; a live 3D preview stage beside them; a note "No USDZ: iPhone AR uses the phone-generated version."
4. Dimensions & specifications: width, depth and height in cm, weight in kg, material EN/PT, finishes (name plus swatch colour, add/remove), and an "AR scale check" row showing "Model 85 × 76 × 76 cm matches the dimensions" in success, or a warning when they differ.
5. Call to action: button label and link (optional).
Validation: the publish bar shows "Fix these 3 issues to continue" in danger with links to the fields. Also a "Product published" dialog with the product URL, "View product" and "Copy link", and a "Leave without saving?" dialog.
```

### C4: My Catalog & QR
```
Screen: My Catalog & QR. Left: a catalogue preview card (business name, URL "sanctus.app/catalog/atelier-lagoa", "Copy link", "Open ↗"). Right: a large QR code panel with "Download PNG", "Download SVG" and a print-ready A6 card preview (wordmark, QR, "Veja nossas peças em 3D e AR"). Below: a catalogue settings form (catalogue title, description EN/PT, logo upload, cover image).
```

### C5: Analytics
```
Screen: Analytics. Range selector "7 days · 30 days · 90 days" as a segmented control (2px corners). Stat cards: product views, AR launch attempts, 3D views, QR scans. A line chart of views and AR launches over time using only obsidian and bronze lines on hairline grid lines, with no gradient fills. A "Most viewed products" table. A device split (iOS / Android / Desktop) as a simple horizontal bar. Empty state "No visits yet. Share your catalogue QR to start."
```

### C6: Business Settings
```
Screen: Business Settings. Sections: Business profile (name, logo, description EN/PT, website, city), Contact shown on products (email, phone, WhatsApp; each toggle "Show on product pages"), Account (email, "Change password"). A save bar at the bottom. A success toast "Settings saved".
```

---

## Group D: super admin dashboard (English)

### D0: Admin shell
```
Same shell as C0, with the label "Platform admin" under the wordmark, and the nav: Overview · Applications · Businesses · All Products · Analytics · Catalogs & QR Codes · Audit log · Settings. The Applications item shows a small count badge "4" (ink on #EAE3D6).
```

### D1-D8: admin screens
```
Design these admin screens one by one in the admin shell:
D1 Overview: stat cards (Businesses 18, Pending applications 4, Published products 342, AR launches 30 days 2,140), "Pending applications" list with "Review →", "Most viewed products" table, recent audit events.
D2 Applications: a table (business, contact, city, categories, submitted date, status badge Pending/Approved/Rejected), status tabs, search.
D3 Application detail: all the submitted fields in a two-column definition list, an internal notes textarea, and the actions "Approve and invite owner" (primary) and "Reject" (danger outline, with a reason dialog). After approval: a success notice "Invitation code sent to owner@business.com", the button "Resend invitation".
D4 Businesses list: a table (logo, name, owner email, owner status "Invited/Active", products, catalogue link, created). "New business" primary button.
D5 New business / business detail: a form (name, slug, owner email, language PT/EN), and on the detail page tabs: Profile · Products · Catalogue · Owner (invitation status, "Resend invitation", last sign-in).
D6 All Products: the same table as C2 with a "Business" column and a business filter.
D7 Catalogs & QR Codes: a grid of business catalogue cards, each with a QR thumbnail, URL, "Download QR" and "Open ↗".
D8 Audit log: a dense table (time, actor, event, business, details), filters by event type and date, monospace for IDs.
Settings: platform name, default language, support email, email sender (read-only with the note "Set by the platform owner").
```

---

## Group E: shared components (one Stitch board)
```
Design a single component sheet in the Sanctus system: buttons (primary, secondary, text link, danger, disabled, loading), inputs (default, focus, error, disabled), select, checkbox, toggle, segmented control, badges (success, warning, danger, info, neutral), inline notices (4 tones), toast, confirm dialog, dropdown menu, table row (default, hover, selected), pagination, empty state, error state with "Try again", loading skeleton (flat hairline blocks), file drop zone, the QR dialog. All 2px corners, no blur, no gradients, line icons only.
```

---

## Handover to Claude after client approval

For each approved group, tell Claude: "Group X approved, exports in `design/stitch/`". Claude will then:
1. Compare each export against the current screen and list the differences before changing anything.
2. Map Stitch colours, spacing and type onto the existing tokens in `src/index.css`. A new token is added only if it is genuinely new, with an ADR as required for design changes.
3. Rebuild the screens in the existing components (shared ProductEditor, ProductTable, CatalogQrPanel, AnalyticsView and BusinessForm are never duplicated), keeping `t()`, the data services, and the loading, empty and error states.
4. Remove the three remaining `backdrop-blur` headers (`SiteChrome.tsx`, `PublicShell.tsx`, the `CatalogPage.tsx` filter bar).
5. Run typecheck, lint, unit, e2e and build, check desktop and mobile, push to the Preview branch, and report back.
