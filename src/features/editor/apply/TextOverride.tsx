import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { APPLY_TEXT_TOKENS, MAX_TEXT_OVERRIDE } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { LangField, useBuilder, useLangError } from './builderParts'
import { resetText, setText } from './formOps'

/** The original wording of a text in the language of the app, shortened for use as a heading. */
export function originalName(key: string, lang: 'en' | 'pt', max = 70): string {
  const text = translate(lang, key as TranslationKey).replace(/\{(\w+)\}/g, '…')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** A step's title in a language: what was typed, else the original (built-in step) or the English title (new step). */
export function stepTitleOf(step: { builtin?: string; title?: { en?: string; pt?: string } }, lang: 'en' | 'pt', max = 60): string {
  return step.title?.[lang] || (lang === 'pt' ? step.title?.en : '') || (step.builtin ? originalName(`apply.step.${step.builtin}`, lang, max) : '') || ''
}

/**
 * The wording of one `apply.*` text in the language being typed: the original is the placeholder, a `{token}` the original
 * has can be kept (the line under the field lists them), and Reset puts the original back in both languages.
 * `variant="inline"` is the field alone (inside a card that has its own reset); the default adds a name and a Reset button.
 */
export function TextOverride({
  textKey,
  title,
  multiline = false,
  variant = 'field',
  size = 'plain',
  focusMark = false,
  caption,
}: {
  /** A small line above the field that says what it is (for a text that has no obvious place on the card). */
  caption?: string
  textKey: string
  /** What the person sees as the name of the text. Default: the original wording. */
  title?: string
  multiline?: boolean
  variant?: 'field' | 'inline'
  size?: 'title' | 'question' | 'plain'
  focusMark?: boolean
}) {
  const { t, lang: appLang } = useI18n()
  const { config, onChange, lang } = useBuilder()
  const langError = useLangError()
  const tokens = APPLY_TEXT_TOKENS[textKey] ?? []
  const value = config.texts[textKey] ?? {}
  const name = title ?? originalName(textKey, appLang)
  const edited = !!(value.en || value.pt)
  const error = langError(`texts.${textKey}`)
  const field = (
    <LangField
      name={name}
      lang={lang}
      value={value[lang] ?? ''}
      onChange={(text) => onChange(setText(config, textKey, lang, text))}
      placeholder={translate(lang, textKey as TranslationKey)}
      error={error}
      multiline={multiline}
      maxLength={MAX_TEXT_OVERRIDE}
      size={size}
      focusMark={focusMark}
    />
  )
  return (
    <div className="space-y-1" data-text-key={textKey}>
      {variant === 'field' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ui-body font-medium text-ink [overflow-wrap:anywhere]">{name}</p>
          <Button size="sm" disabled={!edited} onClick={() => onChange(resetText(config, textKey))} icon={<RotateCcw className="size-3.5" aria-hidden />} aria-label={t('applications.builder.resetNamed', { name })}>
            {t('applications.builder.reset')}
          </Button>
        </div>
      )}
      {caption && <p className="px-1 text-ui-small text-ink-muted">{caption}</p>}
      {field}
      {tokens.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 px-1 text-ui-small text-ink-muted">
          {t('applications.builder.tokens')}
          {tokens.map((tok) => (
            <code key={tok} className="rounded-[var(--radius-control)] bg-subtle px-1.5 py-0.5 text-ink">{`{${tok}}`}</code>
          ))}
        </p>
      )}
    </div>
  )
}
