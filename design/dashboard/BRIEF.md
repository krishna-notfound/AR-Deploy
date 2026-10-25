# Dashboard type and layout brief (2026-10-25)

Scope: the Super Admin (`/admin`) and Business Admin (`/dashboard`) screens only. The landing page, apply/sign-up, login, reset, accept-invite, join pages and emails are out of scope.

Goal: someone opening a dashboard should see what matters and what to do next without effort. The type is readable, the hierarchy is obvious, each screen has one primary action, numbers scan in columns and status reads at a glance.

Kept as they are: the Sanctus palette and tokens in `src/index.css`, 2px corners, 1px hairlines, flat surfaces, line icons (lucide, 1.5px stroke) and the dark obsidian sidebar (ADR-0028).

Removed: the duplicate "Recent products" panel (business Overview) and "Recently created businesses" panel (admin Overview). Every other real feature stays.

Stitch screens: project `16545430197078633171`, named "Dash v2 A/B – …". Exports are in `design/stitch/dashboard/`.

## Decided by the owner (2026-10-25)

- **Variant A is chosen.** Inter sets all dashboard text, tables, forms and numbers; Cormorant Garamond 500 sets page titles (h1) only. **Variant B (Jost) is rejected** for the dashboards. Its column below stays for the record only.
- **Stat cards have no icons.** A stat is a label, a value and a hint, in one card split by dividers (§4).
- **No small uppercase letter-spaced labels** on dashboards (eyebrows, table headers, tags, buttons). The SANCTUS wordmark is the only exception.
- The public catalogue and product pages keep Jost and Cormorant (the landing theme). The round-2 public screens change only their clarity and type scale, not their structure or the 3D/AR behaviour.

## 1. Type variants (A chosen, B rejected)

Both variants use **Cormorant Garamond for the page title (h1) only, at weight 500.** Cormorant has a small x-height, so 32px Cormorant looks about as big as 26px sans. That keeps the title in app size (the 18–32px range) while it still reads as Sanctus.

**Variant A, "UI sans": Inter.** Inter was chosen over Geist because it has a tall x-height and open shapes that stay legible at 13–14px, true tabular figures (`tnum`) and full Portuguese accents. It is a variable font on Google Fonts, loaded the same way as Jost today, so no npm dependency is needed. Geist's tight geometric shapes read as a developer tool and clash with the editorial serif.

**Variant B, "Jost" (rejected by the owner):** the current fonts with the new scale. Jost's x-height is about 15% smaller than Inter's, so every UI size is set **1px larger** to reach the same reading size. In B, card titles use Cormorant as well, matching today's serif card titles.

| Role | Variant A (Inter) | Variant B (Jost) | Notes |
|---|---|---|---|
| Page title (h1) | Cormorant 32px / 1.15 / 500, -0.01em | Cormorant 32px / 1.15 / 500, -0.01em | One per screen. No eyebrow above it |
| Page subline | Inter 15px / 1.5 / 400, `#5A5148` | Jost 16px / 1.5 / 400, `#5A5148` | Only when it says something specific |
| Card / section title | Inter 16px / 1.4 / 600, `#1D1C1A` | Cormorant 22px / 1.2 / 500, `#1D1C1A` | Sentence case |
| Body, form input | Inter 14px / 1.5 / 400 (16px on mobile) | Jost 15px / 1.5 / 400 (16px on mobile) | Input text 16px under 640px (iOS zoom) |
| Table cell, primary | Inter 14px / 20px / 500 for the identity, 400 otherwise | Jost 15px / 22px / 500 for the identity, 400 otherwise | Identity in `#1D1C1A`, other cells `#3A352F` |
| Table cell, secondary line | Inter 13px / 18px / 400, `#5A5148` | Jost 14px / 20px / 400, `#5A5148` | Email under the name, price under the product |
| Table header | Inter 13px / 1.3 / 500, `#5A5148`, sentence case | Jost 14px / 1.3 / 500, `#5A5148`, sentence case | No uppercase, no tracking, no fill band |
| Form label | Inter 14px / 1.4 / 500, `#1D1C1A` | Jost 15px / 1.4 / 500, `#1D1C1A` | Above the field, 8px gap |
| Help / meta text | Inter 13px / 1.45 / 400, `#5A5148` | Jost 14px / 1.45 / 400, `#5A5148` | Below the field, 6px gap |
| KPI value | Inter 28px / 1.1 / 500, tabular, -0.01em | Jost 30px / 1.1 / 500, tabular | The lead figure. Nothing on screen is larger |
| KPI label | Inter 13px / 1.3 / 500, `#5A5148` | Jost 14px / 1.3 / 500, `#5A5148` | Above the value, sentence case |
| Badge / pill | Inter 12px / 20px / 500 | Jost 13px / 20px / 500 | 20px tall, 2px radius, pale tint + dark ink |
| Button | Inter 14px / 500, sentence case | Jost 15px / 500, sentence case | Tracked uppercase buttons are dropped |
| Nav item (sidebar) | Inter 14px / 400, active 500 | Jost 15px / 400, active 500 | Up from 13.5px |

The rules that apply in both variants:
- `font-variant-numeric: tabular-nums` on every KPI, table number, count badge, date and file size.
- **No uppercase letter-spaced labels on dashboards.** Today's 11px tracked eyebrows and labels (`--text-eyebrow`, `--text-label`) go; they are the main reason the screens feel hard to read. The only caps left are the SANCTUS wordmark, which is the logo.
- A screen has at most three weights: 400, 500, and 600 in A only. Jost is loaded at 300/400/500, so B never uses 600.
- Body line-height is 1.5 or more. Anything that wraps to three lines gets at least 1.45.
- Nothing is smaller than 12px. Text is `#1D1C1A` or `#3A352F`, and greys are `#5A5148`, which is at least 4.5:1 on `#FAF8F3`. `#6E6559` is only for placeholders.

## 2. Spacing and density (4px base)

| Token | Value |
|---|---|
| Canvas padding | 40px desktop, 24px tablet, 16px phone |
| Gap between cards (horizontal and vertical) | 24px, one value everywhere |
| Card padding | 24px; table cells 16px horizontal |
| Gap inside a group / between groups | 8–12px / 24px or more (at least 2×) |
| Page title to first block | 32px |
| Control height | 40px in forms and toolbars, 36px for small buttons in card headers, 44px on touch |
| Sidebar | 256px, nav rows 40px, icons 18px |
| Top bar | 56px, solid `#F3F0E9`, bottom hairline |

Density is medium. A card shows 4–6 rows and then a "View all" link. Overviews never paginate.

## 3. Page header

- Breadcrumb in the top bar (14px, `#5A5148`, current page `#1D1C1A`). There is no eyebrow above the title.
- h1 (Cormorant 32px), then one optional subline. Status meta (a badge) sits next to the subline.
- **One primary action** on the right (obsidian `#1D1C1A`, chalk text, 40px). At most one secondary (1px ink border, transparent). Further actions go in a "More" menu.
- A duplicate is removed: the business Overview shows "View catalog" in the top bar only, and the page header keeps "Add product".

## 4. Stat strip (KPIs)

- **One card split by 1px vertical dividers** into equal columns, not separate tiles. The number of columns equals the number of stats (4 or 5, never an orphan).
- In each column: label (13/14px, muted), then value (28/30px, ink, tabular), then hint (13/14px, muted, for example "Last 30 days · 16.5% of views").
- No icons, sparklines or coloured deltas. Zero prints as "0". A missing value is a grey "—" at hint size.
- "Sample data" tag in the strip's footer row when the data is seeded, as the app does today.

## 5. Tables

- Rows: 52px for single-line rows; 60px for two-line rows with a 32px monogram. The header row is 40px.
- Header: sentence case, 13/14px, 500, muted. It has no fill. The rule below it is `#D9D3C7`, and row rules are `#ECE7DD` (lighter than the header rule). No zebra stripes.
- Alignment: the identity column is left-aligned and gets the most width (about 35%). Numbers and dates are right-aligned and tabular. A sort glyph shows only on the sorted column.
- **Status column:** one status mark per state. Pills are 20px tall with 2px corners, a pale tint and dark ink of the same hue: success `#2F6B4F` on `#E5F0E9`, info `#33597A` on `#E5EDF4`, warning `#8F5A0B` on `#F8EEDC`, danger `#A8362A` on `#F8E5E2`, neutral `#3A352F` on `#ECE7DD`. Role badges: Owner `#F3F0E9` on `#1D1C1A`; Admin `#6E5C45` on `#EAE3D6`; Team neutral.
- **Row actions:** one 32px "⋯" button at the far right, in a fixed column. The Owner row has no button, and its cell stays empty.
- Toolbar above the table: search (40px, about 320px wide) followed by labelled selects (Role, Status), all on one row.
- Under 640px, each row becomes a two-line list item: the identity and the key value on line 1, everything else on line 2 at 14px muted. No column is dropped.

## 6. Forms (product editor)

- The label is above the field. Help text sits below it, muted. The error replaces the help text in `#A8362A`, at 13/14px with a 14px alert icon, linked to the field with `aria-describedby`.
- Inputs: 40px high, background `#FAF8F3`, 1px border `#D9D3C7`, focus 2px ink ring, 2px corners. Required fields show "Required"; optional ones show "Optional" in muted text after the label.
- Each section is a flat card (`#FAF8F3`, 1px `#D9D3C7`) with a title (§1) and one muted description line, 24px padding and 20px between fields.
- EN/PT: a small segmented control at the right end of the label row (EN | PT). "PT ·" marks a missing translation. The PT help text is "If left empty, customers see the English text."
- Section index: 200px column on the left, sticky, 14/15px, 36px rows. The active item is ink with a 2px ink left bar. A section with errors shows the danger colour and an alert icon.
- Sticky publish bar: solid `#FAF8F3`, top hairline, 64px. Left: status badge plus "Unsaved changes", "All changes saved" or "Not saved yet". Right: Preview (secondary), Save draft (secondary), Publish (primary).
- Validation: an error summary card at the top ("Fix these 3 issues to continue") with links to the fields.

## 7. Empty, loading and error states

- Empty: the card keeps its title. Inside, one ink sentence, one muted sentence and at most one action. No illustration.
- Loading: the final layout with flat `#ECE7DD` bars at the real text heights and the row pitch kept. No shimmer gradient and no layout shift.
- Error: inside the block that failed, never full-screen. One sentence on what failed and a "Retry" text button. Danger colour only on the 16px icon.

## 8. What came from each skill

| Skill | Applied | Rejected as slop or not fitting |
|---|---|---|
| taste-skill `design-taste-frontend` (app-screens) | One question per screen; KPIs as type in one divided strip, not tiles; no icon chips, sparklines or coloured deltas; a 24px single gutter; sentence-case 12–14px grey table headers; right-aligned tabular numbers; one status mark per row; capped lists with "View all"; honest zeros and dashes; in-block error states; no uppercase tracked labels | Its "dark sidebar on light canvas is a tell" rule (the owner kept the obsidian sidebar, ADR-0028); its "monospace for IDs" (no IDs on these screens); page-run devices such as scroll scenes, motion floors and found imagery (not for app screens) |
| ui-ux-pro-max | Label above field, error below with `aria-describedby`, error summary that links to fields; 4.5:1 contrast; 44px touch targets; scale 12/13/14/16/28/32; tabular numbers for data; autosave status in the publish bar | Its dashboard font pairing (Fira Code + Fira Sans, a "tech/HUD" mono look); style presets (glassmorphism, bento, gradients); GSAP motion presets |
| interfaces `better-typography` | Size, line-height and weight paired per role; unitless line-heights; weight ≥ 400 under 18px; tabular figures on changing values; 16px inputs on mobile; -0.01em tracking only at 28px and up | No new typeface beyond the owner's A/B request |
| interfaces `better-layout` | Group with space first, lines last (2× gap between groups); shared left edges; one primary per view and the rest in a menu; identity leads, actions trail; sticky bar without clipping content | — |
| interfaces `better-interface` | Review order (accessibility, layout, writing, type, colour, polish) used to check every Stitch result; escalation triggers: state never shown by colour alone (pills carry words), visible focus, no clipped text | — |

Slop filtered out everywhere: gradients, blur or glass, glow, neon, emoji, sparkle or AI icons, rounded 16px+ cards, pills on everything, decorative blobs, invented features or numbers, jargon ("telemetry", "ecosystem", "curatorial"), filler subtitles and hero-style dashboards.

## 9. Final Stitch screens (desktop 1440)

| Screen | Variant A (Inter) | Variant B (Jost) |
|---|---|---|
| Business Overview | `78fc1b812c594013951277df998efa04` (round 2: product names corrected; was `9303199f…`) | `1079f3a645d440bcbdc50a9a2eb6a671` |
| Team & Access | `c97f2798ca974e08b9239f1e518fa068` | `0089560975804ac6aa55d4dcacf91905` |
| Product Editor | `a16f324eeeab46fba54cdce903a6f60d` | `193a38b28a774a238bc453c6d96796c5` |

The exports are in `design/stitch/dashboard/<A|B>-<screen>/`, and the side-by-side images are `compare-overview.png`, `compare-team.png` and `compare-editor.png`. The B editor was made from the final A editor by changing only the type, so that comparison shows the font change alone. Earlier drafts named "Dash v2 …" without a suffix are superseded.

Two things in the screens stand in for the real app:
- The editor's 3D preview is a flat drawing in place of the live model viewer.
- The product photos were generated by Stitch, not taken from the seed.

## 10. Round 2: every in-scope screen in Variant A (2026-10-25)

Exports are in `design/stitch/dashboard/A-<key>/` (`screenshot.png` + `code.html` + `stitch.json`). The contact sheets are `sheet-admin.png`, `sheet-business.png`, `sheet-public.png` and `sheet-mobile.png`.

| Screen | Folder | Stitch screen ID |
|---|---|---|
| Admin Overview | `A-a-overview` | `f4356b01a00743abad6d4ba7efd184cf` |
| Applications | `A-a-applications` | `be05ab95787c4af88cd1ee8d86889b6e` |
| Application detail, review state | `A-a-app-review` | `0764a3d96ede4408bd2ca9e6a205b962` |
| Application detail, approved state with owner panel | `A-a-app-approved` | `33e7189b900b431f96cda0aac148a49e` |
| Businesses | `A-a-businesses` | `5ff002d14d8745d3971c9f56a89ad973` |
| Business detail (Details tab) | `A-a-business-detail` | `ed707e310bb94542a4a71a57695e4cf9` |
| All Products (also My Products) | `A-a-products` | `777d314e422b4cf4883e50ca3483bae9` |
| Catalogs & QR Codes | `A-a-catalogs` | `8a6f83ea1f2041f398417801eb00ca2f` |
| Analytics | `A-a-analytics` | `d49e0d47784d4696aa5e7838340df558` |
| Audit log | `A-a-audit` | `073a0aba946245aab60662cf5406825e` |
| Admin Settings | `A-a-settings` | `b7559de81a1e4341a73ffb7006a5e239` |
| Role permissions | `A-a-roles` | `43002ba5f9e844de8c1e659b2f115fb0` |
| Member detail | `A-a-member` | `c6f1866725144bfdb880910ae3620ba7` |
| Invite member dialog (form and review steps side by side) | `A-a-invite` | `ec66223f520c46d79e66acf80174a174` |
| My Catalog & QR | `A-b-catalog` | `e1fa01d626a1495488985380fa820377` |
| Business Settings | `A-b-settings` | `5b1f7fe05755428dbb60615711c6bff5` |
| Public catalogue (PT) | `A-p-catalog` | `c8fbe5f3f0ad49499d5bc0cd47b48bc3` |
| Public product page (PT, desktop) | `A-p-product` | `53a98d05959c43088895e36c566ef7ab` |
| Mobile: business Overview | `A-m-overview` | `317c0f253ce34cc295cf0626d36383ba` |
| Mobile: Team & Access | `A-m-team` | `905aa5960c2b43eca15e6fdab3ea767e` |
| Mobile: Product editor | `A-m-editor` | `fe06eab2870b448baec023285f41255e` |

How the screenshots were made:
- Stitch captured six screens (Businesses, Catalogs, Member, Role permissions, My Catalog, Business Settings) in a 1280px viewport, or with the fixed bottom bar in the wrong place. Their `screenshot.png` is the exported `code.html` rendered by Playwright at 1440px. Stitch's own capture is kept as `screenshot-stitch.png`.
- Stitch centred the mobile screens in a 1280 frame. Those screenshots are cropped to the 390px phone; `A-m-team/screenshot-frame.png` keeps Stitch's original.

Sample data:
- The demo seed has no applications. The admin screens therefore use five labelled sample applications (Atelier Norte, Casa do Linho, Luz & Forma, Madeira Viva, Studio Brisa), so the Applications badge reads 3.
- The round-1 Team & Access screen shows 4; it was not regenerated.
- Platform totals (4,862 views, 731 AR attempts) and the per-business figures are sample values that add up to each other.

## 11. Owner decisions

1. ~~A or B~~ **Decided: A** (2026-10-25).
2. ~~Drop the stat-card icons and tracked eyebrows~~ **Decided: yes** (2026-10-25).
3. Still open: remove the duplicate "View my catalog" button from the business Overview header, so it is only in the top bar.
4. Open (round 2):
   - Applications list: "Review" is drawn as a secondary button rather than one primary button per row, to keep one primary per screen.
   - Admin Overview header: it keeps all three real actions ("View catalogs" as a text button, "Add product", "Create business").
5. Open (round 2, public pages): small uppercase labels stay on the public pages, but at 12px or more with tracking of 0.12em or less (today they are 10–11px at 0.18–0.24em). The card chip loses its "01 //" index. "Ver peça →" becomes sentence case.
