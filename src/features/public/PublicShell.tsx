import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business, Lang } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { safeBrandAccent } from '@/lib/color'
import { InAppNotice } from './InAppNotice'
import { TAP_TARGET } from './tapTarget'

/** "EN / PT" as in the reference header: a two-option radio group styled as spaced text. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  const options: Lang[] = ['en', 'pt']
  return (
    <div role="radiogroup" aria-label={t('nav.language')} className={cn('flex items-center text-label', className)}>
      {options.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span className="px-1.5 opacity-50" aria-hidden>
              /
            </span>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l}
            onClick={() => setLang(l)}
            className={cn(TAP_TARGET, 'py-2 transition-opacity', lang === l ? 'opacity-100' : 'opacity-60 hover:opacity-90')}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}

/** Public catalog chrome: business identity + language switcher. Brand accent is scoped here. */
export function PublicShell({ business, catalogHref, children }: { business?: Business | null; catalogHref?: string; children: ReactNode }) {
  const { t } = useI18n()
  const accent = safeBrandAccent(business?.branding.accentColor)
  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={{ '--brand-accent': accent } as React.CSSProperties}>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-5 sm:h-20 sm:px-10">
          {business ? (
            <Link to={catalogHref ?? '#'} className="flex min-w-0 items-center gap-3">
              <SmartImage src={business.logoUrl} alt="" className="size-9 shrink-0 object-contain" />
              <span className="truncate font-display text-[17px] tracking-[0.22em] text-ink uppercase sm:text-[19px]">{business.name}</span>
            </Link>
          ) : (
            <span />
          )}
          <LanguageSwitcher className="ml-auto text-ink" />
        </div>
      </header>
      {/* Catalog (where QR codes land) and product pages: AR may be limited in Instagram/Facebook/WhatsApp browsers. */}
      <InAppNotice />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-8 text-label text-ink-muted sm:px-10">
          <span>{business ? `© ${business.name}` : ''}</span>
          <span className="flex items-center gap-3">
            <Wordmark size={9} />
            <span className="normal-case tracking-normal">{t('nav.poweredBy')}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
