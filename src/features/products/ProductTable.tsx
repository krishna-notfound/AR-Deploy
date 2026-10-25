import { useCan } from '@/auth/usePermission'
import type { Permission } from '@/domain/types'
import { CodeXml, Copy, CopyPlus, ExternalLink, Eye, EyeOff, MoreHorizontal, Pencil, QrCode, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, ProductStatusBadge, type Tone } from '@/components/ui/Badge'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { Thumb } from '@/components/ui/SmartImage'
import type { Business, Product, ProductAnalytics } from '@/domain/types'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { primaryImage } from '@/lib/product'
import { AR_READINESS_HINT, AR_READINESS_LABEL, type ProductArReadiness, hasArModel, productArReadiness } from './productReadiness'
import { EmbedCodeDialog } from './EmbedCodeDialog'
import { ProductQrDialog } from './ProductQrDialog'
import { editPath, type EditorScope, useProductActions } from './useProductActions'

const readinessTone: Record<ProductArReadiness, Tone> = { ready: 'success', 'android-only': 'warning', 'android-blocked': 'warning', 'photos-only': 'neutral' }

/** AR readiness from the stored model files (DUX-05); the editor's 3D section has the full check. */
export function ArReadinessPill({ product }: { product: Product }) {
  const r = productArReadiness(product)
  return (
    <span title={AR_READINESS_HINT[r]}>
      <Badge tone={readinessTone[r]}>{AR_READINESS_LABEL[r]}</Badge>
      <span className="sr-only">. {AR_READINESS_HINT[r]}</span>
    </span>
  )
}

/** Stored AR launch attempts, or "No 3D" when the product has no 3D model and none were ever recorded (DUX-07). */
export function arAttemptsText(p: Product, attempts: number | undefined): string {
  return !attempts && !hasArModel(p) ? 'No 3D' : formatNumber(attempts ?? 0)
}

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
  // Business owners manage their own products; platform users see what their role allows (ADR-0029).
  const can = useCan()
  const allowed = (need: Permission) => scope === 'business' || can(need)
  const [qrFor, setQrFor] = useState<Product | null>(null)
  const [embedFor, setEmbedFor] = useState<Product | null>(null)

  const menuItems = (p: Product): (MenuItem | 'separator')[] => {
    const b = businesses.get(p.businessId)
    return [
      ...(allowed('products.edit') ? [{ label: 'Edit', icon: <Pencil />, onSelect: () => actions.edit(p) }] : []),
      { label: p.status === 'published' ? 'Open product page' : 'Preview draft', icon: <ExternalLink />, onSelect: () => actions.openPreview(p, b) },
      { label: 'Copy product URL', icon: <Copy />, onSelect: () => void actions.copyUrl(p, b) },
      { label: p.status === 'published' ? 'Product QR code' : 'Product QR code (not public yet)', icon: <QrCode />, onSelect: () => setQrFor(p) },
      { label: p.status === 'published' ? 'Embed on your website' : 'Embed on your website (not public yet)', icon: <CodeXml />, onSelect: () => setEmbedFor(p) },
      ...(allowed('products.edit') ? [{ label: 'Duplicate', icon: <CopyPlus />, onSelect: () => void actions.duplicate(p) }] : []),
      ...(!allowed('products.publish')
        ? []
        : [
            p.status === 'published'
              ? { label: 'Unpublish', icon: <EyeOff />, onSelect: () => void actions.unpublish(p) }
              : { label: 'Publish', icon: <Eye />, onSelect: () => void actions.publish(p, b) },
          ]),
      ...(allowed('products.delete') ? (['separator', { label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(p) }] as const) : []),
    ]
  }

  const name = (p: Product) => (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb src={primaryImage(p)?.url} alt="" />
      <div className="min-w-0">
        <Link to={editPath(scope, p)} title={p.name.en} className="block truncate font-medium text-ink hover:underline">
          {p.name.en}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[length:var(--text-ui-small)] leading-[1.15] text-ink-muted">
          <span className="capitalize">{p.category}</span>
          <ArReadinessPill product={p} />
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
            cell: (p: Product) => {
              const n = businesses.get(p.businessId)?.name ?? 'Unknown'
              return (
                <span className="block truncate text-ink" title={n}>
                  {n}
                </span>
              )
            },
            className: 'max-w-[220px]',
            sortValue: (p: Product) => businesses.get(p.businessId)?.name ?? '',
          } satisfies Column<Product>,
        ]
      : []),
    { key: 'price', header: 'Price', cell: (p) => <span className="whitespace-nowrap">{formatMoney(p.price, p.currency)}</span>, sortValue: (p) => p.price, align: 'right' },
    { key: 'status', header: 'Status', cell: (p) => <ProductStatusBadge status={p.status} />, sortValue: (p) => p.status },
    { key: 'views', header: 'Views', cell: (p) => formatNumber(stats.get(p.id)?.views ?? 0), sortValue: (p) => stats.get(p.id)?.views ?? 0, align: 'right', priority: 'low' },
    {
      key: 'ar',
      header: 'AR attempts',
      cell: (p) => <span title={hasArModel(p) ? 'AR launch attempts, not confirmed AR sessions' : 'No 3D model'}>{arAttemptsText(p, stats.get(p.id)?.arActivations)}</span>,
      sortValue: (p) => stats.get(p.id)?.arActivations ?? 0,
      align: 'right',
      priority: 'low',
    },
    { key: 'updated', header: 'Updated', cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatDate(p.updatedAt)}</span>, sortValue: (p) => p.updatedAt },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (p) => <DropdownMenu label={`Actions for ${p.name.en}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />,
    },
  ]

  return (
    <>
      <DataTable
        rows={products}
        columns={columns}
        rowKey={(p) => p.id}
        loading={loading}
        empty={empty}
        caption="Products"
        noun="products"
        twoLine
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
                {hasArModel(p) || stats.get(p.id)?.arActivations ? <span>{formatNumber(stats.get(p.id)?.arActivations ?? 0)} AR attempts</span> : null}
              </div>
              <div className="mt-1.5">
                <ArReadinessPill product={p} />
              </div>
            </div>
            <DropdownMenu label={`Actions for ${p.name.en}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />
          </div>
        )}
      />
      <ProductQrDialog product={qrFor} business={qrFor ? businesses.get(qrFor.businessId) : undefined} onClose={() => setQrFor(null)} />
      <EmbedCodeDialog product={embedFor} business={embedFor ? businesses.get(embedFor.businessId) : undefined} onClose={() => setEmbedFor(null)} />
    </>
  )
}
