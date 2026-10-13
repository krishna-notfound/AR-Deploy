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
   - **No** convert, compress, or AI buttons.
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
- **Scale check:** a mismatch names the likely cause: W/D swapped, the other unit, a model in cm/mm, or a uniform factor (`lib/scale.ts`). Tolerance is the larger of 5% and 1 cm. The model is never rescaled.
- **Scene Viewer check:** a GLB that *requires* a glTF extension Scene Viewer doesn't support gets a warning on upload (`lib/files.ts unsupportedForSceneViewer`).
- **Optimization:** off unless `VITE_MODEL_OPTIMIZATION=on` (ADR-0019; client sign-off pending). It runs in a worker, shows the sizes before and after, and offers "Upload the original instead".
- **Business locked after uploads:** once files are stored, the business select is locked (files live under `{businessId}/`).
- **Unit switch:** the cm/in switch labels the numbers; it does not convert them (the section text says so).
