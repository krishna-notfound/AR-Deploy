# P12: Platform team roles, then three add-ons

Order: **P12.0 team roles first**, then the add-ons in the order **A3 → A2 → A1**. Each add-on gets its own short design round with the owner (questions → design → approval → plan) before any code. Nothing here is started until the step before it is done.

## P12.0 Platform team roles (Owner / Admin / Team)

- Spec (approved 2026-10-25): `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md`
- Plan (18 tasks): `docs/superpowers/plans/2026-10-25-platform-team-rbac.md`
- Decisions: ADR-0029 and ADR-0030 (written in Task 1 of the plan)
- Status (2026-10-25): **Tasks 1–17 done on the branch** (native execution). All tests pass: 439 unit, 38 browser. Task 18 done 2026-10-25 with the owner's go-ahead: applied to `zggylkbgajamhriebdrg` and checked live (invite, join, Team limits, deactivation, history, link reuse refused). A1 (UI pass) followed; see below.

## Add-ons (agreed 2026-10-25, after P12.0)

### Owner's request, verbatim

> actually i didnt live the internal Ui much for current intance theme kind of same but typologgy fornt etc can be impoved a lots human mind feel east no hassle free understanding of things so i have given you Ui/ux skill and taste skill for stitch to design good internal ui external is call keep stick with theme and try to be better typelogy also remove use less data this is addon feature after RBAC another make a special agent for this remove all ai slop which is in this skills also deep reseach for better feel free to ask ui help then also every product have qr and direct ar link to view ar button also i think on add product on business side he can add 3d model and and apply for 3d model prefer apply for 3d model :D

### A3 Request a 3D model (business side): first after P12.0

- **Ask:** when adding or editing a product, the business owner either uploads their own 3D model or **asks Sanctus to make one**. Asking is the preferred option.
- **First understanding, to confirm in the design round:**
  - the product editor offers "Request a 3D model from Sanctus" next to "Upload your own";
  - the request has a status (requested → in progress → delivered, or declined with a reason) and the business owner can see it;
  - the platform team handles requests in the admin dashboard, which fits P12.0 as a new permission such as "Manage 3D model requests";
  - the delivered model is attached to the product.
- **Open questions for the design round:**
  - what the owner sends with a request (photos, dimensions, notes);
  - whether there's a cost or a limit;
  - email notifications;
  - whether a product can be published before its model arrives;
  - **no Meshy API integration** (still out of scope unless the owner decides otherwise).

### A2 QR code and direct AR link for every product: second

- **Ask:** every product has a QR code and a direct link that opens straight to "View in AR".
- **Today:** a separate QR for each *published* product exists (ADR-0025), and AR opens from the product page with a user tap (native AR only, ADR-0021).
- **Open questions for the design round:**
  - what the "direct AR link" should do (a link to the product page with the AR button up front, or one that starts AR straight away; iOS Quick Look and Android Scene Viewer both need a tap, which limits auto-start);
  - whether drafts get a QR or link (today: published only);
  - where they appear (product editor, product list, catalogue QR page);
  - download formats.
- **Must keep:** AR modes unchanged without the owner's go-ahead and a device test (ADR-0021). The catalogue QR still encodes the catalogue URL.

### A1 Clarity pass on the dashboards, typography for the public pages: third

- **Ask:** the owner doesn't like the internal UI much. Keep the theme, but greatly improve typography and fonts so it's easy to take in and hassle-free, and remove data that isn't useful. On the public site, keep the theme and improve the typography.
- **How:**
  - a dedicated design agent uses the UI/UX skill (`ui-ux-pro-max`), the taste skill (`taste-skill:design-taste-frontend`) and the `interfaces:*` review skills, and designs the internal screens in **Stitch** (project 16545430197078633171) before anything is built;
  - the agent filters out those skills' own AI-slop habits: no gradients, glass, neon, emoji, invented features, jargon or fake data (see `design/stitch/BRIEF.md` and ADR-0028);
  - deep research into how good production admin dashboards handle type scale, hierarchy, density, scanning and search;
  - ask the owner for UI input where it matters;
  - the public pages get typography refinements only, keeping the theme.
- **Open questions for the design round:**
  - which data feels useless (go through each dashboard page with the owner);
  - whether the type scale may change globally (`src/index.css` tokens), which needs an ADR;
  - whether fonts stay Cormorant Garamond + Jost or the dashboards get a more readable UI face (a new font needs an ADR).

- **Status (2026-10-25): built on the branch, ahead of A3 and A2 at the owner's request.**
  - **Designs:** Stitch variant A (Inter for the dashboards), approved by the owner.
  - **Spec and plan:** `docs/superpowers/specs/2026-10-25-dashboard-clarity-design.md` and `docs/superpowers/plans/2026-10-25-dashboard-clarity.md`.
  - **Decision:** ADR-0031, which scopes the dashboard type with `data-surface="dashboard"` and `useInDashboard()`.
  - **Public pages:** they keep their look (pixel guard, 14 pages) apart from the label type in the shell and embed.
  - **Testing:**
    - every page was checked on real client data, read-only, against its Stitch screen;
    - `tests/e2e/a11y-dashboard.spec.ts` enforces no text under 12px, no uppercase and no horizontal scroll at 390.
  - **Not done (deferred):** an Uploaded/Remote URL switch on the 3D model slots, and folding the editor's segmented control into the shared one.
  - **Follow-ups from the reviews** (polish only; nothing a user is blocked by):
    - **Buttons:** add `danger-ghost` and `danger-outline` Button variants, which would remove the `text-danger!` and `border-danger!` overrides in four places.
    - **Monogram:** give it `size` and `tone` props, replacing the `!` overrides in the Team pages.
    - **Search labels:** use FormField with SearchInput on the audit log and on access history. The access-history label is currently an `aria-hidden` span that does nothing when clicked. The SearchInput `label` prop is ignored inside a FormField.
    - **StatGroup:** fix the invalid `dt` wrapper. Remove the old card branch and the `icon` prop, which are now unused, and the unused `eyebrow` in the dashboard context.
    - **Tabs:** the fade mask can go stale when badge counts load. Watch the last tab, not only the list.
    - **Overview "More" menu:** its items use `navigate()`, not links. Take the paths from `lib/urls`.
    - **Role permissions:** after saving, the focused h1 shows a focus ring until the next click.
    - **Toast:** one raised in the dashboard keeps the dashboard sizes after you leave it.
    - **Product editor:** after an index click, the active mark is not released on scrollbar drag.
    - **Tests:**
      - the scope test unmounts the app instead of navigating to a public page;
      - a few 390px tests assert class names only;
      - the a11y skeleton wait matches Skeleton's class string, so a `data-skeleton` attribute would be sturdier;
      - dialogs and toasts sit outside `main`, so the a11y spec does not check them.
    - **Analytics:** the value column in "Views by business" is tight for values of 100,000 or more.
    - **My products:** with filters in the URL and 0 products, it says "No products match these filters".
    - **Audit log:** the search placeholder clips at 390.
    - **Pixel guard:** it can fail on glyph edges under parallel load. Run it with `--workers=1`.
  - **Decision to confirm with the owner:** the Team stat strip now counts only active Admins and Team members. Counting deactivated people misstated who has access.

## Log

| Date | Note |
|---|---|
| 2026-10-25 | P12.0 spec approved and plan written. Add-ons A1–A3 recorded from the owner's request, to run after P12.0. |
| 2026-10-25 | P12.0 live. A1 dashboard clarity pass built and reviewed (14 tasks plus a visual review against Stitch); next is the owner's business-logic pass, then A3 and A2. |
