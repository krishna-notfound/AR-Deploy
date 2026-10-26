import { useId } from 'react'
import type { Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'

/**
 * Finish swatches of a product (radio group): "Finish" with the chosen finish's name (and price difference) on the
 * right, then round swatches; the selected one has a bronze ring. Product page and embed. `names`: each finish's name
 * under its swatch (product page, v2).
 */
export function VariantPicker({
  product,
  selectedId,
  onSelect,
  className,
  names = false,
}: {
  product: Product
  selectedId: string | undefined
  onSelect: (id: string) => void
  className?: string
  names?: boolean
}) {
  const { t, lang, localized } = useI18n()
  const headingId = useId()
  const variant = product.variants.find((v) => v.id === selectedId)
  if (!product.variants.length) return null
  return (
    <section className={className} aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-[16px] leading-6 font-medium text-ink">
          {t('product.colors')}
        </h2>
        {variant && (
          <p className="min-w-0 text-right text-[15px] leading-6 text-ink-muted">
            <LocalizedSpan text={variant.name} />
            {variant.priceDelta ? <span className="ml-2 tabular-nums">+{formatMoney(variant.priceDelta, product.currency, lang)}</span> : null}
          </p>
        )}
      </div>
      <div role="radiogroup" aria-labelledby={headingId} className={cn('mt-3 flex flex-wrap', names ? 'gap-x-3 gap-y-4' : 'gap-2')}>
        {product.variants.map((v) => {
          const selected = v.id === selectedId
          const ring = cn(
            'grid size-12 place-items-center rounded-full ring-inset transition-shadow motion-safe:duration-200',
            selected ? 'ring-2 ring-accent' : 'ring-0 hover:ring-1 hover:ring-line-strong',
          )
          const swatch = <span className="size-9 rounded-full ring-1 ring-black/10 ring-inset" style={{ background: v.colorHex ?? 'var(--color-limestone)' }} aria-hidden />
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={localized(v.name) + (v.priceDelta ? ` +${formatMoney(v.priceDelta, product.currency, lang)}` : '')}
              title={localized(v.name)}
              onClick={() => onSelect(v.id)}
              className={names ? 'group flex w-24 flex-col items-center gap-1.5 rounded-soft-sm' : ring}
            >
              {names ? (
                <>
                  <span className={cn(ring, !selected && 'group-hover:ring-1 group-hover:ring-line-strong')}>{swatch}</span>
                  <span className={cn('line-clamp-2 text-center text-[13px] leading-4', selected ? 'font-medium text-ink' : 'text-ink-muted')} aria-hidden>
                    {localized(v.name)}
                  </span>
                </>
              ) : (
                swatch
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
