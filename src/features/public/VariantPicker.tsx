import { useId } from 'react'
import type { Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'

/**
 * Finish swatches of a product (radio group): an uppercase label, the chosen finish's name and price difference under
 * it, then square swatches with 2px corners. Product page and embed.
 */
export function VariantPicker({ product, selectedId, onSelect, className }: { product: Product; selectedId: string | undefined; onSelect: (id: string) => void; className?: string }) {
  const { t, lang, localized } = useI18n()
  const headingId = useId()
  const variant = product.variants.find((v) => v.id === selectedId)
  if (!product.variants.length) return null
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId} className="text-eyebrow text-ink-muted">
        {t('product.colors')}
      </h2>
      {variant && (
        <p className="mt-2 text-[15px] text-ink">
          <LocalizedSpan text={variant.name} />
          {variant.priceDelta ? <span className="ml-2 text-[13px] text-ink-faint tabular-nums">+{formatMoney(variant.priceDelta, product.currency, lang)}</span> : null}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={headingId} className="mt-3 flex flex-wrap gap-2">
        {product.variants.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={v.id === selectedId}
            aria-label={localized(v.name) + (v.priceDelta ? ` +${formatMoney(v.priceDelta, product.currency, lang)}` : '')}
            title={localized(v.name)}
            onClick={() => onSelect(v.id)}
            className={cn('grid size-11 place-items-center rounded-[2px] border transition-colors', v.id === selectedId ? 'border-ink' : 'border-transparent hover:border-line-strong')}
          >
            <span className="size-8 rounded-[2px] ring-1 ring-black/10 ring-inset" style={{ background: v.colorHex ?? 'var(--color-limestone)' }} aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}
