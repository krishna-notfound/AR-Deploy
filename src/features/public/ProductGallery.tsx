import { SmartImage } from '@/components/ui/SmartImage'
import type { ProductImage } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { Reveal } from './Reveal'

const tile = 'h-full w-full rounded-soft-sm bg-subtle object-cover sm:rounded-soft'

/**
 * The product's own extra photos as a mosaic (ADR-0036 v2): one photo wide, two side by side, three or more as one large
 * photo beside two stacked ones, any further photos in a row of three below. There is no photo viewer to open, so the
 * photos are not buttons.
 */
export function ProductGallery({ images, name, className }: { images: ProductImage[]; name: string; className?: string }) {
  const { t } = useI18n()
  if (!images.length) return null
  const alt = (img: ProductImage, i: number) => img.alt || `${name}. ${t('product.photo', { n: i + 1, total: images.length })}`
  const [first, second, third] = images
  const rest = images.slice(3)

  return (
    <section aria-labelledby="gallery-h" className={className}>
      <Reveal>
        <h2 id="gallery-h" className="font-display text-[2rem] leading-tight font-normal text-ink sm:text-[2.5rem]">
          {t('product.gallery')}
        </h2>
      </Reveal>
      <Reveal delay={2} className="mt-6 sm:mt-8">
        {images.length === 1 && first && <SmartImage src={first.url} alt={alt(first, 0)} className={cn(tile, 'aspect-[4/3] sm:aspect-[16/9]')} />}
        {images.length === 2 && (
          <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            {images.map((img, i) => (
              <li key={img.id}>
                <SmartImage src={img.url} alt={alt(img, i)} className={cn(tile, 'aspect-[4/3]')} />
              </li>
            ))}
          </ul>
        )}
        {images.length >= 3 && first && second && third && (
          <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:aspect-[2.4/1] lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:grid-rows-2">
            <li className="col-span-2 lg:col-span-1 lg:row-span-2">
              <SmartImage src={first.url} alt={alt(first, 0)} className={cn(tile, 'aspect-[4/3] lg:aspect-auto')} />
            </li>
            <li className="min-h-0">
              <SmartImage src={second.url} alt={alt(second, 1)} className={cn(tile, 'aspect-[4/3] lg:aspect-auto')} />
            </li>
            <li className="min-h-0">
              <SmartImage src={third.url} alt={alt(third, 2)} className={cn(tile, 'aspect-[4/3] lg:aspect-auto')} />
            </li>
          </ul>
        )}
        {rest.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3">
            {rest.map((img, i) => (
              <li key={img.id}>
                <SmartImage src={img.url} alt={alt(img, i + 3)} className={cn(tile, 'aspect-[4/3]')} />
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </section>
  )
}
