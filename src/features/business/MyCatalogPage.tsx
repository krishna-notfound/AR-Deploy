import { useCurrentBusiness } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'

export default function MyCatalogPage() {
  const business = useCurrentBusiness()
  const catalog = useServiceQuery(() => service.getCatalog(business.slug), [business.slug])
  return (
    <>
      <PageHeader title="My catalog & QR code" description="Share your catalog link or print the QR code for your showroom, flyers and packaging." />
      {catalog.data ? (
        <CatalogQrPanel catalog={catalog.data} productsLink="/dashboard/products" />
      ) : catalog.status === 'error' ? (
        <Card>
          <ErrorState message={catalog.error.message} onRetry={catalog.refetch} />
        </Card>
      ) : (
        <FullPageSpinner />
      )}
    </>
  )
}
