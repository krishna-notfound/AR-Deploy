# ADR-0016: Marketing landing page at "/", demo account picker at "/demo"
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/07-auth-routing.md, design/14-features-public.md

## Context
`/` was the demo account picker. Phase 2 asks for an editorial landing page and also for the demo entry points to be preserved.

## Decision
- **Routes:**
  - `/` is the landing page (`features/marketing/LandingPage.tsx`).
  - `/demo` holds the account picker (`features/demo/DemoAccounts.tsx`, also embedded at the end of the landing page).
  - `/login` is real sign-in (Supabase mode only; in demo mode it forwards to `/demo`).
- Old `/?next=…` links are redirected to `/demo?next=…`.
- **Language:** the landing page is English-only (B2B marketing for the platform). Tenant catalogs stay EN/PT.
- **Hero:** uses the real Glam Velvet Sofa model in `<model-viewer>`; its caption shows the size measured in the browser.
- **Showcase:** comes from `service.getProducts`, with loading, empty and error states.
- **Honesty:** no logos, testimonials or statistics. The contact address is labelled as a placeholder.

## Consequences
- Good: every previous entry point still works. Hostname (tenant) mode is unaffected.
- Trade-off: the landing page loads model-viewer (~290 KB gzipped) after first paint, with the poster shown immediately.

## Alternatives rejected
- Keeping the picker at `/` and putting marketing at `/about`: the first impression would stay an internal tool.
