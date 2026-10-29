import { useState } from 'react'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import type { Lang, LocalizedText } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { Segmented } from './Segmented'

/** One customer-facing text field with EN (required) and PT (optional) versions. */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline,
  rows,
  required,
  error,
  hint,
  maxLength,
  placeholder,
}: {
  label: string
  value: LocalizedText
  onChange: (v: LocalizedText) => void
  multiline?: boolean
  rows?: number
  required?: boolean
  error?: string
  hint?: string
  maxLength?: number
  placeholder?: string
}) {
  const { t } = useI18n()
  const [lang, setLang] = useState<Lang>('en')
  const current = lang === 'en' ? value.en : (value.pt ?? '')
  const set = (text: string) => onChange(lang === 'en' ? { ...value, en: text } : { ...value, pt: text || undefined })
  const ptMissing = !value.pt?.trim() && !!value.en.trim()
  const Control = multiline ? Textarea : Input
  // "Required" (EN) or "Optional" (PT) follows the language word, so the separator only shows when one of them does.
  const marked = (required && lang === 'en') || lang === 'pt'
  return (
    <FormField
      aside={
        <Segmented
          kind="toggle"
          size="sm"
          label={t('products.editor.fieldLanguage', { label })}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: 'EN' },
            {
              value: 'pt',
              label: ptMissing ? (
                <span title={t('products.editor.ptMissing')}>
                  PT <span className="text-warning">·</span>
                  <span className="sr-only">{t('products.editor.ptMissingShort')}</span>
                </span>
              ) : (
                'PT'
              ),
            },
          ]}
        />
      }
      label={
        <>
          {label}{' '}
          <span className="ml-1 text-[13px] font-normal text-ink-muted">
            {t(lang === 'en' ? 'products.editor.langEnglish' : 'products.editor.langPortuguese')}
            {marked && <span aria-hidden> ·</span>}
          </span>
        </>
      }
      required={required && lang === 'en'}
      optional={lang === 'pt'}
      error={lang === 'en' ? error : undefined}
      hint={lang === 'pt' ? (hint ? `${hint} ` : '') + t('products.editor.ptFallback') : hint}
    >
      <Control
        value={current}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => set(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={lang === 'pt' && value.en ? value.en : placeholder}
        lang={lang === 'pt' ? 'pt-PT' : 'en'}
      />
    </FormField>
  )
}
