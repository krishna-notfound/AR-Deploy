import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { InlineNotice } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { listsCategoriesPath, listsCurrenciesPath } from '@/lib/urls'
import { useCategories } from '@/services/listsHooks'

/** The admin console's managed lists (ADR-0055): a header and two tabs, Categories and Currencies. */
export default function ListsLayout() {
  const { t } = useI18n()
  const { loaded, error, reload } = useCategories()
  const tabs = [
    { to: listsCategoriesPath(), label: t('admin.lists.tab.categories') },
    { to: listsCurrenciesPath(), label: t('admin.lists.tab.currencies') },
  ]
  return (
    <>
      <PageHeader title={t('admin.lists.title')} description={t('admin.lists.description')} />
      <nav aria-label={t('admin.lists.tabs')} className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-ui-body transition-colors',
                isActive ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {/* A list that loaded once but could not be read again (after a change, say) must not pass for current (QA EF-11). */}
      {loaded && error && (
        <div role="alert" className="mb-4">
          <InlineNotice tone="warning" className="items-center">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{`${t('admin.lists.staleNotice')} ${errorText(error, t)}`}</span>
              <Button size="sm" variant="ghost" className="underline underline-offset-2" onClick={() => void reload()}>
                {t('common.retry')}
              </Button>
            </span>
          </InlineNotice>
        </div>
      )}
      <Suspense fallback={<SkeletonRows rows={5} />}>
        <Outlet />
      </Suspense>
    </>
  )
}
