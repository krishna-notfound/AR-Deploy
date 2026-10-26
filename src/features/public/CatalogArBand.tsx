import { Box } from 'lucide-react'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { primaryImage } from '@/lib/product'
import { ArSteps } from './ArSteps'
import { Reveal } from './Reveal'

/**
 * The dark AR band of the catalogue (ADR-0036 v2): the three steps, a button that really narrows the grid to the
 * pieces with 3D, and a phone drawn in CSS holding the featured piece's own photo (we have no photo of a phone in a room).
 */
export function CatalogArBand({ featured, onBrowse3d }: { featured: Product; onBrowse3d: () => void }) {
  const { t, localized } = useI18n()
  return (
    <section aria-labelledby="catalog-ar" className="my-12 rounded-soft bg-ink px-6 py-10 text-canvas sm:my-16 sm:rounded-[32px] sm:px-12 sm:py-14 lg:my-20">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal as="h2" className="max-w-md font-display text-headline font-normal text-canvas">
            <span id="catalog-ar">{t('catalog.arBandTitle')}</span>
          </Reveal>
          <Reveal delay={1}>
            <ArSteps className="mt-8 max-w-md" />
            <button
              type="button"
              onClick={onBrowse3d}
              className="mt-9 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-canvas px-7 text-[15px] font-medium text-ink motion-safe:transition-transform motion-safe:duration-200 hover:opacity-90 focus-visible:outline-canvas active:scale-[0.97] max-sm:w-full"
            >
              <Box className="size-4" strokeWidth={1.5} aria-hidden />
              {t('catalog.browse3d')}
            </button>
          </Reveal>
        </div>
        <Reveal delay={2} className="relative grid place-items-center overflow-hidden rounded-soft-sm bg-subtle py-8 sm:rounded-soft sm:py-14">
          {/* The phone: an obsidian frame with the featured piece's own photo on its screen. */}
          <div aria-hidden className="relative aspect-[9/19] w-[150px] rounded-[28px] border-[7px] border-ink bg-ink sm:w-[220px]">
            <div className="absolute top-2 left-1/2 z-10 h-[18px] w-[64px] -translate-x-1/2 rounded-full bg-ink" />
            <SmartImage src={primaryImage(featured)?.url} alt="" className="size-full rounded-[21px]" />
            <span className="absolute right-3 bottom-4 left-3 truncate rounded-full bg-canvas/90 px-3 py-1.5 text-center text-[12px] leading-4 font-medium text-ink">
              {localized(featured.name)}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
