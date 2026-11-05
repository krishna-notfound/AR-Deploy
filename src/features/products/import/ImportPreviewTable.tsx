import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { fieldText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { formatDimensions, formatMoney } from '@/lib/format'
import type { PreparedRow } from './importRows'

/**
 * The rows of an import with a status each: ready, or the problems that keep the row from being created. The table
 * scrolls inside its own box (both ways), so a phone never scrolls the page sideways.
 */
export function ImportPreviewTable({ rows }: { rows: readonly PreparedRow[] }) {
  const { t, lang } = useI18n()
  return (
    <div className="max-h-[28rem] overflow-auto rounded-[var(--radius-control)] border border-line" tabIndex={0} role="region" aria-label={t('products.import.preview.region')}>
      <table className="w-full min-w-[52rem] border-collapse text-left text-ui-body" aria-label={t('products.import.preview.table')}>
        <thead className="sticky top-0 z-10 bg-subtle text-ui-small text-ink-muted">
          <tr>
            <th scope="col" className="w-12 px-3 py-2.5 text-right font-medium">
              {t('products.import.col.row')}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {t('products.import.col.status')}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {t('products.import.col.name')}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {t('products.import.col.category')}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {t('products.import.col.price')}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {t('products.import.col.size')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const ready = p.errors.length === 0
            const d = p.input.dimensions
            const hasSize = d.width > 0 || d.height > 0 || d.depth > 0
            return (
              <tr key={p.index} className="border-t border-line align-top" data-status={ready ? 'ready' : 'error'}>
                <td className="px-3 py-2.5 text-right text-ink-muted tabular-nums">{p.index + 1}</td>
                <td className="min-w-56 px-3 py-2.5">
                  {ready ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-success">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                      {t('products.import.status.ready')}
                    </span>
                  ) : (
                    <div className="text-danger">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
                        <AlertCircle className="size-4 shrink-0" aria-hidden />
                        {t('products.import.status.errors')}
                      </span>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ui-small">
                        {p.errors.map((e) => (
                          <li key={`${e.key}${JSON.stringify(e.vars ?? {})}`}>{fieldText(e, t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="max-w-xs min-w-40 px-3 py-2.5">
                  <div className="font-medium text-ink [overflow-wrap:anywhere]">{p.row.name.en || <span className="text-ink-muted">{t('products.import.noName')}</span>}</div>
                  {p.row.name.pt && <div className="text-ui-small text-ink-muted [overflow-wrap:anywhere]">{p.row.name.pt}</div>}
                </td>
                <td className="px-3 py-2.5 text-ink-body">{p.input.category === p.row.category ? t(`category.${p.input.category}`) : p.row.category || '–'}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-ink-body tabular-nums">{p.row.price !== undefined ? formatMoney(p.input.price, p.input.currency, lang) : '–'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink-body tabular-nums">{hasSize ? formatDimensions(d) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
