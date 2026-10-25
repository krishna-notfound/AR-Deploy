import { Download, ExternalLink, Info, Package, QrCode } from 'lucide-react'
import { useState } from 'react'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { Switch } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { BusinessCatalog } from '@/domain/types'
import { downloadDataUrl } from '@/lib/download'
import { PUBLIC_URL_MODE, PUBLIC_URLS_ARE_LIVE, PUBLIC_URLS_ARE_TEMPORARY, absoluteLocalUrl, catalogLocalPath } from '@/lib/urls'
import { useQrCode } from '@/lib/useQrCode'

/** The "encode local URL" switch is for testing on a phone: offered on demo and temporary hosts, never in production (DUX-08). */
export const LOCAL_QR_SWITCH = PUBLIC_URL_MODE === 'demo' || PUBLIC_URLS_ARE_TEMPORARY

/**
 * Catalog URL + QR code. This QR always encodes the CATALOG URL (never a product), so it
 * stays valid as products are added or removed (ADR-0005). Per-product QR codes are separate (ADR-0025).
 */
export function CatalogQrPanel({ catalog, productsLink }: { catalog: BusinessCatalog; productsLink: string }) {
  const toast = useToast()
  const [localSwitch, setUseLocal] = useState(false)
  const useLocal = LOCAL_QR_SWITCH && localSwitch
  const target = useLocal ? absoluteLocalUrl(catalog.localPath) : catalog.catalogUrl
  const qr = useQrCode(target)
  const b = catalog.business
  const isPublic = b.status === 'active'

  const download = () => {
    if (!qr.url) return
    downloadDataUrl(qr.url, `${b.slug}-catalog-qr.png`)
    toast.success('QR code downloaded', `${b.slug}-catalog-qr.png (about 1000 px, print quality)`)
  }

  return (
    <Card className="overflow-hidden">
      {/* grid-cols-1 + min-w-0: an implicit auto track grew to the URL's width and clipped the column on phones (DUX-03). */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-[family-name:var(--font-ui)] text-[20px] leading-[1.4] font-semibold text-ink">{b.name}</h2>
            <BusinessStatusBadge status={b.status} />
          </div>

          <div>
            <p className="text-ui-small font-medium text-ink-muted">Catalog URL</p>
            <div className="mt-1.5 flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-canvas py-1.5 pr-1.5 pl-3.5">
              <code className="min-w-0 flex-1 truncate font-[family-name:var(--font-ui)] text-ui-body">{catalog.catalogUrl}</code>
              <CopyButton text={catalog.catalogUrl} label="Copy URL" toastTitle="Catalog URL copied" />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && (
              <p className="mt-2 text-ui-small text-ink-muted">Example address for this demo. Your real address is set up by the platform team.</p>
            )}
            {PUBLIC_URLS_ARE_TEMPORARY && (
              <p className="mt-2 text-ui-small font-medium text-warning">
                This is a preview or local address. QR codes and links made here point to it: download QR codes for print from the production site.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(b, { preview: !isPublic }), '_blank', 'noopener')}>
              {isPublic ? 'Open catalog' : 'Preview catalog (not public yet)'}
            </Button>
            <ButtonLink to={productsLink} icon={<Package className="size-4" aria-hidden />}>
              View products
            </ButtonLink>
          </div>

          <dl className="grid grid-cols-2 gap-8 border-t border-line pt-6">
            <div>
              <dt className="text-ui-small font-medium text-ink-muted">Published products</dt>
              <dd className="mt-1 text-ui-kpi font-medium text-ink tabular-nums">{catalog.publishedProductCount}</dd>
            </div>
            <div>
              <dt className="text-ui-small font-medium text-ink-muted">All products</dt>
              <dd className="mt-1 text-ui-kpi font-medium text-ink tabular-nums">{catalog.totalProductCount}</dd>
            </div>
          </dl>

          {!isPublic && (
            <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
              This catalog is {b.status === 'draft' ? 'not public yet' : 'paused'}. Customers who scan the QR code will see “catalog unavailable” until it
              is activated.
            </InlineNotice>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center border-t border-line bg-canvas p-8 md:border-t-0 md:border-l">
          <div className="w-full max-w-[240px] border border-line bg-white p-3">
            {qr.url ? (
              <img src={qr.url} alt={`QR code linking to ${target}`} className="aspect-square w-full" />
            ) : qr.error ? (
              <div className="grid aspect-square place-items-center text-center text-ui-small text-danger">QR code could not be generated.</div>
            ) : (
              <Skeleton className="aspect-square w-full" />
            )}
          </div>
          <p className="mt-4 max-w-[240px] text-center text-ui-small text-ink-muted">
            <QrCode className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Points to the catalog, so it stays valid when products change.
          </p>
          <Button variant="primary" className="mt-4" onClick={download} disabled={!qr.url} icon={<Download className="size-4" aria-hidden />}>
            Download PNG
          </Button>
          {LOCAL_QR_SWITCH && (
            <div className="mt-5 w-full border-t border-line pt-4">
              <Switch checked={localSwitch} onChange={setUseLocal} label="Encode local preview URL" description="For testing on a phone on this network. Leave off for print." />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
