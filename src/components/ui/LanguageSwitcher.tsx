import type { Lang } from '@/domain/types'
import { TAP_TARGET } from '@/features/public/tapTarget'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'

/**
 * "EN / PT" as on the landing page: a two-option radio group styled as spaced text. The same switch on every surface
 * (public pages, dashboards, settings, sign-in); only the colour comes from the caller's `className`.
 * `clear` sets the labels at 12px with 0.08em tracking (tenant catalogues, over photos); the platform pages keep the
 * original text-label style.
 */
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
