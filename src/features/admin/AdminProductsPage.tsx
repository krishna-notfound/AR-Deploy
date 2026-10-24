import { Package, PackagePlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CLEARED_PRODUCT_FILTERS, ProductFilterBar, applyProductFilters, hasProductFilters, useProductFilterParams } from '../products/ProductFilters'
import { ProductTable } from '../products/ProductTable'
import { useBusinesses, useProductStats } from '../products/useCatalogData'

export default function AdminProductsPage() {
  const [filters, update] = useProductFilterParams()
  const products = useServiceQuery(() => service.getProducts(), [])
  const { list: businesses, map: bizMap } = useBusinesses()
  const stats = useProductStats()
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pick, setPick] = useState('')

  const filtered = useMemo(() => applyProductFilters(products.data ?? [], filters), [products.data, filters])
  const hasFilters = hasProductFilters(filters)

  const addProduct = () => {
    if (filters.business) return navigate(`/admin/products/new?business=${filters.business}`)
    setPick(businesses[0]?.id ?? '')
    setPickerOpen(true)
  }

  return (
    <>
      <PageHeader
        title="All products"
        actions={
          <Button variant="primary" icon={<PackagePlus className="size-4" aria-hidden />} onClick={addProduct}>
            Add product
          </Button>
        }
      />
      <Card>
        <ProductFilterBar state={filters} update={update} businesses={businesses} />
        {products.status === 'error' && !products.data ? (
          <ErrorState message={products.error.message} onRetry={products.refetch} />
        ) : (
          <ProductTable
            scope="admin"
            products={filtered}
            businesses={bizMap}
            stats={stats.map}
            loading={products.status === 'loading' && !products.data}
            page={filters.page}
            onPageChange={(page) => update({ page })}
            empty={
              hasFilters ? (
                <EmptyState
                  title="No products match these filters"
                  body="Try another search, business or status."
                  action={<Button onClick={() => update(CLEARED_PRODUCT_FILTERS)}>Clear filters</Button>}
                />
              ) : (
                <EmptyState icon={Package} title="No products yet" body="Add the first product to a business catalog." action={<Button variant="primary" onClick={addProduct}>Add product</Button>} />
              )
            }
          />
        )}
      </Card>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add a product"
        description="Choose the business catalog this product belongs to."
        size="sm"
        footer={
          <>
            <Button onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!pick} onClick={() => navigate(`/admin/products/new?business=${pick}`)}>
              Continue
            </Button>
          </>
        }
      >
        <FormField label="Business">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} data-autofocus>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      </Modal>
    </>
  )
}
