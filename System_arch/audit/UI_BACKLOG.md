> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md.

# UI backlog (deferred during the functional phase, 2026-10-13)

Functional fixes in this phase changed UI text only where a message was false. Everything below is a visual or UX improvement left for the UI phase.

| # | Page | Current issue | Suggested improvement | Files |
|---|---|---|---|---|
| 1 | Product page, no-AR panel | "Open this page on your mobile device" is also shown on phones whose browser has no AR (e.g. Android Firefox) | Phone-aware copy: "Open in Chrome or Safari for AR" on mobiles | `features/public/ArSection.tsx`, `i18n/dictionaries/*` |
| 2 | Product page, scale badge | "True-to-size model" refers to the GLB. On iPhone, Quick Look shows the USDZ, which isn't measured | Small caption on iOS, or a tooltip | `features/public/ProductPage.tsx` |
| 3 | Product page, variants | Picking a colour changes the price only; the 3D model stays the base colour | After client decision A-3: label "3D shows the standard finish" | `ProductPage.tsx` |
| ~~4~~ | ~~WebXR session overlay~~ | ~~The new footprint outline isn't explained~~ **Obsolete:** WebXR session and footprint removed (f171db3) | — | — |
| 5 | Product editor, model upload | Large uploads show only "Checking file…" / "Optimizing model…", with no progress bar or cancel | Progress bar (Supabase upload progress) and a cancel button | `features/products/editor/ModelSection.tsx` |
| 6 | Product editor, dimensions | The unit switch relabels the numbers (now explained in the section text) | Show the converted value next to each field when switching | `ProductEditorForm.tsx` |
| ~~7~~ | ~~Product editor, precise placement~~ | ~~The "Precise placement (beta)" link (after A-1) is a plain text link~~ **Obsolete:** no such link; native-only AR (owner, 2026-10-13) | — | — |
| 8 | Catalog cards | The "3D" badge also shows when the model link couldn't be created (signing failure) | Badge only for models with a usable URL | `features/public/CatalogPage.tsx` |
| 9 | Accessibility | 5 advisory lint warnings: a non-interactive element with `tabIndex` in ProductMedia, a control without a label in Form | Fix during the UI pass; add an axe check to E2E | `ProductMedia.tsx`, `components/ui/Form.tsx` |
| 10 | Dashboards on mobile | Only the drawer and the product page have mobile E2E tests | Mobile pass on the editor and analytics | `tests/e2e/*.mobile.spec.ts` |
| 11 | Analytics (admin and business dashboards) | Label "AR activations" suggests successful AR; the event is one per launch attempt (taps within 2 s ignored), not success or placement | Rename to "AR launch attempts" (docs/PRODUCTION_READINESS.md SEC-08) | analytics views |
