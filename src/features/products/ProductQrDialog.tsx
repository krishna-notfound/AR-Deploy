import { Download, Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Switch } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, Product } from '@/domain/types'
import { downloadDataUrl } from '@/lib/download'
import { PUBLIC_URLS_ARE_LIVE, PUBLIC_URLS_ARE_TEMPORARY, absoluteLocalUrl, productLocalPath, productPublicUrl } from '@/lib/urls'
import { useQrCode } from '@/lib/useQrCode'
import { LOCAL_QR_SWITCH } from '../catalogs/CatalogQrPanel'

/**
 * Per-product QR code (ADR-0025). It encodes the product's PUBLIC URL, separate from and never replacing the
 * catalogue QR code (ADR-0005). Drafts get no code: their page is not public and their address can still change.
 */
export function ProductQrDialog({ product, business, onClose }: { product: Product | null; business: Business | undefined; onClose: () => void }) {
  return (
    <Modal open={!!product} onClose={onClose} title="Product QR code" description={product?.name.en} footer={<Button onClick={onClose}>Close</Button>}>
      {product && (business ? <ProductQrBody product={product} business={business} /> : <InlineNotice tone="warning">This product’s business could not be found.</InlineNotice>)}
    </Modal>
  )
}

function ProductQrBody({ product: p, business: b }: { product: Product; business: Business }) {
  if (p.status !== 'published')
    return (
      <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        <strong className="font-medium">Not public yet.</strong> Publish this product first: a draft’s page is hidden from customers and its web address
        can still change. Its QR code is available once it is published.
      </InlineNotice>
    )
  return <PublishedProductQr product={p} business={b} />
}

function PublishedProductQr({ product: p, business: b }: { product: Product; business: Business }) {
  const toast = useToast()
  const [localSwitch, setLocalSwitch] = useState(false)
  const url = productPublicUrl(b, p)
  const target = LOCAL_QR_SWITCH && localSwitch ? absoluteLocalUrl(productLocalPath(b, p)) : url
  const qr = useQrCode(target)
  const file = `${b.slug}-${p.slug}-qr.png`

  const download = () => {
    if (!qr.url) return
    downloadDataUrl(qr.url, file)
    toast.success('QR code downloaded', `${file} (1024 × 1024 px)`)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Opens this product’s page. For your showroom and flyers, use the catalog QR code: it stays valid as products change.</p>
      {b.status !== 'active' && (
        <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <strong className="font-medium">Not public yet.</strong> The catalog is {b.status === 'draft' ? 'not active yet' : 'paused'}: customers who scan this
          code see “product not available” until it is activated.
        </InlineNotice>
      )}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="w-full max-w-[200px] shrink-0 rounded-xl bg-white p-3 shadow-[var(--shadow-card)]">
          {qr.url ? (
            <img src={qr.url} alt={`QR code linking to ${target}`} className="aspect-square w-full" />
          ) : qr.error ? (
            <div className="grid aspect-square place-items-center text-center text-xs text-danger">QR code could not be generated.</div>
          ) : (
            <Skeleton className="aspect-square w-full" />
          )}
        </div>
        <div className="w-full min-w-0 space-y-3">
          <div>
            <p className="text-[13px] font-medium">Product URL</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-canvas py-1.5 pr-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
              <CopyButton text={url} label="Copy URL" toastTitle="Product URL copied" />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && <p className="mt-1.5 text-xs text-ink-muted">Example address for this demo. Your real address is set up by the platform team.</p>}
            {PUBLIC_URLS_ARE_TEMPORARY && (
              <p className="mt-1.5 text-xs font-medium text-warning">This is a preview or local address. Download QR codes for print from the production site.</p>
            )}
          </div>
          <Button variant="primary" onClick={download} disabled={!qr.url} icon={<Download className="size-4" aria-hidden />}>
            Download PNG
          </Button>
          {LOCAL_QR_SWITCH && (
            <Switch checked={localSwitch} onChange={setLocalSwitch} label="Encode local preview URL" description="For testing on a phone on this network. Leave off for print." />
          )}
        </div>
      </div>
    </div>
  )
}
