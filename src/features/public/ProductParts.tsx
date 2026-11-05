import { ArrowUpRight, Box, CheckCircle2, HelpCircle, Loader2, Smartphone } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/Form'
import { SmartImage } from '@/components/ui/SmartImage'
import type { LengthUnit, Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import type { MeasuredSize } from '@/lib/scale'
import { DimensionDiagram } from './DimensionDiagram'
import type { ProductStage } from './useProductStage'

// The product pages' shared pieces (business page and showcase page, ADR-0047): the action buttons, the dimensions
// block, the specification list and the extra photos. Layout stays with each page.

/** Obsidian: the main action. The three action buttons share one height (48px) so a row of them lines up. */
export const primaryAction =
  'inline-flex h-12 items-center justify-center gap-3 self-stretch rounded-[var(--radius-control)] bg-obsidian px-6 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-chalk transition-colors hover:bg-umber sm:self-start'
/** Outlined: the product's own link and Share. */
export const secondaryAction =
  'inline-flex h-12 items-center justify-center gap-3 self-stretch rounded-[var(--radius-control)] border border-obsidian bg-transparent px-6 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink transition-colors hover:bg-obsidian hover:text-chalk sm:self-start'

/**
 * The main action of a piece with a model, only once the model loaded (AR-08). Where model-viewer can open AR it launches
 * AR; elsewhere it opens the 3D view and ArSection explains the phone hand-off.
 */
export function ArPrimaryAction({ stage, arLabel }: { stage: ProductStage; arLabel: string }) {
  const { t } = useI18n()
  if (stage.modelState !== 'loaded') return null
  if (stage.availability === 'available')
    return (
      <button type="button" onClick={stage.onActivate} disabled={stage.launching} aria-busy={stage.launching} className={cn(primaryAction, 'disabled:cursor-progress disabled:bg-umber')}>
        {stage.launching ? t('ar.preparing') : arLabel}
        {stage.launching ? <Loader2 className="size-4 animate-spin" strokeWidth={1.4} aria-hidden /> : <Smartphone className="size-4" strokeWidth={1.4} aria-hidden />}
      </button>
    )
  return (
    <button type="button" onClick={stage.open3d} className={primaryAction}>
      {t('product.view3d')}
      <Box className="size-4" strokeWidth={1.4} aria-hidden />
    </button>
  )
}

/** The product's own link (label and URL from the product form) as a real button, opening in a new tab. */
export function ProductLinkButton({ product, outlined }: { product: Product; outlined: boolean }) {
  const { t, localized } = useI18n()
  if (!product.cta.url || product.cta.hidden) return null
  return (
    <a href={product.cta.url} target="_blank" rel="noopener noreferrer" data-product-link className={outlined ? secondaryAction : primaryAction}>
      {localized(product.cta.label).trim() ? <LocalizedSpan text={product.cta.label} /> : t('product.contactStore')}
      <ArrowUpRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
    </a>
  )
}

/**
 * Copy for the scale note. Only the GLB is measured. Without a USDZ, iPhone Quick Look gets a file generated from
 * that GLB, so "true to size" holds for both AR viewers; an uploaded USDZ is never measured, so the claim is
 * limited to the 3D model (COR-10).
 */
export function scaleNoteKeys(verified: boolean, separateUsdz: boolean) {
  if (!verified) return { title: 'ar.scaleUnverified', help: 'ar.scaleUnverifiedHelp' } as const
  if (separateUsdz) return { title: 'ar.scaleVerifiedModel', help: 'ar.scaleVerifiedUsdzHelp' } as const
  return { title: 'ar.scaleVerified', help: 'ar.scaleVerifiedHelp' } as const
}

function ScaleNote({ verified, separateUsdz, measured, unit }: { verified: boolean; separateUsdz: boolean; measured: MeasuredSize; unit: LengthUnit }) {
  const { t } = useI18n()
  const keys = scaleNoteKeys(verified, separateUsdz)
  const toUnit = (m: number) => {
    const v = unit === 'cm' ? m * 100 : (m * 100) / 2.54
    return Math.round(v)
  }
  const size = `${toUnit(measured.x)} × ${toUnit(measured.y)} × ${toUnit(measured.z)} ${unit}`
  return (
    <div className={cn('mt-5 flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-3 text-[13px]', verified ? 'border-success/20 bg-success-soft text-success' : 'border-line bg-subtle text-ink-muted')}>
      {verified ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>
        <p className="font-medium">{t(keys.title)}</p>
        <p className="mt-0.5 opacity-90">
          {t(keys.help)} {!verified && t('ar.modelMeasures', { size })}
        </p>
      </div>
    </div>
  )
}

/** The scale verdict beside the AR action (AR-09): the same labels as the scale note under the dimensions. */
export function ScaleBadge({ verified, separateUsdz }: { verified: boolean; separateUsdz: boolean }) {
  const { t } = useI18n()
  return (
    <p className={cn('flex items-center gap-1.5 text-[13px] font-medium', verified ? 'text-success' : 'text-ink-muted')}>
      {verified ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <HelpCircle className="size-4 shrink-0" aria-hidden />}
      {t(scaleNoteKeys(verified, separateUsdz).title)}
    </p>
  )
}

/** The badge where AR can start and the scale is known; nothing otherwise. */
export function ArScaleBadge({ stage }: { stage: ProductStage }) {
  if (stage.availability !== 'available' || stage.scale.status === 'unknown') return null
  return <ScaleBadge verified={stage.scale.status === 'verified'} separateUsdz={stage.separateUsdz} />
}

/** Diagram, the three measures with a cm / in switch, and the scale note once the model is measured. */
export function DimensionsSection({ product, stage }: { product: Product; stage: ProductStage }) {
  const { t } = useI18n()
  const { unit, fmtLen, scale } = stage
  return (
    <section className="mt-10 border-t border-line pt-6" aria-labelledby="dims-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dims-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
          {t('product.dimensions')}
        </h2>
        {/* Hit areas grown to 44px tall on the small control; its look is unchanged. */}
        <span className="[&_button]:relative [&_button]:before:absolute [&_button]:before:inset-x-0 [&_button]:before:-inset-y-2 [&_button]:before:content-['']">
          <SegmentedControl
            size="sm"
            label={t('product.unitToggle')}
            value={unit}
            onChange={stage.setUnit}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'in', label: 'in' },
            ]}
          />
        </span>
      </div>
      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto]">
        <DimensionDiagram dims={product.dimensions} unit={unit} />
        <dl className="grid grid-cols-3 gap-3 text-sm sm:min-w-44 sm:grid-cols-1 sm:gap-0 sm:divide-y sm:divide-line">
          {(['width', 'height', 'depth'] as const).map((k) => (
            <div key={k} className="sm:flex sm:items-baseline sm:justify-between sm:gap-6 sm:py-2.5">
              <dt className="text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted uppercase">{t(`product.${k}`)}</dt>
              <dd className="mt-1 text-[14px] text-ink tabular-nums sm:mt-0">
                {fmtLen(product.dimensions[k])} {unit}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {scale.status !== 'unknown' && stage.modelState === 'loaded' && <ScaleNote verified={scale.status === 'verified'} separateUsdz={stage.separateUsdz} measured={scale.measured} unit={unit} />}
    </section>
  )
}

/** Material, weight and the long description. */
export function ProductSpecs({ product }: { product: Product }) {
  const { t, localized } = useI18n()
  const hasMaterial = !!localized(product.material)
  return (
    <>
      {(hasMaterial || product.weight) && (
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {hasMaterial && (
            <div className="flex items-baseline justify-between gap-6 py-4">
              <dt className="shrink-0 text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">{t('product.material')}</dt>
              <dd className="min-w-0 text-right text-[14px] text-ink-muted">
                <LocalizedSpan text={product.material} />
              </dd>
            </div>
          )}
          {product.weight && (
            <div className="flex items-baseline justify-between gap-6 py-4">
              <dt className="shrink-0 text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">{t('product.weight')}</dt>
              <dd className="text-right text-[14px] text-ink-muted tabular-nums">
                {product.weight.value} {product.weight.unit}
              </dd>
            </div>
          )}
        </dl>
      )}

      {localized(product.description) && (
        <section className={cn('pt-6', hasMaterial || product.weight ? 'mt-0' : 'mt-8 border-t border-line')} aria-labelledby="desc-h">
          <h2 id="desc-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
            {t('product.description')}
          </h2>
          <LocalizedSpan as="p" text={product.description} className="mt-3 max-w-prose text-[15px] leading-7 whitespace-pre-line text-ink-muted" />
        </section>
      )}
    </>
  )
}

/** The additional photographs, below the product. */
export function MorePhotos({ stage }: { stage: ProductStage }) {
  const { t } = useI18n()
  if (stage.additional.length === 0) return null
  return (
    <section className="mt-20 border-t border-line pt-8" aria-labelledby="more-h">
      <h2 id="more-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
        {t('product.morePhotos')}
      </h2>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {stage.additional.map((img) => (
          <li key={img.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-2.5 sm:p-3">
            <SmartImage src={img.url} alt={img.alt || stage.name} className="aspect-[4/3] w-full rounded-[var(--radius-control)] bg-subtle" />
          </li>
        ))}
      </ul>
    </section>
  )
}
