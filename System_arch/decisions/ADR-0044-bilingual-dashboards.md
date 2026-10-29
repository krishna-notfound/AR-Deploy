# ADR-0044: Portuguese and English everywhere, including the dashboards
- **Status:** Accepted (owner, 2026-10-29)
- **Date:** 2026-10-29
- **Affects:** ADR-0004 (admin English-only part), ADR-0032 (the "two dashboards stay English-only" bullet), CLAUDE.md hard rule, design/10-i18n.md, docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md

## Context
The dashboards have been English-only since ADR-0004 (2026-10-12). `LanguageProvider` wraps only the public routes, and CLAUDE.md says "The admin and business dashboards are English-only". On 2026-10-29 the client asked for Portuguese and English in the admin and company dashboards. The owner added: "there should be a switch button of Portugal and English every things so it easy for anyone to switch".

## Decision
- **This supersedes** the CLAUDE.md hard rule "The admin and business dashboards are English-only" and the English-only part of ADR-0004 and ADR-0032. CLAUDE.md is updated in the same project (phase 7). From now on every screen uses `t()`; the landing page, catalog and product pages keep using `t()` and `localized()`.
- **One provider for the whole app.** `LanguageProvider` moves to the app root, so it covers `/admin`, `/dashboard`, the settings hub and the sign-in pages.
- **A visible PT | EN switch** in the Admin Console and company dashboard top bar, the settings hub, and the auth pages (login, reset, accept-invite, join, demo, apply). It is the same switch, with the same design, as on the landing page (owner, 2026-10-29). Dashboard text is not client-editable; its Portuguese (pt-PT) is written in this project with no separate review step.
- **Choice** order: `?lang=` for that visit, then the device's saved choice (`localStorage` key `arfurn:lang`; an old `sessionStorage` value is copied once), then the browser language (`pt*` Portuguese, else English).
- **Every user-facing string** in `/admin` and `/dashboard` (toasts, errors, empty states, confirm dialogs, `aria-label`s, page titles, nav labels) becomes a dictionary key in Portuguese of Portugal (pt-PT). Dates, numbers and money use `Intl` with the current language. Business and product data are not translated.
- **Not in this decision:** emails sent by Edge Functions (a follow-up) and the landing copy (already bilingual).

## Consequences
- Good: anyone can switch language from any screen; Portuguese-speaking staff and business owners work in their language.
- Good: the existing test that requires a Portuguese entry for every English key covers the new strings.
- Trade-off: a large translation effort (about 110 files) and a larger dictionary bundle. Dictionaries are split by area to keep them manageable.
- Trade-off: staff whose browser is set to Portuguese now see Portuguese dashboards by default.
- Trade-off: services return English `message` strings and `validation.ts` returns English text today; both change to keys so the UI never shows raw English.
- Trade-off: the language choice is stored per origin, so business subdomains and the platform domain remember separately.
- Trade-off: the pt-PT wording needs a read-through by the owner or client before go-live.

## Alternatives rejected
- Keep the dashboards English-only (ADR-0004): the client asked for Portuguese.
- Translate only the Admin Console: the company dashboard is what business owners use daily.
- A language setting only inside Settings: the owner wants a switch on every screen.
- A translation library (i18next and similar): needs a new dependency and an ADR; the existing `t()` and dictionaries already work.
- Store the language on the profile only: it would not work on sign-in pages, before login.
