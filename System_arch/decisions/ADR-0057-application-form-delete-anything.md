# ADR-0057: Application form: delete any question, start from blank
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/12-features-admin.md, design/24-applications.md, docs/CLIENT_HANDOVER.md, docs/superpowers/specs/2026-11-11-apply-form-delete-anything-design.md
- **Amends:** ADR-0043 (the locks and limits of the form builder), ADR-0059 (the builder keeps its design; the lock and limit rules change), ADR-0050 (the catalogue PDF question can be deleted like any other)

## Context
Owner request, 2026-11-11: "every field should have a delete button, no hardcode ... a client can completely delete the whole form and build from scratch ... current design I like". Until now the business name, contact name and email were locked, standard questions could only be hidden, built-in sections could not be deleted, and the limits were 10 own questions and 8 sections. The number 0057 was reserved by a paused work package (W6, 2026-11-09) that was never merged; this ADR replaces it and reuses its model and backend code, but not its migration file (it would now sort before the applied `landing_sections` migration).

Owner answers: keep one email question and the consent ticks; Approve asks for the company name; 30 own questions and 12 sections; the database change and function updates may go to the TESTING database.

## Decision
- **Locks:** only two things stay. The applicant **email** question (always asked, always required, no Delete; its wording and description can be edited; reason shown: "We reply to this address and invite the owner here.") and the **consent and terms** ticks on Review (required by law; the consent sentence stays editable, the Terms tick keeps its fixed legal wording with links).
- **Delete any other standard question** (company name, contact name, website, category, description, country, city, role, phone, language, product count, photo and model readiness, notes, catalogue PDF) from its card, with a confirmation. The form stores `removedFields` (built-in keys, never `applicantEmail`); a deleted question is not asked and the application stores it as null. The wording the client gave stays. **Add question** lists the deleted ones under "Restore a standard question". If `language` is deleted, the application stores the language the visitor used the form in.
- **Delete any section except Review**, built-in ones included, with a confirmation. Its questions move to the section above (at its end); the first section's questions go to the start of the next one. The last section before Review cannot be deleted (the email needs one); its menu says why.
- **Form menu** (⋮ next to Preview): "Start from blank" (one section holding the email, then Review; own questions, other sections, hidden options gone; the texts stay) and "Restore the original form" (sections, questions, hidden options back to `DEFAULT_APPLY_FORM`; the texts stay; off while the form is already original). Both ask first and are draft edits, so History and "don't publish" undo them.
- **Limits:** 30 own questions, 12 sections including Review, 50 placements; 2 to 10 options per choice question as before.
- **Names are nullable.** `business_applications.business_name` and `applicant_name` allow null (a stored value still has to be 2 to 80 and 2 to 120 characters). Every place that shows or uses them copes: lists and titles use the applicant email, duplicates show "Company name not given", the team alert and the decision email leave the name out, the in-app and push notice is generic, the duplicate check of `submit-application` matches an open application from the same email that also has no name.
- **Approve asks for the company name.** The Approve dialog on the application page has a Company name field (required, 2 to 80 characters, prefilled when the form had one; the typed name wins and names the new business). `admin_review_application` takes `p_business_name`; without any name approval is refused with `business_name_required` (`business_name_invalid` for a wrong length). The `review-application` function passes it only when typed.
- **Database** (migration `apply_form_delete_anything`, with rollback and PGlite tests): the two columns nullable; `private.validate_apply_form` (only the email locked, `removedFields`, a section before Review, 12 sections, 30 questions); `private.check_site_content_shape` (the draft caps 12 / 30 / 50, from its latest body in `landing_sections`); `admin_review_application` with the fourth argument (the old three-argument function is dropped so PostgREST has one candidate). `private.validate_site_content` itself needs no change: it calls these. The TypeScript twin (`validateApplyForm`, `validateContentShape`) and the SQL gate are tested on the same documents.
- **Code:** `formOps.ts` gains `deleteField`, `restoreField`, `startFromBlank`, `restoreOriginal`, `canDeleteStep`, `isOriginalForm`; `deleteStep` works for built-in sections; the shared model (`supabase/functions/_shared/applyForm.ts`, `application.ts`) takes `removedFields`, nullable names and the new limits.

## Consequences
- Good: the client can reshape the form completely, from blank if they want, and the original is one click away; approval no longer depends on a company name being asked.
- Good: nothing public changes shape: an old form document without `removedFields` resolves exactly as before.
- Trade-off: a form can be as short as one email question; the team sees applications with little information. The Approve dialog and the email-as-title fallback keep review possible.
- Trade-off: the rollback script refuses while an application has no name or a form uses deleted questions, hidden names or more than the old limits, so it needs the data cleaned first (documented in the script).
- Trade-off: functions that import the changed shared files must be redeployed after the migration is applied (submit-application, review-application, application-upload and the notification functions that import `email-templates.ts` or `notificationText.ts`).

## Alternatives rejected
- Keep the names locked: contradicts "no hardcode".
- Delete without a way back: the owner wants to rebuild, and a restore list costs little.
- Make the company name optional in the database only for new rows with a default value: hides the problem; null with explicit fallbacks is honest.
- A new table for form versions: the existing draft, publish and History already undo a reshaping.
