# ADR-0004: Localized product content; admin English-only
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/04-domain-model.md, design/10-i18n.md, design/15-product-editor.md

## Context
Public pages must support PT and EN (§13), and product content must stay tied to the right language. The admin UI uses one language (§2).

## Decision
- Customer-facing product fields use `LocalizedText = { en: string; pt?: string }`.
- `localized()` falls back to EN, and the fallback text is marked with `lang="en"`.
- The interface strings for public pages come from the `en.ts` and `pt.ts` dictionaries.
- Admin and dashboard screens are plain English with no `t()` calls.

## Consequences
- Good: missing translations degrade gracefully, and the admin code stays simple.
- Trade-off: the editor needs EN/PT tabs on localized fields.
