import { useI18n } from '@/i18n/LanguageProvider'
import { Skeleton } from './Skeleton'

/**
 * The dashboard's page-shaped loading state while a route's code downloads: a title and subtitle line, then a table-like
 * block. Bars are flat inside the dashboard (see Skeleton), so there is no motion to switch off for prefers-reduced-motion.
 */
export function PageSkeleton() {
  const { t } = useI18n()
  return (
    <div role="status" aria-label={t('common.loading')} className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="border border-line bg-surface">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y divide-line px-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-[52px] items-center gap-3">
              <Skeleton className="size-8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-[13px] w-1/5" />
              </div>
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
