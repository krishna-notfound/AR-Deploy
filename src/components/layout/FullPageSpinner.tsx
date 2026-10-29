import { Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'

export function FullPageSpinner({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status">
      <Loader2 className="size-6 animate-spin text-ink-faint" aria-hidden />
      <span className="sr-only">{label ?? t('ui.loading')}</span>
    </div>
  )
}
