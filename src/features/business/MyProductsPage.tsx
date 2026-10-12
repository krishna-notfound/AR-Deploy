import { Package, PackagePlus } from 'lucide-react'
import { useMemo } from 'react'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ProductFilterBar, applyProductFilters, useProductFilterParams } from '../products/ProductFilters'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'

export default function MyProductsPage() {
  const business = useCurrentBusiness()
  const [filters, update] = useProductFilterParams()
  // Always scoped to the signed-in business; the URL never chooses the business here.
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const stats = useProductStats(business.id)
  const bizMap = useMemo(() => new Map([[business.id, business]]), [business])
  const filtered = useMemo(() => applyProductFilters(products.data ?? [], { ...filters, business: '' }), [products.data, filters])
  const hasFilters = !!(filters.q || filters.status || filters.category)

  return (
    <>
      <PageHeader
        title="My products"
        description={`Products in ${business.name}’s catalog.`}
        actions={
          <ButtonLink to="/dashboard/products/new" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
            Add product
          </ButtonLink>
        }
      />
      <Card>
        <ProductFilterBar state={filters} update={update} />
        {products.status === 'error' && !products.data ? (
          <ErrorState message={products.error.message} onRetry={products.refetch} />
        ) : (
          <ProductTable
            scope="business"
            products={filtered}
            businesses={bizMap}
            stats={stats.map}
            loading={products.status === 'loading' && !products.data}
            page={filters.page}
            onPageChange={(page) => update({ page })}
            empty={
              hasFilters ? (
                <EmptyState title="No products match these filters" action={<Button onClick={() => update({ q: '', status: '', category: '' })}>Clear filters</Button>} />
              ) : (
                <EmptyState
                  icon={Package}
                  title="Add your first product"
                  body="Upload photos and a 3D model so customers can see it in their room."
                  action={
                    <ButtonLink to="/dashboard/products/new" variant="primary">
                      Add product
                    </ButtonLink>
                  }
                />
              )
            }
          />
        )}
      </Card>
    </>
  )
}
