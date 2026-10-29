import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { safeBrandAccent } from '@/lib/color'
import { LegalLinks } from '../legal/LegalLinks'
import { InAppNotice } from './InAppNotice'
import { TAP_TARGET } from './tapTarget'

/** Public catalog chrome: business identity + language switcher. Brand accent is scoped here. */
export function PublicShell({ business, catalogHref, children }: { business?: Business | null; catalogHref?: string; children: ReactNode }) {
  const { t } = useI18n()
  const accent = safeBrandAccent(business?.branding.accentColor)
  return (
    <div className="public-soft flex min-h-dvh flex-col bg-canvas" style={{ '--brand-accent': accent } as React.CSSProperties}>
      {/* Solid header with a hairline (no blur or translucency), as the Sanctus landing. */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-5 sm:h-20 sm:px-10">
          {business ? (
            <Link to={catalogHref ?? '#'} className="flex min-w-0 items-center gap-3">
              {business.logoUrl && <SmartImage src={business.logoUrl} alt="" className="size-9 shrink-0 object-contain" />}
              <span className="truncate font-display text-[17px] tracking-[0.28em] text-ink uppercase sm:text-[19px]">{business.name}</span>
            </Link>
          ) : (
            <span />
          )}
          <LanguageSwitcher clear className="ml-auto text-ink" />
        </div>
      </header>
      {/* Catalog (where QR codes land) and product pages: AR may be limited in Instagram/Facebook/WhatsApp browsers. */}
      <InAppNotice />
      <div className="flex-1">{children}</div>
      <footer className="mt-auto border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-8 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted sm:px-10 sm:py-10">
          <span>{business ? `© ${business.name}` : ''}</span>
          <LegalLinks linkClassName={cn(TAP_TARGET, 'transition-colors hover:text-ink')} />
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Wordmark size={9} />
            <span className="h-3 w-px bg-line" aria-hidden />
            <span className="text-[12px] tracking-[0.04em] normal-case">{t('nav.poweredBy')}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
