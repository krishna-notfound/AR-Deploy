# ADR-0042: The current setup is a testing environment
- **Status:** Accepted (owner, 2026-10-29, relaying the client)
- **Date:** 2026-10-29
- **Affects:** ADR-0040 (supersedes its "real client data" bullet), System_arch/HANDOFF.md (Live state), design/20-deployment.md, docs/OPERATIONS_RUNBOOK.md

## Context
ADR-0040 (2026-10-27) recorded that the Supabase project `zggylkbgajamhriebdrg` held the client's real data, so every write needed the owner's OK. On 2026-10-29 the owner reported that the client says everything is a testing environment: "client said everything is on testing env yes we are in testing we just flash the supabase and vercel i am using mine".

## Decision
- **Testing environment.** The live site (`main` → `sanctus.warpkit.online`, `builtbykrishna.dev`, `ar-deploy-sage.vercel.app`) and `zggylkbgajamhriebdrg` are the testing setup. Their businesses, products, models and accounts are test data, including the `idk` catalog.
- **Writes:** test writes the owner asks for (uploads, products, re-uploading the chair) are fine. Wiping or resetting the database or storage, deleting businesses or accounts in bulk, applying migrations and deploying functions still need the owner's go-ahead for that action.
- **Vercel:** Production runs on the owner's personal project `ar-deploy` (team `track0`), unchanged from ADR-0040.
- **Supabase:** `zggylkbgajamhriebdrg` stays in the client's organisation ("Sanctus"); no change.
- **Going live (open):** the owner said the Supabase and Vercel will be "flashed" for go-live. Whether that means new projects or a reset of these ones, and when, is not decided yet. Until then nothing is wiped.

## Consequences
- Good: the AR and model checks can run on this setup without treating each test upload as a change to live client data.
- Trade-off: real customers must not be sent to these addresses as the final site until the go-live plan is decided and carried out.
- Still true from ADR-0040: pushing `main` deploys the live site, so it happens only when the owner asks.

## Alternatives rejected
- Keep the ADR-0040 rule that every write needs approval: it no longer matches the data, and slows the testing the owner is doing.
