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
import { SmartImage } from '@/components/ui/SmartImage'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, BusinessCatalog, BusinessStatus, ClosureRequest } from '@/domain/types'
import { formatDate, formatNumber } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { businessAdminPath, catalogLocalPath } from '@/lib/urls'
import { account, isDemoMode, service } from '@/services'
import { CLOSURE_PENDING_ERROR, ok } from '@/services/catalogService'
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
  const prefs = usePreferences()
  const can = useCan()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as '' | BusinessStatus
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
      .filter((c) => !term || c.business.name.toLowerCase().includes(term) || c.business.slug.includes(term))
      .map((c) => ({ catalog: c, views: perf.get(c.business.id)?.views ?? 0, ar: perf.get(c.business.id)?.arActivations ?? 0 }))
  }, [catalogs.data, analytics.data, q, status, closureOnly, closing])

  const menu = (b: Business, count: number): (MenuItem | 'separator')[] => [
    { label: can('businesses.edit') ? 'Edit details' : 'View details', icon: <Pencil />, onSelect: () => navigate(businessAdminPath(b.id)) },
    { label: 'Open catalog', icon: <ExternalLink />, onSelect: () => window.open(catalogLocalPath(b), '_blank', 'noopener') },
    { label: 'View products', icon: <Package />, onSelect: () => navigate(`/admin/products?business=${b.id}`) },
    { label: 'View QR code', icon: <QrCode />, onSelect: () => navigate(`/admin/catalogs?business=${b.id}`) },
    ...(!can(['businesses.status']) || !can('businesses.edit')
      ? []
      : b.status === 'active'
        ? [{ label: 'Deactivate catalog', icon: <Power />, onSelect: () => void actions.setActive(b, false) }]
        : // Offered only once the closure requests are known and none is open for this business (R-W1-3).
          canViewClosures && closures.data && !closureOf.has(b.id)
          ? [{ label: 'Activate catalog', icon: <Power />, onSelect: () => void actions.setActive(b, true) }]
          : []),
    ...(can('businesses.delete')
      ? (['separator', { label: 'Delete business', icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(b, count) }] as const)
      : []),
  ]

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Business',
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
    { key: 'products', header: 'Products', align: 'right', sortValue: (r) => r.catalog.totalProductCount, cell: (r) => formatNumber(r.catalog.totalProductCount) },
    { key: 'published', header: 'Published', align: 'right', sortValue: (r) => r.catalog.publishedProductCount, cell: (r) => formatNumber(r.catalog.publishedProductCount) },
    { key: 'views', header: 'Views', align: 'right', priority: 'low', sortValue: (r) => r.views, cell: (r) => formatNumber(r.views) },
    { key: 'ar', header: 'AR', align: 'right', priority: 'low', sortValue: (r) => r.ar, cell: (r) => formatNumber(r.ar) },
    { key: 'status', header: 'Status', sortValue: (r) => r.catalog.business.status, cell: (r) => <StatusBadges b={r.catalog.business} closure={closureOf.get(r.catalog.business.id)} /> },
    { key: 'updated', header: 'Last updated', align: 'right', sortValue: (r) => r.catalog.business.updatedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.catalog.business.updatedAt, 'en', prefs)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (r) => (
        <DropdownMenu label={`Actions for ${r.catalog.business.name}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menu(r.catalog.business, r.catalog.totalProductCount)} />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Businesses"
        description={`Furniture businesses and their catalogs. Views and AR are last-30-day ${isDemoMode ? 'sample ' : ''}figures.`}
        actions={
          can('businesses.edit') && (<ButtonLink to="/admin/businesses/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
            Create business
          </ButtonLink>)
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:px-6">
          <FormField label="Search businesses">
            <SearchInput value={q} onChange={(v) => setParam('q', v)} label="Search businesses" placeholder="Search by name or address" />
          </FormField>
          <FormField label="Status">
            <Select aria-label="Filter by status" value={status} onChange={(e) => setParam('status', e.target.value)} className="sm:w-44">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="draft">Draft</option>
            </Select>
          </FormField>
          {isPlatformOwner && (
            <Button aria-pressed={closureOnly} variant={closureOnly ? 'primary' : 'secondary'} onClick={() => setParam('closure', closureOnly ? '' : '1')}>
              Closure requested{' '}
              {catalogs.data && closures.data && <Badge tone={closureCount > 0 ? 'warning' : 'neutral'}>{formatNumber(closureCount)}</Badge>}
            </Button>
          )}
        </div>
        {closureOnly && orphans.length > 0 && <OrphanRequests requests={orphans} onChanged={closures.refetch} />}
        {!closureOnly && closures.status === 'error' && !closures.data && (
          <ErrorState className="border-b border-line py-4" message={`Could not load the closure requests. ${closures.error.message}`} onRetry={closures.refetch} />
        )}
        {catalogs.status === 'error' && !catalogs.data ? (
          <ErrorState message={catalogs.error.message} onRetry={catalogs.refetch} />
        ) : closureOnly && closures.status === 'error' && !closures.data ? (
          <ErrorState message={`Could not load the closure requests. ${closures.error.message}`} onRetry={closures.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.catalog.business.id}
            loading={(catalogs.status === 'loading' && !catalogs.data) || (closureOnly && closures.status === 'loading' && !closures.data)}
            caption="Businesses"
            noun="businesses"
            twoLine
            initialSort={{ key: 'updated', dir: 'desc' }}
            page={page}
            onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
            empty={
              closureOnly && !q && !status ? (
                orphans.length > 0 ? (
                  <EmptyState title="No listed business has a closure request" body="Only the requests above are open." />
                ) : (
                  <EmptyState title="No closure requests" body="When a business owner asks to close their account, their business shows here." />
                )
              ) : q || status || closureOnly ? (
                <EmptyState title="No businesses match" body="Try a different search or status." />
              ) : (
                <EmptyState
                  icon={Building2}
                  title="No businesses yet"
                  body="Create the first business to set up its catalog and QR code."
                  action={
                    can('businesses.edit') && (<ButtonLink to="/admin/businesses/new" variant="primary">
                      Create business
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
                    <span>
                      {r.catalog.publishedProductCount}/{r.catalog.totalProductCount} published
                    </span>
                    <span>{formatNumber(r.views)} views</span>
                  </div>
                </div>
                <DropdownMenu label={`Actions for ${r.catalog.business.name}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menu(r.catalog.business, r.catalog.totalProductCount)} />
              </div>
            )}
          />
        )}
      </Card>
    </>
  )
}

/** The status, and the read-only closure badge whose tooltip says why the business can't be activated (R-W1-3). */
function StatusBadges({ b, closure }: { b: Business; closure?: ClosureRequest }) {
  const prefs = usePreferences()
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <BusinessStatusBadge status={b.status} />
      {closure && (
        <span title={CLOSURE_PENDING_ERROR.message}>
          <Badge tone="warning">Closure requested on {formatDate(closure.requestedAt, 'en', prefs)}</Badge>
        </span>
      )}
    </span>
  )
}

const ALREADY_HANDLED = 'This closure was already handled.'

/** Closure requests whose business is gone: the Owner completes them with the same action-code flow as on business detail. */
function OrphanRequests({ requests, onChanged }: { requests: ClosureRequest[]; onChanged: () => void }) {
  const prefs = usePreferences()
  const toast = useToast()
  const titleId = useId()
  const [target, setTarget] = useState<ClosureRequest | null>(null)

  return (
    <section aria-labelledby={titleId} className="border-b border-line bg-warning-soft/40 p-4 sm:px-6">
      <h2 id={titleId} className="text-ui-body font-semibold text-ink">
        Requests without a business
      </h2>
      <p className="mt-0.5 text-ui-small text-ink-muted">Their business is no longer on the platform. Complete the closure to delete the account and close the request.</p>
      <ul className="mt-3 divide-y divide-line">
        {requests.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0">
              <p className="text-ui-body break-words text-ink">{r.email}</p>
              <p className="text-ui-small text-ink-muted">
                {r.businessName ? `${r.businessName} · ` : ''}Requested {formatDate(r.requestedAt, 'en', prefs)}
              </p>
            </div>
            <Button size="sm" variant="danger" aria-label={`Complete closure for ${r.email}`} onClick={() => setTarget(r)}>
              Complete closure
            </Button>
          </li>
        ))}
      </ul>
      <ActionCodeDialog
        open={target !== null}
        purpose="complete_closure"
        title={`Complete closure for ${target?.email ?? ''}?`}
        description="This deletes their account and closes the request. It can't be undone. We email them a final notice."
        confirmLabel="Complete closure"
        destructive
        onClose={() => setTarget(null)}
        onConfirm={async (code) => {
          if (!target) return { ok: true as const, data: undefined }
          const r = await account.completeClosure(target.userId, code)
          if (r.ok) {
            toast.success('Closure completed', `The account for ${target.email} was deleted.`)
            onChanged()
          } else if (r.error.reason === 'not_found') {
            // Nothing left to complete: close the dialog (an ok answer closes it) and show the current list.
            toast.info(ALREADY_HANDLED)
            onChanged()
            return { ok: true as const, data: undefined }
          }
          return r
        }}
      />
    </section>
  )
}
