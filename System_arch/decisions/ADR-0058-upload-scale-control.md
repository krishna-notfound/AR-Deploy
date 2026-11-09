# ADR-0058: Scale control at GLB upload ("Fix the scale")
- **Status:** Accepted (amends [ADR-0006](ADR-0006-ar-fixed-scale-check.md); ADR-0006 is not superseded)
- **Date:** 2026-11-09
- **Affects:** design/15-product-editor.md, design/09-3d-ar.md, tasks/ (round 2, W7)

## Context
ADR-0006 says a model is never rescaled to make the numbers match, and only reports "AR scale unverified". The owner (client request, round 2): "if very large model which has large scale (very large) so we can have a controller on upload time to fix scale if it's over". Example: a dresser modelled in millimetres measures about 602 × 798 × 1800 units, which glTF reads as metres, so it stands about 1.8 km tall in AR. Telling the admin to re-export it is the only fix today.

## Decision
- On every GLB upload (product, option and 3D-request slots), after optimization, the file is measured in the worker (`measureGlb`: the default scene's bounds, in metres).
- `scaleProposal` (in `src/lib/scale.ts`, pure) returns a suggestion when any side is over 10 m, when the longest side is under 1 cm, or when the product's entered dimensions match after ×0.001 / ×0.01 / ×0.0254 (same 'model-units' test as `checkScale`). A thin piece (a rug 5 mm thick) is not a unit mistake, so one side under 1 cm does not trigger it; the whole model must be under 1 cm.
- A "Fix the scale" panel opens before anything is uploaded: the measured size, the likely cause, the product's entered dimensions, and the choices Convert from millimetres / centimetres / inches, Custom factor, or Keep as is, each with the resulting size. Buttons: Apply and upload, Upload without changes, Cancel. The suggestion is pre-selected; nothing is changed or uploaded until the person acts.
- The chosen uniform factor is applied by `applyUniformScale` (worker): the default scene's root nodes move under one new root node with scale [f, f, f]. Geometry, textures, materials and animations are untouched and proportions are kept; the result is re-read and its bounds and triangle count checked, and any doubt fails the scale step (nothing is uploaded; the person chooses again). A packed (meshopt) file is written plain, as everywhere else (ADR-0038).
- The note under the slot says what was done ("Scale fixed: multiplied by 0.001, now …") or that it was left as is, and "Upload the original instead" brings back the unscaled file.
- ADR-0006 stays in force otherwise: `ar-scale="fixed"`, the measured-vs-entered check, and no automatic rescaling. Rescaling happens only on this explicit choice, at upload, for GLB files. Linked URLs and USDZ files are not touched.

## Consequences
- Good: a millimetre or centimetre export no longer blocks the upload; the fix is visible, reversible (upload the original again) and keeps the honest scale check afterwards.
- Trade-off: one more step for files that really are unusual (a 12 m installation can choose Keep as is). The unit guess is a suggestion; for a model in inches without entered dimensions the centimetre option may be pre-selected, and the previews let the person pick the right one.
- No new dependency (glTF-Transform is already used by the optimizer).

## Alternatives rejected
- Rescale automatically when the size is implausible: breaks ADR-0006's principle of never changing the scale on a guess.
- Scale the vertices instead of adding a root node: rewrites geometry (and breaks skins and animations) for no benefit; the wrapper node is exact and reversible.
- Only warn and ask for a re-export (status quo): the admin often has no access to the source file.
