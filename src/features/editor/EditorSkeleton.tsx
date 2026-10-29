import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useI18n } from '@/i18n/LanguageProvider'

/** The Editor's working area while a screen loads: the same block the screens render into. */
export function EditorAreaSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

/**
 * The Editor while its draft loads, laid out like the real thing (header, sticky top bar with its buttons, section list
 * on the left, working area) so nothing jumps when the draft arrives.
 */
export function EditorSkeleton() {
  const { t } = useI18n()
  return (
    <>
      <PageHeader title={t('editor.title')} description={t('editor.description')} />
      <div role="status" aria-label={t('common.loading')}>
        <div className="-mx-1 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-1 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <div className="mb-6 flex gap-1 overflow-x-hidden border-b border-line lg:mb-0 lg:flex-col lg:self-start lg:border-b-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-11 items-center px-3 lg:min-h-10">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <EditorAreaSkeleton />
          </div>
        </div>
      </div>
    </>
  )
}
