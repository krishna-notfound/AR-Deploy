# ADR-0068: New variant from the 3D model request form
- **Status:** Accepted
- **Date:** 2026-11-13
- **Affects:** design/15-product-editor.md, docs/CLIENT_HANDOVER.md, ADR-0034 (amended, still valid)

## Context
Client report (2026-11-13): a business could not send a second 3D model request for the same product ("there is already an open 3D model request"). They want a model for another version of the product, such as another colour or finish. ADR-0034 allows one open request per target (the product, or one of its saved variants), and the request form offered only the product and the variants already saved, so a new version meant leaving the form, adding a variant in Colours and variants, saving, and coming back.

## Decision
- **The rule stays:** one open model request per product or per variant (ADR-0034, `model_requests_one_open_idx`, `request_model` raises `model_request_open`). No migration.
- **"New variant" in Model for.** The request form (`ModelRequestPanel`, shared by every dashboard that shows it) lists the product, each saved variant without an open request, and "New variant". Choosing it shows the variant's name in English (required, free text: a colour, a finish, a size, anything the business calls a version), an optional Portuguese name and an optional colour swatch (off by default). The rules are the editor's (`validateNewVariant`): an English name, a hex swatch when given, at most 50 variants; a name used by another variant is allowed, as in the editor.
- **One step, two writes.** Send first adds the variant through the new service method `addProductVariant` (demo and Supabase), then requests its model with that variant as target. In Supabase, `addProductVariant` reads the stored product and saves it through `save_product` with one more variant and `keep_models: true`, so nothing else changes, 3D files included, and the permission is the product save's. The editor takes the new variant into its form and its saved snapshot, so the form's saved state does not change and the next save keeps the variant (and an unsaved edit stays unsaved).
- **Partial failure is said plainly.** If the variant is added but the request fails, the form says "“Name” was added to Colours and variants, but its 3D model request wasn't sent: <reason>", keeps the photos and selects the new variant, so a retry sends only the request. The variant stays: it is a real variant now.
- **Guidance.** The `model_request_open` message (EN, PT-PT) now ends with "choose New variant under Model for". When the product and every saved variant already have an open request, one line above the form says a new variant can be requested for another version. At 50 variants, "New variant" is not offered.
- Double clicks send once (the form locks and a send in flight ignores another click). A product not saved yet keeps "Save this product first".

## Consequences
- Good: a business gets a model for another version of a product in one step, without leaving the request form; the one-open-request rule and its database guard are unchanged.
- Good: no migration and no new permission: the variant is written by the same `save_product` path as the editor's save.
- Trade-off: the two writes are not one transaction. A request that fails after the variant was added leaves the variant without a request; the form says so and the retry is one click.
- Trade-off: the panel is shown in the business dashboard only (as before); staff add variants in the editor and manage requests from the queue.

## Alternatives rejected
- Allow several open requests per product or variant: drops ADR-0034's rule (owner, 2026-11-13: keep it).
- A database function that adds the variant and the request in one transaction: needs a migration and duplicates `save_product` and `request_model` checks; the visible partial-failure message covers the gap.
- Colour-only variants (a swatch required): the client decides what a version is (colour, finish, size).
