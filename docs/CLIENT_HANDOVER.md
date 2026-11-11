# AR Furniture Platform: client handover guide

Written for the people who will run the platform day to day. No technical knowledge needed.
Last checked against the code: 2026-10-13.

> **Which version this guide describes.** It describes the current release. As checked on 2026-10-27, the live website is built from the `feature/sanctus-brand-design-system` branch and the database has all 18 migrations applied. The `main` branch is older and is not what the live site shows. Settings that cannot be checked from the code (the sign-in Site URL and redirect addresses, hosting environment values, real-device AR results) are not recorded here as done.

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
- **Forgot your password:** use the "Forgot your password?" link on the sign-in page (or go to `/reset-password`). Enter your email: if it belongs to an account, we email it a code (you can ask for a new one after a minute). Type the code, then, if your account has two-step sign-in, the code from your authenticator app (or a recovery code), and choose a new password of 12 to 128 characters. Every device is signed out and we email you that the password was reset; sign in with the new password.

**There is no public sign-up.** Businesses apply, and the Sanctus team decides:

1. **A business applies** at `/apply` ("Apply as a business" in the header and footer). The form has five short steps in English or Portuguese. Applying creates no account. The applicant gets a reference and a confirmation email.
2. **Review it** in **Applications**. Search by business, applicant, email or reference, and filter by status or date. Open an application to read the answers, then **Start review**, **Approve** or **Reject** (a rejection needs a reason, which is kept in the history; you choose whether the applicant sees it in their email). A rejected application can be reopened, and so can an approved one whose business was deleted.
3. **Approving creates the business as a draft.** Customers can't see it until you set it to **Active** on the business page.
4. **Invite the owner.** On the approved application (or the business's **Owner & history** tab), check the email (it's prefilled with the applicant's) and click **Invite owner**. Each business has exactly **one** owner. The owner receives a link to set their password. The link is never shown to you, so nobody can copy it.
5. **Resend invitation** if the owner lost the email or the link expired (wait a minute between attempts; at most 10 per owner in 24 hours). Every attempt and its email outcome is listed under **Emails**.

The **Audit log** shows who did what and when (approvals, rejections, invitations, owner removals, status changes). Entries can't be edited or deleted.

An email shows **Accepted by Resend** when the provider took it. It shows **Delivered** only when Resend confirms delivery. **Not sent** means it was stopped before sending, and the reason is shown next to it (for example, the email service is not configured yet).

To remove an owner, use the remove (bin) icon next to their email on the **Owner & history** tab.

---

### Team roles, owner notices and what to expect (after the business-logic update)

- **Rejection emails.** When you reject an application, the applicant is emailed in their language (English or Portuguese). The reason you typed is kept in the history. It goes into the email **only if you tick "Include the reason in the email"**. If the email can't be sent, the screen says so, and the rejection still stands.
- **Possible duplicates.** If an application has the same email or a very similar business name as another application or an existing business, a **Possible duplicates** panel appears above the review buttons. It is a warning only: you can still approve or reject.
- **Reopening.** If you delete a business that came from an approved application, the application says the business was deleted, and **Reopen** puts it back under review so a new draft can be created.
- **Owner invitations.** Wait one minute between invitations. At most **10 invitations per owner in any 24 hours** can be sent for one business, and removing and re-inviting the same person counts in the same limit. The screen tells you when you can send the next one.
- **Owner column.** The Businesses list shows **Needs owner**, **Invite pending** (or **Invite pending · email not sent**) or **Owner active** for every business, and you can filter by it. An owner is "active" as soon as they sign in successfully, even if they never opened the invitation page.
- **Roles.** Some permissions need others to work, so ticking one also ticks what it needs, and those stay locked until you untick the permission that needs them. For example, "Publish and unpublish" needs "Create and edit products", which needs "View products and catalogues". The platform Owner always keeps every permission.
- **Team members who are removed or deactivated.** Removing a team member ends their access, and the same email can then be invited again, even as a business owner. A deactivated person who signs in is told their access was deactivated.
- **Product changes by the team.** Team members with "Create and edit products" change published products directly; there is no review step. Remove that permission if Team should only prepare drafts.
- **Business owners are told about changes.** When the platform team pauses or reactivates a business, or unpublishes or deletes one of its products, the owner gets an email (in the language of their application, otherwise English) and sees the change under **Changes by the platform team** on their dashboard. The email is sent when the change is made; if the browser is closed at that moment, the email may not go, but the list on the dashboard always has the change.
- **History keeps working after a deletion.** Entries for a deleted business still show its name with "(deleted)", and entries by a deleted person show "Deleted user" with their role.
- **Open closure requests.** While an owner's closure request is open, a business can't be set to Active from the list or the page. The platform Owner restores or completes the request. Removing the owner cancels it.

### Your account and security

Open **Settings** from the dashboard menu. Everything about you is in the "Your account" group, and your business details are in **Settings → Business profile**.

- **Your details.** Add your name and a photo, and choose your time zone and how dates look. After you choose a profile photo, a window opens with a square frame: drag and zoom the picture (**Fill the frame**, **Show whole picture**), then press **Save**. The photo is saved at up to 512 px and the original is not kept.
- **Email and password.** To change your email, enter your password and the new address, then confirm from both inboxes. To change your password (My account → Password), enter the current one and the new one; we email you a 6-digit code, and if two-step sign-in is on we also ask for the code from your authenticator app. Your password changes only when the codes are right; then every device, including this one, is signed out and you sign in with the new password. We email you whenever either changes, so you notice if it was not you.
- **Two-step sign-in (2FA).** Under **Security & 2FA** you can turn on a second check with an authenticator app on your phone. Scan the code on screen, type the 6 digits the app shows, and you are done. From then on you enter a fresh code each time you sign in.
- **Recovery codes.** When you turn on two-step sign-in you get 8 recovery codes. Each works once if you lose your phone. Keep them somewhere safe, such as a password manager or a printed copy. You see them only once, but you can make a new set later (the old set then stops working).
- **Extra check for big actions.** Turning 2FA off, making new recovery codes and closing your account each need a 6-digit code that we email you. It lasts 10 minutes.
- **Closing your account.** Under **My account** choose **Request closure**. Your catalog goes offline straight away and the platform team reviews your request. You can choose **Cancel request** until it is completed, and your catalog comes back as it was. Once the platform confirms, your catalog and sign-in are deleted for good.
- **Security activity.** See your recent sign-ins and security changes. Under **Security & 2FA** you can sign out of your other devices.

The platform owner may require two-step sign-in for everyone. If so, you will be asked to set it up the next time you sign in.

---

### Dark mode

The dashboards (the Admin Console and your company dashboard, including Settings) can be shown in a dark theme.

1. Open the account menu at the bottom of the left sidebar (your name), and under **Appearance** choose **Light**, **Dark** or **System**. Or open **Settings > Preferences** and use the **Appearance** card.
2. **Light** is the default. **Dark** is always dark. **System** follows your device and changes with it (for example at sunset).
3. The choice is applied at once and remembered on this device and browser only. It is not part of your account, so set it again on another device.
4. The public website, the catalogue pages your customers see, and the sign-in pages always stay light. Previews of public pages inside the dashboard (the Website Editor preview, the catalogue preview when you create a business) also stay light, so you see what customers see.

## 3. Creating a business (Super Admin)

Go to **Businesses**, then **New business**. Fill in:

- **Business name** (required).
- **Catalog address:** the short name used in the link, for example `oak-and-linen`. Use lowercase letters, numbers and hyphens. Some words are reserved and can't be used: `www`, `admin`, `app`, `api`, `demo`, `login`, `mail`, `assets`, `static`, `cdn`.
- **Logo:** PNG, JPEG or WebP, up to 2 MB. After you choose the file, a window opens with a square frame: drag and zoom the logo to fit, then press **Save** (a logo that does not fill the square shows whole, with plain space around it). Only the adjusted logo is kept: to change the framing, upload the file again.
- **Catalogue banner:** the picture at the top of your catalogue, next to the logo (**Settings → Business profile** for the owner, the company page for a platform admin). Press **Upload banner**, choose a wide picture (about twice as wide as it is tall; PNG, JPEG or WebP up to 5 MB), drag and zoom it in the window and press **Save**, then **Save changes**. **Edit picture** reopens your original with the framing you chose; **Remove** goes back to the default banner the platform has set (or the built-in Sanctus photograph). Your company name, logo and number of pieces stay on top of the picture automatically, on a dark veil; the banner is trimmed at the sides on a phone. A company that is being created has no banner field yet: create it first, then add the banner.
- **Description:** shown at the top of the catalog.
- **Catalog accent colour:** pick one of the swatches or choose your own colour.
- **Default currency:** used for new products.
- **Contact details** (all optional): email, phone, website, address.

Then click either:
- **Save as draft:** saved but hidden from customers.
- **Create business:** goes live (Active) straight away.

Later you can change the **Catalog status** to Active, Inactive or Draft. Inactive and draft catalogs are hidden from customers.

Owners can change their business name, logo, description and contact details in **Settings → Business profile**. Only a platform admin can change the catalog address, status or accent colour.

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
- **Adjust each photo as you add it.** After you choose a photo, a window opens showing the **whole picture** inside the frame every product photo uses (4:5, a little taller than wide). Nothing is cut unless you choose to:
  - **Drag** the picture to move it. **Zoom** with the slider, the **-** and **+** buttons, the mouse wheel, or by pinching on a phone.
  - **Fill the frame** zooms until the picture covers the whole frame (the sides or the top and bottom are cut off). **Show whole picture** zooms out until all of it fits. **Reset** goes back to how the window opened.
  - If the picture does not fill the frame, a note says so. You can still save it: it then shows whole, with plain space around it.
  - Press **Save** to add the photo, or **Cancel** to skip it. When you choose several photos, the window opens for each one in turn.
- **Edit picture.** Hover (or, on a phone, look at) the top right of a photo and press the pencil. The window reopens on your **original** photo with the framing you chose, so you can change it any time. Your original file is always kept; the catalogue and the product page show the adjusted copy.
- Photos added before this change are not touched. They show whole in the same frame, and **Edit picture** works on them too.

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
- **USDZ file:** used for AR on iPhone and iPad. Without it, iPhones build one from the GLB each time a customer taps AR, which is slower and not guaranteed to work.
- The largest file allowed is **30 MB for a GLB** and **40 MB for a USDZ**: larger files often fail to open in phone AR. For Android AR, Google recommends a GLB of **10 MB or less**. A GLB with textures above 2048 px is accepted with a warning, because large textures make AR slow on phones.
- Files are checked to confirm they really are GLB or USDZ.

**AR readiness panel.** After you upload a model, this panel shows what customers will get: 3D viewer, Android AR, iPhone/iPad AR, true size, and a file-size warning.

**Size check.** The platform measures the GLB model and compares it with the width, height and depth you entered.
- If every side matches within **5%** (or within **1 cm** for small pieces), customers see a **"True-to-size model"** label.
- If not, they see **"AR scale unverified"**, and the editor suggests a likely cause, for example the wrong unit.
- Only the GLB is measured. The USDZ must be exported at the same size.

**Preparing the two files:**
- Export the GLB from your 3D tool (e.g. Blender: File → Export → glTF 2.0, format "glTF Binary"), in metres, at real size, with the base of the furniture on the floor.
- Upload the GLB first. Then, in the **iPhone (USDZ)** section, click **Build from GLB**. The platform makes the iPhone file for you, in your browser, from the same GLB. It takes a few seconds and the section then says "Built from the GLB". Use a computer for this step.
- Or make the USDZ yourself, e.g. with Apple's free **Reality Converter** (macOS): open the GLB, check the size shown, export USDZ, and upload it to the same product. An uploaded USDZ replaces a built one.
- If you change the GLB later, click **Build from GLB** again so the iPhone file matches.
- Keep the GLB under ~10 MB for Google Scene Viewer; very large files load slowly or fail.
- After uploading, the editor's size check should say the model matches the entered dimensions. If it doesn't, fix the file or the numbers before publishing.

**Saving and publishing**
- **Save draft** keeps the product hidden.
- **Preview** opens the product page in a new tab, even for drafts. Previews are not counted in reports.
- **Publish** needs: an English name, a price above zero, at least one gallery photo, and width, height and depth above zero. A published product is visible only while its business is **Active**.
- In the product list you can also **Unpublish** (the product goes back to draft), **Duplicate** (the copy is a draft named "(copy)" and uses the same files), **Copy URL** and **Delete** (you'll be asked to confirm).

### Requesting a 3D model from the Sanctus team

Most businesses do not make their own 3D files. Instead you ask the Sanctus team to make the model from photos of the product, and you are emailed when it is ready. There is no charge per request and no limit on how many you send.

**How to request one (business owner)**
1. Open the product in your dashboard, fill in its width, height and depth (the model is made to that size) and **save it**. A new product must be saved as a draft first.
2. In the **3D models** section, find **Request a 3D model**. If your business is allowed to upload its own files, choose **Request from Sanctus (recommended)** first.
3. Add **2 to 10 photos** (JPG, PNG or WebP, up to 10 MB each): the front, the back, both sides, an angle, and close-ups of the material, in even light and without people. Only the Sanctus team sees these photos. They are separate from your catalog photos and never appear in your catalog.
4. For a colour or option that needs its own model, pick it under **Model for**. Add a note if it helps (for example "the legs are oak and the cushion is removable"), then press **Send request**.

**What you see afterwards**
- **Requested:** the Sanctus team has not started. You can press **Cancel request** until work starts (the photos are then deleted).
- **In progress:** work has started. To stop it, contact the Sanctus team.
- **Ready:** the model is attached to the product, and you are emailed. If the product is published, customers see the 3D view and AR straight away. If you had the editor open, press **Reload** to see it.
- **Declined:** the team could not make the model from the photos. The reason is shown and emailed. Press **Send a new request** with better photos.
- The product list shows **3D requested**, **3D in progress** or **3D declined** next to each product, and you can filter for products with open requests.
- Until the model is ready the product shows its photos only, and customers see nothing about a request. You can publish the product meanwhile.

**How staff deliver a model (platform team with "Handle 3D model requests")**
1. Open **3D requests** in the admin menu. The number beside it is how many requests are waiting. Tabs: Open, Delivered, Declined, Cancelled, All.
2. Open a request. Look at the photos (select one to enlarge it, use the arrow keys to move, **Download original** to save it), the size, material and the business's note.
3. Press **Start work**, make the model elsewhere, then upload the **GLB** and, for iPhones, the **USDZ** under **Model files**. The same checks as in the product editor apply (format, size, the size check against the entered dimensions). The files stay with the request until you deliver.
4. Press **Deliver model**. The files **replace** the product's current 3D files (or the option's), the product gets them at once, and the business owner is emailed. Without a USDZ, iPhone AR depends on the phone converting the GLB; the dialog warns about this.
5. To refuse, press **Decline** and write a reason. It is sent to the business, so make it useful (for example "the photos are too dark; please send new ones in daylight").
6. If the email cannot be sent, the screen says so; the delivery or decline still stands.

**Who may upload their own 3D files**
- On each business's page in the admin, the **3D models** card has the switch **Can upload its own 3D files**. Only the platform team changes it; businesses cannot.
- **Off** (the default for new businesses): the business can request models but cannot add, replace or remove 3D files itself. Its product editor shows the current files as "managed by the Sanctus team". Photos, text and prices stay editable.
- **On:** the business can upload its own GLB and USDZ files as before, and can still request models.
- Businesses that already had 3D files when this was introduced were switched **on**, so nothing they use was taken away. Turning the switch off later keeps their existing files; from then on only the Sanctus team changes them.

**Good to know**
- Delivering replaces the whole set of files. If a business had its own USDZ and you deliver only a GLB, the old USDZ is removed.
- Request photos are kept after a request ends so the team can revise a model, and are deleted if the request is cancelled or the product, business or account is removed.
- In demo mode, photos and files are kept only until the page is reloaded, and no email is sent.

---

## 5. Preparing 3D models

Models made by AI tools or scanners are often far too heavy for a phone. Aim for these targets:

| Target | Why |
|---|---|
| **GLB under 10 MB** | Heavier files load slowly on mobile data |
| **About 100,000 triangles or fewer** | More adds weight without a visible difference on a phone |
| **Textures up to 2048 px, JPEG or PNG** | Android AR does not open larger textures |
| **No Draco, KTX2, meshopt or WebP compression** | Android AR cannot open files that use them |
| **Real size in metres** | The size check compares the model with the width, height and depth you entered |

**The dashboard now makes oversized models lighter for you.** When you upload a GLB, it shrinks textures above 2048 px and reduces models above 100,000 triangles to about 100,000. This happens in your browser before the file is uploaded and takes a few seconds. The shape does not visibly change, the real size is checked to stay within 0.5%, and the editor shows the size before and after. If anything looks wrong, or the check fails, the original is kept, and you can always choose **Upload the original instead**. As an example, a 17.5 MB chair with 440,384 triangles came out at 3.4 MB with 88,076 triangles and looked identical side by side.

**The iPhone file (USDZ) is not changed.** Export it light too (same targets), or leave it out and the iPhone builds one from the GLB.

---

## 6. QR codes and links

- **Catalog QR code:** in Super Admin go to **Catalogs & QR Codes**, or open a business and use its **Catalog & QR** tab. Owners use **My Catalog & QR**. The QR code always points to the business's **catalog**, never to a single product. Use **Download PNG** to get a 1024 × 1024 image for print.
- **Download QR codes for print only from the live production site.** On a preview or local address the panel shows a warning, because the QR code would point to that temporary address.
- **Product links:** use **Copy URL** in the product list. On the product page, customers can use **Share** (their phone's share menu, or the link is copied) or **Copy link**.

### Embedding a product on your own website

- **Copy the code:** in the product list, open a product's menu (**⋯**) and choose **Embed on your website**. Pick the language (or leave it on the visitor's browser), then press **Copy code** and paste it into your website where the product should appear (most site builders have an "HTML" or "Embed" block).
- **Only published products** can be embedded. A draft shows "Not public yet" instead of a code. If your catalog is not active, the frame shows "product not available" until it is.
- **What visitors see:** a compact card with the main photo, name, price and finishes. They can switch to the 3D model and turn it. It always shows the current product, so changes you make here appear on your site automatically.
- **AR:** phones only start AR from a full page, not from inside another website. In the frame, **View in your space (opens Sanctus)** opens the product's page in a new tab, where visitors tap AR as usual.
- **Size:** the code fills the width of the space (up to 960 px) and is 560 px tall. You can change the `height` value in the code if your page needs it.

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

- **Page views:** how many times a product page was loaded on the catalog.
- **Embed views:** how many times a product was loaded through the embed on another website. Embed loads before the day the update went live were counted as page views and can't be separated; the page says so.
- **AR launch attempts** (the summary card says "AR button activations"): taps on "View in my home". Repeat taps within 2 seconds count once. **This is not proof that AR opened or that furniture was placed**, only that the customer tried.
- **3D interactions:** visitors who turned or zoomed a model (counted once per page visit).
- **AR rate:** AR launch attempts divided by views.

Products you deleted keep their numbers and appear as one **Deleted products** row, so the totals still match. Days follow the time zone in your profile settings. Your own previews are not counted. To protect against spam, each visitor can send a limited number of events per minute, and visitors are identified only by a scrambled code, never their IP address.

---

## Editor: change the website text, pages and the application form

The Editor is for Owners and Admins. A Team member does not see it unless the Owner gives that person the "Edit website content" permission. In the left menu it is called **Website editor**. It is available once the Sanctus team has switched it on for your site.

You never change the live site by accident. Everything you type is saved as a **draft**. Visitors see nothing until you press **Publish**.

### What you can edit

| Section | What you can change |
|---|---|
| **Pages** | The text of **Terms** and **Privacy**, in English and in Portuguese. You can also add your own pages (shipping, returns, about us) with a title, an address such as `/pages/shipping` and a text in both languages. |
| **Application form** | The questions on the "Apply as a business" page: their order, their wording, which step they are on, which are required or optional, which are hidden, and up to 30 extra questions of your own. You can also delete any question and any section, or start the form again from blank. All the other texts on that page and the thank-you screen can be reworded too. |
| **Social media** | Links to Instagram, Facebook, LinkedIn, YouTube, TikTok and Pinterest. The ones you fill in appear as small icons in the footer of the main site. |

### Edit and publish

1. Open **Website editor** and choose a section.
2. Change the text. The bar at the top shows "Draft saved" a moment after you stop typing.
3. Press **Preview** to see the page as visitors will see it. It says "Preview of the draft. Not live." Nothing is sent from the preview.
4. Press **Publish**. A box lists what will change (for example "2 pages, 1 extra question"). Confirm and the change is live on the next page load.

If the box says some text is still marked "to be completed", those are placeholders in the legal text (such as the company name or the date). You can still publish, but visitors will see the marker. Fill them in first.

### The home page: sections, the QR section and the About photographs

Open **Website editor**, then **Landing**. The first block is **Sections**: one row for every section under the first picture, in the order visitors see them.

- **Move and hide.** Use the arrows to move a section up or down, and the eye to hide it (a hidden section shows a "Hidden" label and disappears from the page and from the menu links; press the eye again to bring it back). The built-in sections (QR code, How it works, Experience, Collections, About, Partners) can be moved and hidden, never deleted.
- **Add your own section.** Press **Add section** and choose a design: **Text** (a centred heading and text), **Picture and text** (a picture beside the text, on the left or the right) or **Banner** (a full-width picture with white text over it). Fill the heading (English is required, Portuguese is optional), the text, and for the picture designs upload a picture (JPG, PNG or WebP, up to 5 MB) and describe it for screen readers. A button is optional: give it a text and a link, either a page of this site such as `/apply` or a full address starting with `https://`. The optional **Address fragment** lets a link such as `/#our-story` jump to the section. You can have up to 10 sections of your own (16 sections in all). A new section cannot be published until it has a heading (and a picture, for the picture designs); the problem list at the top says what is missing.
- **Delete.** The bin button asks for confirmation and removes only your own sections.
- **The QR section.** The text that used to sit under the first picture now has its own section, right below it. Change its wording under **Texts**, in the new "QR section" group. Open the QR row (the arrow button) to add a picture and choose whether it appears on the left or the right of the text; with no picture the text is centred.
- **The About photographs.** Open the About row to replace the main photograph and the detail photograph, or to add an optional **third picture**. **Use the built-in photo** puts the original back; **Remove the third picture** shows the italic caption in the third box again. Without a third picture the box keeps its caption.
- **Adjusting website pictures.** Every picture you upload in the Website editor (the first picture, collection cards, your own sections, the QR section and the About photographs) opens a window first, showing the **whole picture** in the shape that place uses: the first picture and banners are wide (16:9), collection cards and the About main photograph are a little taller than wide (4:5), the About detail picture is square, the About third picture is tall (2:3), and picture + text sections and the QR section are 4:3. Drag, zoom, **Fill the frame**, **Show whole picture**, then **Save**. Nothing is cut unless you choose to; a picture that does not fill its frame shows whole with plain space around it. Both the original and the adjusted copy are uploaded. Press **Edit picture** next to a picture to reopen your original with the framing you chose (for a picture added before this change it opens the picture as it is). Pictures added before this change are not touched. In the demo, uploaded pictures only last until the page is reloaded, so **Edit picture** needs a fresh upload after a reload.
- **The catalogue banner (default).** Open **Website editor**, then **Site**. The **Catalogue banner** block at the top sets the picture shown at the top of every company's catalogue that has not chosen its own. Press **Upload picture**, choose a wide picture (about twice as wide as it is tall; PNG, JPEG or WebP up to 5 MB), drag and zoom it in the window and press **Save**. **Edit picture** reopens your original with the framing you chose, and **Remove** goes back to the built-in Sanctus photograph. Only the picture changes: each catalogue still shows its own company name, logo and number of pieces over it, on a dark veil that keeps the white text readable. The banner fills the width of the page, so on a phone its sides are trimmed, and on a very wide screen its top and bottom. A company's own banner (below) always wins over this one. As with everything in the Editor, nothing is live until you press **Publish**.
- As everywhere in the Editor, nothing is live until you press **Publish**.

### Pages

- **Terms** and **Privacy** start from the text we supplied. Edit a language to publish your own version of it. **Reset to original** puts our text back.
- **New page**: type the English title and the address is filled in for you. Switch on **Show in footer** to add a link to the footer of the public site, next to Privacy and Terms. Use the arrows to set the order of the footer links.
- Portuguese is optional for your own pages. If the Portuguese box is empty, Portuguese visitors see the English text.
- Formatting: the buttons above the text box add **bold**, headings, lists and links. Links must start with `https://`, `mailto:` or `/`. Raw HTML is not accepted.
- Changing the address of a page that is already live breaks old links to it. The Editor warns you.

### The application form

- The form is a column of cards, like Google Forms. At the top is the page title and introduction; then one **section** (a step of the form) after another, each with its questions as cards. Click a title or a description to type in it.
- **Click a question** (or press Enter on it) to open it in place. Change its wording, its description and whether it is **Required**. Click away or press Esc to close it. Only one question is open at a time.
- **EN | PT** at the top is the language you are typing in. A Portuguese box that is empty shows the English text in grey; the form then shows the English text.
- **Move a question:** drag it by the dots on its left, inside its section or into another one. Without a mouse, use its **⋮** menu (Move up, Move down, Move to section…) or the arrow keys on the dots. The same **⋮** menu on a section moves it, adds a section below it, or deletes it (any section except the last one, **Review and send**; its questions move to the section above, or to the next one when you delete the first). The last section before Review cannot be deleted, because the email question needs a section.
- The questions that come with the form are marked **Standard**. You can reword them and **Reset to default**, and **Hide** them (a hidden question is not asked; Show brings it back). For questions with choices (such as the number of products) you can rename and hide some of the choices, but at least one must stay.
- **Delete a question:** every question can be deleted from its **⋮** menu or the **Delete** button when it is open, after you confirm. Only the **email** question stays: we reply to that address and send the owner invitation there. The confirmation tick box and the agreement to the Terms are always asked on the last section, **Review and send**, because the law requires them; you can reword the confirmation sentence.
- **Bring a standard question back:** open **Add question**; deleted standard questions are listed under **Restore a standard question**. Clicking one puts it back at the end of the section you are looking at.
- **Start from blank** and **Restore the original form** are in the **⋮** menu next to **Preview the form**. Start from blank keeps only one section with the email question and the Review section; your own questions and every other section are deleted, and the texts you reworded stay. Restore the original form puts back the original sections and questions (your own questions are deleted; the texts you reworded stay). Both ask first, and neither goes live until you publish; **History** can bring the earlier form back.
- **Approving an application when the form did not ask for a company name:** the **Approve** dialog asks you to type the company name (2 to 80 characters; it is filled in when the form had one). In the lists the application shows the applicant's email instead of a name.
- **Add question** (on the right of the open question, or at the bottom on a phone) lets you choose the kind first: short answer, paragraph, yes or no, multiple choice or checkboxes. The new question goes below the open one. You can add up to 30 of your own. **Duplicate** copies one of your questions, and **Delete** removes it after you confirm. **Add section** adds a section (12 at most; Review always stays last).
- **After sending** holds the thank-you texts, with a link to preview that screen. **Button & message texts**, at the bottom, holds every other text: buttons, progress labels, warnings and error messages. Type in the search box to find one. The original wording is shown in grey in each box and **Reset** brings it back.
- **Preview the form** shows the real form with your changes (nothing is sent), in English or Portuguese, as on a computer or a phone.
- If something has to be fixed before you can publish, a yellow box at the top lists each problem; click one to jump to it.
- When an application arrives, the answers to your own questions are shown on its page under **Extra questions**, worded as they were on the day it was sent. A question you hide or delete later does not change old applications.
- A hidden or deleted question shows "Not given" on applications received after you hid or deleted it.

### History and undo

**History** lists every published version with the date and who published it. **Restore this version** copies it into the draft; it does not go live until you press Publish.

### Good to know

- If a colleague changes the draft at the same time, the Editor tells you and asks you to reload. Nothing is overwritten without a warning.
- If you leave with unsaved changes, the Editor saves first and asks only if that fails.
- Dashboard text (menus, buttons) is not editable. The dashboards, settings and sign-in pages are available in English and Portuguese: use the **EN / PT** switch at the top of any screen (inside the menu on a phone). The choice is remembered on that device.

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
- **USDZ files are not lightened** (see section 5). Only GLB files are.
- **Test content is still in the live database** (a test catalog with two test products, as checked on 2026-10-27). It will be removed, with your approval, before handover.
- **Public sign-up is off by design.** Businesses apply, and owners are invited. Until the client's email domain is verified in Resend, invitation and confirmation emails reach only the Resend account owner; other recipients are listed as "Not sent".

---

## 11. Ownership and accounts checklist

Transfer each account using the provider's own transfer or invite tools. **Never put passwords or secret keys in documents, email or chat.**

- [ ] **GitHub repository:** the project's GitHub repository (address supplied at handover).
- [ ] **Vercel project:** the hosting project (name and team supplied at handover). As checked on 2026-10-27, the live site is built from the `feature/sanctus-brand-design-system` branch as a Vercel Preview; switching it to the `main` branch is still to be done.
- [ ] **Supabase project:** `zggylkbgajamhriebdrg` (Sanctus AR; database, sign-in, file storage, reports).
- [ ] **Domain and DNS:** pending your domain.
- [ ] **Email sending (Resend or other SMTP):** not set up yet. Needed before owners can sign up and receive emails reliably.
- [ ] Confirm who holds platform admin access after handover.

---

## 12. Walkthrough video checklist

Record these on screen, with a narrator:

- [ ] Sign in, and use the password reset.
- [ ] Super Admin tour: Overview, Businesses, All Products, Analytics, Catalogs & QR Codes.
- [ ] Create a business: address, logo, accent colour, contact details, draft vs active.
- [ ] Apply as a business (`/apply`), then approve the application in **Applications**, invite the owner, and show the **Emails** and **Audit log** history.
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
