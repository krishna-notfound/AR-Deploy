import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business, Lang } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { safeBrandAccent } from '@/lib/color'
import { LegalLinks } from '../legal/LegalLinks'
import { InAppNotice } from './InAppNotice'
import { TAP_TARGET } from './tapTarget'

/** "EN / PT" as in the reference header: a two-option radio group styled as spaced text. */
/** `clear` sets the labels at 12px with 0.08em tracking (tenant catalogues); the platform pages keep the original text-label style. */
export function LanguageSwitcher({ className, clear }: { className?: string; clear?: boolean }) {
  const { lang, setLang, t } = useI18n()
  const options: Lang[] = ['en', 'pt']
  return (
    <div role="radiogroup" aria-label={t('nav.language')} className={cn('flex items-center', clear ? 'text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase' : 'text-label', className)}>
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

/**
 * Public catalog chrome (Stitch 2026-10-26): a slim header with the business name in the serif and EN/PT, and a footer
 * with the name large, the legal links and "powered by". No hairlines; space separates. Brand accent is scoped here.
 * `nameInHero`: the page sets the business name as its own monument, so the header drops it on phones.
 */
export function PublicShell({ business, catalogHref, nameInHero, children }: { business?: Business | null; catalogHref?: string; nameInHero?: boolean; children: ReactNode }) {
  const { t } = useI18n()
  const accent = safeBrandAccent(business?.branding.accentColor)
  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={{ '--brand-accent': accent } as React.CSSProperties}>
      <header className="sticky top-0 z-30 bg-canvas">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-5 sm:h-16 sm:px-10">
          {business ? (
            <Link to={catalogHref ?? '#'} className={cn('flex min-w-0 items-center gap-2.5 rounded-full', nameInHero && 'max-sm:invisible')}>
              {business.logoUrl && <SmartImage src={business.logoUrl} alt="" className="size-8 shrink-0 object-contain" />}
              <span className="truncate font-display text-[19px] leading-none text-ink sm:text-[21px]">{business.name}</span>
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
      <footer className="mt-auto bg-canvas">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-6 px-5 pt-20 pb-10 text-center sm:flex-row sm:items-end sm:justify-between sm:gap-10 sm:px-10 sm:pt-28 sm:pb-12 sm:text-left">
          {business ? <p className="min-w-0 font-display text-[2.5rem] leading-none tracking-[-0.01em] break-words text-ink sm:text-[3.5rem]">{business.name}</p> : <span />}
          <div className="flex flex-col items-center gap-3 text-[14px] leading-5 text-ink-body sm:items-end">
            <LegalLinks linkClassName={cn(TAP_TARGET, 'transition-opacity hover:opacity-70')} />
            <span className="text-[13px] text-ink-muted">{t('nav.poweredBy')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
