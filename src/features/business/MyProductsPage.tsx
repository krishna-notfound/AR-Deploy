import { Package, PackagePlus } from 'lucide-react'
import { useMemo } from 'react'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useProductRequestStates } from '../modelRequests/hooks'
import { useServiceQuery } from '@/services/hooks'
import { CLEARED_PRODUCT_FILTERS, ProductFilterBar, applyProductFilters, hasProductFilters, useProductFilterParams } from '../products/ProductFilters'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'

export default function MyProductsPage() {
  const business = useCurrentBusiness()
  const [filters, update] = useProductFilterParams()
  // Always scoped to the signed-in business; the URL never chooses the business here.
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const stats = useProductStats(business.id)
  const requests = useProductRequestStates(business.id)
  const bizMap = useMemo(() => new Map([[business.id, business]]), [business])
  const filtered = useMemo(() => applyProductFilters(products.data ?? [], { ...filters, business: '' }, requests.data), [products.data, filters, requests.data])
  const hasFilters = hasProductFilters({ ...filters, business: '' })
  // Nothing to filter yet: a loaded, empty catalogue (not merely an empty result).
  const hasNoProducts = products.status === 'success' && (products.data?.length ?? 0) === 0

  return (
    <>
      <PageHeader
        title="My products"
        actions={
          <ButtonLink to="/dashboard/products/new" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
            Add product
          </ButtonLink>
        }
      />
      <Card>
        {!hasNoProducts && <ProductFilterBar state={filters} update={update} requestFilter />}
        {products.status === 'error' && !products.data ? (
          <ErrorState message={products.error.message} onRetry={products.refetch} />
        ) : filters.model === 'open' && requests.status === 'error' && !requests.data ? (
          // The filter needs the request states: without them an empty list would be untrue.
          <ErrorState message={requests.error.message} onRetry={requests.refetch} />
        ) : (
          <ProductTable
            scope="business"
            products={filtered}
            businesses={bizMap}
            stats={stats.map}
            requestStates={requests.data}
            loading={products.status === 'loading' && !products.data}
            page={filters.page}
            onPageChange={(page) => update({ page })}
            empty={
              hasFilters ? (
                <EmptyState title="No products match these filters" action={<Button onClick={() => update(CLEARED_PRODUCT_FILTERS)}>Clear filters</Button>} />
              ) : (
                <EmptyState
                  icon={Package}
                  title="Add your first product"
                  body="Upload photos and a 3D model so customers can see it in their room. Use Add product at the top of the page."
                />
              )
            }
          />
        )}
      </Card>
    </>
  )
}
