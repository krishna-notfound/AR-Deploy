# ADR-0050: Optional PDF catalogue in the business application
- **Status:** Accepted
- **Date:** 2026-11-05
- **Affects:** design/24-applications.md, design/19-supabase.md, design/12-features-admin.md

## Context
The client asked that a company can attach its product catalogue (a PDF it already has) when it applies, so the platform team can look at it during review and, later, prepare the company's products from it. The application is sent by anonymous visitors through the `submit-application` Edge Function; the browser has no write access to any table or bucket. Sending the file inside that function's JSON body is not an option (48 KB body cap, base64 overhead, Edge Function memory and time limits).

## Decision
- The company may attach one PDF (optional, `application/pdf`, at most 20 MB) in the application step "Your catalogue". It is a built-in field of the form, key `catalogue`, optional by default; the Website Editor's form builder can hide it or make it required (it is not a locked field). `_shared/applyForm.ts` (shared with the browser) and the SQL gate `private.validate_apply_form` both know the key.
- **Storage:** a new private bucket `application-files` (20 MB, `application/pdf` only). No policy lets `anon` or `authenticated` insert, update or delete in it. Platform staff with `applications.view` can read (`platform_can`, which includes the staff 2FA gate, as every other staff storage read).
- **Upload:** a new Edge Function `application-upload` (`verify_jwt = false`) takes `{ submissionKey, size, contentType }`, refuses anything that is not a PDF of 1 byte to 20 MB (`400 invalid_request`), counts the request against the per-IP limit that `submit-application` uses (`service_application_attempt`, the same salted daily IP hash; `429 rate_limited`) and returns a signed upload URL (`createSignedUploadUrl`, `upsert`) for exactly `pending/<submissionKey>/catalogue.pdf`. The browser sends the file straight to Storage with that URL. Uploads get an allowance of 4 per hour and address (applications: 5), so uploads alone can never block the application itself. The counting code moved to `_shared/attempts.ts`.
- **Submit:** `submit-application` accepts an optional `cataloguePath`. It must equal `pending/<submissionKey>/catalogue.pdf`, and the object must exist, be `application/pdf` and at most 20 MB; otherwise `400 invalid_application` on field `catalogue`. A storage read error answers `503 config_unavailable`. The path is stored in the new column `business_applications.catalogue_path` (nullable, shape-checked). An application without a catalogue behaves exactly as before.
- **Staff:** the application detail page has a "Product catalogue (PDF)" button that opens a 5-minute signed URL (`service.getApplicationCatalogueUrl`), or says "No catalogue attached".
- **Demo mode:** the mock keeps the PDF in memory for the session only (labelled as such on the form and when the file is gone).
- Migration `application_catalogue` (bucket, column, policy, form gate) with a rollback that refuses to run while files or paths exist. Deploy order: migration, then `application-upload` and `submit-application`.

## Consequences
- Good: the file never passes through an Edge Function; the bucket is private and write-closed to browsers; the same abuse limit covers upload and submission; the form builder treats the field like the other optional fields; the stored path is a fixed shape, so no path from the browser is ever trusted.
- Trade-off: the object exists before the application does. An abandoned upload (a visitor who never sends) leaves a file in `pending/`, and a visitor who removes the file in the form leaves it too (the next upload to the same submission replaces it). No cleanup job is built; a later scheduled sweep of `pending/` older than a few days would do. The bucket checks the content type the uploader declares, not the file's bytes; the browser checks the first bytes (`%PDF-`) before uploading, and staff open the file in the browser's PDF viewer.
- Trade-off: whoever holds a submission key could replace the PDF before the application is reviewed; the key is a random UUID that never leaves the visitor's browser tab.
- Trade-off: a form version published before this change has no placement for `catalogue`; the resolver gives it the default (optional, on "Your catalogue") so the field appears for everyone without a re-publish.

## Alternatives rejected
- File as base64 in the submit request: breaks the body cap and Edge Function limits.
- Public bucket or public upload policy: anyone could fill the storage or host files.
- Client uploads with the visitor's own sign-in: visitors have no account.
- Storing the PDF in the `answers` jsonb: not a place for 20 MB, and invisible to Storage policies.
