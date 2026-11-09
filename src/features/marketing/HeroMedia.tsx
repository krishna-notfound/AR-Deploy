// The landing hero's picture (ADR-0049): the admin's own picture or the built-in photo, full width behind the hero text under a
// dark veil like the sign-in photo panel (round 2), and, when the admin uploaded a 3D model, a "3D" chip that swaps the picture
// for the model in the same place (no AR). The model is only mounted, and so only downloaded, after the chip is tapped. While
// the model is shown the hero text steps aside (invisible, inert) so the whole picture can be dragged.
//
// It renders into the hero section (`relative isolate`, which the caller sets): the picture layer fills the section, `children`
// (the hero text, owned by LandingPage) is the in-flow overlay that gives the section its height.
import { Box, Image as ImageIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { siteAssetUrl } from '@/services'
import { useLandingHero } from '@/services/contentHooks'
import { InPlaceModel } from './InPlaceModel'

const BUILTIN = '/images/sanctus/v2/hero-living.webp'

// 44px tall, 12px label, in the picture's top-left corner opposite the caption.
const CHIP =
  'relative inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-chalk px-3.5 text-xs leading-none font-medium tracking-[0.14em] text-ink uppercase transition-colors select-none hover:bg-limestone active:bg-limestone motion-reduce:transition-none'

export function HeroMedia({ children }: { children?: ReactNode }) {
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
    <>
      <figure className="absolute inset-0 -z-10 bg-obsidian">
        <img
          src={own || BUILTIN}
          alt={alt}
          width={1376}
          height={768}
          fetchPriority="high"
          aria-hidden={show3d || undefined}
          className={cn('size-full object-cover object-[62%_50%] transition-opacity duration-300 motion-reduce:transition-none sm:object-center', show3d && 'opacity-0')}
        />
        {show3d && (
          <div className="absolute inset-0 animate-fade-in motion-reduce:animate-none">
            <InPlaceModel src={glb} alt={`${t('product.view3d')}: ${alt}`} onShowImage={() => setIs3d(false)} showImageLabel={t('landing.hero.showPhoto')} />
          </div>
        )}
        {/* The sign-in panel's veil: a plain dark layer, deeper towards the text at the foot and a little at the top for the chip. */}
        <div className={cn('pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none', show3d && 'opacity-0')} aria-hidden>
          <div className="absolute inset-0 bg-obsidian/35" />
          <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-obsidian/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[78%] bg-linear-to-t from-obsidian/85 via-obsidian/45 to-transparent lg:h-[70%]" />
        </div>
        {caption && (
          <figcaption
            className={cn(
              'pointer-events-none absolute top-[1.125rem] right-5 max-w-[48%] text-right text-xs leading-4 font-medium tracking-[0.12em] text-chalk/90 uppercase transition-opacity duration-300 motion-reduce:transition-none sm:top-6 sm:right-10 sm:max-w-[60%] sm:text-[12px]',
              show3d && 'opacity-0',
            )}
            aria-hidden={show3d || undefined}
          >
            {caption}
          </figcaption>
        )}
      </figure>

      {glb && (
        <div role="group" aria-label={t('landing.hero.viewLabel')} className="absolute top-3 left-5 z-10 sm:top-4 sm:left-10">
          <button type="button" aria-pressed={show3d} onClick={() => setIs3d((v) => !v)} className={CHIP}>
            {show3d ? <ImageIcon className="size-4 text-accent-ink" strokeWidth={1.75} aria-hidden /> : <Box className="size-4 text-accent-ink" strokeWidth={1.75} aria-hidden />}
            {show3d ? t('landing.hero.showPhoto') : t('landing.hero.show3d')}
          </button>
        </div>
      )}

      <div
        inert={show3d || undefined}
        className={cn('pointer-events-auto relative z-10 mt-auto w-full transition-opacity duration-300 motion-reduce:transition-none', show3d && 'pointer-events-none opacity-0')}
      >
        {children}
      </div>
    </>
  )
}
