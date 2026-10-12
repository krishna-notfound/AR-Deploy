import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SegmentedControl } from '@/components/ui/Form'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business, Lang } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { safeBrandAccent } from '@/lib/color'

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  return (
    <SegmentedControl<Lang>
      size="sm"
      label={t('nav.language')}
      value={lang}
      onChange={setLang}
      options={[
        { value: 'en', label: <span lang="en">EN</span> },
        { value: 'pt', label: <span lang="pt">PT</span> },
      ]}
    />
  )
}

/** Public catalog chrome: business identity + language switcher. Brand accent is scoped here. */
export function PublicShell({ business, catalogHref, children }: { business?: Business | null; catalogHref?: string; children: ReactNode }) {
  const { t } = useI18n()
  const accent = safeBrandAccent(business?.branding.accentColor)
  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={{ '--brand-accent': accent } as React.CSSProperties}>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-5 sm:px-8">
          {business ? (
            <Link to={catalogHref ?? '#'} className="flex min-w-0 items-center gap-2.5">
              <SmartImage src={business.logoUrl} alt="" className="size-9 shrink-0 rounded-[var(--radius-control)] object-contain" />
              <span className="truncate text-[15px] font-medium text-ink">{business.name}</span>
            </Link>
          ) : (
            <span />
          )}
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-5 py-8 text-xs text-ink-muted sm:px-8">
          <span>{business ? `© ${business.name}` : ''}</span>
          <span>{t('nav.poweredBy')}</span>
        </div>
      </footer>
    </div>
  )
}
