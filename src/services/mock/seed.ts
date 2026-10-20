// SAMPLE DATA for the demo. Not real businesses, prices, or analytics.
// 3D models: Khronos glTF-Sample-Assets (CC BY 4.0 and CC0, creators named). See src/services/mock/credits.ts.
// Photos: Unsplash (Unsplash License).
import type {
  Business,
  Category,
  Currency,
  Dimensions,
  LocalizedText,
  ModelAsset,
  Product,
  ProductImage,
  ProductVariant,
} from '@/domain/types'
import { type DailyStat, deriveActivity, isoDay } from '../analytics'
import { type Db, SCHEMA_VERSION } from './db'

const KHRONOS = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models'

export const SAMPLE_MODELS = {
  glamVelvetSofa: `${KHRONOS}/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb`,
  sheenWoodLeatherSofa: `${KHRONOS}/SheenWoodLeatherSofa/glTF-Binary/SheenWoodLeatherSofa.glb`,
  sheenChair: `${KHRONOS}/SheenChair/glTF-Binary/SheenChair.glb`,
  chairDamask: `${KHRONOS}/ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb`,
  barnLamp: `${KHRONOS}/AnisotropyBarnLamp/glTF-Binary/AnisotropyBarnLamp.glb`,
  punctualLamp: `${KHRONOS}/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb`,
} as const

/** Deliberately broken URL so the 3D error state can be demonstrated. */
export const BROKEN_MODEL_URL = `${KHRONOS}/DoesNotExist/glTF-Binary/MissingSideTable.glb`

const unsplash = (id: string, w = 1400) => `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`

const PHOTO = {
  greenVelvetSofa: unsplash('photo-1555041469-a586c61ea9bc'),
  yellowArmchairRoom: unsplash('photo-1586023492125-27b2c045efd7'),
  creamTuftedChair: unsplash('photo-1567538096630-e0c55bd6374c'),
  woodenStool: unsplash('photo-1503602642458-232111445657'),
  blackShellChair: unsplash('photo-1592078615290-033ee584e267'),
  greySofaRoom: unsplash('photo-1493663284031-b7e3aefcae8e'),
  tanLeatherSofa: unsplash('photo-1540574163026-643ea20ade25'),
  tuftedBedroom: unsplash('photo-1505693416388-ac5ce068fe85'),
  bedNightstand: unsplash('photo-1522771739844-6a9f6d5f14af'),
  woodSideTable: unsplash('photo-1532372320572-cda25653a26d'),
  woodBookcase: unsplash('photo-1595428774223-ef52624120d2'),
  greyFloorLamp: unsplash('photo-1507473885765-e6ed057f782c'),
  pendantLamp: unsplash('photo-1513506003901-1e6a229e2d15'),
  cushions: unsplash('photo-1550254478-ead40cc54513'),
  greyDiningChair: unsplash('photo-1598300042247-d088f8ab3a91'),
  roundDiningTable: unsplash('photo-1533090481720-856c6e3c1fdc'),
  loungeInterior: unsplash('photo-1538688525198-9b88f6f53126'),
  blackBarStool: unsplash('photo-1581539250439-c96689b516dd'),
  swivelChair: unsplash('photo-1580480055273-228ff5388ef8'),
  whiteSideTable: unsplash('photo-1499933374294-4584851497cc'),
  mustardChair: unsplash('photo-1616627547584-bf28cee262db'),
  diningRoom: unsplash('photo-1617806118233-18e1de247200'),
  sideboardRoom: unsplash('photo-1618220179428-22790b461013'),
  bedroomPlants: unsplash('photo-1615874959474-d609969a20ed'),
  yellowSofa: unsplash('photo-1558211583-d26f610c1eb1'),
  wallShelves: unsplash('photo-1594026112284-02bb6f3352fe'),
  yellowGreyChairs: unsplash('photo-1551298370-9d3d53740c72'),
  blackBed: unsplash('photo-1586105251261-72a756497a11'),
  blueSofa: unsplash('photo-1484101403633-562f891dc89a'),
  orangeSofa: unsplash('photo-1567016432779-094069958ea5'),
  writingDesk: unsplash('photo-1611269154421-4e27233ac5c7'),
}

/** Posters rendered from the actual sample models (public/images/models). */
const POSTER = {
  glamVelvetSofa: '/images/models/glam-velvet-sofa.webp',
  sheenWoodLeatherSofa: '/images/models/sheen-wood-leather-sofa.webp',
  sheenChair: '/images/models/sheen-chair.webp',
  chairDamask: '/images/models/chair-damask.webp',
  barnLamp: '/images/models/barn-lamp.webp',
  punctualLamp: '/images/models/punctual-lamp.webp',
}

function logoSvg(initials: string, bg: string, fg = '#FFFFFF'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${bg}"/><text x="48" y="58" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="600" fill="${fg}" letter-spacing="1">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const DAY = 86_400_000
const daysAgo = (n: number, now: number) => new Date(now - n * DAY).toISOString()

const L = (en: string, pt?: string): LocalizedText => (pt === undefined ? { en } : { en, pt })

let imgCounter = 0
function images(primary: string, gallery: string[] = [], additional: string[] = [], alt = ''): ProductImage[] {
  const mk = (url: string, isPrimary: boolean, kind: ProductImage['kind']): ProductImage => ({
    id: `img_${++imgCounter}`,
    url,
    alt,
    isPrimary,
    kind,
  })
  return [mk(primary, true, 'gallery'), ...gallery.map((u) => mk(u, false, 'gallery')), ...additional.map((u) => mk(u, false, 'additional'))]
}

/** `requiredExtensions` is the file's glTF extensionsRequired, as the editor records it on upload. */
function glb(url: string, requiredExtensions?: string[]): ModelAsset {
  return { format: 'glb', url, fileName: decodeURIComponent(url.split('/').pop() ?? 'model.glb'), status: 'valid', ...(requiredExtensions ? { requiredExtensions } : {}) }
}

let varCounter = 0
/** `media`: the option's own photo and GLB (sample per-variant media); without it the product's are shown. */
function variant(en: string, pt: string | undefined, colorHex: string, priceDelta = 0, media?: { photo: string; glb: string; required: string[] }): ProductVariant {
  const id = `var_${++varCounter}`
  return {
    id,
    name: L(en, pt),
    colorHex,
    priceDelta: priceDelta || undefined,
    ...(media ? { images: [{ id: `${id}_img_1`, url: media.photo, alt: en, isPrimary: true, kind: 'gallery' as const }], models: { glb: glb(media.glb, media.required) } } : {}),
  }
}

interface ProductSeed {
  id: string
  businessId: string
  slug: string
  name: LocalizedText
  short: LocalizedText
  description: LocalizedText
  category: Category
  price: number
  currency: Currency
  images: ProductImage[]
  glb?: string
  /** The GLB's extensionsRequired (checked with glTF-Transform for the sample files). */
  glbRequired?: string[]
  dimensions: Dimensions
  material: LocalizedText
  weightKg?: number
  variants?: ProductVariant[]
  ctaUrl?: string
  status: 'draft' | 'published'
  createdDaysAgo: number
}

const CTA_DEFAULT = L('Contact seller', 'Contactar vendedor')

export function createSeed(now: number = Date.now()): Db {
  imgCounter = 0
  varCounter = 0

  const businesses: Business[] = [
    {
      id: 'biz_casa',
      name: 'Casa Lisboa Interiors',
      slug: 'casa-lisboa',
      logoUrl: logoSvg('CL', '#7A5C45'),
      description: 'Handcrafted upholstery and solid-wood pieces from a family workshop in Lisbon.',
      contact: { email: 'hello@casalisboa.example', phone: '+351 21 000 0000', website: 'https://casalisboa.example', address: 'Rua das Flores 12, Lisboa' },
      status: 'active',
      branding: { accentColor: '#7A5C45' },
      defaultCurrency: 'EUR',
      createdAt: daysAgo(120, now),
      updatedAt: daysAgo(3, now),
    },
    {
      id: 'biz_nord',
      name: 'Nordhaus Living',
      slug: 'nordhaus',
      logoUrl: logoSvg('NH', '#2F5D62'),
      description: 'Calm Scandinavian-inspired furniture and lighting for small apartments.',
      contact: { email: 'studio@nordhaus.example', phone: '+351 22 000 0000', website: 'https://nordhaus.example', address: 'Avenida da Boavista 400, Porto' },
      status: 'active',
      branding: { accentColor: '#2F5D62' },
      defaultCurrency: 'EUR',
      createdAt: daysAgo(90, now),
      updatedAt: daysAgo(1, now),
    },
    {
      id: 'biz_verde',
      name: 'Atelier Verde',
      slug: 'atelier-verde',
      logoUrl: logoSvg('AV', '#4F6B3A'),
      description: 'Warm, colourful pieces made with Brazilian hardwoods and natural fibres.',
      contact: { email: 'contato@atelierverde.example', phone: '+55 11 0000 0000', address: 'Rua Oscar Freire 200, São Paulo' },
      status: 'active',
      branding: { accentColor: '#4F6B3A' },
      defaultCurrency: 'BRL',
      createdAt: daysAgo(45, now),
      updatedAt: daysAgo(6, now),
    },
    {
      id: 'biz_oak',
      name: 'Oak & Ember Studio',
      slug: 'oak-ember',
      logoUrl: logoSvg('OE', '#5A4636'),
      description: 'Small-batch desks and workspace furniture. Catalog paused for the season.',
      contact: { email: 'team@oakember.example' },
      status: 'inactive',
      branding: { accentColor: '#5A4636' },
      defaultCurrency: 'USD',
      createdAt: daysAgo(200, now),
      updatedAt: daysAgo(20, now),
    },
  ]

  const P: ProductSeed[] = [
    // ---- Casa Lisboa ----
    {
      id: 'prd_glam_sofa',
      businessId: 'biz_casa',
      slug: 'glam-velvet-sofa',
      name: L('Glam Velvet Sofa', 'Sofá Glam em Veludo'),
      short: L('A curved velvet sofa on slim brass-tipped legs.', 'Sofá curvo em veludo com pés finos de ponta em latão.'),
      description: L(
        'A sweeping curved silhouette, deep seat and plush velvet upholstery make this sofa the centrepiece of a living room. The frame is kiln-dried hardwood and the cushions use high-resilience foam wrapped in feather.',
        'Uma silhueta curva, assento profundo e estofo em veludo macio fazem deste sofá a peça central da sala. Estrutura em madeira maciça seca em estufa e almofadas em espuma de alta resiliência envolta em penas.',
      ),
      category: 'sofa',
      price: 189900,
      currency: 'EUR',
      images: images(POSTER.glamVelvetSofa, [], [PHOTO.cushions, PHOTO.greySofaRoom], 'Curved velvet sofa'),
      glb: SAMPLE_MODELS.glamVelvetSofa,
      glbRequired: ['KHR_texture_transform'],
      // Matches the measured model size (verified in model-viewer).
      dimensions: { width: 219, height: 79, depth: 102, unit: 'cm' },
      material: L('Velvet upholstery, hardwood frame', 'Estofo em veludo, estrutura em madeira maciça'),
      weightKg: 62,
      variants: [variant('Sapphire', 'Safira', '#1F3F8F'), variant('Emerald', 'Esmeralda', '#2E5E4E', 15000), variant('Dusty Rose', 'Rosa Antigo', '#C9A0A0', 15000)],
      ctaUrl: 'https://casalisboa.example/contact',
      status: 'published',
      createdDaysAgo: 60,
    },
    {
      id: 'prd_leather_sofa',
      businessId: 'biz_casa',
      slug: 'wood-leather-sofa',
      name: L('Alfama Carved Leather Sofa', 'Sofá Alfama em Pele e Madeira Entalhada'),
      short: L('A traditional rolled-arm sofa in brown leather with carved wood trim.', 'Sofá tradicional de braços enrolados em pele castanha com madeira entalhada.'),
      description: L(
        'Generous proportions, rolled arms and hand-carved wood trim. Leather seat cushions are paired with tapestry-weave back pillows. The leather develops a rich patina over time.',
        'Proporções generosas, braços enrolados e madeira entalhada à mão. Almofadas de assento em pele combinadas com almofadas de encosto em tapeçaria. A pele ganha uma pátina rica com o tempo.',
      ),
      category: 'sofa',
      price: 249000,
      currency: 'EUR',
      images: images(POSTER.sheenWoodLeatherSofa, [], [], 'Carved leather sofa'),
      glb: SAMPLE_MODELS.sheenWoodLeatherSofa,
      // Requires EXT_texture_webp, which Scene Viewer does not support: Android visitors are not offered AR.
      glbRequired: ['KHR_texture_transform', 'EXT_texture_webp'],
      dimensions: { width: 273, height: 112, depth: 92, unit: 'cm' },
      material: L('Full-grain leather, carved hardwood', 'Pele flor integral, madeira maciça entalhada'),
      weightKg: 85,
      variants: [variant('Cognac', 'Conhaque', '#9A5B2E'), variant('Espresso', 'Café', '#3B2A20')],
      status: 'published',
      createdDaysAgo: 40,
    },
    {
      id: 'prd_mustard_chair',
      businessId: 'biz_casa',
      slug: 'mustard-tufted-armchair',
      name: L('Mustard Tufted Armchair', 'Poltrona Capitonê Mostarda'),
      short: L('Button-tufted slipper chair in mustard velvet.', 'Poltrona capitonê em veludo mostarda.'),
      description: L(
        'A compact slipper chair that fits bedrooms and reading corners. Hand-tufted back, turned oak legs.',
        'Uma poltrona compacta para quartos e cantos de leitura. Encosto capitonê feito à mão, pés torneados em carvalho.',
      ),
      category: 'chair',
      price: 64900,
      currency: 'EUR',
      images: images(PHOTO.mustardChair, [PHOTO.yellowArmchairRoom], [], 'Mustard tufted armchair'),
      dimensions: { width: 68, height: 86, depth: 72, unit: 'cm' },
      material: L('Cotton velvet, oak legs', 'Veludo de algodão, pés em carvalho'),
      weightKg: 14,
      status: 'published',
      createdDaysAgo: 30,
    },
    {
      id: 'prd_round_table',
      businessId: 'biz_casa',
      slug: 'atlantic-round-dining-table',
      name: L('Atlantic Round Dining Table', 'Mesa de Jantar Redonda Atlântico'),
      short: L('Seats four. Matte lacquer top on solid beech legs.', 'Para quatro pessoas. Tampo lacado mate com pés em faia maciça.'),
      description: L('A round dining table sized for apartments. The matte top resists fingerprints.', 'Mesa redonda pensada para apartamentos. O tampo mate resiste a dedadas.'),
      category: 'table',
      price: 72000,
      currency: 'EUR',
      images: images(PHOTO.roundDiningTable, [PHOTO.diningRoom], [], 'Round dining table'),
      dimensions: { width: 110, height: 75, depth: 110, unit: 'cm' },
      material: L('Lacquered MDF top, beech legs', 'Tampo em MDF lacado, pés em faia'),
      weightKg: 24,
      status: 'published',
      createdDaysAgo: 25,
    },
    {
      id: 'prd_tejo_side',
      businessId: 'biz_casa',
      slug: 'tejo-side-table',
      name: L('Tejo Side Table', 'Mesa de Apoio Tejo'),
      short: L('Round side table with tapered legs.', 'Mesa de apoio redonda com pés cónicos.'),
      description: L(
        'A light side table for sofas and beds. (Demo note: this product points to a missing 3D file so the viewer error state can be tested.)',
        'Uma mesa de apoio leve para sofás e camas. (Nota de demonstração: este produto aponta para um ficheiro 3D inexistente para testar o estado de erro.)',
      ),
      category: 'table',
      price: 18900,
      currency: 'EUR',
      images: images(PHOTO.whiteSideTable, [], [], 'White side table'),
      glb: BROKEN_MODEL_URL,
      dimensions: { width: 40, height: 52, depth: 40, unit: 'cm' },
      material: L('Lacquered ash', 'Freixo lacado'),
      status: 'published',
      createdDaysAgo: 12,
    },
    {
      id: 'prd_bookcase',
      businessId: 'biz_casa',
      slug: 'alfama-bookcase',
      name: L('Alfama Tall Bookcase', 'Estante Alta Alfama'),
      short: L('Narrow open bookcase with twelve cubbies.', 'Estante estreita com doze nichos.'),
      description: L('A slim oak-veneer bookcase for hallways and alcoves.', 'Estante fina em folha de carvalho para corredores e nichos.'),
      category: 'storage',
      price: 54000,
      currency: 'EUR',
      images: images(PHOTO.woodBookcase, [], [], 'Tall wooden bookcase'),
      dimensions: { width: 60, height: 200, depth: 32, unit: 'cm' },
      material: L('Oak veneer', 'Folha de carvalho'),
      status: 'draft',
      createdDaysAgo: 4,
    },

    // ---- Nordhaus ----
    {
      id: 'prd_sheen_chair',
      businessId: 'biz_nord',
      slug: 'sheen-lounge-chair',
      name: L('Sheen Lounge Chair', 'Cadeirão Sheen'),
      short: L('A button-tufted velvet lounge chair on tapered wooden legs.', 'Cadeirão em veludo capitonê sobre pés de madeira cónicos.'),
      description: L(
        'A low, wide lounge chair with a sheen velvet that changes tone with the light. The tapered solid-wood legs are finished with a natural oil.',
        'Um cadeirão baixo e largo em veludo acetinado que muda de tom com a luz. Os pés cónicos em madeira maciça têm acabamento a óleo natural.',
      ),
      category: 'chair',
      price: 89500,
      currency: 'EUR',
      images: images(POSTER.sheenChair, [], [PHOTO.loungeInterior], 'Sheen lounge chair'),
      glb: SAMPLE_MODELS.sheenChair,
      glbRequired: ['KHR_texture_transform'],
      dimensions: { width: 83, height: 69, depth: 57, unit: 'cm' },
      material: L('Sheen woven fabric, solid ash', 'Tecido acetinado, freixo maciço'),
      weightKg: 18,
      // Per-variant media: the same Wayfair chair shell in two upholsteries (bounding boxes within 2 mm), each
      // with its own photo and GLB, so both verify against 83 × 69 × 57 cm.
      variants: [
        variant('Mango Velvet', 'Veludo Manga', '#E8872A', 0, { photo: POSTER.sheenChair, glb: SAMPLE_MODELS.sheenChair, required: ['KHR_texture_transform'] }),
        variant('Purple-Gold Damask', 'Damasco Roxo e Dourado', '#5B3A6B', 6000, { photo: POSTER.chairDamask, glb: SAMPLE_MODELS.chairDamask, required: [] }),
      ],
      ctaUrl: 'https://nordhaus.example/visit',
      status: 'published',
      createdDaysAgo: 55,
    },
    {
      id: 'prd_barn_lamp',
      businessId: 'biz_nord',
      slug: 'copper-barn-wall-lamp',
      name: L('Copper Barn Wall Lamp', 'Aplique de Parede Barn em Cobre'),
      short: L('A wall-mounted barn lamp in brushed copper.', 'Aplique de parede estilo celeiro em cobre escovado.'),
      description: L(
        'A wall sconce with a brushed copper finish that catches the light. Fits kitchens, porches and entryways.',
        'Aplique de parede com acabamento em cobre escovado que reflete a luz. Ideal para cozinhas, alpendres e entradas.',
      ),
      category: 'lighting',
      price: 21900,
      currency: 'EUR',
      images: images(POSTER.barnLamp, [], [PHOTO.pendantLamp], 'Copper barn wall lamp'),
      glb: SAMPLE_MODELS.barnLamp,
      glbRequired: [],
      dimensions: { width: 19, height: 26, depth: 23, unit: 'cm' },
      material: L('Brushed copper-finish steel', 'Aço com acabamento em cobre escovado'),
      weightKg: 2,
      status: 'published',
      createdDaysAgo: 35,
    },
    {
      id: 'prd_shell_chair',
      businessId: 'biz_nord',
      slug: 'fjord-shell-chair',
      name: L('Fjord Shell Chair', 'Cadeira Concha Fjord'),
      short: L('Moulded shell chair with a padded seat.', 'Cadeira de concha moldada com assento almofadado.'),
      description: L('A durable dining chair with a moulded shell, padded seat and beech legs.', 'Cadeira de jantar resistente com concha moldada, assento almofadado e pés em faia.'),
      category: 'chair',
      price: 12900,
      currency: 'EUR',
      images: images(PHOTO.blackShellChair, [PHOTO.yellowGreyChairs], [], 'Black shell chair'),
      dimensions: { width: 48, height: 82, depth: 54, unit: 'cm' },
      material: L('Polypropylene shell, beech', 'Concha em polipropileno, faia'),
      variants: [variant('Black', 'Preto', '#1F1E1C'), variant('Sage', 'Salva', '#A3B09A'), variant('Mustard', 'Mostarda', '#D4A72C')],
      status: 'published',
      createdDaysAgo: 50,
    },
    {
      id: 'prd_floor_lamp',
      businessId: 'biz_nord',
      slug: 'arc-reading-floor-lamp',
      name: L('Arc Reading Floor Lamp', 'Candeeiro de Pé Arc'),
      short: L('Adjustable floor lamp with a dome shade.', 'Candeeiro de pé ajustável com cúpula.'),
      description: L('An adjustable reading lamp with a steel dome shade.', 'Um candeeiro de leitura ajustável com cúpula em aço.'),
      category: 'lighting',
      price: 15900,
      currency: 'EUR',
      images: images(PHOTO.greyFloorLamp, [], [], 'Grey floor lamp'),
      dimensions: { width: 35, height: 150, depth: 60, unit: 'cm' },
      material: L('Powder-coated steel', 'Aço lacado a pó'),
      status: 'published',
      createdDaysAgo: 28,
    },
    {
      id: 'prd_bar_stool',
      businessId: 'biz_nord',
      slug: 'oslo-bar-stool',
      name: L('Oslo Bar Stool', 'Banco Alto Oslo'),
      short: L('Counter-height stool with a footrest ring.', 'Banco alto com aro para os pés.'),
      description: L('Counter-height stool for kitchen islands.', 'Banco alto para ilhas de cozinha.'),
      category: 'chair',
      price: 9900,
      currency: 'EUR',
      images: images(PHOTO.blackBarStool, [], [], 'Black bar stool'),
      dimensions: { width: 46, height: 98, depth: 46, unit: 'cm' },
      material: L('Moulded polypropylene, beech, steel', 'Polipropileno, faia, aço'),
      status: 'draft',
      createdDaysAgo: 2,
    },
    {
      id: 'prd_bed',
      businessId: 'biz_nord',
      slug: 'nordic-upholstered-bed',
      name: L('Nordic Upholstered Bed', 'Cama Estofada Nordic'),
      short: L('Low upholstered bed frame for a 160 cm mattress.', 'Estrutura de cama estofada baixa para colchão de 160 cm.'),
      description: L('A low-profile bed frame with a padded headboard.', 'Estrutura de cama baixa com cabeceira almofadada.'),
      category: 'bed',
      price: 99000,
      currency: 'EUR',
      images: images(PHOTO.blackBed, [PHOTO.bedNightstand], [], 'Upholstered bed'),
      dimensions: { width: 170, height: 95, depth: 210, unit: 'cm' },
      material: L('Wool blend, pine slats', 'Mistura de lã, ripas de pinho'),
      status: 'published',
      createdDaysAgo: 20,
    },
    {
      id: 'prd_linen_sofa',
      businessId: 'biz_nord',
      slug: 'linen-two-seat-sofa',
      name: L('Linen Two-Seat Sofa', 'Sofá de Dois Lugares em Linho'),
      short: L('A compact two-seater in washed linen.', 'Sofá compacto de dois lugares em linho lavado.'),
      description: L('Removable washed-linen covers and a compact footprint.', 'Capas removíveis em linho lavado e dimensões compactas.'),
      category: 'sofa',
      price: 119000,
      currency: 'EUR',
      images: images(PHOTO.blueSofa, [], [], 'Light blue linen sofa'),
      dimensions: { width: 160, height: 82, depth: 88, unit: 'cm' },
      material: L('Washed linen', 'Linho lavado'),
      status: 'published',
      createdDaysAgo: 15,
    },

    // ---- Atelier Verde (BRL) ----
    {
      id: 'prd_damask_chair',
      businessId: 'biz_verde',
      slug: 'damask-accent-chair',
      name: L('Damask Accent Chair', 'Poltrona Damasco'),
      short: L('Purple-and-gold damask accent chair.', 'Poltrona de destaque em damasco roxo e dourado.'),
      description: L(
        'A statement accent chair upholstered in a woven damask with gold threads.',
        'Uma poltrona de destaque estofada em damasco tecido com fios dourados.',
      ),
      category: 'chair',
      price: 289000,
      currency: 'BRL',
      images: images(POSTER.chairDamask, [], [], 'Damask accent chair'),
      glb: SAMPLE_MODELS.chairDamask,
      glbRequired: [],
      // Deliberately does NOT match the model (≈ 83 × 69 × 57 cm) to demonstrate "AR scale unverified".
      dimensions: { width: 60, height: 100, depth: 60, unit: 'cm' },
      material: L('Damask upholstery, jatobá wood', 'Estofo em damasco, madeira de jatobá'),
      ctaUrl: 'https://atelierverde.example/whatsapp',
      status: 'published',
      createdDaysAgo: 38,
    },
    {
      id: 'prd_punctual_lamp',
      businessId: 'biz_verde',
      slug: 'tulip-floor-lamp',
      name: L('Tulip Floor Lamp', 'Candeeiro de Pé Tulipa'),
      short: L('An art nouveau floor lamp with a frosted tulip shade.', 'Candeeiro de pé art nouveau com cúpula de vidro fosco em tulipa.'),
      description: L(
        'A sculptural bronze-finish stem curves over into a frosted glass tulip shade that gives a soft, warm light.',
        'Uma haste escultural com acabamento em bronze curva-se sobre uma cúpula de vidro fosco em forma de tulipa, com uma luz suave e quente.',
      ),
      category: 'lighting',
      price: 149000,
      currency: 'BRL',
      images: images(POSTER.punctualLamp, [], [], 'Tulip floor lamp'),
      glb: SAMPLE_MODELS.punctualLamp,
      glbRequired: [],
      dimensions: { width: 113, height: 186, depth: 72, unit: 'cm' },
      material: L('Bronze-finish metal, frosted glass', 'Metal com acabamento em bronze, vidro fosco'),
      status: 'published',
      createdDaysAgo: 22,
    },
    {
      id: 'prd_terracotta_sofa',
      businessId: 'biz_verde',
      slug: 'terracotta-sofa',
      name: L('Terracotta Sofa', 'Sofá Terracota'),
      short: L('A cheerful three-seater in burnt orange.', 'Um sofá alegre de três lugares em laranja queimado.'),
      description: L('Generous cushions in a durable performance weave.', 'Almofadas generosas num tecido resistente.'),
      category: 'sofa',
      price: 459000,
      currency: 'BRL',
      images: images(PHOTO.orangeSofa, [], [], 'Orange sofa'),
      dimensions: { width: 210, height: 84, depth: 92, unit: 'cm' },
      material: L('Performance weave, eucalyptus frame', 'Tecido técnico, estrutura em eucalipto'),
      status: 'published',
      createdDaysAgo: 18,
    },
    {
      id: 'prd_sideboard',
      businessId: 'biz_verde',
      slug: 'rio-sideboard',
      name: L('Rio Sideboard'),
      short: L('Fluted sideboard with brass handles.'),
      description: L('A long fluted sideboard. (Portuguese translation intentionally missing to demonstrate the fallback.)'),
      category: 'storage',
      price: 389000,
      currency: 'BRL',
      images: images(PHOTO.sideboardRoom, [], [], 'Sideboard in living room'),
      dimensions: { width: 180, height: 75, depth: 45, unit: 'cm' },
      material: L('Freijó wood veneer, brass'),
      status: 'published',
      createdDaysAgo: 10,
    },
    {
      id: 'prd_nightstand',
      businessId: 'biz_verde',
      slug: 'cumaru-nightstand',
      name: L('Cumaru Nightstand', 'Criado-Mudo Cumaru'),
      short: L('Solid-wood nightstand with an open niche.', 'Criado-mudo em madeira maciça com nicho aberto.'),
      description: L('Carved from solid cumaru with a rounded niche.', 'Esculpido em cumaru maciço com nicho arredondado.'),
      category: 'storage',
      price: 129000,
      currency: 'BRL',
      images: images(PHOTO.woodSideTable, [PHOTO.bedroomPlants], [], 'Wooden nightstand'),
      dimensions: { width: 50, height: 55, depth: 40, unit: 'cm' },
      material: L('Solid cumaru', 'Cumaru maciço'),
      status: 'published',
      createdDaysAgo: 8,
    },
    {
      id: 'prd_wall_shelves',
      businessId: 'biz_verde',
      slug: 'floating-wall-shelves',
      name: L('Floating Wall Shelves', 'Prateleiras Flutuantes'),
      short: L('Set of three floating shelves.', 'Conjunto de três prateleiras flutuantes.'),
      description: L('Mix-and-match floating shelves.', 'Prateleiras flutuantes combináveis.'),
      category: 'storage',
      price: 79000,
      currency: 'BRL',
      images: images(PHOTO.wallShelves, [], [], 'Floating wall shelves'),
      dimensions: { width: 120, height: 20, depth: 22, unit: 'cm' },
      material: L('Lacquered pine', 'Pinho lacado'),
      status: 'draft',
      createdDaysAgo: 1,
    },

    // ---- Oak & Ember (inactive catalog, USD, inches) ----
    {
      id: 'prd_desk',
      businessId: 'biz_oak',
      slug: 'walnut-writing-desk',
      name: L('Walnut Writing Desk', 'Secretária de Escrita em Nogueira'),
      short: L('A compact desk with a leather-lined drawer.', 'Secretária compacta com gaveta forrada a pele.'),
      description: L('Solid walnut desk sized for home offices.', 'Secretária em nogueira maciça para escritórios em casa.'),
      category: 'table',
      price: 129900,
      currency: 'USD',
      images: images(PHOTO.writingDesk, [], [], 'Walnut writing desk'),
      dimensions: { width: 48, height: 30, depth: 24, unit: 'in' },
      material: L('Solid walnut', 'Nogueira maciça'),
      status: 'published',
      createdDaysAgo: 150,
    },
    {
      id: 'prd_yellow_sofa',
      businessId: 'biz_oak',
      slug: 'sunny-loveseat',
      name: L('Sunny Loveseat'),
      short: L('A small, bright loveseat.'),
      description: L('A two-seat loveseat with a removable cover.'),
      category: 'sofa',
      price: 89900,
      currency: 'USD',
      images: images(PHOTO.yellowSofa, [], [], 'Yellow loveseat'),
      dimensions: { width: 60, height: 32, depth: 34, unit: 'in' },
      material: L('Cotton canvas'),
      status: 'published',
      createdDaysAgo: 140,
    },
  ]

  const products: Product[] = P.map((s) => {
    const created = daysAgo(s.createdDaysAgo, now)
    const updated = daysAgo(Math.max(0, s.createdDaysAgo - 3), now)
    return {
      id: s.id,
      businessId: s.businessId,
      slug: s.slug,
      name: s.name,
      shortDescription: s.short,
      description: s.description,
      category: s.category,
      price: s.price,
      currency: s.currency,
      images: s.images,
      models: s.glb ? { glb: glb(s.glb, s.glbRequired) } : {},
      dimensions: s.dimensions,
      material: s.material,
      weight: s.weightKg ? { value: s.weightKg, unit: 'kg' } : undefined,
      variants: s.variants ?? [],
      cta: { label: CTA_DEFAULT, url: s.ctaUrl },
      status: s.status,
      publishedAt: s.status === 'published' ? updated : undefined,
      createdAt: created,
      updatedAt: updated,
    }
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    businesses,
    products,
    events: [],
    // Only catalogs that are live can have customer views.
    dailyStats: seedDailyStats(
      products.filter((p) => businesses.find((b) => b.id === p.businessId)?.status === 'active'),
      now,
    ),
    activity: deriveActivity(businesses, products),
  }
}

/** Deterministic PRNG so sample charts look the same on every reset. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedDailyStats(products: Product[], now: number): DailyStat[] {
  const rand = mulberry32(42)
  const out: DailyStat[] = []
  products
    .filter((p) => p.status === 'published')
    .forEach((p, idx) => {
      const popularity = 6 + ((idx * 7) % 23) + (p.models.glb ? 10 : 0)
      const arPropensity = p.models.glb && !p.models.glb.url.includes('DoesNotExist') ? 0.12 + rand() * 0.14 : 0
      for (let day = 29; day >= 0; day--) {
        const date = new Date(now - day * DAY)
        const weekday = date.getUTCDay()
        const weekendBoost = weekday === 0 || weekday === 6 ? 1.35 : 1
        const trend = 1 + (29 - day) * 0.012
        const views = Math.round(popularity * weekendBoost * trend * (0.6 + rand() * 0.8))
        const arActivations = Math.round(views * arPropensity * (0.7 + rand() * 0.6))
        out.push({ productId: p.id, businessId: p.businessId, date: isoDay(date), views, arActivations })
      }
    })
  return out
}

