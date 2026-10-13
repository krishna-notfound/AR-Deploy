# Device test matrix

**No physical-device testing has happened yet.** Every result below is "Not run". Fill a row only with a real result and evidence: a screen recording or screenshot, the URL, the build commit, the data mode, and the measured size of a known object compared with the stated dimensions.

On Android Chrome, add `?ardebug` and use remote debugging to read `[ar] session metrics` (WebXR beta only).

| Device | OS | Browser | AR support | Workflow | Result | Evidence |
|---|---|---|---|---|---|---|
| Pixel 10a | Android (current) | Chrome | ARCore | Native: QR → catalog → product → "View in my home" → Scene Viewer at true scale; return to page | Not run — awaiting device | |
| Pixel 10a | Android | Chrome | ARCore | WebXR beta: scan, place, rotate 15°, move/cancel, start over, tracking loss, exit, PT labels (tasks/P10 checklist) | Not run — awaiting device | |
| Phone reported as AR-incompatible | Android | Chrome | No ARCore | Native first: Scene Viewer opens in 3D view, with no "incompatible" prompt. The beta link either stays hidden or fails honestly | Not run — awaiting device | |
| Samsung mid-range (A-series) | Android / One UI | Chrome | ARCore | Scene Viewer; large GLB (> 10 MB) load time | Not run — awaiting device | |
| Samsung mid-range | Android | Samsung Internet | varies | Mode selection and fallback | Not run — awaiting device | |
| Android phone | Android | Instagram in-app | WebView (no WebXR) | Notice shown; whether the Scene Viewer intent opens; copy link → Chrome | Not run — awaiting device | |
| Android phone | Android | Facebook / WhatsApp link | WebView / system browser | Same as above | Not run — awaiting device | |
| iPhone (product with USDZ) | iOS (current) | Safari | Quick Look | AR tips → Quick Look at fixed scale; tape-measure check | Not run — awaiting device | |
| iPhone (GLB only) | iOS | Safari | Quick Look (USDZ generated on the phone) | Readiness warning is honest; the on-phone USDZ works or fails clearly | Not run — awaiting device | |
| iPhone | iOS | Instagram in-app | WebView | Notice; "open in Safari" path | Not run — awaiting device | |
| iPad | iPadOS | Safari | Quick Look | Tablet layout, Quick Look, admin editor usability | Not run — awaiting device | |
| Desktop | Windows / macOS | Chrome | none | 3D view, hand-off QR, admin upload in Supabase mode | Not run — awaiting device | |
| Desktop | macOS | Safari | none | WebKit rendering of model-viewer | Not run — awaiting device | |

## Evidence: final code, functional phase (2026-10-13, branch `feature/ar-experience-2`, Node 24.21, Playwright 1.64)
| Command | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npm run lint` | exit 0: 0 errors, advisory warnings only (new ones: intentional render-time ref sync in `ProductFilters.tsx`, test harness globals) |
| `npx vitest run` | **140 passed, 13 skipped** (14 files). Skipped: `live.integration.test.ts`, which needs `SUPABASE_IT_*` and writes data. Includes 12 PGlite migration and RLS tests and 11 Edge Function handler tests (mocked DB) |
| `npx playwright test` | **27 passed, 0 failed** (25 desktop, 2 emulated Pixel 7), demo mode, `VITE_MODEL_OPTIMIZATION=on` |
| `npm run build` (picks up `.env.local`, Supabase mode) | exit 0 |
| Demo build (`VITE_DATA_MODE=demo …`) | exit 0 |
| Production guard | `VERCEL_ENV=production` with demo mode: **blocked**; with a secret key: **blocked**; with the valid Supabase config: built; preview with demo: built |
| CSP report-only check (scripted Chromium against a production build) | 0 violations: landing, catalog, product with 3D, admin editor, analytics. A deliberately broken policy was reported, so the check works |
| Secret scan of built JS | no `sb_secret_…` or JWT-shaped tokens |

Earlier full runs in this session had failures, all investigated:
- **Network-bound model tests:** the test budget was shorter than the step waits. Fixed with a 90 s global budget.
- **A real product-list race:** the search term was lost when a filter changed quickly. Fixed in `ProductFilters.tsx`, with a regression test.
- **One assertion of copy that was intentionally changed.**

Repeated runs of the affected tests pass.

## Evidence: audit baseline (earlier the same day) (2026-10-13, by the QA agent, branch `feature/ar-experience-2`, Node 24.21, Playwright 1.64)
| Command | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npm run lint` | 0 errors, 20 warnings (advisory) |
| `npx vitest run` | 98 passed, 13 skipped (`live.integration.test.ts`: needs `SUPABASE_IT_*` and writes data, so it was not run) |
| `track-event/handler.test.ts` (inside vitest) | 11/11 passed (mocked DB) |
| Supabase-mode build | exit 0; contains only the publishable key |
| `VITE_DATA_MODE=demo … vite build` | exit 0; no project ref or key in the output |
| `npx playwright test` | 24 passed, 0 failed, 0 flaky (desktop and emulated Pixel 7). Demo mode only |

## Not covered by any automated test
- Supabase-mode end-to-end runs (only the skipped live test covers it).
- Expiry of signed URLs.
- Real-hostname subdomain routing.
- The `vercel.json` rewrites and headers.
- A successful WebXR session.
- Scene Viewer and Quick Look launches.
- Real in-app webviews.
- iOS/WebKit.
- An accessibility audit.
