import { useCan } from '@/auth/usePermission'
import { Building2, ExternalLink, MoreHorizontal, Package, Pencil, Plus, Power, QrCode, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { FormField, Select } from '@/components/ui/Form'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { SearchInput } from '@/components/ui/SearchInput'
import { SmartImage } from '@/components/ui/SmartImage'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { Business, BusinessCatalog, BusinessStatus } from '@/domain/types'
import { formatDate, formatNumber } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { businessAdminPath, catalogLocalPath } from '@/lib/urls'
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { useBusinessActions } from '../businesses/useBusinessActions'
import { Monogram } from '../applications/Monogram'

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
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const analytics = useServiceQuery(() => service.getAnalytics(), [])
  const actions = useBusinessActions()
  const navigate = useNavigate()

  const rows = useMemo<Row[]>(() => {
    const perf = new Map((analytics.data?.byBusiness ?? []).map((b) => [b.businessId, b]))
    const term = q.trim().toLowerCase()
    return (catalogs.data ?? [])
      .filter((c) => !status || c.business.status === status)
      .filter((c) => !term || c.business.name.toLowerCase().includes(term) || c.business.slug.includes(term))
      .map((c) => ({ catalog: c, views: perf.get(c.business.id)?.views ?? 0, ar: perf.get(c.business.id)?.arActivations ?? 0 }))
  }, [catalogs.data, analytics.data, q, status])

  const menu = (b: Business, count: number): (MenuItem | 'separator')[] => [
    { label: can('businesses.edit') ? 'Edit details' : 'View details', icon: <Pencil />, onSelect: () => navigate(businessAdminPath(b.id)) },
    { label: 'Open catalog', icon: <ExternalLink />, onSelect: () => window.open(catalogLocalPath(b), '_blank', 'noopener') },
    { label: 'View products', icon: <Package />, onSelect: () => navigate(`/admin/products?business=${b.id}`) },
    { label: 'View QR code', icon: <QrCode />, onSelect: () => navigate(`/admin/catalogs?business=${b.id}`) },
    ...(!can(['businesses.status']) || !can('businesses.edit')
      ? []
      : [
          b.status === 'active'
            ? { label: 'Deactivate catalog', icon: <Power />, onSelect: () => void actions.setActive(b, false) }
            : { label: 'Activate catalog', icon: <Power />, onSelect: () => void actions.setActive(b, true) },
        ]),
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
    { key: 'status', header: 'Status', sortValue: (r) => r.catalog.business.status, cell: (r) => <BusinessStatusBadge status={r.catalog.business.status} /> },
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
        </div>
        {catalogs.status === 'error' && !catalogs.data ? (
          <ErrorState message={catalogs.error.message} onRetry={catalogs.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.catalog.business.id}
            loading={catalogs.status === 'loading' && !catalogs.data}
            caption="Businesses"
            noun="businesses"
            twoLine
            initialSort={{ key: 'updated', dir: 'desc' }}
            page={page}
            onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
            empty={
              q || status ? (
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
                    <BusinessStatusBadge status={r.catalog.business.status} />
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
