import { ArrowLeft } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { TAP_TARGET } from '../public/tapTarget'

const YEAR = new Date().getFullYear()

/** The sign-in pages' photographs (owner-generated, public/images/sanctus/v2). */
export const AUTH_PHOTOS = {
  villa: { src: '/images/sanctus/v2/interior-villa.webp', position: '40% 50%' },
  sofa: { src: '/images/sanctus/v2/sofa-travertine.webp', position: '50% 60%' },
  lounge: { src: '/images/sanctus/v2/lounge-chair.webp', position: '50% 50%' },
} as const

/**
 * Split layout of the sign-in style pages (Stitch 10 and 17): a photograph with the brand statement on the left, the
 * form on the right. On phones the photograph becomes a short band above the form. `wide` gives the form more room
 * (application wizard, demo picker) and keeps the photograph in view while the form scrolls.
 */
export function AuthLayout({
  photo = 'villa',
  wide = false,
  footer,
  children,
}: {
  photo?: keyof typeof AUTH_PHOTOS
  wide?: boolean
  /** Extra small print under the rights line (credits, demo notes). */
  footer?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  const image = AUTH_PHOTOS[photo]
  return (
    <div className={cn('min-h-dvh bg-surface text-ink lg:grid', wide ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'lg:grid-cols-2')}>
      <aside className="relative isolate h-32 overflow-hidden bg-obsidian text-chalk sm:h-40 lg:sticky lg:top-0 lg:h-dvh lg:self-start">
        <img src={image.src} alt="" className="absolute inset-0 -z-10 size-full object-cover" style={{ objectPosition: image.position }} />
        {/* A plain dark overlay so the white text stays legible on every part of the photograph. */}
        <div className="absolute inset-0 -z-10 bg-obsidian/45 lg:bg-obsidian/40" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 -z-10 hidden h-2/3 bg-linear-to-t from-obsidian/80 to-transparent lg:block" aria-hidden />
        <div className="flex h-full flex-col px-5 py-5 sm:px-10 lg:px-14 lg:py-12">
          <div className="lg:border-b lg:border-chalk/20 lg:pb-8">
            <Link to="/" aria-label={t('auth.home')} className="inline-flex min-h-11 items-center">
              <Wordmark size={16} />
            </Link>
          </div>
          <div className="mt-auto hidden max-w-md lg:block">
            <p className="flex items-center gap-4 text-eyebrow text-chalk/80">
              <span className="h-px w-8 bg-chalk/50" aria-hidden />
              {t('auth.panel.eyebrow')}
            </p>
            <p className="mt-6 font-display text-[3.25rem] leading-[1.04] font-light text-chalk">{t('auth.panel.title')}</p>
            <p className="mt-5 max-w-sm text-[15px] leading-7 text-chalk/80">{t('auth.panel.body')}</p>
          </div>
          <div className="mt-16 hidden items-center justify-between gap-6 border-t border-chalk/20 pt-6 text-label text-chalk/70 lg:flex">
            <span>{t('auth.panel.tag1')}</span>
            <span className="size-1 rounded-full bg-chalk/50" aria-hidden />
            <span>{t('auth.panel.tag2')}</span>
          </div>
        </div>
      </aside>

      <div className="flex flex-col lg:min-h-dvh">
        <div className="flex items-center justify-between gap-4 px-5 pt-4 sm:px-10 lg:justify-end lg:px-16 lg:pt-10">
          <Link to="/" className={cn(TAP_TARGET, 'inline-flex items-center gap-2 text-label text-ink-muted transition-colors hover:text-ink')}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('auth.backToSite')}
          </Link>
          <LanguageSwitcher className="text-ink lg:order-first lg:mr-auto" />
        </div>

        <main className="flex flex-1 items-center px-5 py-10 sm:px-10 sm:py-14 lg:px-16">
          <div className={cn('mx-auto w-full', wide ? 'max-w-[660px]' : 'max-w-[440px]')}>{children}</div>
        </main>

        <footer className="mx-5 border-t border-line py-6 text-xs leading-5 text-ink-muted sm:mx-10 lg:mx-16">
          <p>{t('auth.rights', { year: YEAR })}</p>
          {footer && <div className="mt-2">{footer}</div>}
        </footer>
      </div>
    </div>
  )
}

/** Eyebrow, serif title and an optional intro: the head of every form on these pages. */
export function AuthHeading({
  eyebrow,
  title,
  children,
  as: Tag = 'h1',
  headingRef,
  className,
}: {
  eyebrow: ReactNode
  title: ReactNode
  children?: ReactNode
  as?: 'h1' | 'h2'
  headingRef?: Ref<HTMLHeadingElement>
  className?: string
}) {
  return (
    <div className={className}>
      <p className="flex items-center gap-3 text-eyebrow text-accent-ink">
        <span className="h-px w-6 bg-accent" aria-hidden />
        {eyebrow}
      </p>
      <Tag ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="mt-4 font-display text-[2.25rem] leading-[1.1] font-normal outline-none sm:text-[2.5rem]">
        {title}
      </Tag>
      {children && <div className="mt-3 text-[15px] leading-7 text-ink-muted">{children}</div>}
    </div>
  )
}

/**
 * Numbered progress bar (Stitch: "1. Solicitação · 2. Validação · 3. Nova senha"). Finished steps become buttons when
 * `onGo` is given. `compactLabels` hides the labels visually on phones (they stay for screen readers).
 */
export function StepIndicator({
  steps,
  current,
  label,
  onGo,
  compactLabels = false,
  className,
}: {
  steps: string[]
  current: number
  label: string
  onGo?: (i: number) => void
  compactLabels?: boolean
  className?: string
}) {
  return (
    <ol aria-label={label} className={cn('flex gap-2 sm:gap-3', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        const content = (
          <>
            <span className={cn('block h-0.5 w-full', state === 'todo' ? 'bg-line' : 'bg-ink')} aria-hidden />
            <span
              className={cn(
                'mt-2.5 block text-[10px] leading-snug font-medium tracking-[0.16em] uppercase',
                state === 'todo' ? 'text-ink-faint' : 'text-ink',
                compactLabels && 'sr-only sm:not-sr-only sm:block',
              )}
            >
              {i + 1}. {s}
            </span>
          </>
        )
        return (
          <li key={s} className="min-w-0 flex-1" aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' && onGo ? (
              <button type="button" onClick={() => onGo(i)} className="block w-full py-2 text-left hover:opacity-70 pointer-coarse:min-h-11">
                {content}
              </button>
            ) : (
              <div className="py-2">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Field styling for these forms: taller controls on a soft fill (the Form components stay untouched). */
export const authFieldsClass =
  '[&_input:not([type=radio],[type=checkbox])]:h-11 [&_select]:h-11 [&_:where(input:not([type=radio],[type=checkbox]),select,textarea)]:bg-canvas'
