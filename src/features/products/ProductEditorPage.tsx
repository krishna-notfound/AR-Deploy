import { Building2 } from 'lucide-react'
import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ProductEditorForm } from './editor/ProductEditorForm'
import { useBusinesses } from './useCatalogData'
import type { EditorScope } from './useProductActions'

/** Shared editor route for both dashboards (design/15). */
export default function ProductEditorPage({ scope }: { scope: EditorScope }) {
  const { productId } = useParams()
  const [params] = useSearchParams()
  const { business: ownBusiness } = useAccount()
  const businesses = useBusinesses()
  const product = useServiceQuery(() => (productId ? service.getProductById(productId) : Promise.resolve({ ok: true as const, data: null })), [productId])

  const base = scope === 'admin' ? '/admin/products' : '/dashboard/products'
  const crumbs = [
    { label: scope === 'admin' ? 'All Products' : 'My Products', to: base },
    { label: productId ? 'Edit product' : 'Add product' },
  ]

  // Keep the initially loaded product stable while the user edits (store refetches are ignored).
  const initial = useMemo(() => product.data, [product.data?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Right after a new product's first save the id changes one render before the new query starts.
  const stale = productId && product.status === 'success' && product.data?.id !== productId
  if ((product.status === 'loading' && !product.data) || stale) return <FullPageSpinner />
  // A failed background refresh keeps the loaded product, so the form (and unsaved edits) stays mounted.
  if (product.status === 'error' && product.error.code !== 'NOT_FOUND' && !product.data) return <ErrorState message={product.error.message} onRetry={product.refetch} />

  const notFound = (productId && !product.data) || (scope === 'business' && product.data && product.data.businessId !== ownBusiness?.id)
  if (notFound) {
    return (
      <>
        <PageHeader title="Product not found" breadcrumbs={crumbs} />
        <Card>
          <EmptyState title="This product does not exist" body="It may have been deleted, or it belongs to another business." action={<ButtonLink to={base}>Back to products</ButtonLink>} />
        </Card>
      </>
    )
  }

  if (scope === 'admin' && businesses.list.length === 0 && businesses.query.status === 'success') {
    return (
      <>
        <PageHeader title="Add product" breadcrumbs={crumbs} />
        <Card>
          <EmptyState
            icon={Building2}
            title="Create a business first"
            body="Every product belongs to a business catalog."
            action={
              <ButtonLink to="/admin/businesses/new" variant="primary">
                Create business
              </ButtonLink>
            }
          />
        </Card>
      </>
    )
  }

  if (scope === 'admin' && businesses.query.status === 'loading' && !businesses.query.data) return <FullPageSpinner />
  if (scope === 'admin' && businesses.query.status === 'error' && !businesses.query.data)
    return <ErrorState message={`The businesses could not be loaded. ${businesses.query.error.message}`} onRetry={businesses.query.refetch} />

  return (
    <ProductEditorForm
      key={initial?.id ?? 'new'}
      scope={scope}
      product={initial ?? null}
      currentStatus={product.data?.status ?? 'draft'}
      businesses={scope === 'admin' ? businesses.list : ownBusiness ? [ownBusiness] : []}
      fixedBusiness={scope === 'business' ? (ownBusiness ?? undefined) : undefined}
      preselectBusinessId={params.get('business') ?? undefined}
      breadcrumbs={crumbs}
    />
  )
}
