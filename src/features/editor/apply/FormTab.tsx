import { ArrowDown, ArrowUp, Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { type ApplyFormConfig, type ContentErrors, type CustomQuestionType, MAX_APPLY_STEPS, MAX_CUSTOM_QUESTIONS, type ResolvedField, type ResolvedStep } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { LangPair, LockNote, useErrorText } from './builderParts'
import { typeLabelKey } from './FieldPanel'
import { addQuestion, addStep, deleteStep, layoutOf, moveField, moveFieldToStep, moveStep, placeableSteps, positionOf, setHidden, setStepText } from './formOps'
import { originalName } from './TextOverride'

const TYPES: CustomQuestionType[] = ['short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice']

/** The Form tab: a card per step with its fields in order, and the buttons that rearrange them (no drag and drop). */
export function FormTab({ config, onChange, errors, onEdit }: { config: ApplyFormConfig; onChange: (next: ApplyFormConfig) => void; errors: ContentErrors; onEdit: (key: string) => void }) {
  const { t } = useI18n()
  const errorText = useErrorText()
  const steps = layoutOf(config)
  const [announcement, setAnnouncement] = useState('')
  const [newType, setNewType] = useState<CustomQuestionType>('short_text')
  // After a move the row is re-created in its new place; this puts keyboard focus back on the button that was used.
  const focusAfter = useRef<{ key: string; act: 'up' | 'down' } | null>(null)
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    const row = document.querySelector(`[data-row="${CSS.escape(want.key)}"]`)
    const button = row?.querySelector<HTMLButtonElement>(`[data-act="${want.act}"]`)
    const other = row?.querySelector<HTMLButtonElement>(`[data-act="${want.act === 'up' ? 'down' : 'up'}"]`)
    ;(button && !button.disabled ? button : other)?.focus()
  }, [config])

  const move = (key: string, act: 'up' | 'down') => {
    const next = moveField(config, key, act === 'up' ? -1 : 1)
    if (next === config) return
    focusAfter.current = { key, act }
    const at = positionOf(next, key)
    if (at) setAnnouncement(t('applications.builder.moved', { step: at.step, position: at.position }))
    onChange(next)
  }
  const moveTo = (key: string, stepId: string) => {
    const next = moveFieldToStep(config, key, stepId)
    if (next === config) return
    const at = positionOf(next, key)
    if (at) setAnnouncement(t('applications.builder.moved', { step: at.step, position: at.position }))
    onChange(next)
  }

  const atStepLimit = config.steps.length >= MAX_APPLY_STEPS
  const atQuestionLimit = config.customQuestions.length >= MAX_CUSTOM_QUESTIONS
  const placeable = placeableSteps(config)

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {steps.map((step, i) => {
        const isReview = step.builtin === 'review'
        const stepIndex = config.steps.findIndex((s) => s.id === step.id)
        const own = config.steps[stepIndex]
        const title = originalName(`apply.step.${step.builtin ?? 'x'}`, 'en')
        return (
          <section key={step.id} aria-label={t('applications.builder.stepN', { n: i + 1, title: step.title?.en || (step.builtin ? title : '') })} className="rounded-[var(--radius-card)] border border-line bg-surface">
            <header className="space-y-3 border-b border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-ui-body font-semibold text-ink">{t('applications.builder.step', { n: i + 1 })}</h3>
                <div className="flex items-center gap-1">
                  {isReview ? (
                    <Badge tone="neutral">
                      <Lock className="mr-1 inline size-3" aria-hidden />
                      {t('applications.builder.alwaysLast')}
                    </Badge>
                  ) : (
                    <>
                      <IconButton aria-label={t('applications.builder.stepUp', { n: i + 1 })} size="sm" disabled={i === 0} onClick={() => onChange(moveStep(config, step.id, -1))}>
                        <ArrowUp className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton aria-label={t('applications.builder.stepDown', { n: i + 1 })} size="sm" disabled={steps[i + 1]?.builtin === 'review'} onClick={() => onChange(moveStep(config, step.id, 1))}>
                        <ArrowDown className="size-4" aria-hidden />
                      </IconButton>
                      {!step.builtin && (
                        <IconButton aria-label={t('applications.builder.stepDelete', { n: i + 1 })} size="sm" onClick={() => onChange(deleteStep(config, step.id))}>
                          <Trash2 className="size-4" aria-hidden />
                        </IconButton>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-ui-small font-medium text-ink-muted">{t('applications.builder.stepTitle')}</p>
                <LangPair
                  name={t('applications.builder.stepTitleN', { n: i + 1 })}
                  value={own?.title ?? {}}
                  onChange={(lang, text) => onChange(setStepText(config, step.id, 'title', lang, text))}
                  placeholders={step.builtin ? { en: originalName(`apply.step.${step.builtin}`, 'en', 60), pt: originalName(`apply.step.${step.builtin}`, 'pt', 60) } : undefined}
                  errors={{ en: errorText(errors, `steps.${stepIndex}.title.en`), pt: errorText(errors, `steps.${stepIndex}.title.pt`) }}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1">
                <p className="text-ui-small font-medium text-ink-muted">{t('applications.builder.stepHint')}</p>
                <LangPair
                  name={t('applications.builder.stepHintN', { n: i + 1 })}
                  value={own?.hint ?? {}}
                  onChange={(lang, text) => onChange(setStepText(config, step.id, 'hint', lang, text))}
                  placeholders={step.builtin ? { en: originalName(`apply.step.${step.builtin}.hint`, 'en', 80), pt: originalName(`apply.step.${step.builtin}.hint`, 'pt', 80) } : undefined}
                  errors={{ en: errorText(errors, `steps.${stepIndex}.hint.en`), pt: errorText(errors, `steps.${stepIndex}.hint.pt`) }}
                  maxLength={200}
                />
              </div>
              {errorText(errors, 'steps') && i === 0 && <p className="text-ui-small text-danger">{errorText(errors, 'steps')}</p>}
            </header>

            {isReview ? (
              <ul className="space-y-2 p-4">
                {(['consent', 'terms'] as const).map((row) => (
                  <li key={row} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-subtle px-3 py-2">
                    <Lock className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="text-ui-body text-ink">{t(row === 'consent' ? 'applications.builder.consentRow' : 'applications.builder.termsRow')}</span>
                    <Badge tone="neutral">{t('applications.builder.required')}</Badge>
                    <span className="text-ui-small text-ink-muted">{t('applications.builder.reviewLocked')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {step.fields.length === 0 ? (
                  <p className="p-4 text-ui-body text-ink-muted">{t('applications.builder.emptyStep')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {step.fields.map((f, at) => (
                      <FieldRow key={f.key} field={f} first={at === 0} last={at === step.fields.length - 1} step={step} steps={placeable} config={config} errors={errors} onMove={move} onMoveTo={moveTo} onEdit={onEdit} onShow={(key) => onChange(setHidden(config, key, false))} />
                    ))}
                  </ul>
                )}
                <footer className="flex flex-wrap items-center gap-3 border-t border-line p-4">
                  <Select aria-label={t('applications.builder.newQuestionType')} value={newType} onChange={(e) => setNewType(e.target.value as CustomQuestionType)} className="w-52">
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(typeLabelKey(type))}
                      </option>
                    ))}
                  </Select>
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    disabled={atQuestionLimit}
                    aria-label={t('applications.builder.addQuestionToStep', { n: i + 1 })}
                    onClick={() => {
                      const r = addQuestion(config, step.id, newType, t('applications.builder.newQuestion'))
                      if (!r.id) return
                      onChange(r.config)
                      onEdit(`custom:${r.id}`)
                    }}
                  >
                    {t('applications.builder.addQuestion')}
                  </Button>
                  <span className="text-ui-small text-ink-muted">{t('applications.builder.questionsUsed', { n: config.customQuestions.length, max: MAX_CUSTOM_QUESTIONS })}</span>
                </footer>
              </>
            )}
          </section>
        )
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Plus className="size-4" aria-hidden />}
          disabled={atStepLimit}
          onClick={() => {
            const r = addStep(config, t('applications.builder.newStep'))
            if (r.id) onChange(r.config)
          }}
        >
          {t('applications.builder.addStep')}
        </Button>
        <span className="text-ui-small text-ink-muted">{atStepLimit ? t('applications.builder.stepsFull', { max: MAX_APPLY_STEPS }) : t('applications.builder.stepsUsed', { n: config.steps.length, max: MAX_APPLY_STEPS })}</span>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  first,
  last,
  step,
  steps,
  config,
  errors,
  onMove,
  onMoveTo,
  onEdit,
  onShow,
}: {
  field: ResolvedField
  first: boolean
  last: boolean
  step: ResolvedStep
  steps: { id: string; title?: { en?: string; pt?: string }; builtin?: string }[]
  config: ApplyFormConfig
  errors: ContentErrors
  onMove: (key: string, act: 'up' | 'down') => void
  onMoveTo: (key: string, stepId: string) => void
  onEdit: (key: string) => void
  onShow: (key: string) => void
}) {
  const { t, lang, localized } = useI18n()
  const errorText = useErrorText()
  const q = field.question
  const name = q ? localized(q.label) || t('applications.builder.untitledQuestion') : config.texts[`apply.f.${field.key}`]?.[lang] || originalName(`apply.f.${field.key}`, lang)
  const qi = q ? config.customQuestions.findIndex((x) => x.id === q.id) : -1
  const problem = q ? Object.keys(errors).find((p) => p.startsWith(`customQuestions.${qi}.`)) : undefined
  return (
    <li data-row={field.key} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', field.hidden && 'bg-subtle/60')}>
      <div className={cn('min-w-0 flex-1 basis-48', field.hidden && 'opacity-60')}>
        <p className="flex flex-wrap items-center gap-2 text-ui-body font-medium text-ink">
          {field.locked && <Lock className="size-3.5 shrink-0 text-ink-muted" aria-label={t('applications.builder.locked')} role="img" />}
          <span className="[overflow-wrap:anywhere]">{name}</span>
          {q && <Badge tone="info">{t(typeLabelKey(q.type))}</Badge>}
          {field.hidden ? <Badge tone="neutral">{t('applications.builder.hidden')}</Badge> : field.required ? <Badge tone="accent">{t('applications.builder.required')}</Badge> : <Badge tone="neutral">{t('common.optional')}</Badge>}
        </p>
        {field.locked && <LockNote>{t('applications.builder.lockedReason')}</LockNote>}
        {problem && <p className="text-ui-small text-danger">{errorText(errors, problem)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {field.hidden && (
          <Button size="sm" icon={<Eye className="size-4" aria-hidden />} aria-label={t('applications.builder.showField', { name })} onClick={() => onShow(field.key)}>
            {t('applications.builder.show')}
          </Button>
        )}
        <IconButton aria-label={t('applications.builder.moveUp', { name })} data-act="up" size="sm" disabled={first} onClick={() => onMove(field.key, 'up')}>
          <ArrowUp className="size-4" aria-hidden />
        </IconButton>
        <IconButton aria-label={t('applications.builder.moveDown', { name })} data-act="down" size="sm" disabled={last} onClick={() => onMove(field.key, 'down')}>
          <ArrowDown className="size-4" aria-hidden />
        </IconButton>
        <Select
          aria-label={t('applications.builder.moveToStepFor', { name })}
          value=""
          className="w-40"
          onChange={(e) => {
            if (e.target.value) onMoveTo(field.key, e.target.value)
          }}
        >
          <option value="">{t('applications.builder.moveToStep')}</option>
          {steps
            .filter((s) => s.id !== step.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {t('applications.builder.stepN', { n: config.steps.findIndex((x) => x.id === s.id) + 1, title: s.title?.en || (s.builtin ? originalName(`apply.step.${s.builtin}`, lang, 24) : '') })}
              </option>
            ))}
        </Select>
        <Button size="sm" icon={<Pencil className="size-4" aria-hidden />} aria-label={t('applications.builder.editField', { name })} onClick={() => onEdit(field.key)}>
          {t('common.edit')}
        </Button>
      </div>
    </li>
  )
}
