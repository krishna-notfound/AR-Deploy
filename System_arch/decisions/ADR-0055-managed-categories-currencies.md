# ADR-0055: Product categories and currencies are admin-managed lists
- **Status:** Accepted
- **Date:** 2026-11-09
- **Affects:** design/19-supabase.md, design/12-features-admin.md, design/04-domain-model.md

## Context
The seven product categories and the three currencies (EUR, BRL, USD) were fixed in the code (`CATEGORIES`, `CURRENCIES`) and in database check constraints (`products.category`, `products.currency`, `businesses.default_currency`). The client asked (round 2, 2026-11-09) for categories the admin can manage, with an "Other" for what does not fit, and for a choice of currencies. Changing either list meant a code release and a migration.

## Decision
- **Two tables**, read by everyone (anon and signed in), written only through the Editor gate that already protects website content: the staff 2FA step and the platform permission `content.manage` (`public.can_manage_site_content()`, RLS policies for insert, update and delete). Migration `managed_lists` (with rollback and a PGlite test).
  - `product_categories (slug pk, label_en, label_pt, sort, active, created_at)`, seeded with `sofa, chair, table, bed, storage, lighting, decor` and `other`. `products.category` now references it (`on update cascade`); the old check constraint is gone.
  - `currencies (code pk 'AAA', enabled, sort)`, seeded with EUR, BRL, USD enabled and 42 more ISO codes disabled (including AOA, MZN and CVE for the Portuguese-speaking markets). `products.currency` and `businesses.default_currency` reference it.
- **One label per language, used everywhere** (not separate singular and plural forms). The old dictionaries had a plural for the public filters ("Sofas") and a singular for the dashboards ("Sofa"); two forms per language would double the admin form and cannot be filled in correctly for arbitrary new categories in two languages. The seed uses the singular, so the public filter chips now read "Sofa", "Chair" (and "Sofá", "Cadeira"). The public dictionary keys `category.*` stay as the fallback while the list loads, and are now singular too, so nothing changes when it arrives.
- **"Other" is permanent:** it cannot be deleted, hidden (a check) or given another slug (a trigger); its names can be edited.
- **Deleting a category in use:** `public.admin_delete_category(slug)` (SECURITY DEFINER, Editor gate first, `search_path = ''`, not executable by anon) moves its products to `other`, then deletes the category and returns how many moved. A direct `delete` of a category that products use is refused by the foreign key.
- **Hiding** (`active = false`) removes a category from pickers (editor, import) and from the public filter chips; products already in it keep it and still show its name, and an editor of such a product still offers it.
- **Disabling a currency** that rows use is allowed: existing rows keep it, it only stops being offered (an editor of such a row still offers it). The last enabled currency cannot be switched off (trigger). Formatting stays `Intl.NumberFormat`; the currency's name in the admin screen is `Intl.DisplayNames`, so no names are stored.
- **Code:** `Category` and `Currency` become `string`; `BUILTIN_CATEGORIES` stays for the seed, the landing's built-in collections and the loading fallback (`CATEGORIES` and `CURRENCIES` are kept as deprecated aliases). A `lists` service (`getCategories`, `saveCategory`, `reorderCategories`, `deleteCategory`, `getCurrencies`, `setCurrencyEnabled`; demo and Supabase) and the hooks `useCategories`, `useCategoryLabel`, `useCurrencies` (one shared cache, refreshed each time a page that needs it opens, built-ins as the fallback while loading or after a failed read) feed the editor, the filters, the import, the catalogue and every place that showed a category name.
- **CSV import:** a category is matched against the visible categories of the list by slug, English or Portuguese name, plural or the old spellings (without case or accents); a currency against the enabled ones. A category that matches nothing, or is blank, keeps the row's error (nothing is guessed); the safety fallback of the draft builder is `other`, no longer `decor`.
- **Landing links:** a landing collection's catalogue link accepts any slug-shaped category, in the TypeScript check and in the SQL publish gate (`private.validate_site_content` is patched in place by the migration, so it does not depend on which migration defined it last).
- **Admin console:** one navigation entry, "Categories & currencies" (`/admin/lists`, `content.manage`), with two tabs. Categories: add (English and Portuguese name, both required), rename, move up and down, show or hide, delete with a confirmation that says the products move to "Other". Currencies: searchable list, a switch each.

## Consequences
- Good: the client's admin can add categories and currencies without a release; the database stays the authority (foreign keys), so a typo can never reach a product; the rules are the same in demo mode.
- Trade-off: the public catalogue and product pages now read two small lists on load. They are cached for the page and the built-ins show first, so there is no layout wait.
- Trade-off: the public filter wording changes from plural to singular for the seeded categories (see above).
- Trade-off: reordering writes one row per category (not one transaction); a failure in the middle leaves a valid but partly moved order, which the next reorder fixes.
- The rollback refuses to run while a product uses a category outside the original seven or a product or business uses a currency outside EUR, BRL and USD.

## Alternatives rejected
- Plural and singular labels per language: see above.
- Storing the category list inside the website-content document: it is not content that is published in versions, and products need a real foreign key.
- Free-text categories: no filters, no labels in two languages, typos.
- A `currencies` row per country with names and symbols: `Intl` already knows them.
