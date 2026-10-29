# ADR-0042: The current setup is the testing environment; production is set up fresh at go-live
- **Status:** Accepted (owner, 2026-10-29)
- **Date:** 2026-10-29
- **Affects:** ADR-0040 (supersedes its "Real client data" bullet), System_arch/HANDOFF.md (Live state), design/20-deployment.md, docs/OPERATIONS_RUNBOOK.md

## Context
ADR-0040 (2026-10-27) recorded that the Supabase project `zggylkbgajamhriebdrg` held the client's real data. On 2026-10-29 the client wrote: "Please keep the testing environment separate from production. No final production deployment or significant production changes should be made without my explicit approval." The owner and I compared one project against a separate dev project (a second project costs $0 on the Supabase Free plan, about $10/month on Pro; setup about 2–3 hours). The owner decided: "we just keep working on same then when everything work we flash everything and make things new".

## Decision
- **No separate dev Supabase project for now.** The current setup is the testing environment: the site from `main` (`sanctus.warpkit.online`, `builtbykrishna.dev`, `ar-deploy-sage.vercel.app`) and the Supabase project `zggylkbgajamhriebdrg`. Its businesses, products, models and accounts are test data, including the `idk` catalog.
- **Production comes later, fresh.** When everything works, production is set up new ("flash"): a clean database and hosting. Whether that means new projects or a reset of these, and the date, is decided then.
- **The client approves production.** No final production deployment and no significant production change happens without the client's explicit approval, passed on by the owner.
- **Writes on the testing setup:** test writes for the work in hand are fine. Wiping or resetting the database or storage, bulk deletes, migrations and function deploys still need the owner's go-ahead for that action. Pushing `main` still happens only when the owner asks.
- Vercel stays on the owner's personal project `ar-deploy` (team `track0`); the Supabase project stays in the client's organisation "Sanctus", where the owner is Administrator.

## Consequences
- Good: no extra cost or setup now; testing is not slowed by treating test uploads as real client data.
- Trade-off: migrations are tried first on the testing project itself, with no separate rehearsal; a bad migration breaks the testing site until fixed.
- Trade-off: the go-live setup (migrations, functions, secrets, Auth settings, Vercel env) has to be done once more, and nothing real should be put on the testing setup in the meantime.

## Alternatives rejected
- A separate dev project now (Sanctus organisation or the owner's own): more reliable for repeated database changes, but the owner judged it not worth it while few changes remain.
- Keep treating the data as real (ADR-0040): no longer true per the owner and client.
