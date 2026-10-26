import { reducedMotion } from '@/lib/motion'
import { Menu, UserRound, X } from 'lucide-react'
import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigationType } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useMaybeI18n } from '@/i18n/LanguageProvider'
import { type Vars, translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { APPLY_PATH } from '@/lib/urls'
import { LegalLinks } from '../legal/LegalLinks'
import { isDemoMode } from '@/services'
import { LanguageSwitcher } from '../public/PublicShell'
import { TAP_TARGET } from '../public/tapTarget'

type NavItem = { key: TranslationKey; href: string }

// Every item is a section of the landing page (ids set in LandingPage); "Parcerias" is the business band, "Contato" the footer.
const NAV: NavItem[] = [
  { key: 'site.nav.collections', href: '/#colecoes' },
  { key: 'site.nav.experience', href: '/#experiencia' },
  { key: 'site.nav.projects', href: '/#projetos' },
  { key: 'site.nav.about', href: '/#sobre' },
  { key: 'site.nav.partners', href: '/#parcerias' },
  { key: 'site.nav.contact', href: '/#contato' },
]

const FOOTER_EXPLORE: NavItem[] = [
  { key: 'site.nav.collections', href: '/#colecoes' },
  { key: 'site.nav.experience', href: '/#experiencia' },
  { key: 'site.nav.projects', href: '/#projetos' },
]

const FOOTER_BRAND: NavItem[] = [
  { key: 'site.nav.about', href: '/#sobre' },
  { key: 'site.nav.manifesto', href: '/#manifesto' },
  { key: 'site.nav.partners', href: '/#parcerias' },
]

const YEAR = new Date().getFullYear()

/**
 * A link to a landing-page section ("/#sobre"). It goes through the router, whose ScrollRestoration scrolls the
 * section into view (each section has scroll-mt-24 for the header). On the landing page itself that scroll is made
 * smooth, unless the visitor prefers reduced motion. Arriving from another page, useSectionScroll takes over.
 */
export function SectionLink({ href, onClick, ...rest }: Omit<ComponentProps<typeof Link>, 'to'> & { href: string }) {
  const { pathname } = useLocation()
  return (
    <Link
      to={href}
      onClick={(e) => {
        onClick?.(e)
        if (pathname === '/' && !reducedMotion()) smoothNextScroll()
      }}
      {...rest}
    />
  )
}

/** ScrollRestoration calls scrollIntoView() without options, so the root's scroll-behavior decides; reset once done. */
function smoothNextScroll() {
  const root = document.documentElement
  root.style.scrollBehavior = 'smooth'
  const reset = () => {
    root.style.scrollBehavior = ''
    window.removeEventListener('scrollend', reset)
  }
  window.addEventListener('scrollend', reset)
  window.setTimeout(reset, 1500)
}

/**
 * Landing page: after arriving from another page with "/#section", scroll to it once the page has rendered (the
 * router's own scroll ran while the lazy page was still loading), and again once `settled` turns true, because
 * links that appear with the page's data move the sections down. Back/forward keeps its restored position.
 */
export function useSectionScroll(settled: boolean) {
  const { hash } = useLocation()
  const navigationType = useNavigationType()
  useEffect(() => {
    if (!hash || navigationType === 'POP') return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
    // Mount and settle only: later hash changes on this page are scrolled by ScrollRestoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])
}

/** Platform copy in the visitor's language on the landing page; English on the English-only pages (sign-in, demo). */
function useSiteText() {
  const i18n = useMaybeI18n()
  return { t: (key: TranslationKey, vars?: Vars) => (i18n ? i18n.t(key, vars) : translate('en', key, vars)), hasLang: !!i18n }
}

function useAccountLink() {
  const { t } = useSiteText()
  return isDemoMode ? { label: t('site.demo'), href: '/demo' } : { label: t('site.account'), href: '/login' }
}

/**
 * Header for the platform's own pages (landing, apply, demo entry, sign-in). Tenant catalogues use PublicShell.
 * A solid surface bar with a hairline (no blur). `cta={false}` hides the apply and account links (sign-in pages).
 */
export function SiteHeader({ cta = true }: { cta?: boolean }) {
  const { t, hasLang } = useSiteText()
  const account = useAccountLink()
  const menuRef = useRef<HTMLDialogElement>(null)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface text-ink">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-5 sm:h-20 sm:gap-6 sm:px-10">
        <Link to="/" aria-label={t('site.home')} className="flex min-h-11 shrink-0 items-center">
          <Wordmark size={15} />
        </Link>
        <nav aria-label={t('site.nav.label')} className="mx-auto hidden xl:block">
          <ul className="flex gap-8 text-label">
            {NAV.map((n) => (
              <li key={n.key}>
                <SectionLink href={n.href} className="py-2 text-ink-muted transition-colors hover:text-ink">
                  {t(n.key)}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-5 xl:ml-0">
          {hasLang && <LanguageSwitcher />}
          {cta && (
            // Below xl the section nav is in the menu, which leaves room for the apply link in the bar.
            <Link to={APPLY_PATH} className="hidden border-b border-current pb-0.5 text-label sm:inline xl:hidden">
              {t('site.apply')}
            </Link>
          )}
          {cta && (
            <>
              <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
              <Link
                to={account.href}
                aria-label={account.label}
                title={account.label}
                className="hidden size-11 place-items-center text-ink-muted transition-colors hover:text-ink sm:grid"
              >
                <UserRound className="size-[18px]" strokeWidth={1.4} aria-hidden />
              </Link>
            </>
          )}
          <button type="button" aria-label={t('site.menuOpen')} className="-mr-2 grid size-11 place-items-center xl:hidden" onClick={() => menuRef.current?.showModal()}>
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
        <div className="flex h-full flex-col overflow-y-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <Wordmark size={15} />
            <button type="button" aria-label={t('site.menuClose')} className="-mr-2 grid size-11 place-items-center" onClick={() => menuRef.current?.close()}>
              <X className="size-5" strokeWidth={1.4} aria-hidden />
            </button>
          </div>
          <ul className="mt-14 space-y-2 text-label">
            {NAV.map((n) => (
              <li key={n.key}>
                <SectionLink href={n.href} onClick={() => menuRef.current?.close()} className="block py-3">
                  {t(n.key)}
                </SectionLink>
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
                <Link to={account.href} className="mt-4 block py-1 text-label">
                  {account.label}
                </Link>
              </>
            )}
          </div>
        </div>
      </dialog>
    </header>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-label text-ink">{title}</h2>
      <ul className="mt-5 space-y-3 text-[13px] text-ink-muted">{children}</ul>
    </div>
  )
}

const footerLink = cn(TAP_TARGET, 'transition-colors hover:text-ink')

/**
 * Wordmark and one line, three columns of real links (landing sections, apply, account), rights line and the
 * honest-labelling notes the platform owes its visitors. No social links or contact details until the client
 * supplies real ones (no placeholder addresses in production).
 */
export function SiteFooter() {
  const { t } = useSiteText()
  const account = useAccountLink()
  const sections = (items: NavItem[]) =>
    items.map((n) => (
      <li key={n.key}>
        <SectionLink href={n.href} className={footerLink}>
          {t(n.key)}
        </SectionLink>
      </li>
    ))
  return (
    <footer id="contato" className="scroll-mt-24 border-t border-line bg-surface text-ink">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-14 sm:px-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] lg:py-16">
        <div>
          <Link to="/" aria-label={t('site.home')} className={cn(TAP_TARGET, 'inline-flex')}>
            <Wordmark size={14} />
          </Link>
          <p className="mt-4 max-w-xs text-[13px] leading-6 text-ink-muted">{t('site.footer.about')}</p>
        </div>
        <nav aria-label={t('site.footer.nav')} className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
          <FooterColumn title={t('site.footer.explore')}>{sections(FOOTER_EXPLORE)}</FooterColumn>
          <FooterColumn title={t('site.footer.brand')}>{sections(FOOTER_BRAND)}</FooterColumn>
          <FooterColumn title={t('site.footer.business')}>
            <li>
              <Link to={APPLY_PATH} className={footerLink}>
                {t('site.apply')}
              </Link>
            </li>
            <li>
              <Link to={account.href} className={footerLink}>
                {account.label}
              </Link>
            </li>
          </FooterColumn>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-5 py-6 sm:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-label text-ink-muted">{t('site.rights', { year: YEAR })}</p>
            <LegalLinks className="text-[13px] text-ink-muted" linkClassName={footerLink} />
          </div>
          {/* The sample catalogues and their credits exist only in demo mode (owner 2026-10-26: nothing demo on the live site). */}
          {isDemoMode && (
            <p className="max-w-2xl text-xs leading-5 text-ink-muted lg:text-right">
              {t('site.credits')} {t('site.sampleData')}
            </p>
          )}
        </div>
      </div>
    </footer>
  )
}
