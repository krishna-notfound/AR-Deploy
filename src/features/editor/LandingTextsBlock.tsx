// The Landing tab's "Texts" block (ADR-0053): every editable text of the landing page, grouped by section, in English and
// Portuguese. The original wording is the placeholder; an empty box means the original. Edits go through siteOps.
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { LANDING_TEXT_GROUPS, LANDING_TEXT_KINDS, type LandingTextKind, type LandingTextSection } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { useEditor } from './EditorContext'
import { changedTexts, resetLandingSection, resetLandingText, sectionKeys, setLandingText } from './siteOps'

/** The original wording in a language, shortened to name the text. */
const originalName = (key: string, lang: 'en' | 'pt', max = 70): string => {
  const text = translate(lang, key as TranslationKey)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function TextRow({ textKey, kind }: { textKey: string; kind: LandingTextKind }) {
  const { t, lang } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const value = draft.landing.texts?.[textKey] ?? {}
  const edited = !!(value.en || value.pt)
  const name = originalName(textKey, lang)
  const max = LANDING_TEXT_KINDS[kind]
  const multiline = kind === 'body'
  return (
    <div className="space-y-2" data-text-key={textKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-ui-body font-medium text-ink [overflow-wrap:anywhere]">{name}</p>
        <Button size="sm" disabled={!edited} aria-label={t('editor.landing.texts.resetNamed', { name })} icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => setDraft((d) => resetLandingText(d, textKey))}>
          {t('editor.landing.texts.reset')}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(['en', 'pt'] as const).map((l) => {
          const code = errors[`landing.texts.${textKey}.${l}`]
          const props = {
            lang: l,
            'aria-label': `${name} (${t(`editor.lang.${l}` as TranslationKey)})`,
            value: value[l] ?? '',
            placeholder: translate(l, textKey as TranslationKey),
            maxLength: max,
            onChange: (e: { target: { value: string } }) => setDraft((d) => setLandingText(d, textKey, l, e.target.value)),
          }
          return (
            <FormField key={l} label={t(`editor.lang.${l}` as TranslationKey)} error={code ? t(`editor.err.${code}` as TranslationKey) : undefined} hint={t('editor.landing.texts.limit', { max })}>
              {multiline ? <Textarea rows={3} {...props} /> : <Input {...props} />}
            </FormField>
          )
        })}
      </div>
    </div>
  )
}

function Section({ id }: { id: LandingTextSection }) {
  const { t, tn } = useI18n()
  const { draft, setDraft } = useEditor()
  const group = LANDING_TEXT_GROUPS.find((g) => g.id === id)!
  const changed = changedTexts(draft, sectionKeys(id))
  const name = t(`editor.landing.texts.section.${id}` as TranslationKey)
  return (
    <details className="group border border-line bg-canvas" data-section={id}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2 text-ui-body font-medium text-ink">
        <span>{name}</span>
        {changed > 0 && <span className="text-ui-small font-normal text-accent-ink">{tn('editor.landing.texts.changed', changed)}</span>}
      </summary>
      <div className="space-y-6 border-t border-line px-4 py-5">
        {id === 'collections' && <p className="text-ui-small text-ink-muted">{t('editor.landing.texts.collectionsNote')}</p>}
        <div>
          <Button size="sm" disabled={changed === 0} aria-label={t('editor.landing.texts.resetSectionNamed', { name })} icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => setDraft((d) => resetLandingSection(d, id))}>
            {t('editor.landing.texts.resetSection')}
          </Button>
        </div>
        {group.keys.map(([key, kind]) => (
          <TextRow key={key} textKey={key} kind={kind} />
        ))}
      </div>
    </details>
  )
}

export function LandingTextsBlock() {
  const { t, tn } = useI18n()
  const { draft } = useEditor()
  const total = changedTexts(draft, LANDING_TEXT_GROUPS.flatMap((g) => g.keys.map(([k]) => k)))
  return (
    <div className="space-y-3">
      <p role="status" className="text-ui-small text-ink-muted">
        {total === 0 ? t('editor.landing.texts.none') : tn('editor.landing.texts.changed', total)}
      </p>
      {LANDING_TEXT_GROUPS.map((g) => (
        <Section key={g.id} id={g.id} />
      ))}
    </div>
  )
}
