import { useCurrentBusiness } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'

export default function MyCatalogPage() {
  const business = useCurrentBusiness()
  const { t } = useI18n()
  const catalog = useServiceQuery(() => service.getCatalog(business.slug), [business.slug])
  return (
    <>
      <PageHeader title={t('business.catalog.title')} description={t('business.catalog.description')} />
      {catalog.data ? (
        <CatalogQrPanel catalog={catalog.data} productsLink="/dashboard/products" />
      ) : catalog.status === 'error' ? (
        <Card>
          <ErrorState message={errorText(catalog.error, t)} onRetry={catalog.refetch} retryLabel={t('common.retry')} />
        </Card>
      ) : (
        <FullPageSpinner />
      )}
    </>
  )
}
