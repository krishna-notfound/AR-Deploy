# ADR-0051: Add many products at once from a CSV
- **Status:** Accepted
- **Date:** 2026-11-05
- **Affects:** design/12-features-admin.md, design/15-product-editor.md, tasks/ (client feedback 2026-11-05, piece 3)

## Context
The client has catalogues of dozens of pieces and adding them one by one in the product editor is slow. The client asked for a way to add many products at once (feedback 2026-11-05). Supabase stays the only backend (ADR-0015) and no new dependency is allowed without an ADR.

## Decision
- A shared screen "Import products" (`ProductImportPage`, one component for both dashboards) at `/admin/products/import` (needs `products.edit`; the admin chooses the business first) and `/dashboard/products/import` (the signed-in business). An "Import" button sits beside "Add product" on both product lists.
- Input is a CSV file or pasted CSV: UTF-8 (a BOM is dropped), comma or semicolon (read from the first line), RFC 4180 quoting, CRLF or LF. The parser is a small own module, `src/lib/csv.ts` (`parseCsv`, `toCsv`); no dependency.
- Columns (header names without case, unknown columns ignored): `name_en`, `name_pt`, `category`, `price`, `currency`, `width`, `height`, `depth`, `unit`, `short_en`, `short_pt`, `description_en`, `description_pt`, `material_en`, `material_pt`, `cta_label_en`, `cta_url`. `name_en` and `category` are required. Numbers accept a comma decimal. "Download template" gives the header and one example row.
- Rows become a typed `ImportRow[]` (`src/features/products/import/importRows.ts`), then drafts: the slug comes from the English name and is unique inside the business and the file, the currency defaults to the business's, the call-to-action button defaults to the editor's. A preview table shows each row's status; a row with a problem (the reading rules plus `validateProductDraft`, the editor's own draft rules) is not created.
- "Create N drafts" calls `service.createProduct` one row at a time with a progress bar and a Cancel button (leaving the page also stops it after the row being saved). The end summary lists what was created (link to each editor) and what was not and why. Everything is a draft with no photos and no 3D files; nothing is published.
- At most 200 rows per import; a bigger file is refused with a message.
- No migration, no Edge Function: the existing `createProduct` path and its RLS apply to every row, so the import cannot do more than the editor can.

## Consequences
- Good: a catalogue of 200 pieces is a spreadsheet plus one click; the same validation as the editor; both dashboards share one screen.
- Good: no server work, so the import is exactly as safe as saving a product by hand.
- Trade-off: one request per row (200 sequential saves take a while); the progress bar and Cancel make that visible.
- Trade-off: photos and 3D files are still added product by product afterwards.
- Trade-off: rows cannot be edited in the preview; fix the file and choose it again.

## Alternatives rejected
- A spreadsheet library (xlsx): a new dependency and a large bundle for something a 60-line parser does; the client can export CSV from any spreadsheet.
- A bulk Edge Function or database function: more surface (another place to enforce the editor's rules) for no gain at 200 rows.
- Editing rows in the preview: duplicates the product editor; fixing the file is simpler.
