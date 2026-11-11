// The built-in photographs of the landing page (the owner's Stitch set, public/images/sanctus/v2; no new files) that a
// collection card may use. The Website Editor stores only the key (ADR-0046); the labels here are the alt text and the
// names the picture chooser shows. The key list lives in the domain file so the publish checks can use it; this record is
// typed by it, so adding a photo to one and not the other does not compile.
import type { LandingImageKey, SiteAsset } from '@/domain/siteContent'
import { siteAssetUrl } from '@/services'
import type { Lang } from '@/domain/types'

export interface LandingImage {
  src: string
  /** Tailwind object-position class when the subject is not centred. */
  focus?: string
  /** What the photo shows (alt text, and the label in the Editor's picture chooser). */
  alt: Record<Lang, string>
}

const src = (name: string) => `/images/sanctus/v2/${name}.webp`

export const LANDING_IMAGES: Record<LandingImageKey, LandingImage> = {
  'sofa-travertine': {
    src: src('sofa-travertine'),
    alt: { en: 'A curved bouclé sofa beside a travertine table', pt: 'Sofá curvo em bouclé junto a uma mesa em travertino' },
  },
  'dining-table': {
    src: src('dining-table'),
    alt: { en: 'A dining table in a bright room', pt: 'Mesa de jantar numa sala luminosa' },
  },
  'lounge-chair': {
    src: src('lounge-chair'),
    focus: 'object-[62%_80%]',
    alt: { en: 'A lounge armchair', pt: 'Poltrona de sala' },
  },
  'lamp-vase': {
    src: src('lamp-vase'),
    alt: { en: 'A lamp and a vase', pt: 'Candeeiro e vaso' },
  },
  'hero-living': {
    src: src('hero-living'),
    alt: {
      en: 'A curved bouclé sofa and a travertine coffee table in a concrete living room with a mountain view',
      pt: 'Sofá curvo em bouclé e mesa de centro em travertino numa sala de betão com vista para as montanhas',
    },
  },
  'armchair-walnut': {
    src: src('armchair-walnut'),
    alt: { en: 'An armchair: bouclé upholstery on a walnut frame', pt: 'Poltrona: estofado bouclé sobre estrutura de nogueira' },
  },
  'coffee-table': {
    src: src('coffee-table'),
    alt: { en: 'A round raw-travertine coffee table with a bronze bowl and a vase', pt: 'Mesa de centro redonda em travertino bruto com uma tigela de bronze e um vaso' },
  },
  'detail-joinery': {
    src: src('detail-joinery'),
    alt: { en: 'A walnut joint beside bouclé upholstery', pt: 'Encaixe de madeira de nogueira junto a um estofado bouclé' },
  },
  'interior-villa': {
    src: src('interior-villa'),
    alt: { en: 'A wide living room with concrete walls and windows over the mountains', pt: 'Sala ampla com paredes de betão e janelas sobre as montanhas' },
  },
  'ar-phone': {
    src: src('ar-phone'),
    alt: { en: 'A phone showing an armchair placed in a living room in augmented reality', pt: 'Telemóvel a mostrar uma poltrona colocada numa sala em realidade aumentada' },
  },
  'model-wireframe': {
    src: src('model-wireframe'),
    alt: { en: 'An armchair as a 3D wireframe model next to the finished piece', pt: 'Poltrona como modelo 3D em malha ao lado da peça final' },
  },
  'showroom-qr': {
    src: src('showroom-qr'),
    alt: { en: 'A QR card on a showroom counter: scan to see the piece in your room in AR', pt: 'Cartão com código QR num balcão de showroom: leia para ver a peça na sua sala em RA' },
  },
}

/** The photo for a stored key; unknown keys (an old or hand-edited draft) show no photo rather than a broken one. */
/** A collection card's picture: a built-in key, or a file the Owner/Admin uploaded (SiteAsset, resolved to its public URL). Undefined when unknown. */
export function collectionImage(image: string | SiteAsset): { src: string; focus?: string; uploaded?: boolean } | undefined {
  if (typeof image === 'string') return landingImage(image)
  const src = siteAssetUrl(image)
  return src ? { src, uploaded: true } : undefined
}

export const landingImage = (key: string): LandingImage | undefined => (Object.hasOwn(LANDING_IMAGES, key) ? LANDING_IMAGES[key as LandingImageKey] : undefined)
