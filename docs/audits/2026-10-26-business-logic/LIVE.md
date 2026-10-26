# Live data sweep (zggy, read-only, 2026-10-26)

Counts: businesses active 1, draft 7; applications approved 8 (none pending/rejected); products published 5, draft 2;
product-media objects 12, 0 orphans; logo orphans 0; no duplicate product slugs; units cm only; currency EUR only.

Observed states to explain against the code audit:
- L1 approved application `ABE43EC0` ("QA Email Test Atelier") has `business_id = null` (business deleted later? on delete set null). Does the admin view say so honestly, and can it be re-approved?
- L2 business "idk" (draft, 2026-10-20) has no member at all (no owner). Is an ownerless business a valid state, and does the admin see a way to assign one?
- L3 product "sadasd" is `published` inside draft business "idkidk". Valid by rule (hidden until active)? What does the owner dashboard say?
- L4 published without any model: "QA Barn Lamp — photos only" (no model at all) and "sadasd"; "QA Lounge Chair" has models only on variants. Is photo-only publish the rule (ADR/decision), and do readiness/AR labels stay honest?
- L5 four owner invites never accepted since 2026-10-20/22 on draft businesses. Is there resend / expiry / visible "invite pending" for the admin?
