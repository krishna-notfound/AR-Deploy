# 18 · Demo mode vs Supabase mode vs still needed
Feeds the delivery report. Setup steps: design/19-supabase.md. "Prepared" means code and SQL exist and were tested locally, but have **not** run against a live project.

| Capability | Demo mode (default) | Supabase mode (prepared) | Still needed for production |
|---|---|---|---|
| Login and accounts | Mock account picker (`/demo`), localStorage; not security | Email + password via Supabase Auth (`/login`); role from `platform_admins` / `business_members` | Invite flow, membership UI, password reset, email templates, redirect URLs |
| Authorization | UX route guard only | RLS on every table, a trigger guarding slug and status, storage policies | Apply migrations; run advisors; pgTAP tests on a real project |
| Business and product CRUD | Mock service + localStorage | PostgREST + `save_product` RPC (atomic) | Apply schema |
| Image upload | Data URL, up to 1.5 MB | Storage: public `business-logos`, private `product-media` with signed URLs | CDN or image resizing (optional); orphan-file cleanup |
| 3D model upload | Session-only blob URL | Stored in `product-media` (≤ 50 MB) | Confirm GLB/USDZ MIME types and CORS on the real bucket |
| Model validation | Extension, magic bytes, in-viewer scale check | Same, plus bucket type and size limits | Server-side validation (optional) |
| GLB→USDZ conversion | **Not provided** | **Not provided** | Out of scope |
| Product and catalog URLs | Demo URL + local routes | Same | Real domain, DNS, TLS |
| QR codes | Real QR of the catalog URL | Same | Nothing once real URLs exist |
| Analytics | Seeded sample data + local events (labelled "Sample data") | Insert-only `product_analytics` + daily view (no personal data) | Rate limiting / bot filtering (Edge Function) |
| Activity feed | Logged in demo data | Derived from timestamps (no deletions) | Audit table if needed |
| AR | Real model-viewer AR | Same, with files from Storage | Real-device testing (P7-10) |
| i18n | Static dictionaries + localized fields | Localized fields stored as jsonb | – |
