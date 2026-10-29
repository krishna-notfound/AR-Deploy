import { Package, PackagePlus } from 'lucide-react'
import { useMemo } from 'react'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { useProductRequestStates } from '../modelRequests/hooks'
import { useServiceQuery } from '@/services/hooks'
import { CLEARED_PRODUCT_FILTERS, ProductFilterBar, applyProductFilters, hasProductFilters, useProductFilterParams } from '../products/ProductFilters'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'

export default function MyProductsPage() {
  const business = useCurrentBusiness()
  const { t } = useI18n()
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
        title={t('business.products.title')}
        actions={
          <ButtonLink to="/dashboard/products/new" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
            {t('business.products.add')}
          </ButtonLink>
        }
      />
      <Card>
        {!hasNoProducts && <ProductFilterBar state={filters} update={update} requestFilter />}
        {products.status === 'error' && !products.data ? (
          <ErrorState message={errorText(products.error, t)} onRetry={products.refetch} retryLabel={t('common.retry')} />
        ) : filters.model === 'open' && requests.status === 'error' && !requests.data ? (
          // The filter needs the request states: without them an empty list would be untrue.
          <ErrorState message={errorText(requests.error, t)} onRetry={requests.refetch} retryLabel={t('common.retry')} />
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
                <EmptyState title={t('business.products.noMatch')} action={<Button onClick={() => update(CLEARED_PRODUCT_FILTERS)}>{t('business.products.clearFilters')}</Button>} />
              ) : (
                <EmptyState
                  icon={Package}
                  title={t('business.products.emptyTitle')}
                  body={t('business.products.emptyBody')}
                />
              )
            }
          />
        )}
      </Card>
    </>
  )
}
