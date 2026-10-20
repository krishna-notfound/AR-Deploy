# Decisions

Architecture decision records live in `System_arch/decisions/` (index: `System_arch/decisions/README.md`). This file lists the owner-approved scope changes and product decisions taken during the production-readiness programme.

| Date | Decision | Approved by | Record |
|---|---|---|---|
| 2026-10-13 | AR uses native viewers only: Google Scene Viewer (Android), Apple Quick Look (iOS/iPadOS), interactive 3D viewer elsewhere. No WebXR, custom AR session or physics | Owner | ADR-0021 |
| 2026-10-13 | Business owners may self-register; new businesses are drafts until an admin activates them; existing businesses are claimed only via admin-issued single-use links. Scope change: the contract excluded self-service accounts | Owner | ADR-0022 |
| 2026-10-13 | Production sign-ups stay disabled; email confirmation stays on | Owner | ADR-0022 |
| 2026-10-13 | A separate free Supabase staging project is approved; production is changed only with per-change approval | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | "AR activation" analytics means a launch attempt (one per tap, 2 s guard), never a successful placement | Owner | docs/PRD.md R-29 |
| 2026-10-13 | No separate staging project: the live project `pmnjchhrgvajtjpadpqo` is used for staging tests until launch, then cleared. Every change there is approved one by one; public sign-ups stay off (test users are created in the dashboard) | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | Kept: admin approval before a business goes public, one pending draft per account (ADR-0022); separate per-business catalogs, no cross-business directory; variants stay colour + price until the client answers A-3 | Owner | this file |
| 2026-10-13 | No new Supabase project, plan upgrade, or pausing/deleting projects without approval; no Preview connected to production | Owner | docs/OPERATIONS_RUNBOOK.md |
| 2026-10-13 | Onboarding: display name (optional, skippable) stored in the account's own Auth metadata, no new table; then register a draft business or redeem a claim link | Owner (no-migration route) | src/features/auth/DisplayNameStep.tsx |
| 2026-10-13 | No analytics date-range picker: design/16 explicitly excludes it | Existing spec | System_arch/design/16 |
| 2026-10-13 | Variant price differences must be whole, non-negative amounts (parser and "+" display already assume this; 0 of 10 live variants negative) | Engineering | src/services/validation.ts |
| 2026-10-20 | Access model: Sanctus admins create owner accounts; no public self-registration or self-claim; exactly one owner per business; manual approval before listing. Supersedes ADR-0022 (to be recorded as ADR-0024 with the Phase 2 migration) | Owner | docs/PRODUCTION_AUDIT_AND_PLAN.md (C1) |
| 2026-10-20 | The client Supabase project `zggylkbgajamhriebdrg` (Sanctus AR, org `vxoqgtqqvgqlmfggxhdu`) is the development and integration target; no separate staging project for now (it is not live). The old project `pmnjchhrgvajtjpadpqo` stays untouched until cut-over | Owner | docs/PRODUCTION_AUDIT_AND_PLAN.md (C14) |
