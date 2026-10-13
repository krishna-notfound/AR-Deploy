import { Info, Loader2, QrCode, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import { useQrCode } from '@/lib/useQrCode'
import type { ArMode } from '../ar/capability'
import { CopyLink } from './ShareActions'

/**
 * The single "View in my home" entry point. Which AR runs behind it is decided by capability
 * (features/ar/capability.ts): our WebXR session, the phone's native viewer, or none. Never fakes AR.
 */
export function ArSection({
  mode,
  startFailed,
  canOpenNative,
  onActivate,
  onOpenNative,
  onShowTips,
}: {
  mode: ArMode
  /** Our WebXR session could not start on this device. */
  startFailed: boolean
  canOpenNative: boolean
  onActivate: () => void
  onOpenNative: () => void
  onShowTips?: () => void
}) {
  const { t } = useI18n()
  const [showQr, setShowQr] = useState(false)

  const failedNotice = startFailed && (
    <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
      <span role="alert">{t('ar.startFailed')}</span>
    </InlineNotice>
  )

  if (mode.mode === 'checking')
    return (
      <Button variant="brand" size="lg" className="w-full" disabled icon={<Loader2 className="size-5 animate-spin" aria-hidden />}>
        {t('ar.checking')}
      </Button>
    )

  if (mode.mode === 'webxr' || mode.mode === 'native')
    return (
      <div className="space-y-2">
        {failedNotice}
        <Button variant="brand" size="lg" className="w-full text-base" onClick={mode.mode === 'native' && startFailed ? onOpenNative : onActivate} icon={<Smartphone className="size-5" aria-hidden />}>
          {mode.mode === 'native' && startFailed ? t('ar.openNative') : t('ar.button')}
        </Button>
        {mode.mode === 'native' && onShowTips && (
          <button type="button" onClick={onShowTips} className="text-[13px] text-ink-muted underline-offset-2 hover:text-ink hover:underline">
            {t('ar.tipsLink')}
          </button>
        )}
      </div>
    )

  if (mode.mode !== 'none' || mode.reason !== 'unsupported') return null

  return (
    <div className="space-y-2">
      {failedNotice}
      {startFailed && canOpenNative && (
        <Button variant="brand" size="lg" className="w-full" onClick={onOpenNative}>
          {t('ar.openNative')}
        </Button>
      )}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="flex gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-[var(--brand-accent)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t('ar.unsupportedTitle')}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">{t('ar.unsupportedBody')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLink size="sm" />
              <Button size="sm" variant="ghost" icon={<QrCode className="size-4" aria-hidden />} onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
                {showQr ? t('ar.hideQr') : t('ar.showQr')}
              </Button>
            </div>
          </div>
        </div>
        {showQr && <PageQr />}
      </div>
    </div>
  )
}

/** QR of the current product page, for handing off to a phone (separate from the catalog QR rule). */
function PageQr() {
  const { t } = useI18n()
  const url = window.location.href.replace(/[?&]preview=1/, '')
  const qr = useQrCode(url, 360)
  return (
    <div className="mt-4 flex items-center gap-4 border-t border-line pt-4">
      {qr.url ? <img src={qr.url} alt={t('ar.qrHint')} className="size-28 rounded-md" /> : <div className="size-28 animate-shimmer rounded-md bg-subtle" />}
      <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('ar.qrHint')}
      </p>
    </div>
  )
}
