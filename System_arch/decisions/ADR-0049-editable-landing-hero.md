# ADR-0049: Editable landing hero picture with an in-place 3D model
- **Status:** Accepted (owner, 2026-11-04)
- **Date:** 2026-11-04
- **Affects:** ADR-0043 (Website Editor), ADR-0046/0047 (landing content), design/21 (landing), migration `landing_hero`

## Context
The first photo of the landing page was a built-in image. The owner wants to replace it with their own picture and, optionally, their own 3D model that visitors can turn in place, behind a very small switch that is understood at a glance. The frame's aspect ratio stays as it is.

## Decision
- The Website Editor document gets `landing.hero`: `image` (site asset), `model.glb` (site asset) and `alt` (EN required when set, PT optional, at most 120 characters), edited in a first "Hero picture" block of the Landing tab. Uploads use the existing `site-content` bucket (`content.manage` + 2FA). Draft, Preview, Publish and History as for every other part.
- The landing hero shows the uploaded picture in the same frame (else the built-in photo). Its description is the alt text and the small caption.
- With a model, a small chip (cube icon + "3D", 44 px hit area) on the photo swaps the picture for the 3D model in the same frame; the chip then reads "Photo". 3D only: no AR button on the hero. The viewer downloads only when the chip is used.
- The 3D stage (viewer, loading, stall timeout, error with retry) is one shared component used by the hero and the landing 3D card.
- The publish gate and the public read accept `landing.hero` (migration `landing_hero`, rollback in `supabase/rollback/`).

## Consequences
- Good: the first impression is the owner's own piece, in 3D, without a deploy.
- Trade-off: no AR from the hero; AR stays on the product and showcase pages.

## Alternatives rejected
- Picking a showcase product for the hero: the owner asked for the photo and model to be uploaded directly for the hero.
