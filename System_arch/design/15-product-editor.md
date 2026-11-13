# 15 · Shared Product Editor (`features/products/ProductEditor`)
Read when: working on product create/edit for either dashboard.

The editor is one page with section nav (sticky on desktop). Localized fields use `EN | PT` tabs: EN is required, PT is optional.

1. **Business** (super admin only)
   - Required select.
   - Locked after the first save.
   - `?business` preselects it.
2. **Basic info**
   - Name.
   - Slug: auto-generated, editable, unique within the business.
   - Short description and full description.
   - Category.
   - Price: decimal input, stored in minor units.
   - Currency.
3. **Images**
   - `ImageUpload` for the gallery: thumbnails, set primary, remove, invalid-file errors.
   - A second `ImageUpload` for additional photos.
4. **3D models**
   - Two slots: GLB and USDZ. Each shows filename, size, a status badge, an "Or paste model URL" field, and Remove.
   - Info box: "GLB → web 3D viewer and Android AR (Scene Viewer). USDZ → iOS AR Quick Look."
   - Empty state with guidance when no model is uploaded.
   - `ModelPreview`: model-viewer without AR, plus the scale check from [09-3d-ar.md](09-3d-ar.md).
   - Business dashboard: the **Request a 3D model** panel (`ModelRequestPanel`, ADR-0034; spec `docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md`). One open request per target (the product or one variant). **Model for** lists the product, each saved variant without an open request, and **New variant** (ADR-0068, 2026-11-13): an English name (required, any text: colour, finish, size), an optional Portuguese name and an optional colour swatch. Send adds the variant through `service.addProductVariant` (`save_product` with one more variant and `keep_models`; same permission as a save) and then requests its model. The editor takes the new variant into its form and saved snapshot (`withAddedVariant`), so the form's saved state is unchanged and the next save keeps it. A request that fails after the variant was added says so and keeps the variant selected for a retry. When every target has an open request, one line explains New variant.
   - **No** compress or AI buttons. One convert button only (ADR-0039): when a GLB is uploaded and no USDZ, the USDZ slot shows **"Build from GLB"**. It builds a real .usdz in the browser (three.js `USDZExporter`, Quick Look compatible, at most 50,000 triangles and 1024 px textures, metres kept) and sends it through the normal USDZ upload and validation. The slot then reads "Built from the GLB" with the date; the business can upload its own USDZ instead, or rebuild after changing the GLB.
5. **Dimensions & specs**
   - W, H, D: required, > 0.
   - Unit: cm or in.
   - Material: localized.
   - Weight: optional value and unit.
   - Variants: localized name, colour hex, optional SKU. Add, remove, and reorder.
6. **Call to action**
   - Label: localized, default "Contact seller".
   - Optional URL, must match `https?://`.
7. **Sticky publishing bar**
   - Status badge.
   - **Save draft**.
   - **Preview**: opens `productLocalPath?preview=1` in a new tab.
   - **Publish / Unpublish**. Publish validates the invariants in [04-domain-model.md](04-domain-model.md). On success, a dialog shows the `productPublicUrl` (Demo URL) with Copy and Open preview.

Other behaviour:
- **Validation:** errors show inline per field, plus a summary at the top with links to the fields. When the service returns `VALIDATION` with `fieldErrors`, map them onto the fields.
- **Unsaved changes:** guard navigation with React Router `useBlocker`.

## Model checks and optimization (2026-10-13)
- **Scale check:** a mismatch names the likely cause: W/D swapped, the other unit, a model in cm/mm, or a uniform factor (`lib/scale.ts`). Tolerance is the larger of 5% and 1 cm. The model is never rescaled automatically.
- **Fix the scale at upload (2026-11-09, ADR-0058):** after optimization a GLB is measured in the worker (`measureGlb`); `scaleProposal` (`lib/scale.ts`) triggers on a side over 10 m, a whole model under 1 cm, or a match to the entered dimensions after x0.001 / x0.01 / x0.0254. `ScaleFixPanel` (in `ModelSection`) then offers Convert from mm / cm / inches, a custom factor, or Keep as is, with the resulting size, before anything is uploaded. `applyUniformScale` (worker) puts the default scene's roots under one scale node; geometry is untouched and the result is re-measured. Rescaling only ever happens on that choice.
- **Scene Viewer check:** a GLB that *requires* a glTF extension Scene Viewer doesn't support gets a warning on upload (`lib/files.ts unsupportedForSceneViewer`).
- **Optimization:** on by default; `VITE_MODEL_OPTIMIZATION=off` disables it (ADR-0019, switched on and extended with triangle reduction by ADR-0038, owner 2026-10-26). It runs in a worker, shows the sizes before and after, and offers "Upload the original instead".
- **Business locked after uploads:** once files are stored, the business select is locked (files live under `{businessId}/`).
- **Unit switch:** the cm/in switch labels the numbers; it does not convert them (the section text says so).

## Import many products from a CSV (2026-11-05, ADR-0051)

- Screen `ProductImportPage` (shared; `scope` admin or business) at `/admin/products/import` and `/dashboard/products/import`, opened by an Import button beside Add product. Admin picks the business first.
- `src/lib/csv.ts` reads and writes CSV; `features/products/import/importRows.ts` maps the columns to `ImportRow[]`, adds the editor's draft rules (`validateProductDraft`) and makes unique slugs. Up to 200 rows; rows with problems are not created.
- Rows are created one by one with `service.createProduct` as drafts (no photos, no 3D), with progress, Cancel and a created/failed summary. Nothing is published.
