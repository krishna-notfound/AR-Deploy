// The four collection cards the landing page shows until the Website Editor publishes its own (ADR-0046). Their texts are
// the landing dictionary keys `landing.col.<key>` and `landing.col.<key>Body`, so the page keeps them in both languages and
// "Start from the current collections" in the Editor copies exactly what visitors see today.
import type { Category } from '@/domain/types'
import type { LandingCollection, LandingCollectionLink, LandingImageKey } from '@/domain/siteContent'
import { enCore } from '@/i18n/dictionaries/en'
import { ptCore } from '@/i18n/dictionaries/pt'

export interface BuiltinCollection {
  key: 'sofas' | 'tables' | 'armchairs' | 'decor'
  /** The catalogue category the card opens (the first catalogue that has one, else the first catalogue). */
  category: Category
  image: LandingImageKey
}

export const BUILTIN_COLLECTIONS: readonly BuiltinCollection[] = [
  { key: 'sofas', category: 'sofa', image: 'sofa-travertine' },
  { key: 'tables', category: 'table', image: 'dining-table' },
  { key: 'armchairs', category: 'chair', image: 'lounge-chair' },
  { key: 'decor', category: 'decor', image: 'lamp-vase' },
]

/**
 * The built-in cards as Editor cards, for the "Start from the current collections" button. `linkFor` chooses where each
 * card leads (the default: the collection's own page, /collections/<slug>).
 */
export function builtinAsCollections(
  linkFor: (c: BuiltinCollection) => LandingCollectionLink = () => ({ kind: 'collection' }),
  newId: () => string = () => crypto.randomUUID(),
): LandingCollection[] {
  return BUILTIN_COLLECTIONS.map((c) => ({
    id: newId(),
    slug: c.key,
    title: { en: enCore[`landing.col.${c.key}`], pt: ptCore[`landing.col.${c.key}`] ?? enCore[`landing.col.${c.key}`] },
    text: { en: enCore[`landing.col.${c.key}Body`], pt: ptCore[`landing.col.${c.key}Body`] ?? enCore[`landing.col.${c.key}Body`] },
    image: c.image,
    link: linkFor(c),
    products: [],
  }))
}
