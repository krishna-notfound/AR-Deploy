# ADR-0041: AR audit fixes: model files straight from storage, a viewer that recovers, honest failures
- **Status:** Accepted (owner, 2026-10-26)
- **Date:** 2026-10-26
- **Affects:** ADR-0035 (amends its `/ar/` note), design/09-3d-ar.md, design/14-features-public.md, `src/features/ar/variantMedia.ts`, `src/components/three/ModelViewer.tsx`, `src/features/public/ProductPage.tsx`, `src/features/products/editor/ModelSection.tsx`

## Context
The owner asked for a deep audit of AR, "the main feature", so it cannot break. Five read-only audits (launch logic, model pipeline with live data, WebXR rendering, live-site emulation, tests) found, among others: through the site's `/ar/` proxy, Vercel compresses the model and drops `Content-Length`, so the 3D view's progress froze at 94% and the 45 s stall timer cancelled live downloads (6 of 11 loads of a 17.5 MB chair failed); a failed viewer download could never be retried; AR support settling after the model loaded hid the AR button; model-viewer's own Scene Viewer failure marker was ignored; the editor blamed CORS for every preview failure; two AR end-to-end tests still expected the pre-ADR-0035 flow.

## Decision
- **Model files load straight from storage.** `arLaunchUrl` returns the public copy's direct Supabase URL (it sends `Content-Length` and `Access-Control-Allow-Origin: *`), else the signed URL. The `/ar/` rewrite in `vercel.json` and `arProxyUrl` stay in the code but are unused by the product page.
- **The viewer recovers:** a failed `import('@google/model-viewer')` is forgotten, so "Try again" downloads it again.
- **AR availability is re-checked** for 3 s after the model loads, so a late WebXR answer still shows the button.
- **A failed Scene Viewer hand-off is honest:** the page reacts to `#model-viewer-no-ar-fallback` as to `#ar-unavailable`: the marker is removed, "AR could not start on this device" is shown and AR stays off for the visit.
- **iPhone without a USDZ:** the file model-viewer builds keeps textures at 2048 px (`ar-usdz-max-texture-size`), and a second tap never starts a second build.
- **Editor preview:** an empty or invalid link shows "This model file is unavailable. Upload it again."; a load failure says "The 3D preview could not load" (no CORS wording); "Try again" fetches fresh signed links; the editor refreshes links after time away.
- **Tests:** the AR end-to-end tests now cover WebXR first (a stubbed `navigator.xr`: one session request per tap, never stuck) and the Scene Viewer fallback intent; unit tests cover each fix.
- **Not changed (owner decisions open):** AR modes (ADR-0035), the AR button in Android in-app browsers (a notice already points to Chrome), and a retry job for failed public-copy syncs.

## Consequences
- Good: on slow connections the 3D view keeps loading; measured direct downloads completed on 4G and Fast 3G where the proxy failed.
- Good: no dead "Try again", no hidden AR button on capable phones, no silent Scene Viewer failure.
- Trade-off: the phone's AR viewer reaches `supabase.co` directly; the proxy existed for networks that block it for apps (2026 reports), which were not confirmed for the owner's case.

## Alternatives rejected
- Keep the proxy and only lengthen the stall timeout: progress still freezes, and slow proxied downloads were also cut short.
- Fix the proxy's compression with headers: not reliably controllable for rewrites on Vercel.
