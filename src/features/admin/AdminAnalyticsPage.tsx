import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnalyticsView } from '../analytics/AnalyticsView'
import { useBusinesses } from '../products/useCatalogData'

export default function AdminAnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const businessId = params.get('business') || undefined
  const { list } = useBusinesses()
  return (
    <>
      <PageHeader title="Analytics" description="Product page views and AR button activations." />
      <AnalyticsView
        businessId={businessId}
        businesses={list}
        onBusinessChange={(id) => setParams(id ? { business: id } : {}, { replace: true })}
        editBase="/admin/products"
      />
    </>
  )
}
