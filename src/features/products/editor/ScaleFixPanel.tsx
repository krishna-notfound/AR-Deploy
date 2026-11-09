import { Ruler } from 'lucide-react'
import { useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import type { Dimensions, Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { localeOf } from '@/i18n/locale'
import { cn } from '@/lib/cn'
import { type MeasuredSize, type ScaleProposal, type ScaleUnitLabel, MODEL_SIZE_MAX_M, MODEL_SIZE_MIN_M, UNIT_SCALE_FACTORS, checkScale } from '@/lib/scale'

type Choice = ScaleUnitLabel | 'keep'

/** A length in metres to three significant digits, in the person's number format (0.0006 stays 0.0006). */
export const formatMeters = (v: number, lang: Lang) => Number(v.toPrecision(3)).toLocaleString(localeOf(lang), { maximumFractionDigits: 6 })
/** "W × H × D" in metres. */
export const formatSizeMeters = (s: MeasuredSize, lang: Lang) => `${formatMeters(s.x, lang)} × ${formatMeters(s.y, lang)} × ${formatMeters(s.z, lang)}`

const OPTIONS: { key: Choice; label: TranslationKey; factor?: number }[] = [
  { key: 'mm', label: 'products.scaleFix.optMm', factor: UNIT_SCALE_FACTORS.mm },
  { key: 'cm', label: 'products.scaleFix.optCm', factor: UNIT_SCALE_FACTORS.cm },
  { key: 'in', label: 'products.scaleFix.optIn', factor: UNIT_SCALE_FACTORS.in },
  { key: 'custom', label: 'products.scaleFix.optCustom' },
  { key: 'keep', label: 'products.scaleFix.optKeep', factor: 1 },
]

const CAUSE: Record<'mm' | 'cm' | 'in', TranslationKey> = { mm: 'products.scaleFix.cause.mm', cm: 'products.scaleFix.cause.cm', in: 'products.scaleFix.cause.in' }

/** Reads a typed factor ("0.001" or "0,001"); null when it is not a usable number. */
function parseFactor(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 1e-6 && n <= 1e6 ? n : null
}

/**
 * "Fix the scale" step (ADR-0058, owner 2026-11-09): shown before a GLB is uploaded when its measured size is implausible
 * for furniture or matches the product's dimensions in other units. Nothing is changed without the person's choice.
 */
export function ScaleFixPanel({
  measured,
  proposal,
  dimensions,
  busy,
  scaling = false,
  failed,
  onApply,
  onKeep,
  onCancel,
}: {
  measured: MeasuredSize
  proposal: ScaleProposal
  dimensions: Dimensions
  /** Scaling or uploading is running. */
  busy: boolean
  /** The scale is being applied (labels the main button). */
  scaling?: boolean
  failed: boolean
  onApply: (factor: number) => void
  onKeep: () => void
  onCancel: () => void
}) {
  const { t, lang } = useI18n()
  const id = useId()
  const [choice, setChoice] = useState<Choice>(proposal.suggested.label)
  const [custom, setCustom] = useState(String(proposal.suggested.factor))

  const num = (v: number) => formatMeters(v, lang)
  const size = (s: MeasuredSize) => formatSizeMeters(s, lang)
  const scaled = (f: number): MeasuredSize => ({ x: measured.x * f, y: measured.y * f, z: measured.z * f })
  const entered = dimensions.width > 0 && dimensions.height > 0 && dimensions.depth > 0 ? `${dimensions.width} × ${dimensions.height} × ${dimensions.depth} ${dimensions.unit}` : null
  const customFactor = parseFactor(custom)
  const factorOf = (key: Choice) => (key === 'custom' ? customFactor : OPTIONS.find((o) => o.key === key)!.factor!)
  const selected = factorOf(choice)

  const cause = proposal.suggested.label === 'custom' ? t(proposal.kind === 'too-small' ? 'products.scaleFix.cause.small' : 'products.scaleFix.cause.large') : t(CAUSE[proposal.suggested.label])

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 rounded-[var(--radius-control)] border border-warning/50 bg-subtle/60 p-3.5 text-[13px] leading-[1.45] text-ink-body">
      <h5 id={`${id}-title`} className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Ruler className="size-4 shrink-0 text-warning" aria-hidden />
        {t('products.scaleFix.title')}
      </h5>
      <p className="mt-2 text-ink">
        {t('products.scaleFix.measures', { size: size(measured), tall: num(measured.y) })} {cause}
        {proposal.kind === 'units' && ` ${t('products.scaleFix.causeMatches')}`}
      </p>
      <p className="mt-1 text-ink-muted">{t('products.scaleFix.nothing')}</p>
      <p className="mt-1 text-ink-muted">{entered ? t('products.scaleFix.entered', { size: entered }) : t('products.scaleFix.noneEntered')}</p>

      <fieldset className="mt-3 min-w-0" disabled={busy}>
        <legend className="text-[13px] font-medium text-ink">{t('products.scaleFix.legend')}</legend>
        <div className="mt-1.5 space-y-1.5">
          {OPTIONS.map((o) => {
            const f = factorOf(o.key)
            const result = f != null ? scaled(f) : null
            const outside = result != null && o.key !== 'keep' && [result.x, result.y, result.z].some((v) => v > MODEL_SIZE_MAX_M || v < MODEL_SIZE_MIN_M)
            const matches = result != null && o.key !== 'keep' && entered != null && checkScale(result, dimensions).status === 'verified'
            return (
              <div key={o.key} className={cn('rounded-[var(--radius-control)] border px-3 py-2', choice === o.key ? 'border-ink bg-surface' : 'border-line bg-surface/60')}>
                <label className="flex min-h-7 cursor-pointer items-start gap-2.5 pointer-coarse:min-h-9">
                  <input type="radio" name={`${id}-choice`} value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)] pointer-coarse:size-5" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{t(o.label)}</span>
                    {result && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted tabular-nums">
                        {t(o.key === 'keep' ? 'products.scaleFix.unchanged' : 'products.scaleFix.result', { size: size(result) })}
                        {matches && <Badge tone="success">{t('products.scaleFix.matches')}</Badge>}
                      </span>
                    )}
                    {outside && <span className="block text-warning">{t('products.scaleFix.stillOutside')}</span>}
                  </span>
                </label>
                {o.key === 'custom' && choice === 'custom' && (
                  <div className="mt-2 pl-[26px]">
                    <label htmlFor={`${id}-factor`} className="block font-medium text-ink">
                      {t('products.scaleFix.factorLabel')}
                    </label>
                    <Input
                      id={`${id}-factor`}
                      inputMode="decimal"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      aria-invalid={customFactor == null || undefined}
                      aria-describedby={`${id}-factor-help`}
                      className="mt-1 h-9 max-w-40 max-sm:h-11"
                    />
                    <p id={`${id}-factor-help`} className={cn('mt-1', customFactor == null ? 'text-danger' : 'text-ink-muted')}>
                      {t(customFactor == null ? 'products.scaleFix.factorInvalid' : 'products.scaleFix.factorHelp')}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>

      {failed && (
        <p role="alert" className="mt-2 text-danger">
          {t('products.scaleFix.failed')}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="primary" size="sm" loading={busy} disabled={selected == null} onClick={() => (choice === 'keep' ? onKeep() : onApply(selected!))}>
          {t(scaling ? 'products.scaleFix.applying' : 'products.scaleFix.apply')}
        </Button>
        <Button size="sm" disabled={busy} onClick={onKeep}>
          {t('products.scaleFix.uploadAsIs')}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </section>
  )
}
