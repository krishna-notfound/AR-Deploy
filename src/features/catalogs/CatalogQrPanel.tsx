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
import { useI18n } from '@/i18n/LanguageProvider'
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
  const { t } = useI18n()
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
    toast.success(t('admin.catalogs.qr.downloaded'), t('admin.catalogs.qr.downloadedDetail', { file: `${b.slug}-catalog-qr.png` }))
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
            <p className="text-ui-small font-medium text-ink-muted">{t('admin.catalogs.url')}</p>
            <div className="mt-1.5 flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-canvas py-1.5 pr-1.5 pl-3.5">
              <code className="min-w-0 flex-1 truncate font-[family-name:var(--font-ui)] text-ui-body">{catalog.catalogUrl}</code>
              <CopyButton text={catalog.catalogUrl} label={t('admin.catalogs.copyUrl')} toastTitle={t('admin.catalogs.urlCopied')} />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && (
              <p className="mt-2 text-ui-small text-ink-muted">{t('admin.catalogs.exampleAddress')}</p>
            )}
            {PUBLIC_URLS_ARE_TEMPORARY && (
              <p className="mt-2 text-ui-small font-medium text-warning">
                {t('admin.catalogs.tempAddress')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(b, { preview: !isPublic }), '_blank', 'noopener')}>
              {isPublic ? t('admin.catalogs.open') : t('admin.catalogs.preview')}
            </Button>
            <ButtonLink to={productsLink} icon={<Package className="size-4" aria-hidden />}>
              {t('admin.catalogs.viewProducts')}
            </ButtonLink>
          </div>

          <dl className="grid grid-cols-2 gap-8 border-t border-line pt-6">
            <div>
              <dt className="text-ui-small font-medium text-ink-muted">{t('admin.catalogs.published')}</dt>
              <dd className="mt-1 text-ui-kpi font-medium text-ink tabular-nums">{catalog.publishedProductCount}</dd>
            </div>
            <div>
              <dt className="text-ui-small font-medium text-ink-muted">{t('admin.catalogs.allProducts')}</dt>
              <dd className="mt-1 text-ui-kpi font-medium text-ink tabular-nums">{catalog.totalProductCount}</dd>
            </div>
          </dl>

          {!isPublic && (
            <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
              {t(b.status === 'draft' ? 'admin.catalogs.notPublicNotice' : 'admin.catalogs.pausedNotice')}
            </InlineNotice>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center border-t border-line bg-canvas p-8 md:border-t-0 md:border-l">
          <div className="w-full max-w-[240px] border border-line bg-white p-3">
            {qr.url ? (
              <img src={qr.url} alt={t('admin.catalogs.qr.alt', { url: target })} className="aspect-square w-full" />
            ) : qr.error ? (
              <div className="grid aspect-square place-items-center text-center text-ui-small text-danger">{t('admin.catalogs.qr.failed')}</div>
            ) : (
              <Skeleton className="aspect-square w-full" />
            )}
          </div>
          <p className="mt-4 max-w-[240px] text-center text-ui-small text-ink-muted">
            <QrCode className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            {t('admin.catalogs.qr.hint')}
          </p>
          <Button variant="primary" className="mt-4" onClick={download} disabled={!qr.url} icon={<Download className="size-4" aria-hidden />}>
            {t('admin.catalogs.qr.download')}
          </Button>
          {LOCAL_QR_SWITCH && (
            <div className="mt-5 w-full border-t border-line pt-4">
              <Switch checked={localSwitch} onChange={setUseLocal} label={t('admin.catalogs.localSwitch')} description={t('admin.catalogs.localSwitchHint')} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
