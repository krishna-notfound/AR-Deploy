import { useCan } from '@/auth/usePermission'
import type { Permission } from '@/domain/types'
import { CodeXml, Copy, CopyPlus, ExternalLink, Eye, EyeOff, MoreHorizontal, Pencil, QrCode, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, ProductStatusBadge, type Tone } from '@/components/ui/Badge'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { Thumb } from '@/components/ui/SmartImage'
import type { ProductRequestState } from '@/domain/modelRequests'
import type { Business, Product, ProductAnalytics } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { primaryImage } from '@/lib/product'
import { useFormat } from '@/lib/useFormat'
import { MODEL_REQUEST_BADGE_KEY, type ModelRequestBadge, modelRequestBadge } from '../modelRequests/badge'
import { AR_READINESS_HINT_KEY, AR_READINESS_LABEL_KEY, type ProductArReadiness, hasArModel, productArReadiness } from './productReadiness'
import { EmbedCodeDialog } from './EmbedCodeDialog'
import { ProductQrDialog } from './ProductQrDialog'
import { editPath, type EditorScope, useProductActions } from './useProductActions'

const readinessTone: Record<ProductArReadiness, Tone> = { ready: 'success', 'android-only': 'warning', 'android-blocked': 'warning', 'photos-only': 'neutral' }

/** AR readiness from the stored model files (DUX-05); the editor's 3D section has the full check. */
export function ArReadinessPill({ product }: { product: Product }) {
  const { t } = useI18n()
  const r = productArReadiness(product)
  return (
    <span title={t(AR_READINESS_HINT_KEY[r])}>
      <Badge tone={readinessTone[r]}>{t(AR_READINESS_LABEL_KEY[r])}</Badge>
      <span className="sr-only">. {t(AR_READINESS_HINT_KEY[r])}</span>
    </span>
  )
}

const requestTone: Record<ModelRequestBadge, Tone> = { requested: 'accent', in_progress: 'warning', rejected: 'danger' }

/** The product's 3D request badge (R-S4-9); nothing when there is none to show. */
function RequestBadge({ product, state }: { product: Product; state: ProductRequestState | undefined }) {
  const { t } = useI18n()
  const badge = modelRequestBadge(state, productArReadiness(product) === 'photos-only')
  return badge ? <Badge tone={requestTone[badge]}>{t(MODEL_REQUEST_BADGE_KEY[badge])}</Badge> : null
}

/** Stored AR launch attempts, or "No 3D" when the product has no 3D model and none were ever recorded (DUX-07). */
export function arAttemptsText(p: Product, attempts: number | undefined, formatNumber: (n: number) => string, noModel: string): string {
  return !attempts && !hasArModel(p) ? noModel : formatNumber(attempts ?? 0)
}

/**
 * Shared product table for Super Admin ("admin" scope shows the business column)
 * and Business Admin ("business" scope).
 */
export function ProductTable({
  products,
  businesses,
  stats,
  requestStates,
  scope,
  showBusiness = scope === 'admin',
  loading,
  empty,
  page,
  onPageChange,
}: {
  products: Product[]
  businesses: Map<string, Business>
  stats: Map<string, ProductAnalytics>
  /** Each product's 3D request state (business scope only; the admin list passes none and shows no badges). */
  requestStates?: Record<string, ProductRequestState>
  scope: EditorScope
  /** Show the business column and sub-line; off when the table is already limited to one business. */
  showBusiness?: boolean
  loading?: boolean
  empty: React.ReactNode
  page?: number
  onPageChange?: (p: number) => void
}) {
  const { t, tn } = useI18n()
  const fmt = useFormat()
  const actions = useProductActions(scope)
  // Business owners manage their own products; platform users see what their role allows (ADR-0029).
  const can = useCan()
  const allowed = (need: Permission) => scope === 'business' || can(need)
  const [qrFor, setQrFor] = useState<Product | null>(null)
  const [embedFor, setEmbedFor] = useState<Product | null>(null)

  const menuItems = (p: Product): (MenuItem | 'separator')[] => {
    const b = businesses.get(p.businessId)
    return [
      ...(allowed('products.edit') ? [{ label: t('common.edit'), icon: <Pencil />, onSelect: () => actions.edit(p) }] : []),
      { label: t(p.status === 'published' ? 'products.menu.open' : 'products.menu.previewDraft'), icon: <ExternalLink />, onSelect: () => actions.openPreview(p, b) },
      { label: t('products.menu.copyUrl'), icon: <Copy />, onSelect: () => void actions.copyUrl(p, b) },
      { label: t(p.status === 'published' ? 'products.menu.qr' : 'products.menu.qrDraft'), icon: <QrCode />, onSelect: () => setQrFor(p) },
      { label: t(p.status === 'published' ? 'products.menu.embed' : 'products.menu.embedDraft'), icon: <CodeXml />, onSelect: () => setEmbedFor(p) },
      ...(allowed('products.edit') ? [{ label: t('products.menu.duplicate'), icon: <CopyPlus />, onSelect: () => void actions.duplicate(p) }] : []),
      ...(!allowed('products.publish')
        ? []
        : [
            p.status === 'published'
              ? { label: t('products.actions.unpublish'), icon: <EyeOff />, onSelect: () => void actions.unpublish(p) }
              : { label: t('products.menu.publish'), icon: <Eye />, onSelect: () => void actions.publish(p, b) },
          ]),
      ...(allowed('products.delete') ? (['separator', { label: t('common.delete'), icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(p) }] as const) : []),
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
          <span>{t(`products.category.${p.category}`)}</span>
          <ArReadinessPill product={p} />
          <RequestBadge product={p} state={requestStates?.[p.id]} />
        </span>
      </div>
    </div>
  )

  const columns: Column<Product>[] = [
    { key: 'name', header: t('products.table.product'), cell: name, sortValue: (p) => p.name.en.toLowerCase(), className: 'max-w-[280px]' },
    ...(showBusiness
      ? [
          {
            key: 'business',
            header: t('products.table.business'),
            cell: (p: Product) => {
              const n = businesses.get(p.businessId)?.name ?? t('products.table.unknownBusiness')
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
    { key: 'price', header: t('products.table.price'), cell: (p) => <span className="whitespace-nowrap">{fmt.money(p.price, p.currency)}</span>, sortValue: (p) => p.price, align: 'right' },
    { key: 'status', header: t('common.status'), cell: (p) => <ProductStatusBadge status={p.status} />, sortValue: (p) => p.status },
    { key: 'views', header: t('products.table.views'), cell: (p) => fmt.number(stats.get(p.id)?.views ?? 0), sortValue: (p) => stats.get(p.id)?.views ?? 0, align: 'right', priority: 'low' },
    {
      key: 'ar',
      header: t('products.table.arAttempts'),
      cell: (p) => (
        <span title={t(hasArModel(p) ? 'products.table.arAttemptsHint' : 'products.table.noModel')}>{arAttemptsText(p, stats.get(p.id)?.arActivations, fmt.number, t('products.table.noModelShort'))}</span>
      ),
      sortValue: (p) => stats.get(p.id)?.arActivations ?? 0,
      align: 'right',
      priority: 'low',
    },
    { key: 'updated', header: t('common.updated'), cell: (p) => <span className="whitespace-nowrap tabular-nums">{fmt.date(p.updatedAt)}</span>, sortValue: (p) => p.updatedAt },
    {
      key: 'actions',
      header: t('common.actions'),
      srOnlyHeader: true,
      align: 'right',
      cell: (p) => <DropdownMenu label={t('products.table.actionsFor', { name: p.name.en })} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />,
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
        caption={t('products.table.caption')}
        noun={t('products.table.noun')}
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
              {showBusiness && <p className="truncate text-xs text-ink-muted">{businesses.get(p.businessId)?.name}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                <ProductStatusBadge status={p.status} />
                <span className="font-medium text-ink">{fmt.money(p.price, p.currency)}</span>
                <span>{tn('products.table.viewsCount', stats.get(p.id)?.views ?? 0, { count: fmt.number(stats.get(p.id)?.views ?? 0) })}</span>
                {hasArModel(p) || stats.get(p.id)?.arActivations ? (
                  <span>{tn('products.table.arCount', stats.get(p.id)?.arActivations ?? 0, { count: fmt.number(stats.get(p.id)?.arActivations ?? 0) })}</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ArReadinessPill product={p} />
                <RequestBadge product={p} state={requestStates?.[p.id]} />
              </div>
            </div>
            <DropdownMenu label={t('products.table.actionsFor', { name: p.name.en })} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menuItems(p)} />
          </div>
        )}
      />
      <ProductQrDialog product={qrFor} business={qrFor ? businesses.get(qrFor.businessId) : undefined} onClose={() => setQrFor(null)} />
      <EmbedCodeDialog product={embedFor} business={embedFor ? businesses.get(embedFor.businessId) : undefined} onClose={() => setEmbedFor(null)} />
    </>
  )
}
