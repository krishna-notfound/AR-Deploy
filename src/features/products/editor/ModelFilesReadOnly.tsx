// The 3D files of a product or an option, read-only, for a business owner whose own uploads are off (S4 R-S4-4):
// the Sanctus team manages them, so there is no upload, URL or remove control here.
import { FileBox } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { ModelAsset, ProductModels } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { formatFileSize } from '@/lib/format'
import { AR_READINESS_HINT_KEY, AR_READINESS_LABEL_KEY, productArReadiness } from '../productReadiness'

const FORMAT_TITLE = { glb: 'products.model.glbTitle', usdz: 'products.model.usdzTitle' } as const

/** `label` names the target ("the product" or the option's name) for screen readers. */
export function ModelFilesReadOnly({ models, label }: { models: ProductModels; label: string }) {
  const { t } = useI18n()
  const files = [models.glb, models.usdz].filter((m): m is ModelAsset => !!m)
  if (!files.length) return <p className="text-[13px] leading-[1.45] text-ink-muted">{t('products.model.noFiles')}</p>
  const readiness = productArReadiness({ models })
  return (
    <section aria-label={t('products.model.filesFor', { label })} className="rounded-[var(--radius-card)] border border-line p-4">
      <h4 className="text-[14px] font-semibold text-ink">{t('products.model.managedByTeam')}</h4>
      <ul className="mt-3 space-y-2">
        {files.map((f) => (
          <li key={f.format} className="flex min-w-0 items-center gap-2.5 text-[13px] leading-[1.45]">
            <FileBox className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="shrink-0 font-medium text-ink">{t(FORMAT_TITLE[f.format])}</span>
            <span className="min-w-0 truncate text-ink-muted">
              {f.fileName}
              {f.sizeBytes ? ` · ${formatFileSize(f.sizeBytes)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] leading-[1.45] text-ink-muted">
        <Badge tone={readiness === 'ready' ? 'success' : readiness === 'photos-only' ? 'neutral' : 'warning'}>{t(AR_READINESS_LABEL_KEY[readiness])}</Badge>
        <span>{t(AR_READINESS_HINT_KEY[readiness])}</span>
      </p>
    </section>
  )
}
