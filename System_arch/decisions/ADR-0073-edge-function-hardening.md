# ADR-0073: Edge function hardening after the QA round of 2026-11-14
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/24-applications.md, design/23-email.md, design/19-supabase.md; `supabase/functions/_shared/http.ts`, `notify.ts`, `webpush.ts`, `submit-application`, `application-upload`, `review-application`, `send-test-email`

## Context
The QA report found six weaknesses in the public and staff Edge Functions: the per-IP limit of the application functions keyed on a client-chosen `X-Forwarded-For` entry; a catalogue could be replaced after the application was submitted; two concurrent rejects emailed the applicant twice; a push subscription could point the sender at any https host; request bodies were read whole before the size check; and `send-test-email` returned provider text and failed with a 500 on a body that was not an object. "Send application" also waited about 8 seconds for 7 notification emails.

## Decision
- The caller address is `cf-connecting-ip`, then `x-real-ip`, then the first `X-Forwarded-For` entry (`clientIp` in `_shared/http.ts`). The first entry stays only as the last resort so that a platform without the first two headers does not put every visitor into one bucket. Which header the live edge sets is verified by the owner after deploy (see the QA log).
- `submit-application` also refuses a fourth application for one applicant email within 24 hours (429 `rate_limited`): each stored application sends that address a confirmation, whatever connections the sender uses.
- `application-upload` signs no URL once an application with that submission key is stored (409 `already_submitted`). An URL signed before the submission stays valid for its own lifetime (a known, small window; the file is still a PDF of at most 20 MB).
- `submit-application` answers as soon as the application, audit row and in-app notification are saved; the emails then run under `EdgeRuntime.waitUntil` when the runtime has it, otherwise they are awaited as before. `email_log` rows are written the same way.
- `review-application` sends a rejection email only for the request that wins `service_claim_decision_email` (a primary key on application id and `reviewed_at`). If the claim call itself fails it still sends: a duplicate is better than a lost notice.
- Push endpoints must be on `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com` or `*.notify.windows.com`: a `NOT VALID` check constraint on `push_subscriptions` (new and changed rows), plus the same check in `notify()` (a bad saved device is dropped) and in the sender.
- `readJsonObject` refuses by `Content-Length` first and cancels the stream once the limit is passed. `send-test-email` uses it, answers 400 `invalid_json` for anything but a JSON object, and returns only codes from `SAFE_EMAIL_REASONS`; provider text stays in `email_log`.
- Portuguese emails are PT-PT, like the app dictionaries.

## Consequences
- Good: spoofing a header no longer buys a fresh allowance when the platform header is present; a victim address gets at most 3 confirmations a day from this form; one rejection is one email; the sender cannot be pointed at internal or attacker hosts.
- Trade-off: if the background email work is cut off when the runtime stops, the email is missing; the replay path (same submission key after 30 seconds) completes any workflow with no `email_log` row. A new push service host (a browser vendor adds one) needs this list and the constraint changed.
- Trade-off: abandoned `pending/` uploads in `application-files` are still never removed (needs an owner decision on a scheduled cleanup).

## Alternatives rejected
- Last `X-Forwarded-For` hop as the key: if the platform appends its own proxy address, every visitor shares one bucket and nobody can apply.
- `upsert: false` on the signed URL: a visitor who picked a wrong file could not retry before submitting.
- A column on `business_applications` for the email claim: the table has no update grant for the service role; a private table with a primary key needs no new grants.
