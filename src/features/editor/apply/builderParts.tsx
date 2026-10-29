// Small pieces shared by the builder screens: the side drawer, the English | Portuguese pair of inputs, error text.
import { Lock, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { useFocusTrap } from '@/components/ui/Modal'
import type { ContentErrors, Lang } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'

/** The text of a validation error for a document path (the validator gives a code; this is its sentence). */
export function useErrorText() {
  const { t } = useI18n()
  return (errors: ContentErrors, path: string): string | undefined => {
    const code = errors[path]
    return code ? t(`editor.err.${code}` as TranslationKey) : undefined
  }
}

/** A right-hand drawer (full screen on phones) with the dialog behaviour of Modal: focus trapped, Escape closes. */
export function Drawer({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { t } = useI18n()
  useFocusTrap(ref, open, onClose)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative flex h-full w-full flex-col bg-surface shadow-[var(--shadow-pop)] sm:max-w-xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-ui-card font-semibold text-ink [overflow-wrap:anywhere]">
              {title}
            </h2>
            {description && <p className="mt-1 text-ui-small text-ink-muted">{description}</p>}
          </div>
          <IconButton aria-label={t('common.close')} size="sm" onClick={onClose} className="-mt-1 -mr-2">
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** The lock icon with the reason a field cannot be changed. */
export function LockNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-ui-small text-ink-muted">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export const LANG_NAMES: Record<Lang, string> = { en: 'English', pt: 'Português' }

/**
 * One text in English and Portuguese side by side (stacked under `md`). Empty Portuguese falls back to English on the
 * public form; `placeholders` shows what the original says. `name` names the pair for screen readers.
 */
export function LangPair({
  name,
  value,
  onChange,
  placeholders,
  errors,
  multiline = false,
  maxLength,
}: {
  name: string
  value: { en?: string; pt?: string }
  onChange: (lang: Lang, text: string) => void
  placeholders?: { en?: string; pt?: string }
  errors?: { en?: string; pt?: string }
  multiline?: boolean
  maxLength?: number
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(['en', 'pt'] as const).map((lang) => (
        <FormField key={lang} label={LANG_NAMES[lang]} error={errors?.[lang]}>
          {multiline ? (
            <Textarea rows={2} lang={lang} aria-label={`${name} (${LANG_NAMES[lang]})`} value={value[lang] ?? ''} placeholder={placeholders?.[lang]} maxLength={maxLength} onChange={(e) => onChange(lang, e.target.value)} />
          ) : (
            <Input lang={lang} aria-label={`${name} (${LANG_NAMES[lang]})`} value={value[lang] ?? ''} placeholder={placeholders?.[lang]} maxLength={maxLength} onChange={(e) => onChange(lang, e.target.value)} />
          )}
        </FormField>
      ))}
    </div>
  )
}
