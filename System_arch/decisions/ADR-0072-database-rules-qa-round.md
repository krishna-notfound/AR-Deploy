# ADR-0072: Database rules that only the browser or a convention enforced (QA round of 2026-11-14)
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/19-supabase.md (RLS, publish rules, lists), `supabase/migrations/20261114123349_qa_database_rules.sql`, `src/services/supabase/supabaseCatalogService.ts` (DB_RULES), `src/features/products/editor/ProductEditorForm.tsx`, ADR-0054, ADR-0055

## Context
The external QA report of 2026-11-14 found rules that held only in the browser (or by convention) and could be bypassed through the Data API: a published product could lose its GLB, hidden categories and disabled currencies could be written, localized text could be `null` or a number (crashing public pages), the 10-device push cap could be skipped, two simultaneous approvals could pick one slug, `cancel_model_request` answered 500 for an unknown request, and several form rules (description length, e-mail shape, URL host, social domains) had no server check.

## Decision
One migration, `20261114123349_qa_database_rules.sql`, with a rollback in `supabase/rollback/20261114_qa_database_rules_rollback.sql`:
1. `private.platform_invites` gets row level security (no policies), like the other private tables.
2. Eight foreign keys to `auth.users` get an index.
3. `cancel_model_request` raises `model_request_not_found` with P0001 (PostgREST: 400) instead of P0002 (500). The client reads the reason from the message, so it is unchanged.
4. **A published product keeps its GLB** (completes ADR-0054, which says "saving a published product that has a model cannot remove it"): a deferred constraint trigger refuses, at commit, a delete or change of the last glb row of a published product (`publish_needs_model`). Products published without a GLB before the rule are untouched (no glb row exists to remove).
5. Localized columns (`products.name, short_description, description, material, cta_label`, `product_variants.name`): `en` must be a string, `pt` absent or a string (CHECK, NOT VALID).
6. `private.unique_business_slug` takes a transaction-level advisory lock, so concurrent approvals cannot pick the same slug.
7. `push_subscriptions` keeps at most 10 rows per user by an insert trigger (the same rule `register_push_subscription` applied).
8. **Managed lists (ADR-0055):** a NEW `products.category` must be an active category and a NEW `products.currency` an enabled currency (`category_hidden`, `currency_disabled`, 23514). A product that already holds a hidden category or a disabled currency keeps it; only an insert or a change is checked. `businesses.default_currency` is not checked (approval creates businesses with the default currency, which may be switched off).
9. Form rules also in the database: business description at most 1000 characters (trimmed, the editor's limit), contact e-mail shape, website and CTA URL need a host, and the Website Editor's social links must be on the network's own domain (`private.social_url_ok`, called from `private.validate_site_content`, patched in place).

New CHECK constraints are NOT VALID: new and changed rows are held to them, existing rows are not scanned (the migration header lists the queries to find offenders before validating).

## Consequences
- Good: the API can no longer store what the UI refuses; public pages cannot receive non-string text; approvals cannot collide.
- Trade-off: an existing row that breaks a new constraint (for example a business e-mail with no dot in the domain) fails its next update until fixed; the header lists the checks to run before applying.
- Trade-off: removing a published product's GLB needs the product to be unpublished first. The editor shows the existing "models" field message.
- Trade-off: `pg_trigger_depth() > 1` skips the list check for the foreign key's own cascade (renaming a category slug).
- Not changed (needs an owner decision): the internal company description stays readable by every signed-in user (ADR-0054 accepted it); see `docs/qa/2026-11-14-database-rules.md`.

## Alternatives rejected
- Redefine `save_product` for the list checks: a 170-line function already redefined seven times; a trigger on `products` covers every writer.
- Unpublish automatically when the last GLB is removed: silent data change; the owner chose "publish or not, his choice".
- A retry loop on the slug unique violation: the advisory lock is smaller and serialises every caller of the helper.
- `VALIDATE CONSTRAINT` in the migration: would fail the whole migration on one legacy row and take locks on live tables.
