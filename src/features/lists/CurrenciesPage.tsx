import { useMemo, useState } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Form'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { CurrencyItem } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { localeOf } from '@/i18n/locale'
import { lists } from '@/services'
import { reloadLists, useCurrencies } from '@/services/listsHooks'

/** The currency's name in the person's language ("Libra esterlina"), or the code when the browser does not know it. */
function currencyName(code: string, lang: 'en' | 'pt'): string {
  try {
    return new Intl.DisplayNames(localeOf(lang), { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Admin console: which currencies companies and products can use (ADR-0055). A searchable list with a switch each. */
export default function CurrenciesPage() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const { currencies, loaded, error, reload } = useCurrencies()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(() => currencies.map((c) => ({ ...c, name: currencyName(c.code, lang) })), [currencies, lang])
  const term = q.trim().toLowerCase()
  const shown = term ? rows.filter((c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)) : rows
  const on = currencies.filter((c) => c.enabled).length

  async function toggle(c: CurrencyItem, enabled: boolean) {
    setBusy(c.code)
    try {
      const res = await lists.setCurrencyEnabled(c.code, enabled)
      if (!res.ok) toast.error(errorText(res.error, t))
      else await reloadLists()
    } finally {
      setBusy(null)
    }
  }

  if (!loaded) {
    return error ? <ErrorState message={errorText(error, t)} onRetry={() => void reload()} retryLabel={t('common.retry')} /> : <SkeletonRows rows={6} />
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-ui-body text-ink-muted">{t('admin.lists.currencies.intro')}</p>
      <Card>
        <CardHeader title={t('admin.lists.currencies.listLabel')} description={t('admin.lists.currencies.count', { on, total: currencies.length })} actions={<SearchInput value={q} onChange={setQ} label={t('admin.lists.currencies.search')} placeholder={t('admin.lists.currencies.searchPlaceholder')} className="w-full sm:w-72" />} />
        <CardBody>
          {on === 1 && <InlineNotice tone="neutral" className="mb-3">{t('admin.lists.currencies.onlyOne')}</InlineNotice>}
          {shown.length === 0 ? (
            <EmptyState title={t('admin.lists.currencies.none', { q: q.trim() })} />
          ) : (
            <ul aria-label={t('admin.lists.currencies.listLabel')} className="divide-y divide-line border-y border-line">
              {shown.map((c) => (
                <li key={c.code} className="flex min-h-14 items-center py-2" data-currency={c.code}>
                  <div className="flex-1">
                    <Switch
                      label={<span className="tabular-nums">{c.code}</span>}
                      description={c.name}
                      checked={c.enabled}
                      // The last one on cannot be switched off (the database refuses it too).
                      disabled={busy === c.code || (c.enabled && on === 1)}
                      onChange={(enabled) => void toggle(c, enabled)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
