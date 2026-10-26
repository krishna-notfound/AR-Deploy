# Next scope after the 2026-10-26 deadline (owner re-plan)

Owner's words (2026-10-26): "i dont need mantainance part just make privacy policy and tos and working business logics", "no need application close or anthinything", S4: "Request a 3D model, Admin uploads + notify, Allow own upload switch, try to fix and audit ar part also write these changes in md file and make everything parallel mutli sub agent".

## What ships before the deadline (in progress)

| Item | State |
|---|---|
| S1.5 business-logic fixes (18 tasks, audit of 2026-10-26) | 15 merged; Tasks 13, 14 and the e2e part of 15 finishing; then final review and release to `zggylkbgajamhriebdrg` + `sanctus.warpkit.online` (owner go-ahead given) |
| AR button fix ("View in my home" launches AR again) | merged |
| Static Privacy Policy and Terms (EN, pt-PT), footer links, "I agree" ticks | merged |

## S2: trimmed

**Keep**
1. Privacy Policy and Terms: done (drafts for the client's lawyer; placeholders for company facts).
2. "Working business logic": the audit fixes that were moved to S2 (see `docs/superpowers/plans/2026-10-26-business-logic-fixes.md`, "Moved out of S1.5"):
   - old catalog and product addresses redirect to the new ones, so printed QR codes keep working (BIZ-04, PUB-03/PROD-06);
   - "catalog unavailable" page instead of "not found" for a paused business (PUB-02/BIZ-03);
   - view-only staff see a read-only business form; field limits shown on the form (BIZ-05, BIZ-09);
   - logo uploaded before the business exists is moved; a partial file clean-up is reported (BIZ-06);
   - public-page fixes: stale product page after unpublish, image refresh, CTA label, address case, `noindex` for embed/preview, PT sort order (PUB-04, 05, 07, 08, 09 header, 10);
   - closure wording for the owner (BIZ-08), demo business delete (BIZ-10 part).

**To confirm with the owner** (they are business logic or make the legal text true; not in the owner's list either way):
- Business online/offline switch plus platform suspend (the owner asked for it earlier in S2 design).
- Platform inbox setting: closure alerts currently go to a test address that nobody reads.
- The privacy must-haves that the Privacy Policy text promises (`docs/legal/drafts/README.md`, "What the app must do"):
  - a "Report content" link;
  - a reason stored with staff takedowns;
  - self-hosted fonts and 3D decoders;
  - automatic deletion of old security logs;
  - deleting the profile photo on closure.

  Without them the published text is not true.
- The product-editor audit fixes that were moved to S4 (two people editing at once, unnamed finishes, remove-finish confirm, default finish label, address-change confirm, error copy).

**Dropped**: maintenance mode, applications open/closed, email sender/reply-to and per-email switches, email log page, new-business defaults, product limit, CSV exports, Site & SEO settings.

## S4: 3D model requests

**Keep**
1. **Request a 3D model.** A business sends 2–10 photos (separate from catalog photos) and asks the platform to make the model for a product.
2. **Admin uploads and notify.** Platform staff upload the finished GLB/USDZ to the request. The business is emailed, and the product's 3D/AR shows only once the model is ready.
3. **Allow own upload switch.** Per business: may it upload its own 3D files, or must it request them?

**Dropped / later**: none of the other S4 ideas.

## AR: audit and fix

- The AR button was fixed (see above). Still to audit, with real devices:
  - the Android Scene Viewer hand-off;
  - iPhone Quick Look with and without a USDZ;
  - the signed-URL token in the Android launch link;
  - the AR button sitting below the fold on phones.
- The audit report goes to `docs/audits/2026-10-26-ar/`. Fixes stay within ADR-0021: native only, no WebXR, no AR-mode change without the owner's go-ahead.

## How it runs

- Each item gets a short spec, then a plan, then parallel build agents in separate worktrees, then a task review and a final whole-branch review. Parallelism is limited by machine memory.
- Release to `zggylkbgajamhriebdrg` and `sanctus.warpkit.online` follows the runbook. Nothing goes to `main` or production without the owner.
