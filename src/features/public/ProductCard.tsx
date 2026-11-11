import { ArrowRight, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Product } from '@/domain/types'
import { hasAny3d } from '@/features/ar/variantMedia'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { primaryImage } from '@/lib/product'
import { useCategoryLabel } from '@/services/listsHooks'

// The one product card of the public pages (ADR-0054): the company catalogue, a collection page and the showcase's
// "More pieces". Sanctus style: a hairline frame, the whole piece on a subtle ground in the product photo frame, 4:5 (object-contain,
// so a cropped file fills it exactly and an uncropped one shows whole), the category label, the serif name and a "3D · AR" chip when the piece has a model. No price: prices are
// not shown on public pages. The grid around it is two columns on a phone.

/** The 4:5 picture frame (keyed by its source, so a new source tries again). The photo is contained, so a tall wardrobe and a low table both show whole. */
const FRAME = imageFrame('product')

function CardImage({ src, alt }: { src?: string; alt: string }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(!src)
  if (failed)
    return (
      <div role="img" aria-label={alt || t('ui.image.unavailable')} className={cn('flex w-full items-center justify-center text-ink-faint', FRAME.aspectClass)}>
        <ImageOff className="size-5" aria-hidden />
      </div>
    )
  return (
    <img
      src={src}
      alt={alt}
      width={800}
      height={1000}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        'w-full transition-transform duration-500 ease-out group-hover/card:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100',
        FRAME.aspectClass,
        FRAME.fitClass,
      )}
    />
  )
}

export function ProductCard({ product, href, headingLevel = 'h2' }: { product: Product; href: string; headingLevel?: 'h2' | 'h3' }) {
  const { t, localized } = useI18n()
  const categoryLabel = useCategoryLabel()
  const name = localized(product.name)
  return (
    <Link
      to={href}
      className="group/card flex h-full w-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink sm:p-4"
    >
      <div className="relative overflow-hidden rounded-[var(--radius-control)] bg-subtle">
        <CardImage key={primaryImage(product)?.url ?? ''} src={primaryImage(product)?.url} alt={name} />
        {hasAny3d(product) && (
          <span className="absolute top-2 left-2 rounded-[var(--radius-control)] bg-obsidian px-2 py-1 text-xs leading-4 font-medium tracking-[0.08em] text-chalk uppercase sm:top-3 sm:left-3">
            <span aria-hidden>{t('collection.chip')}</span>
            <span className="sr-only">{t('collection.chipLabel')}</span>
          </span>
        )}
      </div>
      <p className="mt-4 text-xs leading-4 font-medium tracking-[0.08em] text-accent-ink uppercase">{categoryLabel(product.category)}</p>
      <LocalizedSpan as={headingLevel} text={product.name} className="mt-1.5 font-display text-[1.2rem] leading-snug font-normal break-words text-ink sm:text-[1.4rem]" />
      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] leading-5 font-medium text-ink transition-colors group-hover/card:text-accent-ink">
        {t('catalog.viewPiece')}
        <ArrowRight className="size-3.5 transition-transform group-hover/card:translate-x-0.5" strokeWidth={1.5} aria-hidden />
      </span>
    </Link>
  )
}
