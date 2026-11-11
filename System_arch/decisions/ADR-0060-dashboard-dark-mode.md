# ADR-0060: Dashboard dark mode (Light / Dark / System)
- **Status:** Accepted (amends [ADR-0023](ADR-0023-sanctus-brand-from-client-references.md) on tokens; ADR-0023 is not superseded)
- **Date:** 2026-11-11
- **Affects:** design/11-design-system.md, docs/CLIENT_HANDOVER.md

## Context
A user asked for dark mode in the dashboards (owner, 2026-11-11: "user ask for dark mode in dashboard side, also add that in full dashboard"; the defaults below are the orchestrator's and the owner may change them). The Sanctus palette (ADR-0023) is light only, the colours are Tailwind `@theme` tokens, and a few components held raw colours. The public site, catalogues and sign-in pages are the client's brand surfaces and must not change.

## Decision
- **Scope:** every signed-in screen: `/admin/**` (including the Website Editor chrome and the product editor), `/dashboard/**`, settings and the notification bell. The public site, sign-in, sign-up and invitation pages are always light. Anything that shows a public page inside a dashboard (Website Editor previews, the apply-form preview, catalogue previews, the 3D stage) is wrapped in `data-theme="light"`.
- **Choice:** Light / Dark / System. Light is the default. The choice is per device in `localStorage` key `arfurn:theme` (read in try/catch, falls back to Light). No database change. System follows `prefers-color-scheme` and changes with it.
- **Where:** the account menu in the dashboard (a Light / Dark / System radio group) and Settings → Preferences → "Appearance" card. Both through `t()` (EN and PT-PT).
- **Tokens:** `src/index.css` redefines the same colour token names under `[data-theme="dark"]` (`:root[data-theme='dark']`), and `[data-theme="light"]` restores the public values for a light island. A unit test fails if the island's values drift from `@theme`. One new token, `--color-on-danger` (text on a solid danger fill). Palette constants (obsidian, chalk, limestone, umber, taupe) do not change: they name fixed colours for surfaces that stay dark or light (the sidebar, photo overlays). Where a component meant "the strongest fill", it uses `bg-ink text-canvas` (identical in light), not `bg-obsidian text-chalk`.
- **Palette:** a warm Sanctus dark, not blue-grey: ground `#141311`, surface `#1c1a17`, subtle `#26231f`, bone text `#f3f0e9`, bronze `#cdb994` for accent text and `#a38d6e` for rings. Contrast numbers are in the comment above the block in `src/index.css` (every text pair is at least 5.2:1, borders and rings at least 3.8:1). The primary button is bone with obsidian text.
- **No flash:** `public/theme-init.js`, loaded from `index.html` before first paint, sets `data-theme="dark"` on `<html>` only for `/admin` and `/dashboard` paths when the saved choice resolves to dark. It is a same-origin file, not an inline script, so the site stays inside the `script-src 'self'` policy (`vercel.json`, report-only today). `ThemeSync` (in `RootLayout`) keeps the attribute in step on route changes; a public route removes it. `color-scheme: dark` is set with the theme so scrollbars and form controls follow.
- **Charts** read token colours (`var(--color-*)`), so they follow the theme. QR codes stay dark on white; photos stay as uploaded.

## Consequences
- Good: no change for anyone until they choose; public pages and the pixel guard are untouched; one token set, no duplicated components.
- Trade-off: the choice is per browser, not per account (no DB change, so it does not follow a person to another device). The light island repeats the public values in CSS (guarded by a test). One extra blocking same-origin request for `theme-init.js` on every page load.
- Components added later must use tokens, not raw colours, and wrap any public-page preview in `data-theme="light"`.

## Alternatives rejected
- Per-account setting in the database: needs a migration and the owner's go-ahead; not needed for the request.
- An inline script in `index.html`: breaks under an enforced `script-src 'self'`.
- Following the device setting with no choice: people on a dark phone with a bright office monitor, and the reverse, could not override it.
- Dark mode on the public site: out of scope; those pages carry the client's brand.
