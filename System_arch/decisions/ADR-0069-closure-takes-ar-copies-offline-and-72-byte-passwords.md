# ADR-0069: Closing an account takes the business's public AR copies offline; passwords are at most 72 bytes
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/19-supabase.md, design/12-features-admin.md, docs/CLIENT_HANDOVER.md (password length); amends the 12 to 128 character rule in ADR-0066 and design spec 8

## Context
QA of 2026-11-14 found two real problems in the account-security paths.
1. The public AR copies that `sync-ar-models` writes (bucket `ar-models`, `{business}/{product}/{variant|base}/{file}`) stayed online after a business owner asked to close the account, and after the business was deleted: the closure sweep covered `product-media`, `business-logos` and `model-request-photos` only. Anyone holding a copy's URL could still download the model.
2. The password rule allowed 128 characters, but Supabase Auth hashes with bcrypt, which uses only the first 72 bytes. A longer password was accepted and then silently cut short; the owner invitation page had no maximum at all.

## Decision
- **AR copies.** `request_closure` (business owner) takes the business's copies offline as soon as the business goes inactive: the `account-security` function removes the business's `ar-models` folder (two folder levels below it) and sets `public_url` to null on its model rows, so a cancelled closure falls back to the private file. The browser then asks `sync-ar-models` to copy the published products again after "Cancel request". Completing the closure sweeps `ar-models` with the other buckets (`SWEEP_BUCKETS`). A failure in either step is logged and noted in the audit event (`ar_copies_removal_incomplete`, `storage_sweep_incomplete`); it never blocks the closure.
- **Password length.** At least 12 characters and at most 72 bytes (UTF-8, so an accented letter counts as 2). One rule in `accountService.ts` (`PASSWORD_MAX`, `passwordTooLong`) and in the `account-security` function (`PASSWORD_MAX`), used by Settings, the reset page, the owner invitation page and the staff join page. This replaces the 128 in ADR-0066.
- **Recovery code.** A recovery code spent by a request that then fails to remove the authenticator is given back (`service_restore_recovery_code`, only a code spent in the last 5 minutes, service role only).
- **Sessions.** The function answers `signedOut: false` when a password change or reset could not end every session; the app retries once with a global sign-out and, if that fails too, tells the person their other devices may still be signed in.

## Consequences
- Good: a closed business's models are no longer downloadable; the password limit matches what is really hashed; a failed audit write no longer turns a successful password change or recovery-code set into an error.
- Trade-off: a person whose business closure is cancelled has its AR copies made again by the browser that cancels (fire and forget); if that call fails, phone AR uses the private file until the next product save. The platform Owner restoring a closure from the console does not trigger the copy; `sync-ar-models` with `{ all: true }` does.
- Trade-off: a password between 73 and 128 characters, which worked before, is now refused when it is set. Existing accounts are unaffected (their sign-in is truncated the same way).
- Needs the owner: redeploy of the `account-security` function, and the migration `20261114123438_recovery_code_restore.sql` (the function runs without it; only the give-back of a recovery code needs it).

## Alternatives rejected
- Leave the copies until the closure completes: a closing business is inactive and not public anywhere else; a public file is the one thing that stays reachable.
- Count the limit in characters: a 40-character password with accented letters would pass and be cut short.
- Re-copy the AR files from the function on cancel: the function would need the caller's product list and a second service-role path; the browser already makes the same call when a business is set active.
