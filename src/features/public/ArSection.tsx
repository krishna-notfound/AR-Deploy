import { Info, Loader2, QrCode, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageProvider'
import { useQrCode } from '@/lib/useQrCode'
import { CopyLink } from './ShareActions'
import type { ModelState } from './ProductMedia'
import { shareableCurrentUrl } from '@/lib/urls'

export type ArAvailability = 'none' | 'checking' | 'available' | 'unavailable'

export function arAvailability(model: ModelState, canActivateAR: boolean): ArAvailability {
  if (model === 'none' || model === 'error') return 'none'
  if (model === 'loading') return 'checking'
  return canActivateAR ? 'available' : 'unavailable'
}

/**
 * "View in my home" — shown only when model-viewer reports canActivateAR (a real capability
 * check). Otherwise explains how to use AR on a phone. Never fakes AR.
 */
export function ArSection({ availability, onActivate, onShowTips }: { availability: ArAvailability; onActivate: () => void; onShowTips: () => void }) {
  const { t } = useI18n()
  const [showQr, setShowQr] = useState(false)

  if (availability === 'none') return null

  if (availability === 'checking')
    return (
      <Button variant="brand" size="lg" className="w-full" disabled icon={<Loader2 className="size-5 animate-spin" aria-hidden />}>
        {t('ar.checking')}
      </Button>
    )

  if (availability === 'available')
    return (
      <div>
        <Button variant="brand" size="lg" className="w-full text-base" onClick={onActivate} icon={<Smartphone className="size-5" aria-hidden />}>
          {t('ar.button')}
        </Button>
        <button type="button" onClick={onShowTips} className="mt-2 text-[13px] text-ink-muted underline-offset-2 hover:text-ink hover:underline">
          {t('ar.tipsLink')}
        </button>
      </div>
    )

  return (
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
  )
}

/** QR of the current product page, for handing off to a phone (separate from the catalog QR rule). */
function PageQr() {
  const { t } = useI18n()
  const url = shareableCurrentUrl()
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
