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
import { errorText } from '@/i18n/errorText'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { catalogLocalPath } from '@/lib/urls'
import { account, service } from '@/services'
import { ok } from '@/services/catalogService'
import { useNoticeToast } from '@/features/team/useMemberActions'
import { useServiceQuery } from '@/services/hooks'
import { BusinessForm } from '../businesses/BusinessForm'
import { BusinessReadOnly } from '../businesses/BusinessReadOnly'
import { AuditTimeline } from '../applications/AuditTimeline'
import { EmailActivity } from '../applications/EmailActivity'
import { BusinessModelsCard } from '../businesses/BusinessModelsCard'
import { BusinessOwnersPanel } from '../businesses/BusinessOwnersPanel'
import { closureByBusiness } from '../businesses/closure'
import { useBusinessActions } from '../businesses/useBusinessActions'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'
import { ProductTable } from '../products/ProductTable'
import { useProductStats } from '../products/useCatalogData'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'

type Tab = 'details' | 'products' | 'owners' | 'qr'

export default function BusinessDetailPage() {
  const { t } = useI18n()
  const f = useFormat()
  const can = useCan()
  const { businessId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (['details', 'products', 'owners', 'qr'].includes(params.get('tab') ?? '') ? params.get('tab') : 'details') as Tab
  const setTab = (next: Tab) => setParams(next === 'details' ? {} : { tab: next }, { replace: true })

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

  if (business.status === 'loading' && !b) return <FullPageSpinner />
  if (!b) {
    const notFound = business.status === 'error' && business.error.code === 'NOT_FOUND'
    return (
      <>
        <PageHeader title={t(notFound ? 'admin.businesses.detail.notFound' : 'admin.businesses.detail.loadFailed')} breadcrumbs={[{ label: t('nav.businesses'), to: '/admin/businesses' }]} />
        <Card>
          {notFound ? (
            <EmptyState title={t('admin.businesses.detail.notExistTitle')} body={t('admin.businesses.detail.notExistBody')} action={<ButtonLink to="/admin/businesses">{t('admin.businesses.detail.backToList')}</ButtonLink>} />
          ) : (
            <ErrorState message={business.status === 'error' ? errorText(business.error, t) : t('common.error.generic')} onRetry={business.refetch} />
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
    ...(canToggle ? [{ label: t(b.status === 'active' ? 'admin.businesses.detail.deactivate' : 'admin.businesses.detail.activate'), onSelect: toggleActive }] : []),
    ...(canDelete ? [{ label: t('common.delete'), icon: <Trash2 aria-hidden />, destructive: true, disabled: deleting, onSelect: () => void onDelete() }] : []),
  ]

  return (
    <>
      <PageHeader
        title={b.name}
        breadcrumbs={[{ label: t('nav.businesses'), to: '/admin/businesses' }, { label: b.name }]}
        meta={
          <>
            <BusinessStatusBadge status={b.status} />
            {closure && (
              <span title={t('common.error.reason.closure_pending')}>
                <Badge tone="warning">{t('admin.businesses.list.closureOn', { date: f.date(closure.requestedAt) })}</Badge>
              </span>
            )}
            <span className="min-w-0 truncate text-ui-small text-ink-muted">/catalog/{b.slug}</span>
          </>
        }
        more={more}
        actions={
          <>
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(b, { preview: b.status !== 'active' }), '_blank', 'noopener')}>
              {t(b.status === 'active' ? 'admin.catalogs.open' : 'admin.businesses.list.previewCatalog')}
            </Button>
            {canToggle && (
              <Button className="max-sm:hidden" onClick={toggleActive}>
                {t(b.status === 'active' ? 'admin.businesses.detail.deactivate' : 'admin.businesses.detail.activate')}
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
                {t('common.delete')}
              </Button>
            )}
          </>
        }
      />
      {canViewClosures && closures.status === 'error' && !closures.data && (
        <Card className="mb-6">
          <ErrorState message={`${t('admin.businesses.detail.closureCheckFailed')} ${errorText(closures.error, t)}`} onRetry={closures.refetch} />
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
        label={t('admin.businesses.detail.sections')}
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: 'details', label: t('admin.businesses.detail.tabDetails') },
          { value: 'products', label: t('admin.overview.products'), badge: productCount === undefined ? undefined : <span className="text-ink-muted">{productCount}</span> },
          { value: 'owners', label: t('admin.businesses.detail.tabOwner') },
          { value: 'qr', label: t('admin.businesses.detail.tabQr') },
        ]}
      />
      {tab === 'details' && (
        <div className="space-y-6">
          {can('businesses.edit') ? <BusinessForm business={b} mode="edit" /> : <BusinessReadOnly business={b} />}
          <BusinessModelsCard business={b} onChanged={business.refetch} />
        </div>
      )}
      {tab === 'products' && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <p className="text-ui-body text-ink-muted">{t('admin.overview.products')}</p>
            <ButtonLink to={`/admin/products/new?business=${b.id}`} size="sm" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
              {t('admin.products.add')}
            </ButtonLink>
          </div>
          {products.status === 'error' && !products.data ? (
            <ErrorState message={`${t('admin.businesses.detail.productsFailed')} ${errorText(products.error, t)}`} onRetry={products.refetch} />
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
                  title={t('admin.products.emptyTitle')}
                  body={t('admin.businesses.detail.productsEmptyBody')}
                  action={
                    <ButtonLink to={`/admin/products/new?business=${b.id}`} variant="primary">
                      {t('admin.products.add')}
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
              <PanelHeader title={t('admin.businesses.detail.history')} />
              <CardBody>
                <p className="text-ui-body text-ink-muted">{t('admin.businesses.detail.recordsNeeded')}</p>
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
            <ErrorState message={`${t('admin.businesses.detail.catalogFailed')} ${errorText(catalog.error, t)}`} onRetry={catalog.refetch} />
          </Card>
        ) : (
          <FullPageSpinner />
        ))}
    </>
  )
}

/** What the closure means for the catalog now, from its real status (R-W3-6): never "offline" for a live catalog. */
const CLOSURE_STATUS_SENTENCE: Record<BusinessStatus, TranslationKey> = {
  inactive: 'admin.businesses.detail.closureInactive',
  draft: 'admin.businesses.detail.closureDraft',
  active: 'admin.businesses.detail.closureActive',
}

/** A business owner asked to close their account (spec 8): the Owner completes or restores it. */
function ClosureBanner({ business, request, onRestored }: { business: Business; request: ClosureRequest; onRestored: () => void }) {
  const { t } = useI18n()
  const f = useFormat()
  const confirm = useConfirm()
  const toast = useToast()
  const noticeToast = useNoticeToast()
  const navigate = useNavigate()
  const titleId = useId()
  const [completing, setCompleting] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Completed or restored elsewhere (another tab or Owner session) since this page loaded: say so and reload.
  const alreadyHandled = () => {
    toast.info(t('admin.businesses.list.alreadyHandled'))
    onRestored()
  }

  const restore = async () => {
    if (restoring) return
    const ok = await confirm({
      title: t('admin.businesses.detail.restoreTitle', { name: business.name }),
      body: t('admin.businesses.detail.restoreBody'),
      confirmLabel: t('admin.businesses.detail.restore'),
    })
    if (!ok) return
    setRestoring(true)
    const r = await account.restoreClosure(request.userId)
    setRestoring(false)
    if (r.ok) {
      noticeToast(t('admin.businesses.detail.restored'), r.data.notice, t('admin.businesses.detail.restoredBody'))
      onRestored()
    } else if (r.error.reason === 'not_found') alreadyHandled()
    else toast.error(t('admin.businesses.detail.restoreFailed'), errorText(r.error, t))
  }

  return (
    <Card role="region" aria-labelledby={titleId} className="mb-6 border border-warning/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id={titleId} className="text-ui-card font-semibold text-ink">
            {t('admin.businesses.list.closureRequested')}
          </h2>
          <p className="mt-1 text-ui-body break-words text-ink-body">
            {t('admin.businesses.detail.askedToClose', { email: request.email, date: f.date(request.requestedAt) })} {t(CLOSURE_STATUS_SENTENCE[business.status])}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void restore()} loading={restoring} disabled={completing}>
            {t('admin.businesses.detail.restore')}
          </Button>
          <Button variant="danger" onClick={() => setCompleting(true)} disabled={restoring}>
            {t('admin.businesses.list.completeClosure')}
          </Button>
        </div>
      </div>
      <ActionCodeDialog
        open={completing}
        purpose="complete_closure"
        title={t('admin.businesses.detail.completeTitle', { name: business.name })}
        description={t('admin.businesses.detail.completeBody')}
        confirmLabel={t('admin.businesses.list.completeClosure')}
        destructive
        onClose={() => setCompleting(false)}
        onConfirm={async (code) => {
          const r = await account.completeClosure(request.userId, code)
          if (r.ok) {
            noticeToast(t('admin.businesses.list.closureDone'), r.data.notice, t('admin.businesses.detail.completedBody', { name: business.name }))
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
