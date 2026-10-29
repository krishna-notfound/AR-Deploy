import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { FormField, Select, Switch } from '@/components/ui/Form'
import {
  type ApplyBuiltinField,
  type ApplyChoiceField,
  type ApplyFormConfig,
  type ContentErrors,
  type CustomQuestion,
  type CustomQuestionType,
  MAX_CHOICE_OPTIONS,
  MIN_CHOICE_OPTIONS,
} from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { BUILTIN_FIELDS } from '../../../../supabase/functions/_shared/applyForm.ts'
import { Drawer, LangPair, LockNote, useErrorText } from './builderParts'
import {
  addOption,
  deleteQuestion,
  isChoiceQuestion,
  isLockedField,
  layoutOf,
  moveOption,
  removeOption,
  setHidden,
  setOptionHidden,
  setRequired,
  updateQuestion,
  visibleOptionCount,
} from './formOps'
import { TextOverride, originalName } from './TextOverride'
import { fieldTextKeys, optionTextKey } from './textGroups'

const TYPES: CustomQuestionType[] = ['short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice']
export const typeLabelKey = (type: CustomQuestionType): TranslationKey => `applications.builder.type.${type}` as TranslationKey

interface PanelProps {
  /** `businessName`, `website`, ... or `custom:<question id>`. */
  fieldKey: string | null
  config: ApplyFormConfig
  onChange: (next: ApplyFormConfig) => void
  errors: ContentErrors
  onClose: () => void
  /** Called after a question is deleted (the panel closes). */
  onDeleted?: () => void
}

/** The side drawer for one field or question: wording, required, hidden, options. */
export function FieldPanel({ fieldKey, config, onChange, errors, onClose, onDeleted }: PanelProps) {
  const { t } = useI18n()
  const question = fieldKey?.startsWith('custom:') ? config.customQuestions.find((q) => q.id === fieldKey.slice(7)) : undefined
  const builtin = fieldKey && !fieldKey.startsWith('custom:') ? (fieldKey as ApplyBuiltinField) : null
  const open = !!(question || (builtin && builtin in BUILTIN_FIELDS))
  const title = question ? question.label.en || t('applications.builder.untitledQuestion') : builtin ? originalName(`apply.f.${builtin}`, 'en') : ''
  return (
    <Drawer open={open} onClose={onClose} title={title} description={question ? t('applications.builder.questionPanelHint') : t('applications.builder.fieldPanelHint')}>
      {question && <QuestionBody q={question} config={config} onChange={onChange} errors={errors} onDeleted={() => (onDeleted ?? onClose)()} />}
      {builtin && !question && <BuiltinBody k={builtin} config={config} onChange={onChange} errors={errors} />}
    </Drawer>
  )
}

function BuiltinBody({ k, config, onChange, errors }: { k: ApplyBuiltinField; config: ApplyFormConfig; onChange: (c: ApplyFormConfig) => void; errors: ContentErrors }) {
  const { t, lang } = useI18n()
  const info = BUILTIN_FIELDS[k]
  const locked = isLockedField(k)
  const placed = layoutOf(config).flatMap((s) => s.fields).find((f) => f.key === k)
  const keys = fieldTextKeys(k)
  const choice = info.options ? (k as ApplyChoiceField) : null
  return (
    <>
      <section className="space-y-4" aria-label={t('applications.builder.wording')}>
        <TextOverride textKey={keys.label} title={t('applications.builder.label')} config={config} onChange={onChange} errors={errors} />
        {keys.hint && <TextOverride textKey={keys.hint} title={t('applications.builder.hint')} config={config} onChange={onChange} errors={errors} multiline />}
        {keys.extra && <TextOverride textKey={keys.extra} title={t('applications.builder.otherLabel')} config={config} onChange={onChange} errors={errors} />}
      </section>

      <section className="space-y-4" aria-label={t('applications.builder.rules')}>
        {locked && <LockNote>{t('applications.builder.lockedReason')}</LockNote>}
        {k === 'language' ? (
          <p className="text-ui-small text-ink-muted">{t('applications.builder.languageNote')}</p>
        ) : (
          <Switch label={t('applications.builder.required')} checked={locked || !!placed?.required} disabled={locked} onChange={(v) => onChange(setRequired(config, k, v))} />
        )}
        <Switch label={t('applications.builder.hidden')} description={t('applications.builder.hiddenHint')} checked={!!placed?.hidden} disabled={locked} onChange={(v) => onChange(setHidden(config, k, v))} />
      </section>

      {choice && (
        <section className="space-y-5" aria-label={t('applications.builder.options')}>
          <h3 className="text-ui-body font-medium text-ink">{t('applications.builder.options')}</h3>
          {(info.options ?? []).map((v) => {
            const shown = !config.hiddenOptions[choice]?.includes(v)
            const onlyOne = shown && visibleOptionCount(config, choice) <= 1
            const name = originalName(optionTextKey(choice, v), lang)
            return (
              <div key={v} className="space-y-2 rounded-[var(--radius-card)] border border-line p-3">
                <TextOverride textKey={optionTextKey(choice, v)} config={config} onChange={onChange} errors={errors} />
                <Switch label={t('applications.builder.showOption', { name })} checked={shown} disabled={onlyOne} onChange={(on) => onChange(setOptionHidden(config, choice, v, !on))} />
                {onlyOne && <LockNote>{t('applications.builder.lastOption')}</LockNote>}
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}

function QuestionBody({ q, config, onChange, errors, onDeleted }: { q: CustomQuestion; config: ApplyFormConfig; onChange: (c: ApplyFormConfig) => void; errors: ContentErrors; onDeleted: () => void }) {
  const { t } = useI18n()
  const errorText = useErrorText()
  const i = config.customQuestions.findIndex((x) => x.id === q.id)
  const placed = layoutOf(config).flatMap((s) => s.fields).find((f) => f.key === `custom:${q.id}`)
  const at = `customQuestions.${i}`
  const choice = isChoiceQuestion(q.type)
  return (
    <>
      <FormField label={t('applications.builder.questionType')}>
        <Select value={q.type} onChange={(e) => onChange(updateQuestion(config, q.id, { type: e.target.value as CustomQuestionType }))}>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {t(typeLabelKey(type))}
            </option>
          ))}
        </Select>
      </FormField>

      <section className="space-y-4" aria-label={t('applications.builder.wording')}>
        <div className="space-y-1">
          <p className="text-ui-body font-medium text-ink">{t('applications.builder.label')}</p>
          <LangPair
            name={t('applications.builder.label')}
            value={q.label}
            onChange={(lang, text) => onChange(updateQuestion(config, q.id, { label: { ...q.label, [lang]: text } }))}
            errors={{ en: errorText(errors, `${at}.label.en`), pt: errorText(errors, `${at}.label.pt`) }}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <p className="text-ui-body font-medium text-ink">{t('applications.builder.help')}</p>
          <LangPair
            name={t('applications.builder.help')}
            value={q.help ?? {}}
            onChange={(lang, text) => onChange(updateQuestion(config, q.id, { help: { en: q.help?.en ?? '', ...(q.help?.pt !== undefined ? { pt: q.help.pt } : {}), [lang]: text } }))}
            errors={{ en: errorText(errors, `${at}.help.en`), pt: errorText(errors, `${at}.help.pt`) }}
            maxLength={300}
          />
        </div>
      </section>

      {choice && (
        <section className="space-y-3" aria-label={t('applications.builder.options')}>
          <h3 className="text-ui-body font-medium text-ink">{t('applications.builder.options')}</h3>
          {errorText(errors, `${at}.options`) && <p className="text-ui-small text-danger">{errorText(errors, `${at}.options`)}</p>}
          {(q.options ?? []).map((o, j) => (
            <div key={o.id} className="space-y-1 rounded-[var(--radius-card)] border border-line p-3">
              <LangPair
                name={t('applications.builder.optionN', { n: j + 1 })}
                value={o.label}
                onChange={(lang, text) => onChange(updateQuestion(config, q.id, { options: (q.options ?? []).map((x) => (x.id === o.id ? { ...x, label: { ...x.label, [lang]: text } } : x)) }))}
                errors={{ en: errorText(errors, `${at}.options.${j}.label.en`), pt: errorText(errors, `${at}.options.${j}.label.pt`) }}
                maxLength={80}
              />
              <div className="flex gap-1">
                <IconButton aria-label={t('applications.builder.optionUp', { n: j + 1 })} size="sm" disabled={j === 0} onClick={() => onChange(moveOption(config, q.id, o.id, -1))}>
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton aria-label={t('applications.builder.optionDown', { n: j + 1 })} size="sm" disabled={j === (q.options?.length ?? 0) - 1} onClick={() => onChange(moveOption(config, q.id, o.id, 1))}>
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton aria-label={t('applications.builder.optionRemove', { n: j + 1 })} size="sm" disabled={(q.options?.length ?? 0) <= MIN_CHOICE_OPTIONS} onClick={() => onChange(removeOption(config, q.id, o.id))}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          <Button size="sm" icon={<Plus className="size-4" aria-hidden />} disabled={(q.options?.length ?? 0) >= MAX_CHOICE_OPTIONS} onClick={() => onChange(addOption(config, q.id))}>
            {t('applications.builder.addOption')}
          </Button>
        </section>
      )}

      <section className="space-y-4">
        <Switch label={t('applications.builder.required')} checked={!!placed?.required} onChange={(v) => onChange(setRequired(config, `custom:${q.id}`, v))} />
        <LockNote>{t('applications.builder.deleteInstead')}</LockNote>
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => {
            onChange(deleteQuestion(config, q.id))
            onDeleted()
          }}
        >
          {t('applications.builder.deleteQuestion')}
        </Button>
      </section>
    </>
  )
}
