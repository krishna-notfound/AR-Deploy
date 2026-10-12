import { Copy, CopyPlus, ExternalLink, Eye, EyeOff, MoreHorizontal, Pencil, Trash2, Box } from 'lucide-react'
import { Link } from 'react-router'
import { ProductStatusBadge } from '@/components/ui/Badge'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { Thumb } from '@/components/ui/SmartImage'
import type { Business, Product, ProductAnalytics } from '@/domain/types'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { editPath, type EditorScope, useProductActions } from './useProductActions'

import { primaryImage } from '@/lib/product'

/**
 * Shared product table for Super Admin ("admin" scope shows the business column)
 * and Business Admin ("business" scope).
 */
export function ProductTable({
  products,
  businesses,
  stats,
  scope,
  loading,
  empty,
  page,
  onPageChange,
}: {
  products: Product[]
  businesses: Map<string, Business>
  stats: Map<string, ProductAnalytics>
  scope: EditorScope
  loading?: boolean
  empty: React.ReactNode
  page?: number
  onPageChange?: (p: number) => void
}) {
  const actions = useProductActions(scope)

  const menuItems = (p: Product): (MenuItem | 'separator')[] => {
    const b = businesses.get(p.businessId)
    return [
      { label: 'Edit', icon: <Pencil />, onSelect: () => actions.edit(p) },
      { label: p.status === 'published' ? 'Open product page' : 'Preview draft', icon: <ExternalLink />, onSelect: () => actions.openPreview(p, b) },
      { label: 'Copy product URL', icon: <Copy />, onSelect: () => void actions.copyUrl(p, b) },
      { label: 'Duplicate', icon: <CopyPlus />, onSelect: () => void actions.duplicate(p) },
      p.status === 'published'
        ? { label: 'Unpublish', icon: <EyeOff />, onSelect: () => void actions.unpublish(p) }
        : { label: 'Publish', icon: <Eye />, onSelect: () => void actions.publish(p, b) },
      'separator',
      { label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(p) },
    ]
  }

  const name = (p: Product) => (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb src={primaryImage(p)?.url} alt="" />
      <div className="min-w-0">
        <Link to={editPath(scope, p)} className="block truncate font-medium text-ink hover:underline">
          {p.name.en}
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="capitalize">{p.category}</span>
          {p.models.glb && (
            <span className="inline-flex items-center gap-0.5" title="Has a 3D model">
              · <Box className="size-3" aria-hidden /> 3D
            </span>
          )}
        </span>
      </div>
    </div>
  )

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Product', cell: name, sortValue: (p) => p.name.en.toLowerCase(), className: 'max-w-[280px]' },
    ...(scope === 'admin'
      ? [
          {
            key: 'business',
            header: 'Business',
            cell: (p: Product) => <span className="text-ink-muted">{businesses.get(p.businessId)?.name ?? 'Unknown'}</span>,
            sortValue: (p: Product) => businesses.get(p.businessId)?.name ?? '',
          } satisfies Column<Product>,
        ]
      : []),
    { key: 'price', header: 'Price', cell: (p) => formatMoney(p.price, p.currency), sortValue: (p) => p.price, align: 'right' },
    { key: 'status', header: 'Status', cell: (p) => <ProductStatusBadge status={p.status} />, sortValue: (p) => p.status },
    { key: 'views', header: 'Views', cell: (p) => formatNumber(stats.get(p.id)?.views ?? 0), sortValue: (p) => stats.get(p.id)?.views ?? 0, align: 'right', priority: 'low' },
    {
      key: 'ar',
      header: 'AR',
      cell: (p) => formatNumber(stats.get(p.id)?.arActivations ?? 0),
      sortValue: (p) => stats.get(p.id)?.arActivations ?? 0,
      align: 'right',
      priority: 'low',
    },
    { key: 'updated', header: 'Updated', cell: (p) => <span className="text-ink-muted">{formatDate(p.updatedAt)}</span>, sortValue: (p) => p.updatedAt },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (p) => <DropdownMenu label={`Actions for ${p.name.en}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />,
    },
  ]

  return (
    <DataTable
      rows={products}
      columns={columns}
      rowKey={(p) => p.id}
      loading={loading}
      empty={empty}
      caption="Products"
      noun="products"
      initialSort={{ key: 'updated', dir: 'desc' }}
      page={page}
      onPageChange={onPageChange}
      mobileRow={(p) => (
        <div className="flex items-start gap-3">
          <Thumb src={primaryImage(p)?.url} alt="" size="lg" />
          <div className="min-w-0 flex-1">
            <Link to={editPath(scope, p)} className="block truncate text-sm font-medium hover:underline">
              {p.name.en}
            </Link>
            {scope === 'admin' && <p className="truncate text-xs text-ink-muted">{businesses.get(p.businessId)?.name}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <ProductStatusBadge status={p.status} />
              <span className="font-medium text-ink">{formatMoney(p.price, p.currency)}</span>
              <span>{formatNumber(stats.get(p.id)?.views ?? 0)} views</span>
              <span>{formatNumber(stats.get(p.id)?.arActivations ?? 0)} AR</span>
            </div>
          </div>
          <DropdownMenu label={`Actions for ${p.name.en}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />
        </div>
      )}
    />
  )
}
