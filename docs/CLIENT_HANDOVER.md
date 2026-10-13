# AR Furniture Platform: client handover guide

Written for the people who will run the platform day to day. No technical knowledge needed.
Last checked against the code: 2026-10-13.

> **Which version this guide describes.** It describes the release that is ready but **not yet published** to the live website. The live site still runs an earlier version. Until the release goes out, these items are missing or different there: claim links, the sign-up page, the "AR launch attempts" wording, the QR warning on preview addresses, and the Android AR behaviour (the older version tries an in-browser AR mode first). The database is already up to date.

---

## 1. What the platform does

There are three parts:

| Part | Address | Who uses it |
|---|---|---|
| **Super Admin** | `/admin` | You (the platform team). Manage every business, product, owner, QR code and report. |
| **Business dashboard** | `/dashboard` | Each furniture business owner. Manages only their own products, catalog and reports. |
| **Public catalog and product pages** | `/catalog/<business-address>` and `/products/<business-address>/<product-address>` | Customers. No sign-in. English or Portuguese. |

Customers browse a catalog, open a product, turn it around in 3D, and on a phone tap **View in my home** to see it in their room (augmented reality, "AR").

The public pages pick English or Portuguese from the visitor's phone or browser language. Visitors can switch language on the page. The dashboards are in English only.

---

## 2. Signing in and accounts

- **Sign in:** go to `/login` and enter your email and password.
- **Forgot your password:** use the "Forgot your password?" link on the sign-in page (or go to `/reset-password`). Enter your email and you'll get a reset link. Open it and choose a new password of at least 12 characters.

**Public sign-up is currently OFF on the live site.** Business owners get access in one of two ways:

1. **The platform admin adds them.** Open **Businesses**, pick the business, open the **Owners** tab, then use **Add owner by email**. The person must already have an account and must have confirmed their email.
2. **A claim link.** On the same **Owners** tab, click **Create claim link**. The link:
   - works once and is valid for 7 days;
   - is shown only once, so copy it straight away. Creating a new link cancels the old one;
   - should only be sent to a contact you have checked yourself, for example by phone.

   The owner opens the link, signs in, and the business is added to their account.

> While sign-up is off, the owner can't create an account through the website. A platform admin has to create it first in the Supabase dashboard (Authentication, Users). Ask your technical contact to do this.

**Owners who register a new business themselves** (once sign-up is switched on) start with a **draft** business. It stays hidden from customers until a platform admin sets it to **Active**.

To remove an owner, use the remove (bin) icon next to their email on the **Owners** tab.

---

## 3. Creating a business (Super Admin)

Go to **Businesses**, then **New business**. Fill in:

- **Business name** (required).
- **Catalog address:** the short name used in the link, for example `oak-and-linen`. Use lowercase letters, numbers and hyphens. Some words are reserved and can't be used: `www`, `admin`, `app`, `api`, `demo`, `login`, `mail`, `assets`, `static`, `cdn`.
- **Logo:** PNG, JPEG or WebP, up to 2 MB.
- **Description:** shown at the top of the catalog.
- **Catalog accent colour:** pick one of the swatches or choose your own colour.
- **Default currency:** used for new products.
- **Contact details** (all optional): email, phone, website, address.

Then click either:
- **Save as draft:** saved but hidden from customers.
- **Create business:** goes live (Active) straight away.

Later you can change the **Catalog status** to Active, Inactive or Draft. Inactive and draft catalogs are hidden from customers.

Owners can change their business name, logo, description and contact details in **Business Settings**. Only a platform admin can change the catalog address, status or accent colour.

---

## 4. Adding a product

Use **Add Product** in the business dashboard, or **All Products → New** in Super Admin.

**Basic information**
- **Product name:** English is required. Portuguese is optional but recommended.
- **Product URL:** the short name used in the product link.
- **Short description** (up to 160 characters) and **full description**, in EN and PT.
- **Category:** sofa, chair, table, bed, storage, lighting or decor.
- **Price and currency.**

**Images**
- **Gallery photos:** at least one is required before you can publish. PNG, JPEG or WebP, up to 5 MB each.
- **Additional photos** are optional.

**Dimensions and specifications**
- Width, height and depth, plus the unit (**centimetres or inches**). The unit switch only says which unit the numbers are in. It does **not** convert them.
- Use the real outside dimensions. They are shown to customers and used for the size check (see below).
- **Material:** one free-text field per language, for example "Solid oak, linen upholstery".
- **Weight** (optional).

**Options (variants)**
- Each option has a name (EN, plus optional PT), a **colour swatch**, an optional SKU and an optional **price difference** that is added to the base price.
- **Important:** choosing an option changes only the swatch and the price. **The 3D model and the photos stay the same for every option.**

**Call to action:** the main button on the product page, for example a contact form or a WhatsApp link.

**3D models** (optional, but there's no AR without them)
- **GLB file:** used for the 3D viewer on every device and for AR on Android. **Without a GLB there is no 3D viewer and no AR button**, even if a USDZ is uploaded.
- **USDZ file:** used for AR on iPhone and iPad. Without it, iPhones try to convert the GLB themselves, which is slower and not guaranteed to work.
- The largest file allowed is **50 MB**. For Android AR, Google recommends a GLB of **10 MB or less**. Larger files load slowly on mobile data.
- Files are checked to confirm they really are GLB or USDZ.

**AR readiness panel.** After you upload a model, this panel shows what customers will get: 3D viewer, Android AR, iPhone/iPad AR, true size, and a file-size warning.

**Size check.** The platform measures the GLB model and compares it with the width, height and depth you entered.
- If every side matches within **5%** (or within **1 cm** for small pieces), customers see a **"True-to-size model"** label.
- If not, they see **"AR scale unverified"**, and the editor suggests a likely cause, for example the wrong unit.
- Only the GLB is measured. The USDZ must be exported at the same size.

**Preparing the two files (the platform does not convert between them):**
- Export the GLB from your 3D tool (e.g. Blender: File → Export → glTF 2.0, format "glTF Binary"), in metres, at real size, with the base of the furniture on the floor.
- Make the USDZ from that same GLB, e.g. with Apple's free **Reality Converter** (macOS): open the GLB, check the size shown, export USDZ. Upload both to the same product.
- Keep the GLB under ~10 MB for Google Scene Viewer; very large files load slowly or fail.
- After uploading, the editor's size check should say the model matches the entered dimensions. If it doesn't, fix the file or the numbers before publishing.

**Saving and publishing**
- **Save draft** keeps the product hidden.
- **Preview** opens the product page in a new tab, even for drafts. Previews are not counted in reports.
- **Publish** needs: an English name, a price above zero, at least one gallery photo, and width, height and depth above zero. A published product is visible only while its business is **Active**.
- In the product list you can also **Unpublish** (the product goes back to draft), **Duplicate** (the copy is a draft named "(copy)" and uses the same files), **Copy URL** and **Delete** (you'll be asked to confirm).

---

## 5. Model compression

A tool that shrinks GLB files before upload is built, but it is **switched OFF** until you approve it. It never changes size or shape: it reduces large textures and removes unused data. **USDZ files are never changed.** Today every file is stored exactly as uploaded.

---

## 6. QR codes and links

- **Catalog QR code:** in Super Admin go to **Catalogs & QR Codes**, or open a business and use its **Catalog & QR** tab. Owners use **My Catalog & QR**. The QR code always points to the business's **catalog**, never to a single product. Use **Download PNG** to get a 1024 × 1024 image for print.
- **Download QR codes for print only from the live production site.** On a preview or local address the panel shows a warning, because the QR code would point to that temporary address.
- **Product links:** use **Copy URL** in the product list. On the product page, customers can use **Share** (their phone's share menu, or the link is copied) or **Copy link**.

---

## 7. How AR works for customers

| Device | What happens when they tap "View in my home" |
|---|---|
| **Android phone** | Opens Google's **Scene Viewer** (needs the Google app / Google Play Services for AR). Phones without AR support get Scene Viewer's 3D view instead of AR. |
| **iPhone / iPad** | Opens Apple **AR Quick Look**, using the USDZ file. |
| **Computer** | Interactive 3D on the page, plus a "View in your room on a phone" box with **Copy link** and **Show QR code**, to open the product on a phone. |

- The first time, customers see short **placement tips** (point at the floor, move slowly, tap to place, drag and rotate). They can tick "Don't show these tips again".
- **In-app browsers** (opening the link inside Instagram, Facebook or WhatsApp): the page shows a notice suggesting Safari or Chrome, because these built-in browsers may limit AR.

---

## 8. Reports (Analytics)

Reports cover the **last 30 days**, per business and per product. Super Admin can filter by business. Owners see only their own business.

- **Views:** how many times a product page was loaded.
- **AR launch attempts** (the summary card says "AR button activations"): taps on "View in my home". Repeat taps within 2 seconds count once. **This is not proof that AR opened or that furniture was placed**, only that the customer tried.
- **3D interactions:** visitors who turned or zoomed a model (counted once per page visit).
- **AR rate:** AR launch attempts divided by views.

Your own previews are not counted. To protect against spam, each visitor can send a limited number of events per minute, and visitors are identified only by a scrambled code, never their IP address.

---

## 9. Troubleshooting

| Problem | What to check |
|---|---|
| **No "View in my home" button** | The product needs a GLB file. On a computer the button never appears; customers see the "view on a phone" box. The button also waits while the model is loading. |
| **AR doesn't open** | Android: the Google app / Google Play Services for AR must be installed and up to date, and some phones don't support AR. iPhone: check that a USDZ is uploaded. Make sure the page is open in Safari or Chrome, not inside Instagram, Facebook or WhatsApp. |
| **Model doesn't load** | Check the AR readiness panel. Re-upload the GLB, or check the file's link. Large files (over 10 MB) are slow on mobile. |
| **Wrong size in AR** | Look at the size check in the editor. Usually the dimensions were typed in the other unit (cm/in), or the model was exported at the wrong scale. Fix the file or the numbers. For iPhone, the USDZ must be exported at the same size as the GLB. |
| **QR code opens the wrong address** | It was probably downloaded from a preview or local address. Download it again from the live production site. |
| **Customer stuck inside an app** | Tell them to use the app's "Open in browser" option (Safari or Chrome). |

---

## 10. Known limitations

- **No real-device AR test is recorded yet.** AR on actual Android phones and iPhones still needs to be checked before launch.
- **No custom domain or business subdomains yet.** Catalogs currently live at `/catalog/<business-address>` on the current Vercel address.
- **Options (variants) don't swap the 3D model or photos.** They change only the swatch and the price.
- **Material is a single text field** per language. There is no material picker.
- **Model compression is off** (see section 5).
- **Sample data is still in the live database** (4 sample businesses with their products and seeded report numbers). It will be removed, with your approval, once the real catalog is ready.
- **Public sign-up is off.** Email sending for real owners needs an email service (for example Resend) that isn't set up yet.

---

## 11. Ownership and accounts checklist

Transfer each account using the provider's own transfer or invite tools. **Never put passwords or secret keys in documents, email or chat.**

- [ ] **GitHub repository:** `krishna-notfound/AR-Deploy` (the code).
- [ ] **Vercel project:** `ar-deploy` in team `track0` (hosting; the `main` branch publishes the live site).
- [ ] **Supabase project:** `pmnjchhrgvajtjpadpqo` (database, sign-in, file storage, reports).
- [ ] **Domain and DNS:** pending your domain.
- [ ] **Email sending (Resend or other SMTP):** not set up yet. Needed before owners can sign up and receive emails reliably.
- [ ] Confirm who holds platform admin access after handover.

---

## 12. Walkthrough video checklist

Record these on screen, with a narrator:

- [ ] Sign in, and use the password reset.
- [ ] Super Admin tour: Overview, Businesses, All Products, Analytics, Catalogs & QR Codes.
- [ ] Create a business: address, logo, accent colour, contact details, draft vs active.
- [ ] Owners tab: add an owner by email; create a claim link (and show that it appears only once).
- [ ] Add a product: EN/PT text, price, category, dimensions and unit, material, options, photos.
- [ ] Upload GLB and USDZ files; read the AR readiness panel and the size check.
- [ ] Preview, publish, unpublish, duplicate, delete.
- [ ] Download the catalog QR from the live site; copy a product link.
- [ ] The customer view: catalog, product page, language switch.
- [ ] AR on a real Android phone and a real iPhone, including the tips screen.
- [ ] The computer view: 3D viewer and the "view on a phone" QR.
- [ ] Opening a link inside Instagram or WhatsApp, and the notice that appears.
- [ ] Reading the Analytics page (what "AR launch attempts" means and doesn't mean).
- [ ] The business owner's own dashboard.
