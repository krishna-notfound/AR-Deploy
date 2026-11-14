# ADR-0074: Failed reads, unsaved work and page crashes are said out loud
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/12-features-admin.md, design/24-applications.md (error and empty states)

## Context
The 2026-11-14 QA report found places where the app stayed silent or lied: a rejected service call left a query loading for ever, a failed read looked like "0 views" or "no such collection", closing Settings or reloading a form threw unsaved edits away, one crashing page replaced the whole app in the browser's language instead of the chosen one, and a lost connection gave no sign.

## Decision
- `useServiceQuery` and `useServiceMutation` turn a rejected or thrown call into a failed `Result` (`UNKNOWN`), so every consumer's existing error state runs.
- A failed read is never shown as an empty or zero answer: product tables show a warning with a retry when the views and AR counts could not be read; `/collections/:slug` shows an error with a retry instead of the built-in fallback or a 404; the invite dialog and the business picker say the read failed; the managed lists say when a reload after a change failed; the public catalogue keeps its products and shows a small notice when a refresh fails.
- Unsaved work is guarded in two layers: `useBeforeUnload` (reload or tab close) and, in the app, one router blocker per screen. Settings sections report their drafts to the Settings layout (`useUnsavedDraft`), which holds the only blocker there (a React Router instance honours one blocker at a time) and asks before Close, Esc or a section change discards them. After a draft conflict in the Website Editor, Reload asks before it replaces the local edits.
- Business contact edits send only the entries that changed (email, phone, website, address), so an older tab cannot undo a contact edit saved meanwhile.
- Dashboard and public route groups each get a route-level `errorElement` (`RouteError`, translated through `t()`), so a crash in one page leaves the shell standing; the root boundary stays as the last resort.
- A small offline banner (`navigator.onLine` and the `online` and `offline` events) is shown app-wide.
- Duplicate-slug errors from the database are translatable field messages, not English text.

## Consequences
- Good: no silent zeros, no endless "Loading", no lost drafts; one place (`hooks.ts`) guarantees the error path.
- Trade-off: the product tables still print 0 beside the warning (the table component is shared with the product editor work); a per-cell placeholder is a follow-up.
- Trade-off: `navigator.onLine` is only a hint for "online"; the banner appears for "offline" only.

## Alternatives rejected
- One blocker per Settings section: a router uses only the last registered blocker, so sections and the layout would override each other.
- A global error toast for every failed read: hides which view is wrong and where to retry.
