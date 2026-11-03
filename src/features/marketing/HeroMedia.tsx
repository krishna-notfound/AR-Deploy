// The landing hero's picture (ADR-0049): the admin's own picture or the built-in photo, in the same wide frame either way,
// and, when the admin uploaded a 3D model, a very small "3D" chip that swaps the picture for the model in the same place
// (no AR). The model is only mounted, and so only downloaded, after the chip is tapped.
import { Box, Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { siteAssetUrl } from '@/services'
import { useLandingHero } from '@/services/contentHooks'
import { InPlaceModel } from './InPlaceModel'

const BUILTIN = '/images/sanctus/v2/hero-living.webp'

// A 32px chip with a 44px touch area (the ::before extends it), in the picture's top-left corner opposite the caption.
const CHIP =
  "relative inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface/95 px-2.5 text-[11px] leading-none font-medium tracking-[0.14em] text-ink uppercase shadow-sm backdrop-blur-sm transition-colors select-none before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] hover:border-line-strong motion-reduce:transition-none"

export function HeroMedia() {
  const { t, localized } = useI18n()
  const { hero } = useLandingHero()
  const [is3d, setIs3d] = useState(false)

  const own = hero?.image ? siteAssetUrl(hero.image) : ''
  const glb = hero?.model ? siteAssetUrl(hero.model.glb) : ''
  const described = localized(hero?.alt).trim()
  // Own picture without a description: a generic alt (never empty) and no caption; the built-in photo keeps its own texts.
  const alt = described || (own ? t('landing.hero.ownImageAlt') : t('landing.hero.imageAlt'))
  const caption = described || (own ? '' : t('landing.hero.caption'))
  const show3d = is3d && !!glb

  return (
    <figure className="relative order-1 lg:order-2">
      <img
        src={own || BUILTIN}
        alt={alt}
        width={1376}
        height={768}
        fetchPriority="high"
        aria-hidden={show3d || undefined}
        className={cn(
          'aspect-[4/3] size-full object-cover transition-opacity duration-300 motion-reduce:transition-none sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto',
          show3d && 'opacity-0',
        )}
      />
      {show3d && (
        <div className="absolute inset-0 animate-fade-in motion-reduce:animate-none">
          <InPlaceModel src={glb} alt={`${t('product.view3d')}: ${alt}`} onShowImage={() => setIs3d(false)} showImageLabel={t('landing.hero.showPhoto')} />
        </div>
      )}
      {caption && (
        <figcaption
          className={cn(
            'absolute right-3 bottom-3 bg-surface px-3 py-2 text-[10px] leading-none font-medium tracking-[0.18em] text-ink uppercase transition-opacity duration-300 motion-reduce:transition-none sm:right-5 sm:bottom-5',
            show3d && 'pointer-events-none opacity-0',
          )}
          aria-hidden={show3d || undefined}
        >
          {caption}
        </figcaption>
      )}
      {glb && (
        <div role="group" aria-label={t('landing.hero.viewLabel')} className="absolute top-3 left-3 z-10 sm:top-5 sm:left-5">
          <button type="button" aria-pressed={show3d} onClick={() => setIs3d((v) => !v)} className={CHIP}>
            {show3d ? <ImageIcon className="size-3.5 text-accent-ink" strokeWidth={1.75} aria-hidden /> : <Box className="size-3.5 text-accent-ink" strokeWidth={1.75} aria-hidden />}
            {show3d ? t('landing.hero.showPhoto') : t('landing.hero.show3d')}
          </button>
        </div>
      )}
    </figure>
  )
}
