# 01 · Overview, non-goals & honesty rules
Read when: starting any work, or writing UI copy that describes what the system does.

## What we build
One React SPA (one deployment) serving three surfaces. Frontend-only, backed by a mock service layer.

| Surface | Routes | Users | Language | Scope |
|---|---|---|---|---|
| Super Admin | `/admin/*` | Platform team | English | Confirmed |
| Business Admin | `/dashboard/*` | One business | English | **Pending confirmation** |
| Public catalog / product | `/catalog/:slug`, `/products/:slug/:p` | Customers | EN + PT | Confirmed (core) |

Flow: Demo entry `/` (account picker) → admin or dashboard. Customers arrive by QR code or shared link → public pages → 3D viewer → "View in my home" (AR).
All data goes through `src/services` (see [05-services.md](05-services.md)).

## Non-goals (never build)
- Backend, database, auth provider, registration, or password recovery.
- Server-side storage, model conversion, or compression.
- GLB→USDZ conversion or AI photo-to-3D.
- DNS, SSL, or hosting automation.
- Payments, billing, subscriptions, team roles, or permission management.
- Advanced analytics: device breakdowns, date-range systems, monthly reports, 3D-interaction tracking.

## Honesty rules (UI copy)
1. Overview and analytics show a "Sample data" label.
2. Simulated actions say so. For example: "Catalog configured in demo. Real subdomain and SSL require backend setup."
3. `https://{slug}.example.com/...` URLs are labelled "Demo URL".
4. Uploaded 3D files are labelled "Stored in this browser session only. Needs backend storage." Never say "processed", "optimized", or "compressed".
5. AR scale counts as "verified" only when measured dimensions match the entered ones ([09-3d-ar.md](09-3d-ar.md)).
6. The in-app browser notice says AR "may be limited", never that it is "blocked".
7. The frontend role check is not a security boundary. Say so in code comments and the README.
8. Business Admin carries a "Scope pending confirmation" badge on the demo entry page only. It is not a nag on every screen.
