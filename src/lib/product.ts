import type { Product } from '@/domain/types'

/** The price the product page opens on: base price plus the first variant's difference. */
export function initialPrice(p: Pick<Product, 'price' | 'variants'>) {
  return p.price + (p.variants[0]?.priceDelta ?? 0)
}

/** The primary gallery image (falls back to the first gallery image, then any image). */
export function primaryImage(p: Pick<Product, 'images'>) {
  return p.images.find((i) => i.isPrimary && i.kind === 'gallery') ?? p.images.find((i) => i.kind === 'gallery') ?? p.images[0]
}
