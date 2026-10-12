import type { Product } from '@/domain/types'

/** The primary gallery image (falls back to the first gallery image, then any image). */
export function primaryImage(p: Pick<Product, 'images'>) {
  return p.images.find((i) => i.isPrimary && i.kind === 'gallery') ?? p.images.find((i) => i.kind === 'gallery') ?? p.images[0]
}
