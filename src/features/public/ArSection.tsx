import { Box, Info, Loader2, QrCode, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { useQrCode } from '@/lib/useQrCode'
import { CopyLink } from './ShareActions'
import type { ModelState } from './ProductMedia'
import { TAP_TARGET } from './tapTarget'
import { shareableCurrentUrl } from '@/lib/urls'
import { IN_APP_NAME, arBrowserName, browserName, detectInAppBrowser, isAndroid, isIOS } from '@/lib/userAgent'

/** 'model-unsupported': this phone's AR viewer cannot open this model (Android + a GLB Scene Viewer does not support). */
export type ArAvailability = 'none' | 'checking' | 'available' | 'unavailable' | 'model-unsupported'

export function arAvailability(model: ModelState, canActivateAR: boolean, modelUnsupported = false): ArAvailability {
  if (model === 'none' || model === 'error') return 'none'
  if (model === 'loading') return 'checking'
  if (modelUnsupported) return 'model-unsupported'
  return canActivateAR ? 'available' : 'unavailable'
}

/**
 * AR status beside the product actions. The AR button itself ("View in my home") is the product page's primary action and
 * is shown only when model-viewer reports canActivateAR (a real capability check). Here: the check in progress,
 * AR tips, or how to use AR on a phone. Never fakes AR.
 */
export function ArSection({ availability, onShowTips }: { availability: ArAvailability; onShowTips: () => void }) {
  const { t } = useI18n()
  const [showQr, setShowQr] = useState(false)

  if (availability === 'none') return null

  if (availability === 'checking')
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-muted" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('ar.checking')}
      </p>
    )

  if (availability === 'model-unsupported')
    return (
      <p className="flex items-start gap-2 text-[13px] text-ink-muted">
        <Box className="mt-0.5 size-4 shrink-0" strokeWidth={1.4} aria-hidden />
        {t('ar.modelUnsupported')}
      </p>
    )

  if (availability === 'available')
    return (
      <button type="button" onClick={onShowTips} className={cn(TAP_TARGET, 'self-start text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline')}>
        {t('ar.tipsLink')}
      </button>
    )

  // Honest hand-off copy (AR audit AR-07/08): a phone is never told to "open this page on your mobile device".
  const inApp = detectInAppBrowser()
  const onPhone = isIOS() || isAndroid()
  const browser = arBrowserName()
  // Already in Safari (iOS) / Chrome (Android): pointing to the same browser would be no help, so say it plainly.
  const inArBrowser = onPhone && browserName() === browser
  const phoneKind = inApp ? 'inApp' : !onPhone ? 'desktop' : inArBrowser ? 'device' : 'browser'
  const title = { inApp: t('ar.inAppTitle', { browser }), desktop: t('ar.unsupportedTitle'), device: t('ar.deviceUnsupportedTitle'), browser: t('ar.phoneUnsupportedTitle') }[phoneKind]
  const body = {
    inApp: inApp ? t('ar.inAppBody', { app: IN_APP_NAME[inApp], browser }) : '',
    desktop: t('ar.unsupportedBody'),
    device: t('ar.deviceUnsupportedBody'),
    browser: t('ar.phoneUnsupportedBody', { browser }),
  }[phoneKind]
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div className="flex gap-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-line">
          <Smartphone className="size-4 text-accent-ink" strokeWidth={1.4} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">{title}</p>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyLink size="sm" />
            {/* The QR code hands the page from a computer to a phone; on a phone it is no help. */}
            {!onPhone && (
            <Button size="sm" variant="ghost" icon={<QrCode className="size-4" aria-hidden />} onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
              {showQr ? t('ar.hideQr') : t('ar.showQr')}
            </Button>
            )}
          </div>
        </div>
      </div>
      {showQr && !onPhone && <PageQr />}
    </div>
  )
}

/** QR of the current product page, for handing off to a phone (separate from the catalog QR rule). */
function PageQr() {
  const { t } = useI18n()
  const url = shareableCurrentUrl()
  const qr = useQrCode(url, 360)
  return (
    <div className="mt-4 flex items-center gap-4 border-t border-line pt-4">
      {qr.url ? <img src={qr.url} alt={t('ar.qrHint')} className="size-28 shrink-0 rounded-[var(--radius-control)] border border-line bg-white p-1" /> : <div className="size-28 shrink-0 animate-shimmer rounded-[var(--radius-control)] bg-subtle" />}
      <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('ar.qrHint')}
      </p>
    </div>
  )
}
