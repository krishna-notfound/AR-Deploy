import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { listsCategoriesPath, listsCurrenciesPath } from '@/lib/urls'

/** The admin console's managed lists (ADR-0055): a header and two tabs, Categories and Currencies. */
export default function ListsLayout() {
  const { t } = useI18n()
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
      <Suspense fallback={<SkeletonRows rows={5} />}>
        <Outlet />
      </Suspense>
    </>
  )
}
