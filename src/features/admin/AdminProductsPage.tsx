import { useCan } from '@/auth/usePermission'
import { Package, PackagePlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CLEARED_PRODUCT_FILTERS, ProductFilterBar, applyProductFilters, hasProductFilters, useProductFilterParams } from '../products/ProductFilters'
import { ProductTable } from '../products/ProductTable'
import { useBusinesses, useProductStats } from '../products/useCatalogData'

export default function AdminProductsPage() {
  const { t } = useI18n()
  const can = useCan()
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
        title={t('admin.products.title')}
        actions={
          can('products.edit') && (
            <Button variant="primary" icon={<PackagePlus className="size-4" aria-hidden />} onClick={addProduct}>
              {t('admin.products.add')}
            </Button>
          )
        }
      />
      <Card>
        <ProductFilterBar state={filters} update={update} businesses={businesses} />
        {products.status === 'error' && !products.data ? (
          <ErrorState message={errorText(products.error, t)} onRetry={products.refetch} />
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
                  title={t('admin.products.noMatchTitle')}
                  body={t('admin.products.noMatchBody')}
                  action={<Button onClick={() => update(CLEARED_PRODUCT_FILTERS)}>{t('admin.products.clearFilters')}</Button>}
                />
              ) : (
                <EmptyState icon={Package} title={t('admin.products.emptyTitle')} body={t('admin.products.emptyBody')} action={<Button variant="primary" onClick={addProduct}>{t('admin.products.add')}</Button>} />
              )
            }
          />
        )}
      </Card>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('admin.products.pickerTitle')}
        description={t('admin.products.pickerBody')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setPickerOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!pick} onClick={() => navigate(`/admin/products/new?business=${pick}`)}>
              {t('common.continue')}
            </Button>
          </>
        }
      >
        <FormField label={t('admin.products.business')}>
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
