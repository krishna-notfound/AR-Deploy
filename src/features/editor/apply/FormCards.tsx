import { useEffect, useMemo, useRef, useState } from 'react'
import { type ApplyBuiltinField, MAX_APPLY_STEPS, MAX_CUSTOM_QUESTIONS, type CustomQuestionType, removedFieldsOf } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { AddBar, questionMenuItems } from './AddBar'
import { CardsContext, type CardsContextValue, type FocusRequest, useBuilder } from './builderParts'
import { useFieldDrag } from './dragReorder'
import { addQuestion, addStep, layoutOf, moveField, moveFieldTo, moveFieldToStep, placeableSteps, positionOf, restoreField } from './formOps'
import { MessagesPanel } from './MessagesPanel'
import { AfterCard, HeaderCard, SectionCard } from './SectionCards'

/** The section the person is looking at: the one under the upper part of the window (the last one when none is). */
function sectionInView(fallback: string): string {
  const zones = [...document.querySelectorAll<HTMLElement>('[data-step-zone]')]
  const mid = window.innerHeight * 0.4
  const hit = zones.find((z) => {
    const r = z.getBoundingClientRect()
    return r.top <= mid && r.bottom >= mid
  })
  return hit?.dataset.stepZone ?? zones.at(-1)?.dataset.stepZone ?? fallback
}

/**
 * The form as a column of cards: the header, one group per section (its card and its question cards), the Review rows, the
 * "After sending" card and the "Button & message texts" panel. It owns what the cards share: dragging and moving, the
 * announcements for screen readers, focusing a card, and the add bar.
 */
export function FormCards({ panelOpen, onPanelToggle, focusRequest }: { panelOpen: boolean; onPanelToggle: () => void; focusRequest: FocusRequest | null }) {
  const { t, lang: appLang } = useI18n()
  const { config, onChange, openKey, setOpenKey, requestFocus } = useBuilder()
  const steps = layoutOf(config)
  const [announcement, setAnnouncement] = useState('')
  // After a move the card is re-created in its new place; this puts keyboard focus back on its handle.
  const focusHandle = useRef<string | null>(null)
  useEffect(() => {
    const key = focusHandle.current
    if (!key) return
    focusHandle.current = null
    document.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"] [data-handle]`)?.focus({ preventScroll: true })
  }, [config])

  // A request to focus a card (a new card, or a link in the problems banner) is carried out once the card is on screen.
  const lastHandled = useRef(0)
  useEffect(() => {
    const request = focusRequest
    if (!request || request.nonce === lastHandled.current) return
    const el = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(request.card)}"]`)
    if (!el) return
    lastHandled.current = request.nonce
    el.scrollIntoView?.({ block: 'center' })
    // A new card takes focus in its first field; a link from the problems banner goes to the field that has the problem.
    const first = el.querySelector<HTMLElement>('[data-autofocus]')
    const invalid = el.querySelector<HTMLElement>('[aria-invalid="true"]')
    const target = (request.select ? first : (invalid ?? first)) ?? el.querySelector<HTMLElement>('input, textarea, button')
    target?.focus({ preventScroll: true })
    if (request.select && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) target.select()
  })

  const focusCard = requestFocus

  const announceMove = (next: typeof config, key: string) => {
    const at = positionOf(next, key)
    if (at) setAnnouncement(t('applications.builder.moved', { step: at.step, position: at.position }))
  }
  const move = (key: string, act: 'up' | 'down') => {
    const next = moveField(config, key, act === 'up' ? -1 : 1)
    if (next === config) return
    focusHandle.current = key
    announceMove(next, key)
    onChange(next)
  }
  const moveTo = (key: string, stepId: string) => {
    const next = moveFieldToStep(config, key, stepId)
    if (next === config) return
    focusHandle.current = key
    announceMove(next, key)
    onChange(next)
  }
  const { drag, start } = useFieldDrag((key, stepId, index) => {
    const next = moveFieldTo(config, key, stepId, index)
    if (next === config) return
    focusHandle.current = key
    announceMove(next, key)
    onChange(next)
  })

  const placeable = placeableSteps(config)
  const sections = useMemo(() => steps.map((step, i) => ({ step, n: i + 1 })).filter((s) => s.step.builtin !== 'review'), [steps])
  const openField = openKey ? steps.flatMap((s) => s.fields).find((f) => f.key === openKey) : undefined
  const anchorStep = (): string => (openField ? steps.find((s) => s.fields.some((f) => f.key === openField.key))!.id : sectionInView(placeable.at(-1)?.id ?? ''))

  const questionsFull = config.customQuestions.length >= MAX_CUSTOM_QUESTIONS
  const sectionsFull = config.steps.length >= MAX_APPLY_STEPS
  const addQuestionBelow = (type: CustomQuestionType) => {
    const r = addQuestion(config, anchorStep(), type, t('applications.builder.newQuestion'), openField?.key)
    if (!r.id) return
    onChange(r.config)
    setOpenKey(`custom:${r.id}`)
    focusCard(`field:custom:${r.id}`, { select: true })
  }
  const addSection = () => {
    const r = addStep(config, t('applications.builder.newSection'), anchorStep())
    if (!r.id) return
    onChange(r.config)
    focusCard(`step:${r.id}`, { select: true })
  }
  const removed = removedFieldsOf(config).map((key) => ({ key, name: config.texts[`apply.f.${key}`]?.[appLang] || translate(appLang, `apply.f.${key}` as TranslationKey) }))
  const restoreIn = (stepId: string, key: ApplyBuiltinField) => {
    const next = restoreField(config, key, stepId)
    if (next === config) return
    onChange(next)
    setOpenKey(key)
    focusCard(`field:${key}`, { select: true })
  }
  const restore = (key: ApplyBuiltinField) => restoreIn(anchorStep(), key)
  const addQuestionIn = (stepId: string, type: CustomQuestionType) => {
    const r = addQuestion(config, stepId, type, t('applications.builder.newQuestion'))
    if (!r.id) return
    onChange(r.config)
    setOpenKey(`custom:${r.id}`)
    focusCard(`field:custom:${r.id}`, { select: true })
  }
  const addBar = <AddBar railed={!!openField} questionsFull={questionsFull} sectionsFull={sectionsFull} removed={removed} onAddQuestion={addQuestionBelow} onRestore={restore} onAddSection={addSection} />

  const ctx: CardsContextValue = {
    move,
    moveTo,
    announceSection: (position, total) => setAnnouncement(t('applications.builder.sectionMoved', { n: position, total })),
    startDrag: start,
    drag,
    focusCard,
    addBar,
    addQuestionBelow,
    addQuestionIn,
    questionMenu: (stepId) => questionMenuItems(t, questionsFull, removed, (type) => addQuestionIn(stepId, type), (key) => restoreIn(stepId, key)),
    questionsFull,
  }

  return (
    <CardsContext.Provider value={ctx}>
      <div className="space-y-4">
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <HeaderCard />
        {steps.map((step, i) => (
          <SectionCard key={step.id} step={step} n={i + 1} total={steps.length} sections={sections} />
        ))}
        <AfterCard />
        <MessagesPanel open={panelOpen} onToggle={onPanelToggle} />
        {!openField && addBar}
      </div>
    </CardsContext.Provider>
  )
}
