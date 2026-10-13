> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md. The custom WebXR session described here was removed (f171db3); on branch `chore/production-readiness` (not yet deployed) AR is native viewers only (`scene-viewer quick-look`), with no custom physics.

# Audit executive summary (2026-10-13)

**Scope:** branch `feature/ar-experience-2` (commit 82c4a21), the live Supabase project `pmnjchhrgvajtjpadpqo` (read-only metadata only) and the signed client agreement (US$3,235, 35 days).

**Method:**
- Six independent review agents (scope, architecture, AR, scale and physics, security, QA), then two challenge agents.
- The challengers re-checked the claims and fixes that change the plan against Chromium source, W3C specs and Google/Apple docs.
- Simplification, stated honestly: the challenge round used two dedicated challenger agents. The original agents did not cross-examine each other one to one.

**Status: READY FOR IMPLEMENTATION. Not ready for release.**

## What genuinely works (evidence: 98 unit tests, 11 Edge Function tests and 24 E2E tests run and passing; typecheck, lint and both builds clean, see DEVICE_TEST_MATRIX.md §Evidence)
- Multi-business catalog, product CRUD, publish/unpublish, duplicate, QR code to the catalog URL, EN/PT public pages and the 3D viewer, in demo and Supabase mode.
- **Data isolation holds:**
  - Row-level security (RLS) is on for every table.
  - Roles live in tables, not in the login token.
  - Private media can only be signed for published products.
  - No secret key reaches the browser.
- **Analytics are real** in Supabase mode, through the rate-limited `track-event` Edge Function.

## Main blockers
1. **Automatic model compression is missing.** It is a contract item (A and C). The obvious tools (meshopt, Draco, WebP) would break Scene Viewer, which only accepts three glTF extensions. A safe, reduced pipeline is designed (ISSUE P1-01).
2. **The Android AR default deviates from the contract and fails on phones without AR support.**
   - (Historical, 82c4a21; removed since.) This branch sent every Android 7+ Chrome phone into our custom WebXR session, because Chrome reports `immersive-ar` as supported without checking ARCore.
   - Phones without ARCore, or where ARCore isn't installed yet, get a failure or the Play "incompatible" install flow instead of Scene Viewer.
   - The contract specifies Scene Viewer (P1-02).
3. **AR breaks after the page has been open for an hour.** Signed model URLs expire after 1 hour and are never refreshed (P1-04).
4. **The AR button stops working after a Scene Viewer failure** (P1-03).
5. **Delivery items have no artifact yet:**
   - production deployment, domain, wildcard subdomains and SSL
   - real-device tests
   - user guide and walkthrough video

## Biggest AR risk
No AR path has been tested on a real device in its current form.
- The Pixel 10a "works but hard to control" report came from **model-viewer's own WebXR mode** (the old `ar-modes="webxr …"`), not from Scene Viewer.
- Scene Viewer, Quick Look and our custom session are all untested on hardware.

## Physics (requested by the owner)
A physics-style placement layer is feasible **without a physics engine**, but only in our custom WebXR mode. Native viewers can't be changed.
- ~~**Recommended now:** settle-onto-floor motion, a true width × depth footprint preview and a precise model bounding box.~~ Built, then removed with the session; the owner chose native-only (2026-10-13).
- **Needs client approval:** drag on the floor, several items with overlap warnings, and an estimated wall clearance.
- **Rejected:** Rapier (about 2 MB and no room geometry to collide with).

Details: AR_COMPATIBILITY_AND_PHYSICS.md.

## Recommended next actions
1. Stage A of IMPLEMENTATION_PLAN.md: code-only correctness fixes, no approvals needed.
2. Ask the client the questions in IMPLEMENTATION_PLAN.md §Approvals (what "compression" means, the AR beta button, variants, physics scope).
3. Owner approval for the migration bundle in Stage C.
4. Stage D: deploy, then the device pass.
