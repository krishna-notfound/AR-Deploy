import { useState } from 'react'
import { FormField, Input, SegmentedControl, Textarea } from '@/components/ui/Form'
import type { Lang, LocalizedText } from '@/domain/types'

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
  const [lang, setLang] = useState<Lang>('en')
  const current = lang === 'en' ? value.en : (value.pt ?? '')
  const set = (text: string) => onChange(lang === 'en' ? { ...value, en: text } : { ...value, pt: text || undefined })
  const ptMissing = !value.pt?.trim() && !!value.en.trim()
  const Control = multiline ? Textarea : Input
  return (
    <FormField
        aside={
          <SegmentedControl
            size="sm"
            label={`${label} language`}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'pt', label: ptMissing ? <span title="Portuguese translation missing">PT ·</span> : 'PT' },
            ]}
          />
        }
        label={
          <>
            {label}{' '}
            <span className="ml-1 font-normal text-ink-faint">{lang === 'en' ? 'English' : 'Portuguese'}</span>
          </>
        }
        required={required && lang === 'en'}
        optional={lang === 'pt'}
        error={lang === 'en' ? error : undefined}
        hint={lang === 'pt' ? (hint ? `${hint} ` : '') + 'If left empty, customers see the English text.' : hint}
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
