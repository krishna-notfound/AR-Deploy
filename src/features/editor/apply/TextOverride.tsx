import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { type ApplyFormConfig, type ContentErrors, APPLY_TEXT_TOKENS, MAX_TEXT_OVERRIDE } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { LangPair, useErrorText } from './builderParts'
import { resetText, setText } from './formOps'

/** The original wording of a text in the language of the app, shortened for use as a heading. */
export function originalName(key: string, lang: 'en' | 'pt', max = 70): string {
  const text = translate(lang, key as TranslationKey).replace(/\{(\w+)\}/g, '…')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * The wording of one `apply.*` text in English and Portuguese: the original is the placeholder, a `{token}` the original
 * has can be kept (chips show them), and Reset puts the original back in both languages.
 */
export function TextOverride({
  textKey,
  title,
  config,
  onChange,
  errors,
  multiline = false,
}: {
  textKey: string
  /** What the person sees as the name of the text. Default: the original wording. */
  title?: string
  config: ApplyFormConfig
  onChange: (next: ApplyFormConfig) => void
  errors: ContentErrors
  multiline?: boolean
}) {
  const { t, lang } = useI18n()
  const errorText = useErrorText()
  const tokens = APPLY_TEXT_TOKENS[textKey] ?? []
  const value = config.texts[textKey] ?? {}
  const name = title ?? originalName(textKey, lang)
  const edited = !!(value.en || value.pt)
  return (
    <div className="space-y-2" data-text-key={textKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ui-body font-medium text-ink [overflow-wrap:anywhere]">{name}</p>
        <Button size="sm" disabled={!edited} onClick={() => onChange(resetText(config, textKey))} icon={<RotateCcw className="size-3.5" aria-hidden />} aria-label={t('applications.builder.resetNamed', { name })}>
          {t('applications.builder.reset')}
        </Button>
      </div>
      <LangPair
        name={name}
        value={value}
        onChange={(l, text) => onChange(setText(config, textKey, l, text))}
        placeholders={{ en: translate('en', textKey as TranslationKey), pt: translate('pt', textKey as TranslationKey) }}
        errors={{ en: errorText(errors, `texts.${textKey}.en`), pt: errorText(errors, `texts.${textKey}.pt`) }}
        multiline={multiline}
        maxLength={MAX_TEXT_OVERRIDE}
      />
      {tokens.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-ui-small text-ink-muted">
          {t('applications.builder.tokens')}
          {tokens.map((tok) => (
            <code key={tok} className="rounded-[var(--radius-control)] bg-subtle px-1.5 py-0.5 text-ink">{`{${tok}}`}</code>
          ))}
        </p>
      )}
    </div>
  )
}
