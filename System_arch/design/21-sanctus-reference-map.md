# 21 · Sanctus reference map

The client's visual references live in `AR-attachment/`. They are the source of truth for the Sanctus brand (ADR-0023). This file maps every reference to the app, records the copy transcribed from them, and lists where the app deliberately differs.

## Reference inventory

| Ref | File | What it shows | Used for |
|---|---|---|---|
| R1 | `PHOTO-2026-10-12-18-35-54.jpg` (1280×1170) | Brand board: SANCTUS wordmark and "S" monogram, palette with hex codes, serif + sans pairing, stationery, mood photos | Tokens, wordmark and monogram (traced to SVG), favicon, the about-section vase photo |
| R2 | `PHOTO-2026-10-16-23-05-50 (1).jpg` (1280×853) | Social/brand collage: centred hero, collections row, about panel, "Espaços que inspiram." panel | The "Decoração" collection photo |
| R3 | `PHOTO-2026-10-16-23-05-50 (2).jpg` (853×1280) | **Full homepage, top to bottom** | The landing page structure and copy (all sections below) |
| R4 | `PHOTO-2026-10-16-23-05-50.jpg` (1280×853) | Lower-resolution copy of R5 | Not used separately |
| R5 | `Sanctus Luxury Furniture Website Moodboard (2).png` (1536×1024) | Nine page mockups: home, collections, product (Linden), projects (Residências Lagoa), about, gallery, blog, contact, cart, mobile menu | Projects interior photo; mobile menu (full-height obsidian panel) |
| R6 | `Sanctus_ Beyond What Is Seen (1).png` (1312×1199) | Hero; product pages Poltrona Linden / Sofá Mesas / Luminária Gaia with the 3D / AR rail; AR phone views; four editorial tiles | Product page layout (info left, stage centre, round 3D/AR actions right, thumbnails, "Arraste para girar") |
| R7 | `Sanctus_ Beyond What Is Seen (2).png` (1536×1024) | Hero; product page v2; collections grid; "Explore nossos ambientes" 3D experience; projects; Mesa Lunar product; brand panel; footer | Hero photograph; three collection photos; "VER EM 3D / AR" primary button |

## Landing page (R3), section by section

Portuguese text is verbatim from R3 and lives in `src/i18n/dictionaries/pt.ts` (`landing.*`, `site.*`). `en.ts` holds faithful translations.

1. **Header** over the hero: wordmark · HOME · COLEÇÕES · PROJETOS · SOBRE · CONTATO · account icon (the reference also has search and bag icons; see differences).
2. **Hero** (`#` top): eyebrow "MOBILIÁRIO", heading "Beyond / What Is Seen.", body "Design atemporal que transcende o visível e transforma espaços em experiências.", a short rule, link "EXPLORAR COLEÇÕES →".
3. **Collections** (`#colecoes`): "COLEÇÕES", "Formas que / conectam.", "Cada peça da Sanctus é um convite à contemplação, unindo materiais nobres, formas orgânicas e um design que se mantém atual por gerações.", "VER TODAS AS COLEÇÕES →"; cards SOFÁS "Conforto em forma de arte." · MESAS "O encontro entre forma e função." · POLTRONAS "Ergonomia e elegância." · DECORAÇÃO "Elementos que inspiram.", each "VER COLEÇÃO →".
4. **About + projects row**: vase photo · panel (`#sobre`) "SOBRE A SANCTUS", "Mais do que móveis, / criamos atmosferas.", "A SANCTUS nasceu da crença de que o verdadeiro luxo está nos detalhes. Nossas curadorias unem tradição artesanal, design contemporâneo e materiais autênticos, para transformar espaços em experiências sensoriais.", "CONHEÇA NOSSA HISTÓRIA →" · interior photo · dark panel (`#projetos`) "PROJETOS", "Espaços que / inspiram.", "Descubra como nossas peças transformam ambientes em experiências únicas.", "VER PROJETOS →".
5. **Quote band** (`#manifesto`): "“O design é a ponte entre o visível e o intangível.”" / "— SANCTUS", stone photo.
6. **Featured piece**: "POLTRONA", "Linden", "R$ 28.900", "A Poltrona Linden combina linhas orgânicas e materiais nobres, criando um peça atemporal que traz conforto e elegância para qualquer ambiente." (sic, kept as written), "DIMENSÕES" "A. 76 cm / L. 85 cm / P. 76 cm", "MATERIAIS" "Madeira maciça, linho e espuma de alta densidade.", "DETALHES" list, texture photo, caption "Texturas que contam histórias."
7. **Photo band**: lake tile with wordmark, "Coleções que atravessam o tempo.", "VER CATÁLOGO →"; fabric, bench and card photos.
8. **Footer** (`#contato`): wordmark · nav · "© {year} SANCTUS. TODOS OS DIREITOS RESERVADOS."

## Product page (R6, R7)

Back link · serif name · price · short description · finish swatches with the selected name below ("ACABAMENTO") · dark button "VER EM 3D / AR" · stage that **opens on the photograph** with thumbnails · round actions "3D · Visualizar em 3D" and "AR · Ver em AR" · "Arraste para girar" in 3D. The page keeps the platform's own sections below: dimensions with the drawing and the scale check, material, weight, description, more photos.

## Where the app differs from the references, and why

| Reference element | In the app | Reason |
|---|---|---|
| "ADICIONAR AO CARRINHO", bag icon, cart page, "Finalizar compra" | Not built. The product page's dark button is "VER EM 3D / AR" (also reference copy, R7) | No cart, checkout or payment (client scope) |
| "Trocar ambiente", "Mais opções", "PERSONALIZAR", heart (favourite) | Not built | No such features; buttons without an action are not allowed |
| Search icon in the header | Not built | No site-wide search yet |
| Facebook / Instagram / Pinterest / LinkedIn icons | Not shown | No account URLs supplied; add them when the client provides links |
| "Cuidados", "Prazo de entrega" in DETALHES | Only "Materiais" and "Dimensões" | There is no care or delivery data; delivery is commerce scope |
| Hero slider "01 02 03" with arrows | Single hero photograph | The references contain one usable hero image; a slider of one is a dead control |
| Thumbnails beside the landing's featured armchair | Not shown | Only one usable photo of that armchair exists in the references |
| Projects, gallery, blog, contact and about pages (R5) | Sections on the landing page; nav links scroll to them | The pages have no content or data yet; building empty pages is out of scope |
| "© 2024" | Current year | A fixed past year would be wrong |
| Contact block "(11) 98765-4321", "contato@sanctus.com.br", "São Paulo, SP" (R5) | A labelled placeholder (`contato@sanctus.example`) | Those details are mockup text, not confirmed client data |
| "R$ 28.900" Linden on the landing, button "VER EM 3D / AR" | Kept, with the note "Peça ilustrativa: imagem e preço das referências da marca." The dark button reads "VER CATÁLOGO" (reference copy) and opens a catalogue | Sample content must be labelled (project rule). The piece has no product record or 3D model, so it must not link to another product's 3D/AR page |
| Header stays light on catalogue and product pages, with the business name | Business identity on its own catalogue; Sanctus credited in the footer | The platform is multi-tenant: each catalogue belongs to a business |
| Portuguese dialect | Landing copy is Brazilian Portuguese as written; the rest of the PT dictionary is European Portuguese | Open question Q3: the client should pick one |

## Assets cut from the references (`public/images/sanctus/`)

**Provenance check (2026-10-20):** the three PNG references carry C2PA Content Credentials naming ChatGPT (`gpt-image`, `trainedAlgorithmicMedia`). The scenes are AI-generated; no original photographs exist online. The JPEG references are WhatsApp copies of the same set.

Assets marked *moodboard crop* are cropped from the references, with baked-in mockup text removed (OpenCV inpainting), upscaled and saved as WebP. **They are low resolution and temporary.** Assets marked *Pexels* are licensed visual alternatives (Pexels licence: free commercial use, attribution optional; credited in the footer).

| File | Source | Crop (x0, y0, x1, y1) | Notes |
|---|---|---|---|
| `hero.webp` | R7 | 0, 46, 780, 402 | Hero text, slider labels and scroll cue removed |
| `col-sofas.webp`, `col-mesas.webp`, `col-poltronas.webp` | R7 | 204/341/489, 428 → 328/478/626, 604 | Collection tiles |
| `col-decoracao.webp` | R2 | 497, 449, 625, 574 | |
| `about-vase.webp` | **Pexels 29627528**, "Minimalist Arch in Studio with Textured Walls", Pavel Morillo, original 1824×2736: https://www.pexels.com/photo/minimalist-arch-in-studio-with-textured-walls-29627528/ | 0, 1000, 1500, 2560 → 1200×1248 | Visual alternative (glass vase on plinth instead of the stone vase); replaced the R1 crop |
| `about-interior.webp` | R5 | 171, 379, 571, 687 | |
| `quote-stone.webp` | R3 | 709, 763, 828, 826 | |
| `feature-main.webp`, `feature-texture.webp` | R3 | 76, 842, 387, 1082 / 667, 984, 822, 1060 | |
| `band-lake.webp` | **Pexels 17965189**, "Lake in Mountains Landscape in Fog", Elshad Aliyev, original 4000×6000: https://www.pexels.com/photo/lake-in-mountains-landscape-in-fog-17965189/ | 0, 2000, 4000, 4100 → 1600×840 | Visual alternative, warm duotone grade (obsidian → bronze) to match the reference tone; replaced the R3 crop |
| `band-fabric.webp` | R3 | 281, 1095, 462, 1231 | Play icon removed (there is no video) |
| `band-bench.webp`, `band-card.webp` | R3 | 468/649, 1095, 642/853, 1231 | |
| Wordmark and monogram (inline SVG in `BrandMark.tsx`), `public/favicon.svg` | R1 | wordmark 725, 80, 1058, 128; monogram 1150, 50, 1230, 150 | Traced vectors; replace with the official logo files |

Replacement briefs for the temporary crops: design/22-sanctus-image-briefs.md.
