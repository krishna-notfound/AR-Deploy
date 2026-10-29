import { useCan } from '@/auth/usePermission'
import { Building2, ExternalLink, MoreHorizontal, Package, Pencil, Plus, Power, QrCode, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { FormField, Select } from '@/components/ui/Form'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { SearchInput } from '@/components/ui/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import { SmartImage } from '@/components/ui/SmartImage'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, BusinessCatalog, BusinessStatus, ClosureRequest, OwnerState } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { businessAdminPath, catalogLocalPath } from '@/lib/urls'
import { account, isDemoMode, service } from '@/services'
import { ok } from '@/services/catalogService'
import { useNoticeToast } from '@/features/team/useMemberActions'
import { useServiceQuery } from '@/services/hooks'
import { closureByBusiness } from '../businesses/closure'
import { useBusinessActions } from '../businesses/useBusinessActions'
import { Monogram } from '../applications/Monogram'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'

function BusinessMark({ b, className }: { b: Business; className?: string }) {
  return b.logoUrl ? (
    <SmartImage src={b.logoUrl} alt="" className={`size-8 shrink-0 border border-line bg-surface object-contain p-0.5 ${className ?? ''}`} />
  ) : (
    <Monogram name={b.name} className={className} />
  )
}

interface Row {
  catalog: BusinessCatalog
  views: number
  ar: number
}

export default function BusinessesListPage() {
  const { t, tn } = useI18n()
  const f = useFormat()
  const can = useCan()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as '' | BusinessStatus
  const ownerFilter = (params.get('owner') ?? '') as '' | OwnerState['state']
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  // Closure requests are the Owner's to handle (spec 8): the filter, its count and the orphan requests are the Owner's.
  // Everyone with businesses.view sees which business has one (a read-only badge) and gets no Activate there (R-W1-3).
  const isPlatformOwner = can('owner')
  const canViewClosures = can('businesses.view')
  const closureOnly = isPlatformOwner && params.get('closure') === '1'
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const analytics = useServiceQuery(() => service.getAnalytics(), [])
  // Owner state of every row (R-W2-5). A failure leaves the list usable: a notice above it and no owner filter.
  const ownerStates = useServiceQuery(() => service.getOwnerStates(), [])
  const ownerOf = useMemo(() => new Map((ownerStates.data ?? []).map((s) => [s.businessId, s])), [ownerStates.data])
  const ownersLoading = ownerStates.status === 'loading' && !ownerStates.data
  // null (not an empty list) until the requests are really loaded for this user: Activate never shows on a placeholder.
  const closures = useServiceQuery<ClosureRequest[] | null>(
    () => (canViewClosures ? account.listClosureRequests() : Promise.resolve(ok(null))),
    [canViewClosures],
  )
  const actions = useBusinessActions()
  const navigate = useNavigate()

  // Open closure requests by business (a staff closure has no business and is never listed here).
  const closureOf = useMemo(() => closureByBusiness(closures.data ?? []), [closures.data])
  const closing = useMemo(
    () => new Set((catalogs.data ?? []).filter((c) => closureOf.has(c.business.id)).map((c) => c.business.id)),
    [closureOf, catalogs.data],
  )
  // Requests whose business is no longer listed (a closure that stopped part-way): still the Owner's to finish.
  const orphans = useMemo(() => {
    if (!catalogs.data) return []
    const listed = new Set(catalogs.data.map((c) => c.business.id))
    return (closures.data ?? []).filter((r) => !r.businessId || !listed.has(r.businessId))
  }, [closures.data, catalogs.data])
  const closureCount = closing.size + orphans.length

  const rows = useMemo<Row[]>(() => {
    const perf = new Map((analytics.data?.byBusiness ?? []).map((b) => [b.businessId, b]))
    const term = q.trim().toLowerCase()
    return (catalogs.data ?? [])
      .filter((c) => !closureOnly || closing.has(c.business.id))
      .filter((c) => !status || c.business.status === status)
      .filter((c) => !ownerFilter || !ownerStates.data || ownerOf.get(c.business.id)?.state === ownerFilter)
      .filter((c) => !term || c.business.name.toLowerCase().includes(term) || c.business.slug.includes(term))
      .map((c) => ({ catalog: c, views: perf.get(c.business.id)?.views ?? 0, ar: perf.get(c.business.id)?.arActivations ?? 0 }))
  }, [catalogs.data, analytics.data, q, status, ownerFilter, ownerStates.data, ownerOf, closureOnly, closing])

  const menu = (b: Business, count: number): (MenuItem | 'separator')[] => [
    { label: t(can('businesses.edit') ? 'admin.businesses.list.editDetails' : 'admin.businesses.list.viewDetails'), icon: <Pencil />, onSelect: () => navigate(businessAdminPath(b.id)) },
    { label: t(b.status === 'active' ? 'admin.catalogs.open' : 'admin.businesses.list.previewCatalog'), icon: <ExternalLink />, onSelect: () => window.open(catalogLocalPath(b, { preview: b.status !== 'active' }), '_blank', 'noopener') },
    ...(can('products.view')
      ? [
          { label: t('admin.catalogs.viewProducts'), icon: <Package />, onSelect: () => navigate(`/admin/products?business=${b.id}`) },
          { label: t('admin.businesses.list.viewQr'), icon: <QrCode />, onSelect: () => navigate(`/admin/catalogs?business=${b.id}`) },
        ]
      : []),
    ...(!can(['businesses.status']) || !can('businesses.edit')
      ? []
      : b.status === 'active'
        ? [{ label: t('admin.businesses.actions.deactivate'), icon: <Power />, onSelect: () => void actions.setActive(b, false) }]
        : // Offered only once the closure requests are known and none is open for this business (R-W1-3).
          canViewClosures && closures.data && !closureOf.has(b.id)
          ? [{ label: t('admin.businesses.actions.activate'), icon: <Power />, onSelect: () => void actions.setActive(b, true) }]
          : []),
    ...(can('businesses.delete')
      ? (['separator', { label: t('admin.businesses.actions.delete'), icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(b, count) }] as const)
      : []),
  ]

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('admin.catalogs.business'),
      sortValue: (r) => r.catalog.business.name.toLowerCase(),
      cell: (r) => (
        <div className="flex items-center gap-3">
          <BusinessMark b={r.catalog.business} />
          <div className="max-w-[24rem] min-w-0">
            <Link to={businessAdminPath(r.catalog.business.id)} className="block truncate text-sm leading-5 font-medium hover:underline">
              {r.catalog.business.name}
            </Link>
            <span className="block truncate text-ui-small text-ink-muted">{r.catalog.catalogUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      ),
    },
    { key: 'products', header: t('admin.overview.products'), align: 'right', sortValue: (r) => r.catalog.totalProductCount, cell: (r) => f.number(r.catalog.totalProductCount) },
    { key: 'published', header: t('admin.overview.published'), align: 'right', sortValue: (r) => r.catalog.publishedProductCount, cell: (r) => f.number(r.catalog.publishedProductCount) },
    { key: 'views', header: t('admin.businesses.list.views'), align: 'right', priority: 'low', sortValue: (r) => r.views, cell: (r) => f.number(r.views) },
    { key: 'ar', header: 'AR', align: 'right', priority: 'low', sortValue: (r) => r.ar, cell: (r) => f.number(r.ar) },
    {
      key: 'owner',
      header: t('admin.businesses.owner.title'),
      sortValue: (r) => OWNER_ORDER[ownerOf.get(r.catalog.business.id)?.state ?? 'needs_owner'],
      cell: (r) => <OwnerStateBadge state={ownerOf.get(r.catalog.business.id)} loading={ownersLoading} />,
    },
    { key: 'status', header: t('common.status'), sortValue: (r) => r.catalog.business.status, cell: (r) => <StatusBadges b={r.catalog.business} closure={closureOf.get(r.catalog.business.id)} /> },
    { key: 'updated', header: t('admin.businesses.list.lastUpdated'), align: 'right', sortValue: (r) => r.catalog.business.updatedAt, cell: (r) => <span className="whitespace-nowrap">{f.date(r.catalog.business.updatedAt)}</span> },
    {
      key: 'actions',
      header: t('common.actions'),
      srOnlyHeader: true,
      align: 'right',
      cell: (r) => (
        <DropdownMenu label={t('admin.businesses.list.actionsFor', { name: r.catalog.business.name })} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menu(r.catalog.business, r.catalog.totalProductCount)} />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('nav.businesses')}
        description={t(isDemoMode ? 'admin.businesses.list.descriptionDemo' : 'admin.businesses.list.description')}
        actions={
          can('businesses.edit') && (<ButtonLink to="/admin/businesses/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
            {t('admin.catalogs.createBusiness')}
          </ButtonLink>)
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:px-6">
          <FormField label={t('admin.businesses.list.search')}>
            <SearchInput value={q} onChange={(v) => setParam('q', v)} label={t('admin.businesses.list.search')} placeholder={t('admin.businesses.list.searchPlaceholder')} />
          </FormField>
          <FormField label={t('common.status')}>
            <Select aria-label={t('admin.businesses.list.filterStatus')} value={status} onChange={(e) => setParam('status', e.target.value)} className="sm:w-44">
              <option value="">{t('admin.businesses.list.allStatuses')}</option>
              <option value="active">{t('admin.businesses.status.active')}</option>
              <option value="inactive">{t('admin.businesses.status.inactive')}</option>
              <option value="draft">{t('admin.businesses.status.draft')}</option>
            </Select>
          </FormField>
          {ownerStates.data && (
            <FormField label={t('admin.businesses.owner.title')}>
              <Select aria-label={t('admin.businesses.list.filterOwner')} value={ownerFilter} onChange={(e) => setParam('owner', e.target.value)} className="sm:w-44">
                <option value="">{t('admin.businesses.list.allOwners')}</option>
                <option value="needs_owner">{t('admin.businesses.list.needsOwner')}</option>
                <option value="invite_pending">{t('admin.businesses.list.invitePending')}</option>
                <option value="owner_active">{t('admin.businesses.owner.active')}</option>
              </Select>
            </FormField>
          )}
          {isPlatformOwner && (
            <Button aria-pressed={closureOnly} variant={closureOnly ? 'primary' : 'secondary'} onClick={() => setParam('closure', closureOnly ? '' : '1')}>
              {t('admin.businesses.list.closureRequested')}{' '}
              {catalogs.data && closures.data && <Badge tone={closureCount > 0 ? 'warning' : 'neutral'}>{f.number(closureCount)}</Badge>}
            </Button>
          )}
        </div>
        {closureOnly && orphans.length > 0 && <OrphanRequests requests={orphans} onChanged={closures.refetch} />}
        {!closureOnly && closures.status === 'error' && !closures.data && (
          <ErrorState className="border-b border-line py-4" message={`${t('admin.businesses.list.closureLoadFailed')} ${errorText(closures.error, t)}`} onRetry={closures.refetch} />
        )}
        {ownerStates.status === 'error' && !ownerStates.data && (
          <ErrorState className="border-b border-line py-4" message={t('admin.businesses.list.ownerStatesFailed')} onRetry={ownerStates.refetch} />
        )}
        {catalogs.status === 'error' && !catalogs.data ? (
          <ErrorState message={errorText(catalogs.error, t)} onRetry={catalogs.refetch} />
        ) : closureOnly && closures.status === 'error' && !closures.data ? (
          <ErrorState message={`${t('admin.businesses.list.closureLoadFailed')} ${errorText(closures.error, t)}`} onRetry={closures.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.catalog.business.id}
            loading={(catalogs.status === 'loading' && !catalogs.data) || (closureOnly && closures.status === 'loading' && !closures.data)}
            caption={t('nav.businesses')}
            noun={t('admin.businesses.list.noun')}
            twoLine
            initialSort={{ key: 'updated', dir: 'desc' }}
            page={page}
            onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
            empty={
              closureOnly && !q && !status ? (
                orphans.length > 0 ? (
                  <EmptyState title={t('admin.businesses.list.noListedClosureTitle')} body={t('admin.businesses.list.noListedClosureBody')} />
                ) : (
                  <EmptyState title={t('admin.businesses.list.noClosureTitle')} body={t('admin.businesses.list.noClosureBody')} />
                )
              ) : q || status || closureOnly || (ownerFilter && ownerStates.data) ? (
                <EmptyState title={t('admin.businesses.list.noMatchTitle')} body={t('admin.businesses.list.noMatchBody')} />
              ) : (
                <EmptyState
                  icon={Building2}
                  title={t('admin.businesses.list.emptyTitle')}
                  body={t('admin.businesses.list.emptyBody')}
                  action={
                    can('businesses.edit') && (<ButtonLink to="/admin/businesses/new" variant="primary">
                      {t('admin.catalogs.createBusiness')}
                    </ButtonLink>)
                  }
                />
              )
            }
            mobileRow={(r) => (
              <div className="flex items-center gap-3">
                <BusinessMark b={r.catalog.business} />
                <div className="min-w-0 flex-1">
                  <Link to={businessAdminPath(r.catalog.business.id)} className="block text-sm leading-5 font-medium">
                    {r.catalog.business.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-small text-ink-muted tabular-nums">
                    <StatusBadges b={r.catalog.business} closure={closureOf.get(r.catalog.business.id)} />
                    <OwnerStateBadge state={ownerOf.get(r.catalog.business.id)} loading={ownersLoading} />
                    <span>
                      {t('admin.businesses.list.publishedOf', { published: f.number(r.catalog.publishedProductCount), total: f.number(r.catalog.totalProductCount) })}
                    </span>
                    <span>{tn('admin.analytics.views', r.views, { n: f.number(r.views) })}</span>
                  </div>
                </div>
                <DropdownMenu label={t('admin.businesses.list.actionsFor', { name: r.catalog.business.name })} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menu(r.catalog.business, r.catalog.totalProductCount)} />
              </div>
            )}
          />
        )}
      </Card>
    </>
  )
}

const OWNER_ORDER: Record<OwnerState['state'], number> = { needs_owner: 0, invite_pending: 1, owner_active: 2 }

/** Owner state (R-W2-5); "email not sent" when the newest invitation was not sent, failed or bounced. */
function OwnerStateBadge({ state, loading }: { state?: OwnerState; loading: boolean }) {
  const { t } = useI18n()
  if (loading)
    return (
      <span className="inline-block">
        <Skeleton className="h-4 w-24" />
        <span className="sr-only">{t('admin.businesses.list.loadingOwner')}</span>
      </span>
    )
  if (!state) return null
  if (state.state === 'needs_owner') return <Badge tone="neutral">{t('admin.businesses.list.needsOwner')}</Badge>
  if (state.state === 'owner_active') return <Badge tone="success">{t('admin.businesses.owner.active')}</Badge>
  return state.emailFailed ? <Badge tone="danger">{t('admin.businesses.list.inviteNotSent')}</Badge> : <Badge tone="warning">{t('admin.businesses.list.invitePending')}</Badge>
}

/** The status, and the read-only closure badge whose tooltip says why the business can't be activated (R-W1-3). */
function StatusBadges({ b, closure }: { b: Business; closure?: ClosureRequest }) {
  const { t } = useI18n()
  const f = useFormat()
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <BusinessStatusBadge status={b.status} />
      {closure && (
        <span title={t('common.error.reason.closure_pending')}>
          <Badge tone="warning">{t('admin.businesses.list.closureOn', { date: f.date(closure.requestedAt) })}</Badge>
        </span>
      )}
    </span>
  )
}

/** Closure requests whose business is gone: the Owner completes them with the same action-code flow as on business detail. */
function OrphanRequests({ requests, onChanged }: { requests: ClosureRequest[]; onChanged: () => void }) {
  const { t } = useI18n()
  const f = useFormat()
  const toast = useToast()
  const noticeToast = useNoticeToast()
  const titleId = useId()
  const [target, setTarget] = useState<ClosureRequest | null>(null)

  return (
    <section aria-labelledby={titleId} className="border-b border-line bg-warning-soft/40 p-4 sm:px-6">
      <h2 id={titleId} className="text-ui-body font-semibold text-ink">
        {t('admin.businesses.list.orphanTitle')}
      </h2>
      <p className="mt-0.5 text-ui-small text-ink-muted">{t('admin.businesses.list.orphanBody')}</p>
      <ul className="mt-3 divide-y divide-line">
        {requests.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0">
              <p className="text-ui-body break-words text-ink">{r.email}</p>
              <p className="text-ui-small text-ink-muted">
                {r.businessName ? `${r.businessName} · ` : ''}{t('admin.businesses.list.requestedOn', { date: f.date(r.requestedAt) })}
              </p>
            </div>
            <Button size="sm" variant="danger" aria-label={t('admin.businesses.list.completeFor', { email: r.email })} onClick={() => setTarget(r)}>
              {t('admin.businesses.list.completeClosure')}
            </Button>
          </li>
        ))}
      </ul>
      <ActionCodeDialog
        open={target !== null}
        purpose="complete_closure"
        title={t('admin.businesses.list.completeTitle', { email: target?.email ?? '' })}
        description={t('admin.businesses.list.completeBody')}
        confirmLabel={t('admin.businesses.list.completeClosure')}
        destructive
        onClose={() => setTarget(null)}
        onConfirm={async (code) => {
          if (!target) return { ok: true as const, data: undefined }
          const r = await account.completeClosure(target.userId, code)
          if (r.ok) {
            noticeToast(t('admin.businesses.list.closureDone'), r.data.notice, t('admin.businesses.list.accountDeleted', { email: target.email }))
            onChanged()
          } else if (r.error.reason === 'not_found') {
            // Nothing left to complete: close the dialog (an ok answer closes it) and show the current list.
            toast.info(t('admin.businesses.list.alreadyHandled'))
            onChanged()
            return { ok: true as const, data: undefined }
          }
          return r
        }}
      />
    </section>
  )
}
