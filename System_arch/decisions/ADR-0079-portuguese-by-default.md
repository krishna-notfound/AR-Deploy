# ADR-0079: Portuguese is the default language
- **Status:** Accepted (amends ADR-0044's choice order)
- **Date:** 2026-11-14
- **Affects:** src/i18n/LanguageProvider.tsx, vite.config.ts, playwright.config.ts

## Context
The client is Portuguese and the live site is `sanctus.company`. Until now, a visitor with nothing chosen got Portuguese only when the browser language was Portuguese; everyone else got English. The owner asked for Portuguese first for everyone, with English one tap away.

## Decision
The language order is: `?lang=` for this visit, then the device's saved choice, then **Portuguese**. The browser language no longer decides. The build-time variable `VITE_DEFAULT_LANG` (`en` or `pt`) overrides the last step; production leaves it unset. The unit and end-to-end test runs set it to `en`, because their assertions are written against the English copy.

## Consequences
- Good: every first visit opens in Portuguese, on every screen (public pages, sign-in, dashboards); the EN/PT switch and a saved choice still win.
- Trade-off: an English-speaking visitor sees Portuguese until they switch once (the choice is then remembered on that device).
- Trade-off: tests run with a different default than production; one test checks the production default explicitly.

## Alternatives rejected
- Keep the browser-language rule: the owner wants Portuguese for everyone.
- Switch the tests to Portuguese: hundreds of assertions would change with no gain in coverage.
