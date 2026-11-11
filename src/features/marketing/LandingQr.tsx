// The QR section under the hero (ADR-0061): what used to be the hero's text, with its own eyebrow and title. Centred text by default;
// the Owner/Admin may add a picture on the left or right (contained, never cropped). The words are the landing texts landing.qr.*.
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { siteAssetUrl } from '@/services'
import { SECTION, SECTION_Y } from './landingFrame'
import { useSiteContent } from './SiteContentProvider'

const frame = imageFrame('qr')

export function LandingQr() {
  const { t, localized } = useI18n()
  const qr = useSiteContent().chrome?.landingQr
  const src = qr?.image && qr.imageSide !== 'none' ? siteAssetUrl(qr.image) : ''
  const side = qr?.imageSide ?? 'none'
  const text = (
    <div className={cn('min-w-0', !src && 'mx-auto flex max-w-3xl flex-col items-center text-center')}>
      <Eyebrow className={cn(!src && 'justify-center')}>{t('landing.qr.eyebrow')}</Eyebrow>
      <h2 id="qr-title" className="mt-4 text-headline [overflow-wrap:anywhere]">
        {t('landing.qr.title')}
      </h2>
      <p className={cn('mt-5 text-base leading-7 text-ink-muted [overflow-wrap:anywhere] sm:mt-6', src ? 'max-w-md' : 'max-w-xl')}>{t('landing.qr.body')}</p>
    </div>
  )
  return (
    <section id="qr" className="scroll-mt-24" aria-labelledby="qr-title">
      <div className={cn(SECTION, SECTION_Y, src && 'grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16')}>
        {src && qr?.image ? (
          <>
            <img
              src={src}
              alt={localized(qr.image.alt)}
              loading="lazy"
              className={cn('w-full border border-line bg-subtle', frame.aspectClass, frame.fitClass, side === 'right' && 'lg:order-last')}
            />
            {text}
          </>
        ) : (
          text
        )}
      </div>
    </section>
  )
}
