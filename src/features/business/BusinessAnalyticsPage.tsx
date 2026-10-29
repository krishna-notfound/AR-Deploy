import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { AnalyticsView } from '../analytics/AnalyticsView'

export default function BusinessAnalyticsPage() {
  const business = useCurrentBusiness()
  const { t } = useI18n()
  return (
    <>
      <PageHeader title={t('business.analytics.title')} description={t('business.analytics.description')} />
      <AnalyticsView businessId={business.id} editBase="/dashboard/products" />
    </>
  )
}
