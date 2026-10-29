import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'

export default function NotFoundPage({ inShell }: { inShell?: boolean }) {
  const { t } = useI18n()
  useDocumentTitle(t('notFound.title'))
  return (
    <div className={inShell ? 'py-16' : 'grid min-h-dvh place-items-center bg-canvas p-6'}>
      <div className="mx-auto max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-11 place-items-center border border-line text-ink-faint" aria-hidden>
          <Compass className="size-5" strokeWidth={1.5} />
        </span>
        {/* In the dashboard shell: no small uppercase text (ADR-0031); the public 404 keeps its eyebrow. */}
        <p className={inShell ? 'mb-2 text-[length:var(--text-ui-small)] font-medium text-ink-muted' : 'mb-2 text-[11px] font-medium tracking-[0.18em] text-accent-ink uppercase'}>{t('notFound.code')}</p>
        <h1 className="font-display text-[2rem] leading-tight font-normal">{t('notFound.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('notFound.body')}</p>
        <ButtonLink to="/" variant="primary" className="mt-5">
          {t('notFound.home')}
        </ButtonLink>
      </div>
    </div>
  )
}
