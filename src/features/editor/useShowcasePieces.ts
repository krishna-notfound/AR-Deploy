import { useMemo } from 'react'
import type { ProductRef } from '@/domain/siteContent'
import type { Business, Category, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { primaryImage } from '@/lib/product'
import { service } from '@/services'
import type { ServiceError } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { houseRef } from './landingOps'

/** One piece of the admin's own showcase catalogue (ADR-0047), reduced to what the Editor's pickers and grid show. */
export interface ShowcasePiece {
  id: string
  slug: string
  name: string
  image?: string
  hasModel: boolean
  published: boolean
  category: Category
  updatedAt: string
  ref: ProductRef
  product: Product
}

export type ShowcaseState =
  | { status: 'loading' }
  | { status: 'error'; error: ServiceError; retry: () => void }
  | { status: 'ready'; business: Business; pieces: ShowcasePiece[] }

/** The house business and its pieces from `service.getShowcase()`: the only source of pieces the Editor offers (never a business's products). */
export function useShowcasePieces(): ShowcaseState {
  const { localized } = useI18n()
  const q = useServiceQuery(() => service.getShowcase(), [])
  return useMemo<ShowcaseState>(() => {
    if (q.data) {
      const { business, products } = q.data
      return {
        status: 'ready',
        business,
        pieces: products.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: localized(p.name),
          image: primaryImage(p)?.url,
          hasModel: !!p.models.glb,
          published: p.status === 'published',
          category: p.category,
          updatedAt: p.updatedAt,
          ref: houseRef(p.slug),
          product: p,
        })),
      }
    }
    if (q.status === 'error') return { status: 'error', error: q.error, retry: q.refetch }
    return { status: 'loading' }
  }, [q.data, q.status, q.error, q.refetch, localized])
}
