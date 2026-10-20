import { Menu, UserRound, X } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useMaybeI18n } from '@/i18n/LanguageProvider'
import { type Vars, translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { APPLY_PATH } from '@/lib/urls'
import { isDemoMode } from '@/services'
import { LanguageSwitcher } from '../public/PublicShell'

// The reference navigation: every item is a section of the landing page (ids set in LandingPage).
const NAV: { key: TranslationKey; href: string }[] = [
  { key: 'site.nav.home', href: '/' },
  { key: 'site.nav.collections', href: '/#colecoes' },
  { key: 'site.nav.projects', href: '/#projetos' },
  { key: 'site.nav.about', href: '/#sobre' },
  { key: 'site.nav.contact', href: '/#contato' },
]

const YEAR = new Date().getFullYear()

/** Platform copy in the visitor's language on the landing page; English on the English-only pages (sign-in, demo). */
function useSiteText() {
  const i18n = useMaybeI18n()
  return { t: (key: TranslationKey, vars?: Vars) => (i18n ? i18n.t(key, vars) : translate('en', key, vars)), hasLang: !!i18n }
}

/**
 * Header for the platform's own pages (landing, demo entry, sign-in). Tenant catalogues use PublicShell.
 * `overlay` sits on the landing hero photograph (chalk text); `solid` is the light bar used everywhere else.
 */
export function SiteHeader({ variant = 'solid', cta = true }: { variant?: 'overlay' | 'solid'; cta?: boolean }) {
  const { t, hasLang } = useSiteText()
  const menuRef = useRef<HTMLDialogElement>(null)
  const overlay = variant === 'overlay'
  const accountLabel = isDemoMode ? t('site.demo') : t('site.account')
  const accountHref = isDemoMode ? '/demo' : '/login'

  return (
    <header className={cn('z-30', overlay ? 'absolute inset-x-0 top-0 text-chalk' : 'sticky top-0 border-b border-line bg-canvas/95 text-ink backdrop-blur-sm')}>
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-5 sm:h-20 sm:px-10">
        <Link to="/" aria-label={t('site.home')} className="shrink-0">
          <Wordmark size={15} />
        </Link>
        <nav aria-label={t('site.nav.label')} className="mx-auto hidden lg:block">
          <ul className="flex gap-10 text-label">
            {NAV.map((n) => (
              <li key={n.key}>
                <a href={n.href} className="py-2 opacity-90 transition-opacity hover:opacity-100">
                  {t(n.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4 lg:ml-0">
          {hasLang && <LanguageSwitcher />}
          {cta && (
            <Link to={APPLY_PATH} className="hidden border-b border-current pb-0.5 text-label opacity-90 hover:opacity-100 sm:inline">
              {t('site.apply')}
            </Link>
          )}
          {cta && (
            <Link to={accountHref} aria-label={accountLabel} title={accountLabel} className="grid size-9 place-items-center opacity-90 hover:opacity-100">
              <UserRound className="size-[18px]" strokeWidth={1.4} aria-hidden />
            </Link>
          )}
          <button type="button" aria-label={t('site.menuOpen')} className="grid size-9 place-items-center lg:hidden" onClick={() => menuRef.current?.showModal()}>
            <Menu className="size-5" strokeWidth={1.4} aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile menu (reference: full-height obsidian panel). <dialog> gives focus trapping and Escape for free. */}
      <dialog
        ref={menuRef}
        aria-label={t('site.nav.label')}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-sm bg-obsidian p-0 text-chalk backdrop:bg-obsidian/60"
      >
        <div className="flex h-full flex-col px-8 py-6">
          <div className="flex items-center justify-between">
            <Wordmark size={15} />
            <button type="button" aria-label={t('site.menuClose')} className="grid size-9 place-items-center" onClick={() => menuRef.current?.close()}>
              <X className="size-5" strokeWidth={1.4} aria-hidden />
            </button>
          </div>
          <ul className="mt-14 space-y-6 text-label">
            {NAV.map((n) => (
              <li key={n.key}>
                <a href={n.href} onClick={() => menuRef.current?.close()} className="block py-1">
                  {t(n.key)}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-10 border-t border-chalk/20 pt-6">
            {hasLang && <LanguageSwitcher />}
            {cta && (
              <>
                <Link to={APPLY_PATH} className="mt-4 block py-1 text-label">
                  {t('site.apply')}
                </Link>
                <Link to={accountHref} className="mt-4 block py-1 text-label">
                  {accountLabel}
                </Link>
              </>
            )}
          </div>
        </div>
      </dialog>
    </header>
  )
}

/** Reference footer: wordmark · section links · rights line, plus the honest-labelling notes the platform owes its visitors. */
export function SiteFooter() {
  const { t } = useSiteText()
  return (
    <footer id="contato" className="scroll-mt-20 bg-canvas text-ink">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-12 gap-y-6 px-5 py-10 sm:px-10">
        <Link to="/" aria-label={t('site.home')}>
          <Wordmark size={14} />
        </Link>
        <nav aria-label={t('site.nav.label')}>
          <ul className="flex flex-wrap gap-x-10 gap-y-3 text-label text-ink-muted">
            {NAV.map((n) => (
              <li key={n.key}>
                <a href={n.href} className="hover:text-ink">
                  {t(n.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Link to={APPLY_PATH} className="text-label text-ink hover:underline lg:ml-auto">
          {t('site.apply')}
        </Link>
        <p className="text-label text-ink-muted">{t('site.rights', { year: YEAR })}</p>
      </div>
      <div className="border-t border-line">
        {/* Contact details are shown only once the client supplies real ones (no placeholder addresses in production). */}
        <p className="mx-auto max-w-[1320px] px-5 py-6 text-xs leading-5 text-ink-muted sm:px-10">
          {t('site.credits')}
          {isDemoMode ? ` ${t('site.sampleData')}` : ''}
        </p>
      </div>
    </footer>
  )
}
