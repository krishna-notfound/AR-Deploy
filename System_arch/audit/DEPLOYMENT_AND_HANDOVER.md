# Deployment and handover

The technical details live in `System_arch/design/20-deployment.md` (Vercel settings, DNS and wildcard SSL, Auth URLs, rollback). This file is the delivery checklist plus a guide for the people who will run the platform.

## 1. Deployment checklist (owner)
Each step needs explicit approval. Nothing below has been done yet.

1. **Vercel project** from the Git repository. Deploy through Git only: `vercel deploy --prebuilt` would skip the build guard.
2. **Environment variables:**
   - **Production:** `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL=https://pmnjchhrgvajtjpadpqo.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`, and `VITE_ROOT_DOMAIN=<domain>` once the domain exists.
   - **Preview:** `VITE_DATA_MODE=demo`.
   - Never add a secret or service_role key.
   - `VITE_MODEL_OPTIMIZATION=on` only after client approval A-2.
   - **The production build refuses to build** if the mode isn't `supabase`, the URL isn't `https`, a value is missing, or the key is a secret key (`productionBuildProblem`, `src/services/backendConfig.ts`). Verified locally: demo mode and a secret key are blocked, a valid configuration builds.
3. **Database:** five migrations are live. `20261013093006_publish_rules.sql` is pending approval O-1.
4. **Edge Function `track-event`:** live (v1). The client-IP change is pending O-3.
5. **Auth settings:** O-2. Site URL and redirect URLs as in design/20 §"Supabase Auth settings".
6. **Domain:** apex plus `*.domain` wildcard. Vercel issues the wildcard certificate through DNS (design/20 §"Domains and tenant routing"). After that, reprint QR codes: they encode the catalog URL, which changes from the path form to `https://<business>.<domain>`.
7. **First admin:** create the user in Supabase Auth, then `insert into public.platform_admins (user_id) select id from auth.users where email = '<admin email>';` in the SQL editor (design/20).
8. **Before handover:** remove the sample data and sample accounts (O-4).
9. **After deploying:**
   - Run the device pass (DEVICE_TEST_MATRIX.md) on the production URL.
   - Watch the CSP report-only warnings, then enforce the policy (O-6).
   - Run the live integration test against an approved target (O-7).
10. **Rollback:** promote the previous Vercel deployment. The frontend has no data migrations. Migration rollback steps are in APPROVAL_REQUIRED.md O-1.

## 2. Monitoring
- **Errors:** Vercel → Logs (frontend); Supabase → Logs → Edge Functions (`track-event`) and Postgres.
- **Security and performance:** Supabase → Advisors. Re-run after every migration.
- **No paid error tracker is configured.** Adding one, for example Sentry, needs approval and an ADR.

## 3. What the client receives
- **Source code:** this Git repository (React + Vite + TypeScript), with the full history.
- **Database:**
  - the Supabase project `pmnjchhrgvajtjpadpqo` (transfer it to the client's Supabase organization: Project Settings → General → Transfer project),
  - migrations in `supabase/migrations/`,
  - Edge Function in `supabase/functions/`.
- **Files:** product photos and 3D models live in Supabase Storage (`product-media` private bucket, `business-logos` public bucket). They move with the project.
- **Docs:** `System_arch/` (architecture, decisions, audit and status).

## 4. Guide for the platform team (non-technical)

**Sign in.** Open the site's `/login` page and use the team email and password. Forgot your password? Use "Forgot your password?" on that page.

**Add a business.**
1. Go to Businesses → Create business.
2. Enter the name, the catalog address (it becomes the subdomain, for example `casa-lisboa`), the logo (PNG, JPG or WebP, up to 2 MB) and the contact details.
3. Choose **Create business** to make the catalog public, or **Save as draft** to finish later.

**Add a product.**
1. Go to All Products → Add product, choose the business, and fill in the name (English required, Portuguese recommended), price, description, materials and colours.
2. **Dimensions:** enter the real outer width, height and depth, and choose centimetres or inches. The switch says which unit the numbers are in; it doesn't convert them.
3. **Photos:** at least one product photo is required before publishing.
4. **3D models:** upload the GLB file (needed for 3D and Android AR) and the USDZ file (iPhone AR) from your 3D artist. Then check the **AR readiness** box under the preview:
   - **True size:** the model's measured size matches the dimensions you entered. If not, the box says the likely cause, such as "width and depth are swapped" or "the numbers are in the other unit". Fix the file or the numbers; the model is never stretched to fit.
   - **iPhone and iPad AR:** without a USDZ file, iPhones convert the model themselves, which is slower and not guaranteed.
   - **File size:** keep GLB files under 10 MB for Android AR.
5. **Save draft**, then **Preview** to see the page as customers will, then **Publish**. If the business's catalog isn't active yet, the product becomes visible when it is activated.

**Share a catalog.**
1. Go to Catalogs & QR Codes, then **Download PNG** to print the QR code.
2. The QR code always opens the business's catalog, never a single product.
3. To share one product, use **Share** on its page.

**Analytics.** These show product page views and "AR activations", meaning visits where someone tapped "View in my home", counted once per page view. They do not count successful placements: the phone's AR viewer doesn't report back.

**What customers see.**
- **iPhone:** "View in my home" opens Apple's AR viewer at real size.
- **Android phones that support Google AR:** AR opens at real size.
- **Other phones and computers:** they keep the interactive 3D view and the dimensions, with a link and QR code to open the page on a phone.
- **Instagram, Facebook and WhatsApp:** links opened inside these apps show a hint to open the page in Safari or Chrome.
