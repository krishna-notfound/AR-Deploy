# 06 · Persistence (demo only)
Read when: touching `services/mock/store.ts`, uploads, or anything in localStorage or sessionStorage.
Decision: [ADR-0007](../decisions/ADR-0007-session-only-3d-uploads.md)

## DB blob
- Shape: `{ schemaVersion: 1, businesses, products, events, dailyStats, activity }`. Sample analytics are stored as `dailyStats` aggregates and live demo events as `events` ([ADR-0012](../decisions/ADR-0012-sample-analytics-daily-aggregates.md)).
- `store.flush()` also runs on `beforeunload`, so the last debounced write is never lost.
- Key: `localStorage['arfurn:v1:db']`. Writes are debounced by about 200 ms.
- On load: parse the blob, then run `isValidDb()` (a hand-written type guard). If parsing fails, the version is wrong, or the shape is invalid:
  1. move the bad payload to `arfurn:v1:db:corrupt-<ts>`,
  2. re-seed,
  3. show the toast "Stored demo data was invalid and has been reset."
- If `setItem` throws `QuotaExceededError`, keep the data in memory and show a warning toast.
- Settings → "Reset demo data" (with confirmation) calls `resetDemoData()`.

## Uploads
| Kind | Stored as | Limit |
|---|---|---|
| Image or logo | data URL inside the DB | 5 MB upload; must be ≤ 1.5 MB as a data URL to persist, otherwise reject with a message |
| GLB or USDZ | `blob:` URL in the session registry (`lib/files.ts`); only metadata is persisted | 50 MB |

After a reload, a stale `blob:` URL means the model is gone. Show "File no longer available in this session. Re-upload (backend storage needed)."

## Other keys
| Key | Store | Purpose |
|---|---|---|
| `arfurn:account` | local | current mock user id |
| `arfurn:sidebar` | local | sidebar collapsed |
| `arfurn:arTipsDismissed` | local | AR tips "don't show again" |
| `arfurn:inAppNoticeDismissed` | session | in-app browser notice |
| `arfurn:lang` | session | public language |
| `arfurn:debug:failRate` | local | failure injection |
