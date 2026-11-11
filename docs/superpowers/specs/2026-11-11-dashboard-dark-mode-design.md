# Dashboard dark mode, 2026-11-11

Owner request (2026-11-11): "user ask for dark mode in dashboard side, also add that in full dashboard".

## Decisions

These are the orchestrator's defaults. The owner can change them.

- **Scope:** every signed-in screen:
  - Admin Console (`/admin/**`), including the Website Editor chrome and the product editor;
  - the company dashboard (`/dashboard/**`);
  - Settings and the account/security pages inside the dashboards;
  - the notification bell.
- **Out of scope (stay light):**
  - the public site (landing, catalogues, product pages, `/apply`);
  - the sign-in, sign-up and invitation pages.
  - Anything that **shows a public page inside the dashboard** stays light: the Website Editor previews, the apply-form preview and catalogue previews. Wrap them in a light scope.
- **Choice:** Light / Dark / System (follows the device).
  - Light is the default, so nothing changes for anyone until they choose.
  - Remembered per device (`localStorage`, read in try/catch, falls back to Light). No database change.
- **Where to switch:**
  - the account/user menu in the dashboard header: a three-way control;
  - Settings → a new "Appearance" card with the same control.
  - Both are bilingual through `t()` (EN + PT-PT).
- **No flash:** apply the saved theme before first paint on dashboard routes, for example a tiny inline script in `index.html` that sets `data-theme` on `<html>` only when the path starts with `/admin` or `/dashboard`, plus the React provider keeping it in sync on navigation. Public routes always get light.

## How

- Tokens in `src/index.css` (ADR-0023). Add a dark set under `:root[data-theme="dark"]` (and `[data-theme="light"]` to force light inside previews). The set redefines the same token names:
  - canvas/surface/subtle;
  - ink/ink-muted/ink-faint;
  - line/line-strong;
  - accent-ink/accent-bright;
  - obsidian/chalk;
  - focus;
  - success/warning/danger.
- **Palette:** a warm Sanctus dark, not blue-grey: an obsidian/umber ground and bone text. Bronze accents keep WCAG AA (4.5:1 text, 3:1 UI and borders).
- **The primary button** (obsidian today) becomes bone on dark with obsidian text, so it stays the strongest element.
- **Hardcoded colours:** find any raw hex, `bg-white`, `text-black` or similar in dashboard components and move them to tokens. Keep those that must stay light:
  - QR codes stay dark-on-white;
  - product photos and 3D model-viewer backgrounds stay neutral or light.
- **Charts** (analytics) use token colours that read on both grounds.
- **Must work in dark:** toasts (Sonner), dialogs, dropdowns, inputs and their placeholders, tables, badges, skeletons, focus rings and scrollbars (`color-scheme: dark`).

## Tests and done

- Unit tests: the theme store (default light, saved choice, broken storage falls back to light, System follows `prefers-color-scheme`).
- Component tests: the menu control and the Appearance card. Public routes never get `data-theme="dark"`.
- Playwright screenshots in dark at 1440 and 390 px:
  - admin overview, applications, products and the product editor;
  - the Website Editor (preview stays light);
  - the company dashboard and settings.
- Existing visual baselines stay light and unchanged.
- `typecheck`, `lint`, `test` and `build` pass.
- **Records:**
  - ADR-0060 "Dashboard dark mode" plus its row in `System_arch/decisions/README.md`, amending ADR-0023 on tokens;
  - update `System_arch/design/` for the theme/tokens;
  - update `docs/CLIENT_HANDOVER.md` (how to switch);
  - a row in `docs/DECISIONS.md`.
