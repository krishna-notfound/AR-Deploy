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
import { useI18n } from '@/i18n/LanguageProvider'
import { downloadDataUrl } from '@/lib/download'
import { PUBLIC_URLS_ARE_LIVE, PUBLIC_URLS_ARE_TEMPORARY, absoluteLocalUrl, productLocalPath, productPublicUrl } from '@/lib/urls'
import { useQrCode } from '@/lib/useQrCode'
import { LOCAL_QR_SWITCH } from '../catalogs/CatalogQrPanel'

/**
 * Per-product QR code (ADR-0025). It encodes the product's PUBLIC URL, separate from and never replacing the
 * catalogue QR code (ADR-0005). Drafts get no code: their page is not public and their address can still change.
 */
export function ProductQrDialog({ product, business, onClose }: { product: Product | null; business: Business | undefined; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal open={!!product} onClose={onClose} title={t('products.qr.title')} description={product?.name.en} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {product && (business ? <ProductQrBody product={product} business={business} /> : <InlineNotice tone="warning">{t('products.share.businessNotFound')}</InlineNotice>)}
    </Modal>
  )
}

function ProductQrBody({ product: p, business: b }: { product: Product; business: Business }) {
  const { t } = useI18n()
  if (p.status !== 'published')
    return (
      <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        <strong className="font-medium">{t('products.share.notPublicYet')}</strong> {t('products.qr.draftNotice')}
      </InlineNotice>
    )
  return <PublishedProductQr product={p} business={b} />
}

function PublishedProductQr({ product: p, business: b }: { product: Product; business: Business }) {
  const { t } = useI18n()
  const toast = useToast()
  const [localSwitch, setLocalSwitch] = useState(false)
  const url = productPublicUrl(b, p)
  const target = LOCAL_QR_SWITCH && localSwitch ? absoluteLocalUrl(productLocalPath(b, p)) : url
  const qr = useQrCode(target)
  const file = `${b.slug}-${p.slug}-qr.png`

  const download = () => {
    if (!qr.url) return
    downloadDataUrl(qr.url, file)
    toast.success(t('products.qr.downloaded'), t('products.qr.downloadedBody', { file }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{t('products.qr.intro')}</p>
      {b.status !== 'active' && (
        <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <strong className="font-medium">{t('products.share.notPublicYet')}</strong> {t(b.status === 'draft' ? 'products.qr.catalogDraft' : 'products.qr.catalogPaused')}
        </InlineNotice>
      )}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="w-full max-w-[200px] shrink-0 rounded-lg border border-line bg-white p-3">
          {qr.url ? (
            <img src={qr.url} alt={t('products.qr.alt', { target })} className="aspect-square w-full" />
          ) : qr.error ? (
            <div className="grid aspect-square place-items-center text-center text-xs text-danger">{t('products.qr.failed')}</div>
          ) : (
            <Skeleton className="aspect-square w-full" />
          )}
        </div>
        <div className="w-full min-w-0 space-y-3">
          <div>
            <p className="text-[13px] font-medium">{t('products.qr.url')}</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-canvas py-1.5 pr-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
              <CopyButton text={url} label={t('products.qr.copyUrl')} toastTitle={t('products.actions.urlCopied')} />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && <p className="mt-1.5 text-xs text-ink-muted">{t('products.share.demoAddress')}</p>}
            {PUBLIC_URLS_ARE_TEMPORARY && (
              <p className="mt-1.5 text-xs font-medium text-warning">{t('products.qr.tempAddress')}</p>
            )}
          </div>
          <Button variant="primary" onClick={download} disabled={!qr.url} icon={<Download className="size-4" aria-hidden />}>
            {t('products.qr.download')}
          </Button>
          {LOCAL_QR_SWITCH && (
            <Switch checked={localSwitch} onChange={setLocalSwitch} label={t('products.qr.localLabel')} description={t('products.qr.localHint')} />
          )}
        </div>
      </div>
    </div>
  )
}
