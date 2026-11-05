# Client feedback 2026-11-05: five pieces

Source: the client's messages of 05 Nov (relayed by the owner). Owner answers the same day: build all five, in the order 1 → 2 → 3 → 4 → 5, each as its own merge so any piece can be reverted alone; do not touch the per-company "own 3D models" switch; when a product's button is hidden, show nothing; no mobile or page redesign, only the "Sanctus" lettering after the client's logo (`public/brand/sanctus-logo-source.jpg`, the same file the favicon was made from).

Every piece follows the project rules (CLAUDE.md): EN + PT-PT texts through `t()`, data only through `src/services`, demo mode keeps working, every data view has loading/empty/error states, schema changes in a new migration with RLS and explicit grants plus a rollback, decisions recorded (ADR + `docs/DECISIONS.md` row) in the same change.

## Piece 1 — collection page and the product button switch (bounded)

- `/collections/:slug` no longer shows the collection's own picture: back link, eyebrow, title, short text, then the product grid and the one closing Apply banner. Landing cards keep their pictures.
- Products get `cta.hidden` (TypeScript `Product.cta: { label; url?; hidden?: boolean }`), column `products.cta_hidden boolean not null default false`, saved through the latest `save_product` RPC (replaced in a new migration `product_cta_hidden`, with rollback). Mock service and both mappings carry it.
- Product editor, Call to action section: switch "Show the button on the product page" (on by default). Off: the label and link fields stay but are disabled.
- Public pages (business product page, `/showcase/:slug`, embed): when hidden, neither the link button nor "Contact the store" is shown. Share stays.
- Record: `docs/DECISIONS.md` row.

## Piece 2 — PDF catalogue in the application form (ADR-0050)

- The company may attach one PDF catalogue (optional, at most 20 MB, `application/pdf`) on the application step "Your catalogue".
- Storage: new private bucket `application-files` (20 MB, `application/pdf` only). No `storage.objects` policy for anon/authenticated insert; staff with `applications.view` may read (`platform_can`, staff 2FA gate as the other staff reads).
- Upload: new Edge Function `application-upload` (verify_jwt false): body `{ submissionKey, size, contentType }`, refuses anything but a PDF up to 20 MB, counts against the same per-IP attempt limit as applications (`service_application_attempt`), returns a signed upload URL for `pending/<submissionKey>/catalogue.pdf` (supabase-js `createSignedUploadUrl`). The browser uploads the file directly with it and shows progress, the file name and Remove.
- `submit-application` accepts `cataloguePath`; it must equal `pending/<submissionKey>/catalogue.pdf`, exist, be a PDF and at most 20 MB, else `invalid_application` on field `catalogue`. Stored in new column `business_applications.catalogue_path` (nullable). Existing behaviour without a catalogue is unchanged.
- The form builder treats it like the other optional built-in fields (can be hidden or made required; it is not a locked field). `_shared/applyForm.ts` and the client copy stay one source.
- Admin application detail: "Product catalogue (PDF)" opens a short-lived signed URL; "No catalogue attached" otherwise.
- Demo mode: the mock keeps the file in memory for the session (labelled session-only).
- Migration `application_catalogue` (bucket, column, policies) + rollback; deploy `application-upload` and `submit-application` after the migration.

## Piece 3 — add many products at once (ADR-0051)

- A new "Import products" screen reached from the Products list in the admin (`/admin/products/import`, business chosen first) and in the business dashboard (`/dashboard/products/import`, own business).
- Input: a CSV file or pasted CSV (UTF-8, comma or semicolon, quoted fields; a small parser in `src/lib/csv.ts`, no new dependency). A "Download template" link gives the header row and one example row. Columns: `name_en, name_pt, category, price, currency, width, height, depth, unit, short_en, short_pt, description_en, description_pt, material_en, material_pt, cta_label_en, cta_url`. Unknown columns are ignored; `name_en` and `category` are required, the rest optional.
- Preview table: one row per product with its own errors (same rules as the product editor's draft validation); rows with errors are not created. "Create N drafts" creates them one by one as drafts (no photos, no 3D), shows progress, and ends with a summary listing what was created (links to each editor) and what failed and why. Nothing is published.
- At most 200 rows per import. The screen is the shared feature for both dashboards (not duplicated).
- The preview takes its rows from a typed `ImportRow[]`, so piece 5 can fill the same preview.

## Piece 4 — "Sanctus" in the client's lettering (ADR-0052)

- Reference: `public/brand/sanctus-logo-source.jpg`: a high-contrast display serif, fine hairlines, thick-and-thin strokes, and the distinctive A–N join (the N's diagonal sweeps up into a curl).
- Render "SANCTUS" in candidate open-licence fonts (OFL, Google Fonts) next to the logo, pick the closest by eye, and rebuild the `Wordmark` SVG path (`src/components/ui/BrandMark.tsx`) from that font with the A–N curl drawn after the logo. Keep the current composition (size use, spacing approach, where the wordmark appears); only the letterforms change. The SVG path is generated once with a dev-time script outside the app; no font file or dependency is shipped for the wordmark.
- Check every place the wordmark shows (site header and footer, sign-in, dashboard sidebar, mobile menu, emails if they use it) at desktop and phone width; re-record the visual baselines that change on purpose.
- The favicon stays as it is.

## Piece 5 — read products out of the PDF catalogue (ADR-0053)

- On the Import screen (piece 3), staff only (`products.edit`, staff 2FA): "Read a PDF catalogue" with a PDF upload (at most 20 MB), or "Use the catalogue from the application" when the business came from an application with a catalogue.
- New Edge Function `catalogue-extract` (verify_jwt true): checks the caller is platform staff with `products.edit` and AAL2; reads the PDF (uploaded to `application-files/imports/<uuid>.pdf` with a signed upload URL, or the application's stored file); sends it to Claude through the official SDK `npm:@anthropic-ai/sdk@1.1.0` (ADR, as for every new dependency): model `claude-opus-5-5`, `output_config.effort: "medium"`, structured JSON output (`output_config.format` with a JSON schema of `{ products: ImportRow-like[] }`), streaming with `finalMessage()`, server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`), the PDF as a base64 `document` block before the instruction text. Checks `stop_reason` (refusal, max_tokens) before reading the output; typed SDK errors mapped to the app's error codes.
- Returns rows into the preview of piece 3; staff review and edit nothing is created until "Create N drafts". The PDF is deleted after reading unless it is the application's own.
- Needs the secret `ANTHROPIC_API_KEY` in the Supabase project. Without it the function answers `not_configured` and the screen says that reading PDFs is not set up yet. Each catalogue read is billed by Anthropic (input tokens for every page); the owner and client decide on enabling it.
- Demo mode: the mock returns three sample rows labelled as sample data.

## Order and commits

Pieces 1–4 are built in parallel worktrees and merged in order 1, 2, 3, 4, each with a merge commit (`git revert -m 1 <merge>` removes one piece). Piece 5 starts after piece 3 is merged and is merged last. Migrations are applied and functions deployed after all checks pass, then `main` is pushed when the owner confirms.
