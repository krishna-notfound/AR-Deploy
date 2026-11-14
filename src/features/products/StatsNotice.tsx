import { Button } from '@/components/ui/Button'
import { InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import type { QueryResult } from '@/services/hooks'

/**
 * Shown above a product table when the views and AR counts could not be read: without it the table would show 0 views and
 * 0 AR attempts for every product, as if nobody had looked (QA EF-04). Renders nothing otherwise.
 */
export function StatsNotice({ query, className }: { query: Pick<QueryResult<unknown>, 'status' | 'data' | 'refetch'>; className?: string }) {
  const { t } = useI18n()
  if (query.status !== 'error') return null
  return (
    <div role="alert" className={className}>
      <InlineNotice tone="warning" className="items-center">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t('products.stats.failed')}</span>
          <Button size="sm" variant="ghost" className="underline underline-offset-2" onClick={query.refetch}>
            {t('common.retry')}
          </Button>
        </span>
      </InlineNotice>
    </div>
  )
}
