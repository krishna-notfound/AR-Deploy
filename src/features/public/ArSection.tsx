import { Box, Info, Loader2, QrCode } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { useQrCode } from '@/lib/useQrCode'
import { CopyLink, PILL_SOFT } from './ShareActions'
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

const statusLine = 'flex items-start gap-2 text-[14px] leading-5 text-ink-muted'

/**
 * The quiet controls under the product's primary action. The AR button itself ("View in my home") is the product page's
 * primary action and is shown only when model-viewer reports canActivateAR (a real capability check). Here: the check
 * in progress, AR tips, or how to use AR on a phone (a computer gets "Open on your phone" with the link and a QR code;
 * a phone gets an honest line and the link). `actions` (contact, share) sit in the same row. Never fakes AR.
 */
export function ArSection({ availability, onShowTips, actions }: { availability: ArAvailability; onShowTips: () => void; actions?: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  // Honest hand-off copy (AR audit AR-07/08): a phone is never told to "open this page on your mobile device".
  const inApp = detectInAppBrowser()
  const onPhone = isIOS() || isAndroid()
  const browser = arBrowserName()
  // Already in Safari (iOS) / Chrome (Android): pointing to the same browser would be no help, so say it plainly.
  const inArBrowser = onPhone && browserName() === browser
  const phoneKind = inApp ? 'inApp' : !onPhone ? 'desktop' : inArBrowser ? 'device' : 'browser'
  const handoff = availability === 'unavailable'
  // The QR code hands the page from a computer to a phone; on a phone it is no help.
  const desktopHandoff = handoff && !onPhone

  const title = { inApp: t('ar.inAppTitle', { browser }), desktop: t('ar.unsupportedTitle'), device: t('ar.deviceUnsupportedTitle'), browser: t('ar.phoneUnsupportedTitle') }[phoneKind]
  const body = {
    inApp: inApp ? t('ar.inAppBody', { app: IN_APP_NAME[inApp], browser }) : '',
    desktop: t('ar.unsupportedBody'),
    device: t('ar.deviceUnsupportedBody'),
    browser: t('ar.phoneUnsupportedBody', { browser }),
  }[phoneKind]

  return (
    <div className="flex flex-col gap-4">
      {(desktopHandoff || availability === 'available' || actions) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          {desktopHandoff && (
            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} className={cn(PILL_SOFT, 'flex-1 whitespace-nowrap')}>
              <QrCode className="size-4" strokeWidth={1.5} aria-hidden />
              {t('product.openOnPhone')}
            </button>
          )}
          {availability === 'available' && (
            <button type="button" onClick={onShowTips} className={cn(TAP_TARGET, 'text-[15px] font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline')}>
              {t('ar.tipsLink')}
            </button>
          )}
          {actions}
        </div>
      )}

      {availability === 'checking' && (
        <p className={statusLine} role="status">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          {t('ar.checking')}
        </p>
      )}

      {availability === 'model-unsupported' && (
        <p className={statusLine}>
          <Box className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          {t('ar.modelUnsupported')}
        </p>
      )}

      {desktopHandoff && open && (
        <div id={panelId} className="rounded-soft-sm bg-subtle p-5 sm:p-6">
          <p className="text-[16px] leading-6 font-medium text-ink">{title}</p>
          <p className="mt-1.5 text-[15px] leading-6 text-ink-body">{body}</p>
          <PageQr />
          <CopyLink size="sm" className="mt-4" />
        </div>
      )}

      {handoff && !desktopHandoff && (
        <div>
          <p className="text-[15px] leading-6 font-medium text-ink">{title}</p>
          <p className="mt-1 text-[15px] leading-6 text-ink-body">{body}</p>
          <CopyLink size="sm" className="mt-3" />
        </div>
      )}
    </div>
  )
}

/** QR of the current product page, for handing off to a phone (separate from the catalog QR rule). */
function PageQr() {
  const { t } = useI18n()
  const url = shareableCurrentUrl()
  const qr = useQrCode(url, 360)
  return (
    <div className="mt-4 flex items-center gap-4">
      {qr.url ? <img src={qr.url} alt={t('ar.qrHint')} className="size-28 shrink-0 rounded-[12px] bg-white p-1.5" /> : <div className="size-28 shrink-0 animate-shimmer rounded-[12px] bg-surface" />}
      <p className="flex items-start gap-1.5 text-[14px] leading-5 text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('ar.qrHint')}
      </p>
    </div>
  )
}
