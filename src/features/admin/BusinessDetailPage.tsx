import { useCan } from '@/auth/usePermission'
import { ExternalLink, PackagePlus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader, PanelHeader } from '@/components/layout/PageHeader'
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import type { MenuItem } from '@/components/ui/Menu'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/ToastProvider'
import { Package } from 'lucide-react'
import type { Business, BusinessStatus, ClosureRequest } from '@/domain/types'
import { formatDate } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { catalogLocalPath } from '@/lib/urls'
import { account, service } from '@/services'
import { CLOSURE_PENDING_ERROR, ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { BusinessForm } from '../businesses/BusinessForm'
import { AuditTimeline } from '../applications/AuditTimeline'
import { EmailActivity } from '../applications/EmailActivity'
import { BusinessOwnersPanel } from '../businesses/BusinessOwnersPanel'
import { closureByBusiness } from '../businesses/closure'
import { useBusinessActions } from '../businesses/useBusinessActions'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'

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
  // Closure requests are the Owner's to complete or restore (spec 8). Everyone with businesses.view sees that one is
  // open (a read-only badge), and nobody is offered Activate while it is (R-W1-3).
  const isPlatformOwner = can('owner')
  const canViewClosures = can('businesses.view')
  // null (not an empty list) until the requests are really loaded for this user: Activate never shows on a placeholder.
  const closures = useServiceQuery<ClosureRequest[] | null>(
    () => (canViewClosures ? account.listClosureRequests() : Promise.resolve(ok(null))),
    [canViewClosures],
  )
  const prefs = usePreferences()

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

  // The exact count from business_product_counts, as on the Businesses list (R-W5-6); a products read stops at 1000
  // rows. Undefined until it has loaded: never show or confirm "0 products" for an unknown count.
  const productCount = catalog.data?.totalProductCount
  const bizMap = new Map([[b.id, b]])

  const closure = closures.data ? closureByBusiness(closures.data).get(b.id) : undefined
  // Same gates and handlers as the inline buttons; below sm these two live in the header's More menu. Activate is
  // offered only once the closure requests are known and none is open for this business.
  const canToggle = can('businesses.status') && can('businesses.edit') && (b.status === 'active' || (canViewClosures && !!closures.data && !closure))
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
            {closure && (
              <span title={CLOSURE_PENDING_ERROR.message}>
                <Badge tone="warning">Closure requested on {formatDate(closure.requestedAt, 'en', prefs)}</Badge>
              </span>
            )}
            <span className="min-w-0 truncate text-ui-small text-ink-muted">/catalog/{b.slug}</span>
          </>
        }
        more={more}
        actions={
          <>
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(b, { preview: b.status !== 'active' }), '_blank', 'noopener')}>
              {b.status === 'active' ? 'Open catalog' : 'Preview catalog'}
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
      {canViewClosures && closures.status === 'error' && !closures.data && (
        <Card className="mb-6">
          <ErrorState message={`Could not check for a closure request. ${closures.error.message}`} onRetry={closures.refetch} />
        </Card>
      )}
      {isPlatformOwner && closure && (
        <ClosureBanner
          business={b}
          request={closure}
          onRestored={() => {
            closures.refetch()
            business.refetch()
          }}
        />
      )}
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
            <p className="text-ui-body text-ink-muted">Products</p>
            <ButtonLink to={`/admin/products/new?business=${b.id}`} size="sm" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
              Add product
            </ButtonLink>
          </div>
          {products.status === 'error' && !products.data ? (
            <ErrorState message={`Could not load this catalog’s products. ${products.error.message}`} onRetry={products.refetch} />
          ) : (
            <ProductTable
              scope="admin"
              showBusiness={false}
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
          {/* R-W7-8: a business's history and emails are records.view; without it, say what is needed. */}
          {can('records.view') ? (
            <div className="space-y-6">
              <AuditTimeline businessId={b.id} />
              <EmailActivity businessId={b.id} />
            </div>
          ) : (
            <Card>
              <PanelHeader title="History" />
              <CardBody>
                <p className="text-ui-body text-ink-muted">{RECORDS_NEEDED}</p>
              </CardBody>
            </Card>
          )}
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

const ALREADY_HANDLED = 'This closure was already handled.'
/** R-W7-8: shown in place of History and Email activity without records.view. */
const RECORDS_NEEDED = "This business's history needs 'View the audit log and email log'."

/** What the closure means for the catalog now, from its real status (R-W3-6): never "offline" for a live catalog. */
const CLOSURE_STATUS_SENTENCE: Record<BusinessStatus, string> = {
  inactive: 'The catalog is inactive and offline until you complete the closure, which deletes the business and their account, or restore it.',
  draft: 'The catalog is a draft and offline until you complete the closure, which deletes the business and their account, or restore it, which keeps it as a draft.',
  active: 'The catalog is still live. Complete the closure, which deletes the business and their account, or restore it.',
}

/** A business owner asked to close their account (spec 8): the Owner completes or restores it. */
function ClosureBanner({ business, request, onRestored }: { business: Business; request: ClosureRequest; onRestored: () => void }) {
  const prefs = usePreferences()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const titleId = useId()
  const [completing, setCompleting] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Completed or restored elsewhere (another tab or Owner session) since this page loaded: say so and reload.
  const alreadyHandled = () => {
    toast.info(ALREADY_HANDLED)
    onRestored()
  }

  const restore = async () => {
    if (restoring) return
    const ok = await confirm({
      title: `Restore ${business.name}?`,
      body: 'The closure request is removed and the catalog goes back to the status it had before. We email the owner.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    setRestoring(true)
    const r = await account.restoreClosure(request.userId)
    setRestoring(false)
    if (r.ok) {
      toast.success('Business restored', 'The catalog is back at its previous status and the owner was emailed.')
      onRestored()
    } else if (r.error.reason === 'not_found') alreadyHandled()
    else toast.error('Could not restore the business', r.error.message)
  }

  return (
    <Card role="region" aria-labelledby={titleId} className="mb-6 border border-warning/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id={titleId} className="text-ui-card font-semibold text-ink">
            Closure requested
          </h2>
          <p className="mt-1 text-ui-body break-words text-ink-body">
            {request.email} asked to close their account on {formatDate(request.requestedAt, 'en', prefs)}. {CLOSURE_STATUS_SENTENCE[business.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void restore()} loading={restoring} disabled={completing}>
            Restore
          </Button>
          <Button variant="danger" onClick={() => setCompleting(true)} disabled={restoring}>
            Complete closure
          </Button>
        </div>
      </div>
      <ActionCodeDialog
        open={completing}
        purpose="complete_closure"
        title={`Complete closure of ${business.name}?`}
        description="This deletes the business with its products, photos and models, and the owner's account. It can't be undone. We email the owner a final notice."
        confirmLabel="Complete closure"
        destructive
        onClose={() => setCompleting(false)}
        onConfirm={async (code) => {
          const r = await account.completeClosure(request.userId, code)
          if (r.ok) {
            toast.success('Closure completed', `${business.name} and its owner's account were deleted.`)
            navigate('/admin/businesses')
          } else if (r.error.reason === 'not_found') {
            // Nothing left to complete: close the dialog (an ok answer closes it) and show the current state.
            alreadyHandled()
            return { ok: true as const, data: undefined }
          }
          return r
        }}
      />
    </Card>
  )
}
