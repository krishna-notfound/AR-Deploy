import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnalyticsView } from '../analytics/AnalyticsView'

export default function BusinessAnalyticsPage() {
  const business = useCurrentBusiness()
  return (
    <>
      <PageHeader title="Analytics" description={`Product page views and AR activations for ${business.name}.`} />
      <AnalyticsView businessId={business.id} editBase="/dashboard/products" />
    </>
  )
}
