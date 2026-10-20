# Sanctus dashboard: test results

| | |
|---|---|
| **Date** | 2026-10-20 |
| **Branch** | `feature/sanctus-brand-design-system` |
| **Commits** | `a1e8392`, then `422481b` (QA fixes) |
| **Preview** | https://ar-deploy-i328t0wiz-track0.vercel.app, built from `422481b`. The journeys ran on `ar-deploy-qio4qn0c4` (`a1e8392`); the fixes were re-checked on the newer build. |
| **Data** | Client dev project `zggylkbgajamhriebdrg`. The live project was not touched. |

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED**.

## 1. Automated tests (final tree, `422481b`)

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run lint` | **PASS**: 0 errors, advisory warnings only |
| `npm test` (`vitest run`) | **PASS**: 283 passed, 15 skipped. The skipped tests are the live integration suite, which needs credentials. Green on consecutive full runs. |
| `npx vitest run supabase/tests` (PGlite: migrations, RLS, variant media) | **PASS**: 33 passed. The 8 new tests cover variant-media isolation and stable variant ids. |
| `npm run build` | **PASS** |
| `npm run test:e2e` (Playwright, demo mode, desktop and mobile) | **PASS**: 31 of 31 |
| Migration on the client dev project (`supabase db push`, after a dry run) | **PASS**: 10 of 10 migrations match locally and remotely. Tables, RLS, trigger and storage policy confirmed by query. The generated types are identical to the code's. |
| Supabase security advisors after the migration | **PASS**: no new findings. Only the existing WARNs: intended admin `SECURITY DEFINER` RPCs, and leaked-password protection off. |

**Two test changes worth knowing about:**
- Two component tests (`ownerDashboard.test.tsx` and `productVariants.test.tsx`) failed now and then on a fully loaded run, because a lazily loaded page took longer than the default wait. They now have longer waits. No assertion was removed or weakened.
- One test in `ApplyPage.test.tsx` (earlier commit) now pastes its long answers instead of typing them key by key.

## 2. Browser journeys on the Preview (real app, real database)

Driven with Playwright in Chromium: desktop 1440×900, plus Pixel 7 and iPhone 14 emulation. The full evidence table is in [`dashboard-audit/qa-journeys.md`](dashboard-audit/qa-journeys.md).

| Journey | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|
| QA setup: apply, approve, invite, accept (real UI) | 5 | 0 | 0 | 0 |
| Setup: admin activates the QA business | 1 | 0 | 0 | 0 |
| A. Owner access and isolation | 19 | 0 | 1 | 1 |
| B. Product lifecycle | 22 | 0 | 0 | 0 |
| C. Variants | 7 | 0 | 0 | 0 |
| D. QR | 10 | 0 | 1 | 0 |
| E. 3D and AR | 11 | 0 | 2 | 0 |
| F. Analytics | 7 | 0 | 0 | 0 |
| G. Usability | 21 | 2 → fixed | 0 | 0 |
| Re-check of fixes on the new build | 4 | 0 | 0 | 0 |

**Key evidence:**
- **A.** The owner is refused every `/admin` route. With the owner's own session, the REST API returns 0 rows for other businesses' drafts, applications, audit, email log, analytics and storage folders. An UPDATE on another business's row affects 0 rows.
- **B.** Each product was created in the real editor with uploads. P1 was saved as a draft, then reloaded (it persisted), previewed and published. The public catalogue shows P1 to P4 and hides P5 and P6. Unpublishing P4 removed it from the catalogue; re-publishing brought it back.
- **C.** Switching the P3 finish changes the photo, the GLB and the AR target. `?variant=` works, and an unknown id falls back to the first finish.
- **D.** The catalogue QR and a product QR were downloaded and decoded with jsQR. They decode to the catalogue URL and the product URL respectively, and both open the right page on desktop and Pixel 7.
- **E.** All GLBs load, and their sizes match the entered dimensions within 1 cm. In Pixel 7 emulation the Scene Viewer handoff is built. The invalid GLB is rejected.
- **F.** The traffic was controlled: P1 got 4 views and 1 AR launch attempt, P2 got 4 views and 2 (one double tap counted once). The dashboard showed exactly these numbers. 3D interactions went from 0 to 2. Every `track-event` call returned 204; none was rate-limited.
- **G.** Desktop and 390 px layouts were checked, along with the unsaved-changes guard, editor keyboard focus, and EN/PT on public pages.

## 3. Bugs found and fixed

| # | Sev. | Bug | Fix | Verified |
|---|---|---|---|---|
| 1 | Medium | A product whose models are only on its variants was shown as "photos only": no 3D badge, wrong next-steps count, "—" in analytics | Readiness, the catalogue badge and the AR columns now consider variant models (`hasAny3d`, `productArReadiness`) | Unit test, and re-checked on the Preview (**PASS**) |
| 2 | Low | Owner overview 404 px wide on a 390 px phone (Recent products clipped) | Grid items can now shrink (`min-w-0`) | Re-checked on the Preview: 390/390 (**PASS**) |
| 3 | Low | The 3D viewer took keyboard focus with no visible ring | Inset focus ring for keyboard focus only (pointer focus doesn't show it) | Demo browser: keyboard gives a solid 2 px ring; a mouse click shows none (**PASS**) |
| 4 | Low | The QR toast said "1024 × 1024 px", but the PNG was 1023 px | The wording no longer claims an exact size | Code |
| 5 | (setup) | A paused-business test timed out on a cold lazy import | Longer wait for the lazy page | Suite green |

Defects found and fixed earlier in this work (the dashboard and AR workstreams) are listed in [`SANCTUS_BUSINESS_DASHBOARD_AUDIT.md`](SANCTUS_BUSINESS_DASHBOARD_AUDIT.md) and [`SANCTUS_3D_AR_QA_REPORT.md`](SANCTUS_3D_AR_QA_REPORT.md).

## 4. Known limitations

- Dashboards are English-only by design (CLAUDE.md). EN/PT applies to public pages.
- The QA products have no USDZ files. iPhone AR relies on model-viewer generating one on the device, and readiness reports "Android only".
- The demo-mode sample catalogue includes a GLB that Android AR can't open (`EXT_texture_webp`). It now carries the warning and never offers Android AR.
- Analytics counts every page view and AR launch attempt. They are not unique visitors. De-duplication would change the metric's meaning and needs a decision.

## 5. Blocked and not-tested items

| Item | Status | Reason |
|---|---|---|
| Physical Scene Viewer and Quick Look, scale measured in a room | **BLOCKED** | No physical device. Manual steps are in the 3D/AR report, section 7. |
| Real camera QR scan | **BLOCKED** | No device. The Preview host is also behind Vercel protection. |
| Owner probing another business's products (GET by id, child tables, UPDATE) | **BLOCKED** | No other business in the dev project has products, and creating one would mean writing outside the QA business. The same paths are proven in PGlite (about 60 probes). |
| INSERT or DELETE attempts against another business | **NOT TESTED** (on purpose) | A broken policy would change shared client data. Covered in PGlite instead. |
| Real email invitation delivery and its redirect | **BLOCKED** | No Resend secrets. Also, the Auth Site URL is still the default `http://localhost:3000/` (seen in the QA run), so an emailed link would land there. Needs Administrator access. |

## 6. Remaining risks and release blockers

1. Supabase Auth URL configuration and the email secrets (Administrator access needed). Until they're done, owners can't onboard through email.
2. No real-device AR validation yet. That covers placement, true scale, signed URLs, and the USDZ generated on iPhone.
3. Migrations still awaiting approval: owner column grants (SEC-27, OWN-06), product-media path shape (OWN-02), an AR event requiring a model (OWN-04), and COR-05, COR-07 and COR-16.
4. The client's open decisions: categories, the contact link, the PT dialect, whether USDZ is mandatory, and analytics de-duplication.

**Decision:**
- **The Preview is ready for manual review.**
- **Production is not ready.** Items 1 and 2 are hard blockers.
