# Application form: delete any question, start from blank (2026-11-11)

Owner request (2026-11-11): "every field should have a delete button, no hardcode … a client can completely delete the whole form and build from scratch … current design I like".

Owner answers:
- keep 1 email + consent;
- Approve asks for the company name;
- 30 own questions and 12 sections;
- the database change and function updates may go to the TESTING database.

This **builds on the Google Forms-style builder (ADR-0059) and keeps its design.** It resumes and replaces the paused W6 work (branch `worktree-agent-a05d1344514eb53a4`, commits `ead842b` and `92c3e3b`; spec 2026-11-09 W6): reuse its model and backend code, but **not its migration file** `20261109143000_apply_form_round2.sql`. That file was never applied and would now sort before the applied `20261111083034_landing_sections.sql`.

## Rules

1. **Locks:** only two things stay.
   - The applicant **email** card: always present, always required, no Delete. Its wording, description and placeholder can be edited. Reason shown: "We reply to this address and invite the owner here."
   - The **consent + terms** ticks on Review: their text is editable. Reason shown: "Required by law."
2. **Every other standard question gets Delete,** with a confirm: company name, contact name, website, category, description, country, city, role, phone, language, product count, photo/model readiness, notes and the catalogue PDF.
   - A deleted standard question is stored as `removedFields` (W6 model). Deleted means absent from the public form and stored as null.
   - **"Add question" also lists the deleted standard questions** under "Restore a standard question".
   - **If `language` is deleted,** the application stores the language the applicant used the form in.
3. **Every section except Review gets Delete,** built-in sections included, with a confirm.
   - Its questions move to the section above. If it is the first section, they move to the next one.
   - The email card always needs a section before Review, so the last such section cannot be deleted; its menu says why.
4. **Form menu** (⋮ next to Preview):
   - **"Start from blank"** (confirm): removes every question and section except one section holding the email card, plus Review with consent + terms. Own questions are deleted. The texts stay.
   - **"Restore the original form"** (confirm): resets the steps, fields, questions and hidden options to `DEFAULT_APPLY_FORM`. The texts stay.
   - Both are draft edits, so History and "don't publish" still undo them.
5. **Limits:** 30 own questions (was 10) and 12 sections including Review (was 8). Options stay 2–10. The `validate_site_content` caps follow (the field cap is raised to match).
6. **Approval without a company name:**
   - the Approve dialog on the admin application page asks for the company name (required, 2–80 characters, prefilled when the form had one);
   - `admin_review_application` takes it (W6: `p_business_name`, `business_name_required`).
7. **Null names everywhere:** every place that shows or uses `business_name` / `applicant_name` copes with null, using a fallback such as the email or "Company name not given". That covers:
   - the applications list, detail, title and breadcrumbs;
   - possible duplicates;
   - the staff notifications and push texts;
   - the confirmation and decision emails;
   - the audit events.
   Grep `businessName`, `business_name`, `applicantName`, `applicant_name` across `src/` and `supabase/functions/`.

## Database and functions

- **New migration** (`npx supabase migration new apply_form_delete_anything`, which sorts after `20261111083034`):
  - `business_name` and `applicant_name` become nullable;
  - `private.validate_apply_form` takes the W6 rules (only `applicantEmail` locked, `removedFields`, at least one section before Review) plus the new limits;
  - `private.validate_site_content` is replaced **from its latest body in `20261111083034_landing_sections.sql`**, raising only the apply-form caps and keeping every other check;
  - `admin_review_application` gets `p_business_name`.
  - It comes with a rollback in `supabase/rollback/` and PGlite tests (apply, rollback, re-apply; valid and invalid configs; approval with and without a name).
- **Functions to update** (deployed by the orchestrator after review, not by the agent): `submit-application` (shared `applyForm.ts` / `application.ts`, null names, duplicate check), `review-application` (null name in emails), and any other function importing the changed `_shared` files.
- The frontend and the demo/mock service are updated together.

## Done

- `typecheck`, `lint` (0 errors), `test` and `build` pass, including the PGlite tests.
- Builder e2e: Start from blank → add own questions → publish (demo) → `/apply` shows only those plus email + consent → submit works in demo → approve asks for the name.
- Screenshots at 1440 and 390 px.
- **Records:** ADR-0057 (the number W6 reserved, never written) "Application form: delete any question, start from blank", which amends ADR-0043, ADR-0059 and ADR-0050, plus its README row; update `System_arch/design/12-features-admin.md` and `design/24-applications.md`; update `docs/CLIENT_HANDOVER.md` (delete, restore, start from blank, approval name).
