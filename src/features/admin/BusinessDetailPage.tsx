import { useCan } from '@/auth/usePermission'
import { ExternalLink, PackagePlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { MenuItem } from '@/components/ui/Menu'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { Package } from 'lucide-react'
import { catalogLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { BusinessForm } from '../businesses/BusinessForm'
import { AuditTimeline } from '../applications/AuditTimeline'
import { EmailActivity } from '../applications/EmailActivity'
import { BusinessOwnersPanel } from '../businesses/BusinessOwnersPanel'
import { useBusinessActions } from '../businesses/useBusinessActions'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'

type Tab = 'details' | 'products' | 'owners' | 'qr'

export default function BusinessDetailPage() {
  const can = useCan()
  const { businessId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (['details', 'products', 'owners', 'qr'].includes(params.get('tab') ?? '') ? params.get('tab') : 'details') as Tab
  const setTab = (t: Tab) => setParams(t === 'details' ? {} : { tab: t }, { replace: true })

  const business = useServiceQuery(() => service.getBusinessById(businessId), [businessId])
  const b = business.data
  const catalog = useServiceQuery(() => (b ? service.getCatalog(b.slug) : Promise.resolve({ ok: true as const, data: null })), [b?.slug, b?.updatedAt])
  const products = useServiceQuery(() => service.getProductsByBusiness(businessId), [businessId])
  const stats = useProductStats(businessId)
  const actions = useBusinessActions()
  const [deleting, setDeleting] = useState(false)

  if (business.status === 'loading' && !b) return <FullPageSpinner />
  if (!b) {
    const notFound = business.status === 'error' && business.error.code === 'NOT_FOUND'
    return (
      <>
        <PageHeader title={notFound ? 'Business not found' : 'Could not load business'} breadcrumbs={[{ label: 'Businesses', to: '/admin/businesses' }]} />
        <Card>
          {notFound ? (
            <EmptyState title="This business does not exist" body="It may have been deleted." action={<ButtonLink to="/admin/businesses">Back to businesses</ButtonLink>} />
          ) : (
            <ErrorState message={business.status === 'error' ? business.error.message : 'Unknown error'} onRetry={business.refetch} />
          )}
        </Card>
      </>
    )
  }

  // Undefined until the products (or the catalogue summary) have loaded: never show or confirm "0 products" for an unknown count.
  const productCount = products.data?.length ?? catalog.data?.totalProductCount
  const bizMap = new Map([[b.id, b]])

  // Same gates and handlers as the inline buttons; below sm these two live in the header's More menu.
  const canToggle = can('businesses.status') && can('businesses.edit')
  const canDelete = can('businesses.delete')
  const toggleActive = () => void actions.setActive(b, b.status !== 'active')
  const onDelete = async () => {
    if (deleting) return
    setDeleting(true)
    const ok = await actions.remove(b, productCount, { after: '/admin/businesses' })
    if (!ok) setDeleting(false)
  }
  const more: MenuItem[] = [
    ...(canToggle ? [{ label: b.status === 'active' ? 'Deactivate' : 'Activate', onSelect: toggleActive }] : []),
    ...(canDelete ? [{ label: 'Delete', icon: <Trash2 aria-hidden />, destructive: true, disabled: deleting, onSelect: () => void onDelete() }] : []),
  ]

  return (
    <>
      <PageHeader
        title={b.name}
        breadcrumbs={[{ label: 'Businesses', to: '/admin/businesses' }, { label: b.name }]}
        meta={
          <>
            <BusinessStatusBadge status={b.status} />
            <span className="min-w-0 truncate text-ui-small text-ink-muted">/catalog/{b.slug}</span>
          </>
        }
        more={more}
        actions={
          <>
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(b), '_blank', 'noopener')}>
              Open catalog
            </Button>
            {canToggle && (
              <Button className="max-sm:hidden" onClick={toggleActive}>
                {b.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                className="text-danger! hover:bg-danger-soft! max-sm:hidden"
                icon={<Trash2 className="size-4" aria-hidden />}
                loading={deleting}
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <Tabs
        label="Business sections"
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: 'details', label: 'Details' },
          { value: 'products', label: 'Products', badge: productCount === undefined ? undefined : <span className="text-ink-muted">{productCount}</span> },
          { value: 'owners', label: 'Owner & history' },
          { value: 'qr', label: 'Catalog & QR' },
        ]}
      />
      {tab === 'details' && <BusinessForm business={b} mode="edit" />}
      {tab === 'products' && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <p className="text-ui-body text-ink-muted">Products in {b.name}’s catalog</p>
            <ButtonLink to={`/admin/products/new?business=${b.id}`} size="sm" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
              Add product
            </ButtonLink>
          </div>
          {products.status === 'error' && !products.data ? (
            <ErrorState message={`Could not load this catalog’s products. ${products.error.message}`} onRetry={products.refetch} />
          ) : (
            <ProductTable
              scope="admin"
              products={products.data ?? []}
              businesses={bizMap}
              stats={stats.map}
              loading={products.status === 'loading' && !products.data}
              empty={
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  body="Add the first product to this catalog."
                  action={
                    <ButtonLink to={`/admin/products/new?business=${b.id}`} variant="primary">
                      Add product
                    </ButtonLink>
                  }
                />
              }
            />
          )}
        </Card>
      )}
      {tab === 'owners' && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <BusinessOwnersPanel business={b} />
          <div className="space-y-6">
            <AuditTimeline businessId={b.id} />
            <EmailActivity businessId={b.id} />
          </div>
        </div>
      )}
      {tab === 'qr' &&
        (catalog.data ? (
          <CatalogQrPanel catalog={catalog.data} productsLink={`/admin/products?business=${b.id}`} />
        ) : catalog.status === 'error' ? (
          <Card>
            <ErrorState message={`Could not load the catalog. ${catalog.error.message}`} onRetry={catalog.refetch} />
          </Card>
        ) : (
          <FullPageSpinner />
        ))}
    </>
  )
}
