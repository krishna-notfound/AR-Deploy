import { Bold, Heading2, Link2, List } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/Button'
import { FormField, SegmentedControl, Textarea } from '@/components/ui/Form'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { MarkdownBody } from '../legal/MarkdownBody'
import { type TextEdit, bold, heading, link, list } from './markdownInsert'

const TOOLS: { key: 'bold' | 'heading' | 'list' | 'link'; label: TranslationKey; icon: typeof Bold; apply: (v: string, s: number, e: number) => TextEdit }[] = [
  { key: 'bold', label: 'editor.md.bold', icon: Bold, apply: (v, s, e) => bold(v, s, e) },
  { key: 'heading', label: 'editor.md.heading', icon: Heading2, apply: heading },
  { key: 'list', label: 'editor.md.list', icon: List, apply: list },
  { key: 'link', label: 'editor.md.link', icon: Link2, apply: (v, s, e) => link(v, s, e) },
]

/**
 * A Markdown text box: a textarea with a toolbar (Bold, Heading, List, Link) that inserts Markdown at the cursor, and an
 * Edit | Preview toggle that renders the same text with the public page's own renderer.
 */
export function MarkdownField({
  label,
  lang,
  value,
  onChange,
  error,
  hint,
  footer,
}: {
  label: string
  lang: 'en' | 'pt'
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: ReactNode
  footer?: ReactNode
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const wrap = useRef<HTMLDivElement>(null)
  const textarea = () => wrap.current?.querySelector<HTMLTextAreaElement>('textarea') ?? null
  const nextSelection = useRef<{ start: number; end: number } | null>(null)

  // After a toolbar edit re-renders the text, put the selection where the edit says (and keep the keyboard in the box).
  useLayoutEffect(() => {
    const sel = nextSelection.current
    const el = textarea()
    if (!sel || !el) return
    nextSelection.current = null
    el.focus()
    el.setSelectionRange(sel.start, sel.end)
  }, [value])

  const run = (apply: (v: string, s: number, e: number) => TextEdit) => {
    const el = textarea()
    const edit = apply(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length)
    nextSelection.current = { start: edit.start, end: edit.end }
    onChange(edit.value)
  }

  return (
    <FormField
      label={label}
      error={error}
      hint={hint}
      aside={
        <SegmentedControl
          size="sm"
          label={t('editor.md.mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: t('common.edit') },
            { value: 'preview', label: t('editor.md.preview') },
          ]}
        />
      }
    >
      {mode === 'edit' ? (
        <div ref={wrap} className="flex flex-col gap-2">
          <div role="toolbar" aria-label={`${t('editor.md.toolbar')} (${t(lang === 'en' ? 'editor.lang.en' : 'editor.lang.pt')})`} className="flex gap-1">
            {TOOLS.map((tool) => (
              <IconButton key={tool.key} size="sm" variant="secondary" aria-label={t(tool.label)} title={t(tool.label)} onClick={() => run(tool.apply)}>
                <tool.icon className="size-4" aria-hidden />
              </IconButton>
            ))}
          </div>
          <Textarea lang={lang} rows={18} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px]! leading-6" spellCheck />
        </div>
      ) : (
        <div lang={lang} className="min-h-40 border border-line-strong bg-surface px-4 py-3">
          {value.trim() ? <MarkdownBody markdown={value} /> : <p className="text-ui-small text-ink-muted">{t('editor.md.previewEmpty')}</p>}
        </div>
      )}
      {footer}
    </FormField>
  )
}
