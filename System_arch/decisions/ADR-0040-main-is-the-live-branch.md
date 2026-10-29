# ADR-0040: `main` is the live branch, on the client's database, which holds real client data
- **Status:** Accepted (owner, 2026-10-27); the "Real client data" bullet is superseded by ADR-0042 (the current setup is the testing environment, 2026-10-29)
- **Date:** 2026-10-27
- **Affects:** CLAUDE.md (Status), System_arch/HANDOFF.md (Live state), design/20-deployment.md, docs/OPERATIONS_RUNBOOK.md

## Context
Until 2026-10-27, `sanctus.warpkit.online` was attached to the branch `feature/sanctus-brand-design-system` (Vercel Preview, client database `zggylkbgajamhriebdrg`). Meanwhile `main` (last updated 2026-10-14) built Production against the old dev database `pmnjchhrgvajtjpadpqo`. The owner asked to merge everything to `main` and serve the live domain from it. The owner also confirmed that the client database already holds the client's real data.

## Decision
- **`main` is the live branch.** It was fast-forwarded to the feature branch on 2026-10-27 (`85363e4`, then `ca7b2ea`). Vercel Production (the owner's personal project `ar-deploy`, team `track0`) builds `main` and serves `sanctus.warpkit.online`, `builtbykrishna.dev` (with `www` and `*`) and `ar-deploy-sage.vercel.app`.
- **`sanctus.warpkit.online` moved from the feature branch to Production** (Vercel domain setting `gitBranch: null`). DNS is unchanged.
- **Production uses the client database.** The owner set `VITE_DATA_MODE`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the client project's values; Production was redeployed and the built code was checked to point at `zggylkbgajamhriebdrg`.
- **Real client data** (superseded by ADR-0042: the current setup is the testing environment). `zggylkbgajamhriebdrg` holds the client's live businesses, products, models and accounts. Read-only checks are fine. Any insert, update, delete, function deploy or storage change needs the owner's explicit OK for that action. Nothing is called "test content" as a fact without the owner confirming it.
- **Pushing to `main` deploys the live site**, so it happens only when the owner asks. Feature branches get Vercel Preview URLs for checks first.
- **Later:** hosting moves to the client's own Vercel account. The same three `VITE_*` values are set there and the client's domain is attached; the Supabase Auth Site URL and redirect URLs must then list that domain.

## Consequences
- Good: one branch, one database, one set of addresses; what the client sees is what `main` holds.
- Good: the check for which database a build uses is simple: grep its JS chunks for `https://<ref>.supabase.co`. Which deployment a domain serves: `npx vercel api "/v13/deployments/<domain>?teamId=track0"`.
- Trade-off: there is no staging database, so every live check runs on real client data and must be read-only unless the owner approves a write.
- Trade-off: Production is on the owner's personal Vercel account and domain (`builtbykrishna.dev`) until the move to the client's account.

## Alternatives rejected
- Keep the live domain on the feature branch: two live sources of truth, and `main` would keep building against the old database.
- A separate staging Supabase project now: needs a paid plan or a new project from the client (OPERATIONS_RUNBOOK), not available yet.
