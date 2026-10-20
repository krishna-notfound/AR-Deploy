# 22 · Sanctus image briefs (to replace the temporary moodboard crops)

The landing page still uses low-resolution crops of the client's AI-generated reference boards (design/21). This file holds the generation briefs for their replacements. **No image has been generated yet**: this environment has no image-generation tool or API key. Whoever generates the images (the client, or the team with the client's approval) sends the files back, and they are swapped in under the same file names. Layout, crops and code stay as they are.

## Rules for every image
- No text, letters, numbers, logos, monograms, watermarks or brand names anywhere in the frame.
- No people, hands or pets.
- Generic furniture only: the pieces must not be presented as a real product (no "Linden"), and they never get a 3D model attached.
- Keep the original file at full resolution (PNG or high-quality JPEG). Do not upscale a small image to reach the minimum size; generate at a size that meets it.
- Confirm that the tool's terms allow commercial use, and record the tool, date and prompt per file.

## Shared style block (paste into every prompt)
> Editorial interior photograph for a luxury design brand. Warm natural light from the left, late-afternoon sun, soft long shadows. Palette: chalk white, limestone, taupe, umber, deep warm black, touches of burnished bronze. Materials: travertine, limestone plaster, walnut, cream bouclé, hand-thrown stoneware. Calm, minimal, uncluttered; low contrast, gentle film grain, natural colour, no HDR look. Shot on a full-frame camera, 35 mm lens, eye level, f/5.6. No text, no logos, no people.

## Briefs

| File (in `public/images/sanctus/`) | Used for | Aspect / minimum size | Brief |
|---|---|---|---|
| `hero.webp` | Landing hero, full width, copy over the left side | 16:9 or wider, **≥ 2400 × 1100** (3:2 at ≥ 2400 × 1600 also works) | A long, low, curved modular sofa in cream bouclé, sculptural rounded arms, three loose cushions in taupe and umber. In front, a round travertine pedestal coffee table with a small dark stoneware bowl and a vase with dry branches. Floor-to-ceiling window on the right third: a lake between forested hills at golden hour, sun low over the water. **The left 40 % of the frame is an empty, warm limestone wall in soft shadow, with diagonal sunbeams**: this is where the headline sits. A walnut lounge chair with a cream seat at the right edge. Travertine floor, soft wool rug. |
| `col-sofas.webp` | Collection card "Sofás" | 4:5, **≥ 1200 × 1500** | Close crop of the rounded end of the same curved cream bouclé sofa, low angle, against a travertine wall; sunlight grazing the fabric so its texture shows. |
| `col-mesas.webp` | Collection card "Mesas" | 4:5, **≥ 1200 × 1500** | A round travertine pedestal coffee table with a shallow dark stoneware bowl and one small branch arrangement, on a travertine floor, warm plaster wall behind, a band of sunlight across the top. |
| `col-poltronas.webp` | Collection card "Poltronas" | 4:5, **≥ 1200 × 1500** | A lounge armchair with a solid walnut frame and cream bouclé seat and back, three-quarter view, travertine floor, warm plaster wall, soft shadow to the right. |
| `col-decoracao.webp` | Collection card "Decoração" | 4:5, **≥ 1200 × 1500** | A hand-thrown, egg-shaped stoneware vase on a square travertine plinth, raking sunlight from the left, the rest of the frame in warm shadow. |
| `about-interior.webp` (optional, second batch) | "Sobre / Projetos" row | 4:3, ≥ 1600 × 1200 | A living space with board-formed stone walls, a low taupe sofa and a stone coffee table, a large window over a lake and hills, morning light. |
| `band-bench.webp` (optional, second batch) | Landing photo band | 4:3, ≥ 1400 × 1050 | A low rough-cut stone bench under a tall window, a dark stoneware vase with branches, a lake view, soft light. |
| `band-fabric.webp` (optional, second batch) | Landing photo band | 4:3, ≥ 1400 × 1050 | Macro of a patterned jacquard fabric draped over dark ribbed walnut, warm side light. No play button or icons. |

**Consistency checks before delivery:** put the five main images side by side. The light comes from the same side, the white balance and contrast match, and the cream fabric reads the same in the hero, the sofa card and the armchair card.

## What stays as it is
- `feature-main.webp`, `feature-texture.webp`: the illustrative Linden piece (labelled "Peça ilustrativa"). Replace only with the client's real product photo; it must not link to any product's 3D/AR page until a matching product and model exist.
- `band-card.webp`: a Sanctus brand mockup with the logo printed on a card. Replace with the client's own stationery photo once the official logo is final.
- `quote-stone.webp`: shown small; acceptable until a stone macro is generated with the batch above.
- `about-vase.webp`, `band-lake.webp`: licensed Pexels photos (design/21), credited in the footer.

## Swapping the files in
Send the originals (any name); they are converted to WebP (quality about 82), resized to the slot (hero 2400 px wide, cards 1200 px wide, others 1600 px), saved under the file names above, and the `width`/`height` attributes in `LandingPage.tsx` updated. Then screenshots at 1440 and 390 px and the usual checks.
