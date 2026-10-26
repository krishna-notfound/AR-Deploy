import { Box, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { shareableCurrentUrl } from '@/lib/urls'
import { useQrCode } from '@/lib/useQrCode'
import { isAndroid, isIOS } from '@/lib/userAgent'
import type { ArAvailability } from './ArSection'
import { ArSteps } from './ArSteps'
import { Reveal } from './Reveal'
import { CopyLink } from './ShareActions'

/**
 * The dark AR band of the product page (ADR-0036 v2), shown only for a piece with a 3D model: "Place the <name> in
 * your room", its size (called true size only when the model measured right), the three shared steps, and the way to a
 * phone. A computer gets the QR code of this page (the selected finish included); a phone gets "View in my home" when AR
 * can open here, otherwise the copy-link control. The phone's sticky AR bar stays the main way in.
 */
export function ProductArBand({
  name,
  dims,
  trueToSize,
  availability,
  launching,
  onActivate,
  className,
}: {
  name: string
  /** The size line in the visitor's unit ('' when the dimensions are not filled in). */
  dims: string
  /** The model measured at the listed size (and no separate, unmeasured USDZ): only then "true size". */
  trueToSize: boolean
  availability: ArAvailability
  launching: boolean
  onActivate: () => void
  className?: string
}) {
  const { t } = useI18n()
  const onPhone = isIOS() || isAndroid()
  // The size stays on one line (non-breaking spaces).
  const size = dims ? t(trueToSize ? 'productBand.trueSize' : 'productBand.size', { dims: dims.replace(/ /g, '\u00a0') }) : ''
  const lead = [onPhone ? '' : t('productBand.scan'), size].filter(Boolean).join(' ')

  return (
    <section aria-labelledby="ar-band-h" className={cn('rounded-soft bg-ink px-6 py-9 text-canvas sm:px-10 sm:py-12 lg:rounded-[32px] lg:px-16 lg:py-14', className)}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
        <div className="min-w-0">
          <Reveal>
            <h2 id="ar-band-h" className="max-w-[22ch] font-display text-[2rem] leading-[1.1] font-normal text-balance break-words text-canvas sm:text-[2.5rem]">
              {t('productBand.title', { name })}
            </h2>
          </Reveal>
          <Reveal delay={1}>
            {lead && <p className="mt-4 max-w-[46ch] text-[16px] leading-6 text-canvas/80 tabular-nums">{lead}</p>}
            <ArSteps layout="row" className="mt-8 sm:mt-10" />
          </Reveal>
          {onPhone && (
            <div className="mt-8">
              {availability === 'available' ? (
                <button
                  type="button"
                  onClick={onActivate}
                  disabled={launching}
                  aria-busy={launching}
                  className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-canvas px-7 text-[16px] font-medium text-ink transition-[background-color,transform] hover:bg-surface disabled:cursor-progress motion-safe:duration-200 motion-safe:active:scale-[0.98] sm:w-auto"
                >
                  {launching ? <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> : <Box className="size-5" strokeWidth={1.5} aria-hidden />}
                  {launching ? t('ar.preparing') : t('ar.button')}
                </button>
              ) : (
                <CopyLink className="w-full sm:w-auto" />
              )}
            </div>
          )}
        </div>
        {!onPhone && (
          <Reveal delay={2}>
            <QrCard />
          </Reveal>
        )}
      </div>
    </section>
  )
}

/** The cream card with the QR code of this product page (the URL the visitor is on, without the preview flag). */
function QrCard() {
  const { t } = useI18n()
  const qr = useQrCode(shareableCurrentUrl(), 480)
  return (
    <div className="mx-auto flex w-full max-w-[17rem] flex-col items-center rounded-soft bg-surface px-8 pt-8 pb-6 text-center lg:mx-0 lg:w-[17rem]">
      {qr.url ? (
        <img src={qr.url} alt={t('ar.qrHint')} className="size-40 rounded-[12px] bg-white p-1" />
      ) : qr.error ? (
        <CopyLink size="sm" />
      ) : (
        <div className="size-40 animate-shimmer rounded-[12px] bg-subtle" role="status" aria-label={t('common.loading')} />
      )}
      <p className="mt-4 text-[14px] leading-5 font-medium text-ink">{t('productBand.qr')}</p>
    </div>
  )
}
