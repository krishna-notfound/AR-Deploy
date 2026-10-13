# Security review

Scope: multi-business catalog with Supabase (Postgres + RLS, Auth, Storage, one Edge Function) and a static Vite frontend on Vercel. Findings with IDs, severity and status: [PRODUCTION_READINESS.md §4](PRODUCTION_READINESS.md). Last updated 2026-10-13.

## Trust boundaries

| Boundary | Enforced by | Evidence |
|---|---|---|
| Public visitor (anon) → catalog data | RLS: only `active` businesses and `published` products and their children; anon has SELECT on 5 tables only | PGlite RLS tests; live suite; live anon read check |
| Owner → own business only | RLS via `is_business_member()`; storage policies on the first folder = business id; image/model rows must reference the product's own business folder | PGlite isolation tests; live suite ("isolates businesses", "refuses to reference another business's private file") |
| Owner → catalog address/status | `guard_business_admin_fields` trigger (admins only) | PGlite + live suite |
| Becoming an owner | Admin-only `admin_add_business_member` (confirmed emails only); single-use hashed 7-day claim links (admin-issued); `register_business` creates drafts only, one pending per account, confirmed email required, serialised per account. A matching name/contact email grants nothing | PGlite (10 tests) + live suite (2 tests); ADR-0022 |
| Platform admin | `platform_admins` table, writable only by the service role / SQL editor | Live suite ("resolves roles … not from the client") |
| Analytics endpoint (public) | `track-event`: UUID/type validation, 1 KB body, product must be published in an active business, 30 events/min per visitor key, stores a salted hash, not the IP | Live suite (rate limit, insert-only) |
| Frontend role guard | UX only, not a boundary (CLAUDE.md) | — |

## Secrets

- Browser bundle: publishable key only; production build refuses `sb_secret_`/`service_role` keys and demo mode (`src/services/backendConfig.ts`).
- No secret keys in source or git history (Phase 0 scan).
- Service-role use in this programme: local, in-memory only, to create and delete QA users (2026-10-13); never printed, stored or committed.

## Open items (owner decisions)

- Leaked-password protection is off (advisor WARN; may need a paid plan). Minimum password length is 8 on production; 12 recommended before sign-ups open.
- Production sign-ups off. Before enabling: custom SMTP (e.g. Resend, needs DNS records), password minimum 12, redirect URL allowlist incl. `/reset-password`.
- `track-event` rate-limit key uses the first `X-Forwarded-For` entry (SEC-03); confirm the header layout before relying on the limit against a determined attacker.
- CSP is report-only (`vercel.json`); enforce after a live check including Scene Viewer / Quick Look launches.
- Privacy: analytics store no IP and no personal data; the business contact details are public by design. A privacy policy/consent decision for the client's jurisdiction is the client's call, not claimed here.
