# ADR-0031: Dashboard type and density
- **Status:** Accepted
- **Date:** 2026-10-25
- **Affects:** ADR-0023 (Sanctus type roles) and ADR-0028 (Stitch redesign), for the dashboards only; design/11-design-system.md
- **Spec:** `docs/superpowers/specs/2026-10-25-dashboard-clarity-design.md` §1–§4
- **Design source:** `design/dashboard/BRIEF.md`; Stitch screens "Dash v2 A – …" exported to `design/stitch/dashboard/A-*/`

## Context
The Super Admin and Business dashboards use the landing-page type: Jost, 11px uppercase labels with wide tracking (`text-eyebrow`, `text-label`), tracked uppercase buttons, and small grey text. That suits a brand page, but it makes the screens hard to read. Hierarchy is weak, numbers don't line up in columns, and several screens repeat the same action or list twice.

The owner reviewed two type variants in Stitch (round 1) and every in-scope screen in the chosen variant (round 2), and approved them on 2026-10-25. The landing page, apply page, sign-in pages and emails are the client's reference look and must not change.

## Decision
- **Inter for all dashboard UI text** (tables, forms, buttons, numbers), loaded from the existing Google Fonts link in `index.html`. No npm dependency. Cormorant Garamond 500 stays for the page title (h1) only. Jost is rejected for the dashboards.
- **Type scale** (Inter unless noted):
  - h1: Cormorant 32px / 1.15 / 500 / -0.01em;
  - subline 15/1.5; card title 16/1.4/600; body and input 14/1.5 (16px under 640px);
  - table cell 14/20 (identity 500), secondary line 13/18; table header 13/500, sentence case;
  - label 14/500; help 13/1.45;
  - KPI value 28/1.1/500, tabular; KPI label 13/500;
  - badge 12/20/500; button 14/500, sentence case; nav item 14 (active 500).
- **Spacing:**
  - canvas padding 40 / 24 / 16px (desktop / tablet / phone);
  - card gap 24px and card padding 24px;
  - control height 40px (36px in card headers, 44px on touch);
  - sidebar 256px with 40px rows and 18px icons; top bar 56px.
- **Rules:**
  - nothing under 12px;
  - dashboard greys use `#5A5148` (`text-ink-muted`), and `#6E6559` only for placeholders;
  - weights are 400, 500 and 600 only;
  - tabular figures on every KPI, table number, count, date and file size;
  - **no small uppercase letter-spaced text** in the dashboards (the SANCTUS wordmark is the only exception);
  - stat cards have no icons: one strip divided by hairlines, with a label, a value and a hint.
- **Kept from ADR-0023 and ADR-0028:** the colour tokens, 2px corners, hairlines, flat surfaces, the dark sidebar. No gradients, blur or glow.
- **One scope so nothing else moves:** `DashboardShell` sets `data-surface="dashboard"` (and `document.body.dataset.surface` while a dashboard route is mounted, so portals inherit it). All new rules live in `src/index.css` under that attribute. Pages outside the shell never match it.
- **Public catalogue and product pages (D8)** keep Jost and Cormorant. Small uppercase labels grow to at least 12px with at most 0.08em tracking, the "01 //" card numbering goes, and "Ver peça →" becomes sentence case.
- **Not touched (D9):** the landing page, `/apply`, `/demo`, `/login`, `/reset-password`, `/accept-invite`, `/join` and the emails.
- **Pixel guard:** before any visual change, `tests/visual/guard.spec.ts` records full-page screenshots of the untouched pages at 1440 and 390. The Playwright project `guard` compares them with zero allowed differing pixels, and it runs after every later task.
- **No behaviour change:** permission gating, data loading, empty/loading/error states, and AR and 3D behaviour stay as they are. The "Recently added products" and "Recently created businesses" panels are removed (owner decision D4).

## Consequences
- Good: readable, scannable dashboards with a clear hierarchy, and the Sanctus look kept.
- Good: the scoped selectors plus the pixel guard make "landing and sign-in pages are unchanged" something the tests prove.
- Trade-off: the dashboards now use a second sans (Inter) beside Jost on the public pages. One more font family is loaded (three weights).
- Trade-off: the guard's snapshots are tied to the platform and fonts they were recorded on (the file names carry the OS). They are recorded on the developer's machine, not in CI.
- This ADR amends ADR-0023's "serif for display/headline/title and Jost for the rest" and ADR-0028's dashboard typography, inside the dashboard scope only.

## Alternatives rejected
- **Variant B, Jost with a one-pixel-larger scale:** Jost's smaller x-height keeps the text harder to read at 13–14px, and the owner rejected it.
- **Geist instead of Inter:** its tight geometric shapes read as a developer tool next to the editorial serif.
- **Changing the global type tokens:** it would move the landing and sign-in pages, which must stay pixel-identical.
