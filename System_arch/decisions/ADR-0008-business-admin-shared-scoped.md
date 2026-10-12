# ADR-0008: Business Admin reuses shared features, scoped and marked pending
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/07-auth-routing.md, design/13-features-business.md

## Context
The brief (§2, §10) asks for a Business Admin dashboard, but its scope is "pending final scope confirmation". The code must stay modular and must not duplicate the Super Admin logic.

## Decision
- The Business Admin pages are thin wrappers around the shared feature components: ProductTable, ProductEditor, AnalyticsView, CatalogQrPanel and BusinessForm.
- Each wrapper passes `businessId` from `user.businessId`, never from the URL.
- The demo entry page shows a "Scope pending confirmation" badge for this account type.
- `RequireRole` is a UX guard only, not security.

## Consequences
- Good: if the scope is dropped, removing `/dashboard` and `features/business` removes the whole surface cleanly.
- Trade-off: the shared components need a `scope` or `businessId` prop.
