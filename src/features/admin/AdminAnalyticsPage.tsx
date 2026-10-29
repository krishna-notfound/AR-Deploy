import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { AnalyticsView } from '../analytics/AnalyticsView'
import { useBusinesses } from '../products/useCatalogData'

export default function AdminAnalyticsPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const businessId = params.get('business') || undefined
  const { list } = useBusinesses()
  return (
    <>
      <PageHeader title={t('nav.analytics')} description={t('admin.analytics.pageDescription')} />
      <AnalyticsView
        businessId={businessId}
        businesses={list}
        onBusinessChange={(id) => setParams(id ? { business: id } : {}, { replace: true })}
        editBase="/admin/products"
      />
    </>
  )
}
