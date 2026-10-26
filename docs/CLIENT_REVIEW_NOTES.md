# Sanctus: review notes

Please review the test site at **https://sanctus.warpkit.online**. It is a test environment, not the final live site. Everything below describes what you will see there. The sign-in details are sent to you separately.

## What is new since your last review

**Catalog and AR**
- The black **View in my home** button starts AR again. On phones it now sits right under the 3D view, so you do not have to scroll to find it.
- While AR is getting ready the button shows "Preparing AR". If a phone or an in-app browser (for example inside Instagram) cannot open AR, the page says so in plain words instead of failing silently.
- A size label is shown when AR starts, and very large model files are refused with a clear message.
- Product and catalog pages that were unpublished no longer linger as old copies.

**Business dashboard**
- A business owner sees clear notices when the platform team pauses or changes their business.
- A new logo chosen before the business exists is moved into place, and the screen reports it if any file could not be cleaned up.
- Analytics and the team page follow the same rules everywhere.

**Platform team and security**
- Platform staff actions are protected by a permission check on the server, and by a second sign-in step for staff who use two-step verification. A business owner cannot use staff actions.
- Every action is recorded in the history with who did it.

**Applications and emails**
- A business can apply at `/apply` and must tick "I agree" to the Terms.
- When you reject an application you must give a reason. You choose whether the applicant sees that reason in their email.
- Emails to owners explain what happened in clear wording.

**Legal pages**
- **Privacy Policy** (`/privacy`) and **Terms** (`/terms`) in English and Portuguese (pt-PT), linked from the footer and from the apply form.

## What to try

1. Open the site and sign in as the **platform owner**, using the credentials sent separately.
2. Go to **Applications**. Open one, start the review, and approve it.
3. Open another application and **reject** it once **without** showing the reason, and once **with** "Include the reason in the email" ticked. Check the history for both.
4. Open a business that is still a **draft** and use **Preview** to see its catalog before customers can.
5. On your phone, open a product page in Chrome (Android) or Safari (iPhone) and tap **View in my home**. Tell us what you see, how long it takes, and whether the size looks right.
6. Open `/privacy` and `/terms` in both languages and read them as a visitor would.
7. Fill in the apply form at `/apply` as a test applicant and confirm the "I agree" tick is required.
8. Try a link inside Instagram or WhatsApp and note the message shown.

## Known limitations

- **The legal pages are drafts for your lawyer.** They contain placeholders in square brackets for company facts, and they are not legal advice. Please do not publish them as they are.
- **iPhone AR works best with a USDZ file** uploaded for the product. Without one, the result depends on the phone.
- **AR has not yet been tested on real phones** by us. Your test on Android and iPhone is the first real-device check.
- **The data is sample or QA data**, and emails go to test inboxes until your sending domain is set up.
- **3D model requests** (a business asks us to make a model from photos, and we upload it) are the next feature. They are not on the test site yet.

## What we need from you

1. **Company facts for the legal pages**: legal name and form, tax number, registered office, registry details, contact mailboxes, retention periods and the other items. The full numbered list is in `docs/legal/drafts/README.md`.
2. **Review by your lawyer** of the Privacy Policy and Terms. The same file lists the open questions for counsel.
3. **A USDZ file for each product** that should open in iPhone AR.
4. **The real inbox address** where closure and application alerts should go.
5. **Your feedback** from the steps above: what is unclear, what is missing, and anything that looks wrong on your phone.
