// The admin's showcase pieces (ADR-0047): the one source of the landing page's and the collection pages' products.
// Everything on those pages comes from here, never from the business lists, so a client's product can never appear.
import { useCallback, useMemo } from 'react'
import { HOUSE_BUSINESS_SLUG, type ProductRef } from '@/domain/siteContent'
import type { Business, Product } from '@/domain/types'
import { variantMedia } from '@/features/ar/variantMedia'
import { primaryImage } from '@/lib/product'
import { service } from '@/services'
import type { ServiceError } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'

export interface ShowcasePieces {
  /** `ready` also covers "no showcase catalogue yet" (NOT_FOUND): the pages then show their empty state, not an error. */
  status: 'loading' | 'ready' | 'error'
  error?: ServiceError
  refetch: () => void
  business?: Business
  /** Published pieces with a picture, newest first. */
  pieces: Product[]
  bySlug: (slug: string) => Product | undefined
  /** The piece a landing/collection ref points at; only refs to the house business count. */
  ofRef: (ref?: ProductRef) => Product | undefined
}

export const hasGlb = (p: Product) => !!variantMedia(p).models.glb

export function useShowcasePieces(): ShowcasePieces {
  const q = useServiceQuery(() => service.getShowcase(), [])
  const missing = q.status === 'error' && q.error.code === 'NOT_FOUND'
  const data = q.status === 'success' ? q.data : undefined
  const pieces = useMemo(
    () =>
      (data?.products ?? [])
        .filter((p) => p.status === 'published' && !!primaryImage(p))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.en.localeCompare(b.name.en)),
    [data],
  )
  const bySlug = useCallback((slug: string) => pieces.find((p) => p.slug === slug), [pieces])
  const ofRef = useCallback((ref?: ProductRef) => (ref && ref.businessSlug === HOUSE_BUSINESS_SLUG ? bySlug(ref.productSlug) : undefined), [bySlug])
  const status = q.status === 'loading' ? 'loading' : q.status === 'error' && !missing ? 'error' : 'ready'
  return { status, error: q.status === 'error' && !missing ? q.error : undefined, refetch: q.refetch, business: data?.business, pieces, bySlug, ofRef }
}
