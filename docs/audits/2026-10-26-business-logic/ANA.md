# ANA audit (analytics and dashboard numbers)
Scope read: `supabase/functions/track-event/{handler,index}.ts`, `supabase/migrations/20261012192143_init_schema.sql` (product_analytics, daily view, RLS, grants), `20261012200810_analytics_rate_limit.sql`, `20261024065538_security_hardening.sql` §4 (record_event_limited) and published_at trigger, `20261025070915_platform_team_roles.sql` (analytics/businesses/products read policies, role permissions), `20261025180600_account_settings_optin_2fa.sql` (is_platform_admin/is_business_member), `src/services/analytics.ts`, `src/services/supabase/supabaseCatalogService.ts` (analytics, recordEvent, getRecentActivity, getProducts), `src/services/mock/{mockCatalogService,seed,store}.ts`, `src/features/analytics/*`, `src/features/business/*`, `src/features/admin/{AdminOverviewPage,AdminAnalyticsPage}.tsx`, `src/features/settings/{onboardingSteps.ts,OnboardingChecklist.tsx,sections/PreferencesSection.tsx}`, `src/features/products/productReadiness.ts`, `src/features/ar/{variantMedia,readiness}.ts`, `src/features/public/{ProductPage,EmbedProductPage}.tsx`, `src/components/charts/{Charts,ActivityTrend}.tsx`, `src/lib/format.ts`, `src/app/router.tsx`, `supabase/config.toml`, PRD R-27..R-30, DECISIONS, ADR-0026/0029.
Checked and fine: the track-event validation (UUIDs, 3 types, 1 KB body, published product in an active business, AR/3D events need a product or variant model, the business id must match the product); only the service role can execute it; there is no direct browser INSERT; reads go through `security_invoker` views; the Owner/member/platform_can read policies; there's one view per page load (ProductView is keyed by product id); the AR 2 s relaunch guard; previews are never recorded; the daily rows are paged; the `since` window matches the 30-day series window.

## Findings

### ANA-01 Platform Overview shows zeros and partial counts as true when the role lacks analytics/products/businesses view — Medium — CONFIRMED
- Where: `src/app/router.tsx:79` (the Overview index route has no permission guard), `src/features/admin/AdminOverviewPage.tsx:26-27,79-87,104,119`, `supabase/migrations/20261025070915_platform_team_roles.sql:193-194,211-212,256-257`, `supabase/migrations/20261012192143_init_schema.sql:260-262,299-304` (the public "active businesses" and "published products" policies also apply to `authenticated`).
- What happens: the Owner removes `analytics.view` (or `products.view` / `businesses.view`) from the Team role (ADR-0029 lets them edit the role sets). A Team member opens `/admin`. `getAnalytics()` still runs, but RLS returns no analytics rows. The member sees "Product page views 0", "AR launch attempts 0" and the chart empty state "No activity in the last 30 days", as if these were facts. Without `products.view`/`businesses.view`, the public policies still match, so "Products" equals the published count of active businesses, "Drafts 0", and "Businesses" counts only active ones. Nothing says the numbers are restricted. "Open analytics" and "Full ranking" link to `/admin/analytics`, which then shows the no-permission page. The "Most viewed" rows link to `/admin/products/:id/edit`, which needs `products.edit`.
- Expected rule: ADR-0029 says each page needs its permission, and CLAUDE.md says "no dead buttons". The brief counts "wrong data shown as true" as a finding.
- Fix sketch (UI): with `useCan`, hide or replace the views/AR stats, chart and "Most viewed" card when `analytics.view` is missing ("You don't have access to analytics"). Hide the product/business counts without `products.view`/`businesses.view`. Show the links only with the matching permission.
- Live check: as Owner, remove analytics.view from Team on staging, sign in as a Team member and open /admin.

### ANA-02 Daily buckets and "last 30 days" are UTC, not the user's time zone; the chart ignores the date-format preference — Medium — CONFIRMED
- Where: `supabase/migrations/20261012200810_analytics_rate_limit.sql:28` (`(created_at at time zone 'utc')::date`), `src/services/analytics.ts:6-8,33`, `src/services/supabase/supabaseCatalogService.ts:627`, `src/components/charts/Charts.tsx:18-19` (always `en-US` "Oct 26"), versus `src/features/settings/sections/PreferencesSection.tsx:75` ("Dates and times in the dashboard are shown in this zone.") and `src/lib/format.ts:33-80`.
- What happens: an owner in America/Sao_Paulo (BRL is a supported currency) gets a visit at 22:00 local on 25 Oct. It's counted in the bar labelled "Oct 26", and from 21:00 local each evening the chart's last bar is tomorrow's date. In Lisbon summer time, visits between 00:00 and 01:00 land in the previous day. A user who chose `dd/MM/yyyy` or `yyyy-MM-dd` still sees "Oct 26" in the chart axis, tooltip and table.
- Expected rule: the S1 preference says dashboard dates follow the chosen zone and format. Every other dashboard date uses `formatDate(…, prefs)`.
- Fix sketch (SQL + service + UI): add a view or RPC that buckets by `created_at at time zone p_tz`, with the window computed in that zone, and pass `usePreferences().timezone`. At minimum, label the chart "Days in UTC". Format the axis, tooltip and table labels with `formatDate(iso, 'en', prefs)`.
- Live check: not needed (code reading); optionally record a view after 21:00 UTC-3 and see which bar it lands in.

### ANA-03 Owner "Next steps" and AR-readiness counts take the best finish, so missing iPhone files on a finish are hidden — Medium — CONFIRMED
- Where: `src/features/products/productReadiness.ts:35-37` (the best readiness over the product and its variants), `src/features/business/BusinessOverviewPage.tsx:160-173`, versus `src/features/ar/variantMedia.ts:29-30` (a finish with its own GLB uses only its own files, with no fallback to the product USDZ) and `src/features/ar/readiness.ts:103-105` (the editor warns "own GLB (no USDZ…)" for that finish).
- What happens: a product has a GLB and a USDZ, and its "Walnut" finish has only its own GLB. The Overview counts it as "ready", the "no iPhone AR file" row is missing, and with nothing else open it says "Every product is published with a 3D model and an iPhone AR file." An iPhone customer on the Walnut finish gets no USDZ. The editor flags this, so the two screens disagree about the same product.
- Expected rule: consistency between the editor's per-finish readiness and the Overview. PROJECT_COMPLETION_STATUS §4 leaves open whether a USDZ is mandatory "per product and per finish", so the Overview shouldn't claim it's done.
- Fix sketch (UI/logic): use the worst readiness for the "no USDZ"/"blocked" counts (or count finishes), and change the all-done sentence to "every finish". Keep the best readiness only for "has 3D at all" (`hasArModel`).
- Live check: not needed.

### ANA-04 "Product page views" counts embed loads, and one embed visit that opens the product page counts twice; the AR rate mixes denominators — Medium — CONFIRMED
- Where: `src/features/public/EmbedProductPage.tsx:91-98` (a `view` on every iframe load), `src/features/public/ProductPage.tsx:146-151` (another `view` when the embed's "View in your space" link opens the page), `src/features/analytics/AnalyticsView.tsx:124,130-132`, `src/features/business/BusinessOverviewPage.tsx:64-68`, `src/features/admin/AdminOverviewPage.tsx:83-87`.
- What happens: the owner embeds a product on their homepage, and the iframe is `loading="lazy"`. Every homepage visitor who scrolls past it adds a "Product page view", although no product page was opened. A visitor who taps through to AR adds a second view for the same visit. The total "AR launch rate" divides attempts by all views, including embed views (where AR can't start) and views of products with no 3D model. The per-product rate covers only 3D products. Because each tap more than 2 s apart counts, the rate can go above 100% (labelled "% of views").
- Expected rule: ADR-0026 §3 deliberately records `view` in the embed, so this isn't a bug in the event. But PRD R-28/R-30 ("Counts reconcile", "Totals match") and the label "Product page views" claim more than the data supports.
- Fix sketch (UI, or function + SQL): rename the label to "Views (product page and embeds)", or add a `source` column/type (an `embed_view`) so they can be shown apart. Compute the total AR rate over products with a 3D model only, and cap the wording ("attempts per view").
- Live check: load an embed on a test page once, follow the AR link, and confirm the views go up by 2 in `product_analytics`.

### ANA-05 View counts are freely inflatable: no dedupe, 30/min per key, key from the first X-Forwarded-For hop — Medium — SUSPECTED (known: PRD R-28 "SEC-03", PROJECT_COMPLETION_STATUS §4 open decision; still bites)
- Where: `supabase/functions/track-event/handler.ts:33-35,51-55`, `supabase/migrations/20261024065538_security_hardening.sql:176` (`v_limit 30` per minute).
- What happens: one visitor reloading a product page records a view on every load. A script can post 30 events a minute per network, which is about 43k a day for any published product, including a competitor's. If the Supabase edge passes a client-supplied first XFF entry through, every request gets a fresh key and there's no limit at all. The owner sees these as real "Product page views"/"AR launch attempts".
- Expected rule: R-28 acceptance is "Counts reconcile with stored events". The client hasn't decided between every page view and unique daily visitors.
- Fix sketch (SQL/function): once the client decides, dedupe by (visitor_key, product, type, day), for example with a unique index on a daily table or a check in `record_event_limited`. Take the key from the last trusted hop rather than `[0]`.
- Live check: send `track-event` with two different `X-Forwarded-For` values past 30/min and see whether both keep recording.

### ANA-06 Analytics product and business queries aren't paged, so platform totals silently cap at 1000 rows — Low — CONFIRMED
- Where: `src/services/supabase/supabaseCatalogService.ts:628-629,645-648` (no `range`, no order), `src/services/supabase/supabaseCatalogService.ts:754-760` (`getProducts`, used by AnalyticsView and the Overview), `supabase/config.toml:22` (`max_rows = 1000`). Only the daily rows are paged (`:631-641`).
- What happens: past 1000 products platform-wide, `summarize` keeps an arbitrary 1000. Products, Published, Drafts, views and AR totals drop without any error, because daily rows for products outside the 1000 are discarded (`analytics.ts:40-41`).
- Expected rule: PRD R-30, "Totals match raw event counts".
- Fix sketch (service/SQL): page these two queries like `daily()`, or compute the totals in a SQL RPC.
- Live check: not needed.

### ANA-07 "Most viewed products" lists zero-view products on the admin Overview and the Analytics page, but not on the owner Overview — Low — CONFIRMED
- Where: `src/features/admin/AdminOverviewPage.tsx:33`, `src/features/analytics/AnalyticsView.tsx:54` (no `views > 0` filter) versus `src/features/business/BusinessOverviewPage.tsx:33` (filters `r.views > 0`).
- What happens: with no traffic, the admin Overview and the Analytics page rank five products as "Most viewed" at "0 views", and the "No product activity yet" empty state never shows while any product exists. The owner Overview shows the empty state.
- Expected rule: shared features behave the same on every dashboard (CLAUDE.md).
- Fix sketch (UI): add the `views > 0` filter inside `MostViewedList`, or in one shared helper.
- Live check: not needed.

### ANA-08 `summarize()` adds rows outside the 30-day window to the totals (demo: the totals stop matching the chart) — Low — CONFIRMED (ran it)
- Where: `src/services/analytics.ts:39-56` (`add()` updates per-product totals before checking that the day is in the series), `src/services/mock/seed.ts:640-643,661-679` (seeded once, relative to seed time), `src/services/mock/store.ts:33-50` (persisted, never re-seeded).
- What happens: a demo visitor comes back 10 days later. The seeded rows now span 10 to 39 days ago and old live events are still stored, so "Product page views (Last 30 days)" includes 40 days, while the chart's "N in 30 days" doesn't. Running `summarize` with one row dated 2026-08-01 and `now` = 2026-10-26 gave `totals.views 106`, series sum 5. Supabase pre-filters with `gte('day', since)`, so the live site isn't affected today.
- Expected rule: "Last 30 days" labels, and the demo must model the real rules.
- Fix sketch (service): skip rows whose date isn't in `seriesMap` inside `add()`.
- Live check: not needed.

### ANA-09 Demo `recordEvent` accepts events the real function refuses — Low — CONFIRMED
- Where: `src/services/mock/mockCatalogService.ts:348-357` versus `supabase/migrations/20261024065538_security_hardening.sql:194-213`.
- What happens: the mock records views and AR events for draft products, paused or draft businesses and products without a model, and it has no rate limit. Supabase refuses all of these (`invalid`, 429). Demo analytics can show numbers the live system could never produce.
- Expected rule: the brief says "the demo must model the real rules".
- Fix sketch (mock): apply the same published, active and has-model checks and return `VALIDATION`.
- Live check: not needed.

### ANA-10 Supabase "Recent activity" is rebuilt from timestamps: an unpublished product still reads "was published", and pause, unpublish and delete never appear — Low — CONFIRMED
- Where: `src/services/analytics.ts:92-106`, `src/services/supabase/supabaseCatalogService.ts:843-860`, `supabase/migrations/20261024065538_security_hardening.sql:93-108` (a draft keeps `published_at`), versus the mock's real log `src/services/mock/mockCatalogService.ts:139,152,167,307,334`.
- What happens: the owner unpublishes a product. On both Overviews, "Recent activity" still shows "Product X was published" and nothing about the unpublish. A paused catalog or a deleted product leaves no entry. The demo shows all of these, so the two modes differ.
- Expected rule: honest UI; demo matches real.
- Fix sketch (service): build the owner/admin feed from the existing audit log where RLS allows, or rename the card to "Recently added and published" and drop the publish item once `status = 'draft'`.
- Live check: unpublish a product on staging and look at the Overview.

### ANA-11 Deleting a product erases its past views from the business totals and the daily chart — Low — CONFIRMED
- Where: `supabase/migrations/20261012192143_init_schema.sql:153` (`on delete cascade` from product_analytics to products), `src/services/analytics.ts:40-41`.
- What happens: an owner deletes a product that had 500 views this month. "Product page views (Last 30 days)" and the past bars drop by 500 at once, so history changes after the fact and there's no "deleted products" line.
- Expected rule: PRD R-30 per-business totals; this is a missing-consequence choice that nothing documents.
- Fix sketch (SQL/UI): keep the events with `product_id` set to null, or a "Deleted products" bucket, or at least warn in the delete confirmation that the product's analytics will be removed.
- Live check: not needed.

### ANA-12 Owner Overview "Published" hint says "Catalog not public yet" for a paused catalog — Low — CONFIRMED
- Where: `src/features/business/BusinessOverviewPage.tsx:62` versus `:167` (Next steps: "Your catalog is paused").
- What happens: a business that was live and then paused (`inactive`) sees "Catalog not public yet" under Published, next to "Your catalog is paused".
- Expected rule: consistency.
- Fix sketch (UI): use three hints: active "In your catalog", draft "Catalog not public yet", inactive "Catalog paused".
- Live check: not needed.

## Ideas (optional, max 5 lines)
- Leave signed-in owner and staff visits to their own public pages out of the counts, or flag them.
- Show the 3D-interactions series in the chart, which today shows only views and AR.
- Run one SQL RPC for the totals (counts by status plus 30-day sums), so the Overview, Analytics and admin pages can't drift.
