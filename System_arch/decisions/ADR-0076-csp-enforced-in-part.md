# ADR-0076: Enforce the verified part of the CSP; the rest stays report-only
- **Status:** Proposed (QA fix 2026-11-14, SEC-WEB-01 / PSA-3; accepted when merged)
- **Date:** 2026-11-14
- **Affects:** design/20-deployment.md, docs/SECURITY_REVIEW.md (O-6 in System_arch/HANDOFF.md)

## Context
`vercel.json` enforced only `frame-ancestors`. The full policy was `Content-Security-Policy-Report-Only`, so nothing stopped an injected script, and nobody reads a report-only policy without a report endpoint (which needs a backend, ADR-0015).

On 2026-11-14 the policy was run ENFORCED against a production build in demo mode (home, apply, privacy, collection, catalogue, product with the 3D viewer loaded, embed, sign-in, demo sign-in, admin editor, product list and editor, dashboard): zero violations. A deliberately narrowed policy did report violations, so the check detects them. Not covered from here: Supabase mode (signed storage URLs, Edge Functions), Draco/KTX2 models from `www.gstatic.com`, Scene Viewer and Quick Look launches on a phone, the model optimiser.

## Decision
Enforce the directives that depend only on what the app itself ships, on every route (embeds too, each with its own `frame-ancestors`):
`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'`.

No `default-src` in the enforced header, so `connect-src`, `img-src` and `media-src` stay unrestricted there. They remain in the report-only policy (unchanged) until checked in Supabase mode and on a phone; then the owner (or the next change) moves them across by adding `default-src 'self'; connect-src ...; img-src ...; media-src ...` from the report-only value to the two enforced rules in `vercel.json`.

## Consequences
- Good: an injected or third-party script, object or form target is now blocked, which was the point of SEC-24.
- Trade-off: Vercel Preview deployments inject `vercel.live` scripts for the toolbar; those are now blocked on previews (production is unaffected).
- Trade-off: `'unsafe-inline'` stays for styles (Tailwind, model-viewer shadow DOM style, inline `style` attributes).
- Trade-off: browsers without `'wasm-unsafe-eval'` support (very old Safari) cannot run the meshopt decoder; this was already the policy in report-only.
- Trade-off: still no violation reporting (no backend); violations show only in the visitor's console.

## Alternatives rejected
- Enforce the whole policy now: Supabase mode and AR on a device could not be checked from here; a wrong `img-src` or `connect-src` would blank product pictures or models on the live site.
- Keep everything report-only: leaves no protection against script injection.
- Add a `report-uri`: needs a collector endpoint, which is a backend (ADR-0015).
