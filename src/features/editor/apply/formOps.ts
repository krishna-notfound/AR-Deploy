// Pure edits of the application form document (ApplyFormConfig) for the builder. Every function returns a new config and
// leaves its input alone; a change the rules refuse (the email hidden or deleted, a 31st question, the last visible option,
// a field on Review) returns the same config. The document keeps one placement per field in array order, so these first
// write every field out explicitly (`materialize`) and then move entries around.
import {
  APPLY_BUILTIN_KEYS,
  type ApplyBuiltinField,
  type ApplyChoiceField,
  type ApplyFieldPlacement,
  type ApplyFormConfig,
  type ApplyStep,
  type CustomQuestion,
  type CustomQuestionType,
  DEFAULT_APPLY_FORM,
  type Lang,
  LOCKED_FIELDS,
  MAX_APPLY_STEPS,
  MAX_CHOICE_OPTIONS,
  MAX_CUSTOM_QUESTIONS,
  MAX_QUESTION_LABEL,
  MIN_CHOICE_OPTIONS,
  type ResolvedField,
  type ResolvedStep,
  removedFieldsOf,
  resolveApplyForm,
} from '@/domain/siteContent'
import { BUILTIN_FIELDS } from '../../../../supabase/functions/_shared/applyForm.ts'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const uuid = (): string => crypto.randomUUID()

export const isLockedField = (key: string): boolean => (LOCKED_FIELDS as readonly string[]).includes(key)
export const isChoiceQuestion = (type: CustomQuestionType): boolean => type === 'single_choice' || type === 'multi_choice'
export const questionIdOf = (key: string): string | null => (key.startsWith('custom:') ? key.slice(7) : null)

/** The review step (always last) and the steps fields can sit on. */
export const reviewStepOf = (c: ApplyFormConfig): ApplyStep | undefined => c.steps.find((s) => s.builtin === 'review')
export const placeableSteps = (c: ApplyFormConfig): ApplyStep[] => c.steps.filter((s) => s.builtin !== 'review')

/** The steps with every field (hidden ones too) in display order: what the builder shows. */
export const layoutOf = (c: ApplyFormConfig): ResolvedStep[] => resolveApplyForm(c, { includeHidden: true })

/** Every field written out as an explicit placement in display order (defaults filled in), questions included. */
export function materialize(c: ApplyFormConfig): ApplyFormConfig {
  const fields: ApplyFieldPlacement[] = layoutOf(c).flatMap((st) =>
    st.fields.map((f: ResolvedField): ApplyFieldPlacement => ({ key: f.key, stepId: st.id, ...(f.hidden ? { hidden: true } : {}), required: f.required })),
  )
  return { ...clone(c), fields }
}

function withFields(c: ApplyFormConfig, edit: (fields: ApplyFieldPlacement[]) => void): ApplyFormConfig {
  const next = materialize(c)
  edit(next.fields)
  return next
}

/** Position of a field in its step, 1-based, with the step's number among the steps shown (for the "Moved to…" message). */
export function positionOf(c: ApplyFormConfig, key: string): { step: number; position: number } | null {
  const steps = layoutOf(c)
  for (const [i, st] of steps.entries()) {
    const at = st.fields.findIndex((f) => f.key === key)
    if (at >= 0) return { step: i + 1, position: at + 1 }
  }
  return null
}

// ---- fields ---------------------------------------------------------------------------------------------------------
/** Moves a field one place up (-1) or down (1) inside its step. Same config at the edge. */
export function moveField(c: ApplyFormConfig, key: string, dir: -1 | 1): ApplyFormConfig {
  const next = materialize(c)
  const at = next.fields.findIndex((f) => f.key === key)
  if (at < 0) return c
  const stepId = next.fields[at]!.stepId
  const siblings = next.fields.map((f, i) => [f, i] as const).filter(([f]) => f.stepId === stepId)
  const slot = siblings.findIndex(([, i]) => i === at)
  const other = siblings[slot + dir]
  if (!other) return c
  ;[next.fields[at], next.fields[other[1]]] = [next.fields[other[1]]!, next.fields[at]!]
  return next
}

/** Moves a field to the end of another step (never Review). */
export function moveFieldToStep(c: ApplyFormConfig, key: string, stepId: string): ApplyFormConfig {
  if (!placeableSteps(c).some((s) => s.id === stepId)) return c
  const next = materialize(c)
  const at = next.fields.findIndex((f) => f.key === key)
  if (at < 0 || next.fields[at]!.stepId === stepId) return c
  const [moved] = next.fields.splice(at, 1)
  moved!.stepId = stepId
  let last = -1
  next.fields.forEach((f, i) => {
    if (f.stepId === stepId) last = i
  })
  next.fields.splice(last + 1, 0, moved!)
  return next
}

/**
 * Moves a field into a section at a position: `index` counts the fields the section already has once this one is taken
 * out (0 = first, anything past the end = last). Works inside a section and across sections (drag and drop, the keyboard
 * and the move menu). Never onto Review. The same config when the field would stay where it is.
 */
export function moveFieldTo(c: ApplyFormConfig, key: string, stepId: string, index: number): ApplyFormConfig {
  if (!placeableSteps(c).some((s) => s.id === stepId)) return c
  const next = materialize(c)
  const at = next.fields.findIndex((f) => f.key === key)
  if (at < 0) return c
  const from = next.fields[at]!
  const oldSlot = from.stepId === stepId ? next.fields.filter((f) => f.stepId === stepId).findIndex((f) => f.key === key) : -1
  const [moved] = next.fields.splice(at, 1)
  const siblings = next.fields.map((f, i) => [f, i] as const).filter(([f]) => f.stepId === stepId)
  const slot = Math.max(0, Math.min(Math.floor(index), siblings.length))
  if (slot === oldSlot) return c
  moved!.stepId = stepId
  let insertAt: number
  if (slot < siblings.length) insertAt = siblings[slot]![1]
  else insertAt = siblings.length ? siblings[siblings.length - 1]![1] + 1 : next.fields.length
  next.fields.splice(insertAt, 0, moved!)
  return next
}

export function setRequired(c: ApplyFormConfig, key: string, required: boolean): ApplyFormConfig {
  if (isLockedField(key) || key === 'language') return c
  return withFields(c, (fields) => {
    const f = fields.find((x) => x.key === key)
    if (f) f.required = required
  })
}

/** Hides or shows a built-in field. Locked fields and questions are never hidden (delete a question instead). */
export function setHidden(c: ApplyFormConfig, key: string, hidden: boolean): ApplyFormConfig {
  if (isLockedField(key) || questionIdOf(key) !== null) return c
  return withFields(c, (fields) => {
    const f = fields.find((x) => x.key === key)
    if (!f) return
    if (hidden) f.hidden = true
    else delete f.hidden
  })
}

// ---- deleting and restoring standard questions (ADR-0057) ---------------------------------------------------------------
/** The standard questions that can be deleted: all of them except the locked email. */
export const isDeletableField = (key: string): key is ApplyBuiltinField => (APPLY_BUILTIN_KEYS as readonly string[]).includes(key) && !isLockedField(key)

/**
 * Deletes a standard question: it is no longer on the form, no longer has a place, and applications store it as null. The
 * wording the client gave it stays (restoring brings it back). A choice question forgets its hidden options.
 */
export function deleteField(c: ApplyFormConfig, key: string): ApplyFormConfig {
  if (!isDeletableField(key) || removedFieldsOf(c).includes(key)) return c
  const next = materialize(c)
  next.fields = next.fields.filter((f) => f.key !== key)
  next.removedFields = [...(next.removedFields ?? []), key]
  if (next.hiddenOptions[key as ApplyChoiceField]) {
    next.hiddenOptions = { ...next.hiddenOptions }
    delete next.hiddenOptions[key as ApplyChoiceField]
  }
  return next
}

/**
 * Brings a deleted standard question back, last on a section (never Review). Without `stepId` it goes to the section it
 * started on, or to the first section when that one is gone. It comes back visible, with its original Required flag.
 */
export function restoreField(c: ApplyFormConfig, key: string, stepId?: string): ApplyFormConfig {
  if (!isDeletableField(key) || !removedFieldsOf(c).includes(key)) return c
  const placeable = placeableSteps(c)
  if (stepId !== undefined && !placeable.some((s) => s.id === stepId)) return c
  const info = BUILTIN_FIELDS[key]
  const home = stepId ?? placeable.find((s) => s.id === info.defaultStep || s.builtin === info.defaultStep)?.id ?? placeable[0]?.id
  if (!home) return c
  const next = materialize(c)
  const left = removedFieldsOf(next).filter((k) => k !== key)
  if (left.length) next.removedFields = left
  else delete next.removedFields
  let last = -1
  next.fields.forEach((f, i) => {
    if (f.stepId === home) last = i
  })
  next.fields.splice(last + 1, 0, { key, stepId: home, required: info.defaultRequired })
  return next
}

/**
 * Start from blank: one section holding the email card, then Review. Every other standard question is deleted, own questions
 * and hidden options are gone, and the texts stay. The section that held the email (with its title) is the one kept.
 */
export function startFromBlank(c: ApplyFormConfig): ApplyFormConfig {
  const next = clone(c)
  const holder = layoutOf(c).find((s) => s.builtin !== 'review' && s.fields.some((f) => f.key === 'applicantEmail'))
  const kept = (holder && c.steps.find((s) => s.id === holder.id)) ?? placeableSteps(c)[0] ?? clone(DEFAULT_APPLY_FORM.steps.find((s) => s.builtin === 'contact')!)
  const review = reviewStepOf(c) ?? clone(DEFAULT_APPLY_FORM.steps.find((s) => s.builtin === 'review')!)
  next.steps = [clone(kept), clone(review)]
  next.fields = [{ key: 'applicantEmail', stepId: kept.id, required: true }]
  next.customQuestions = []
  next.hiddenOptions = {}
  next.removedFields = APPLY_BUILTIN_KEYS.filter((k) => !isLockedField(k))
  return next
}

/** Back to the original form: its sections, questions, hidden options and removed questions. The texts stay. */
export function restoreOriginal(c: ApplyFormConfig): ApplyFormConfig {
  return { ...clone(DEFAULT_APPLY_FORM), texts: clone(c.texts) }
}

/** Whether the sections, questions and options already are the original ones (so "Restore the original form" would change nothing). */
export function isOriginalForm(c: ApplyFormConfig): boolean {
  const shape = (x: ApplyFormConfig) =>
    JSON.stringify([
      layoutOf(x).map((s) => [s.id, s.builtin ?? null, x.steps.find((y) => y.id === s.id)?.title ?? null, x.steps.find((y) => y.id === s.id)?.hint ?? null, s.fields.map((fl) => [fl.key, !!fl.hidden, fl.required])]),
      x.customQuestions,
      Object.entries(x.hiddenOptions).filter(([, v]) => v && v.length).sort(),
      removedFieldsOf(x),
    ])
  return shape(c) === shape(DEFAULT_APPLY_FORM)
}

// ---- options of the built-in choice fields -------------------------------------------------------------------------
export const visibleOptionCount = (c: ApplyFormConfig, field: ApplyChoiceField): number =>
  (BUILTIN_FIELDS[field].options ?? []).filter((v) => !c.hiddenOptions[field]?.includes(v)).length

/** Hides or shows one option of a choice field. At least one stays visible: hiding the last one returns the same config. */
export function setOptionHidden(c: ApplyFormConfig, field: ApplyChoiceField, value: string, hidden: boolean): ApplyFormConfig {
  const all = BUILTIN_FIELDS[field].options ?? []
  if (!all.includes(value)) return c
  const current = c.hiddenOptions[field] ?? []
  const next = hidden ? [...new Set([...current, value])] : current.filter((v) => v !== value)
  if (all.every((v) => next.includes(v))) return c
  const hiddenOptions = { ...c.hiddenOptions }
  if (next.length) hiddenOptions[field] = next
  else delete hiddenOptions[field]
  return { ...c, hiddenOptions }
}

// ---- steps ----------------------------------------------------------------------------------------------------------
/**
 * Adds a step before Review (7 new steps at most). `title` is the English title the new step starts with. With `afterId` it
 * goes right after that step; Review, or a step that does not exist, means just before Review.
 */
export function addStep(c: ApplyFormConfig, title: string, afterId?: string): { config: ApplyFormConfig; id: string | null } {
  if (c.steps.length >= MAX_APPLY_STEPS) return { config: c, id: null }
  const id = uuid()
  const next = materialize(c)
  const review = next.steps.findIndex((s) => s.builtin === 'review')
  const after = afterId === undefined ? -1 : next.steps.findIndex((s) => s.id === afterId && s.builtin !== 'review')
  const at = after >= 0 ? after + 1 : review < 0 ? next.steps.length : review
  next.steps.splice(at, 0, { id, title: { en: title } })
  return { config: next, id }
}

/** Moves a step one place; Review stays last and nothing moves past it. */
export function moveStep(c: ApplyFormConfig, id: string, dir: -1 | 1): ApplyFormConfig {
  const at = c.steps.findIndex((s) => s.id === id)
  const to = at + dir
  if (at < 0 || c.steps[at]!.builtin === 'review' || to < 0 || c.steps[to]?.builtin === 'review' || !c.steps[to]) return c
  const next = materialize(c)
  ;[next.steps[at], next.steps[to]] = [next.steps[to]!, next.steps[at]!]
  return next
}

/** Edits a step's title or hint in one language; empty removes that language (original text, or English for a new step). */
export function setStepText(c: ApplyFormConfig, id: string, field: 'title' | 'hint', lang: Lang, value: string): ApplyFormConfig {
  const next = clone(c)
  const st = next.steps.find((s) => s.id === id)
  if (!st) return c
  const text = { ...(st[field] ?? {}) }
  if (value) text[lang] = value
  // A new step needs an English title (an empty one is flagged by the validator); everything else just loses the language.
  else if (lang === 'en' && field === 'title' && !st.builtin) text.en = ''
  else delete text[lang]
  if (Object.keys(text).length) st[field] = text
  else delete st[field]
  return next
}

/** Whether a section can be deleted: not Review, and not the last section before Review (the email card needs one). */
export function canDeleteStep(c: ApplyFormConfig, id: string): boolean {
  const step = c.steps.find((s) => s.id === id)
  return !!step && step.builtin !== 'review' && placeableSteps(c).length >= 2
}

/**
 * Removes a section, built-in ones included (ADR-0057). Its questions move to the section above, at its end; the first
 * section's questions go to the start of the next one. Review and the last section before Review stay.
 */
export function deleteStep(c: ApplyFormConfig, id: string): ApplyFormConfig {
  if (!canDeleteStep(c, id)) return c
  const at = c.steps.findIndex((s) => s.id === id)
  const next = materialize(c)
  const before = next.steps.slice(0, at).reverse().find((s) => s.builtin !== 'review')
  const target = before ?? next.steps.find((s, i) => i > at && s.builtin !== 'review')
  if (!target) return c
  const moved = next.fields.filter((f) => f.stepId === id).map((f) => ({ ...f, stepId: target.id }))
  const rest = next.fields.filter((f) => f.stepId !== id)
  const onTarget = rest.map((f, i) => [f, i] as const).filter(([f]) => f.stepId === target.id)
  const insertAt = !onTarget.length ? rest.length : before ? onTarget[onTarget.length - 1]![1] + 1 : onTarget[0]![1]
  rest.splice(insertAt, 0, ...moved)
  next.fields = rest
  next.steps = next.steps.filter((s) => s.id !== id)
  return next
}

// ---- questions ------------------------------------------------------------------------------------------------------
export const questionCount = (c: ApplyFormConfig): number => c.customQuestions.length

const defaultOptions = (): NonNullable<CustomQuestion['options']> => [
  { id: uuid(), label: { en: '' } },
  { id: uuid(), label: { en: '' } },
]

/**
 * Adds a question at the end of a step (never Review; 10 at most). `label` is the English text it starts with. With
 * `afterKey` (a field that sits on a section you can place on) it goes right below that field instead, on its section.
 */
export function addQuestion(c: ApplyFormConfig, stepId: string, type: CustomQuestionType, label: string, afterKey?: string): { config: ApplyFormConfig; id: string | null } {
  if (c.customQuestions.length >= MAX_CUSTOM_QUESTIONS || !placeableSteps(c).some((s) => s.id === stepId)) return { config: c, id: null }
  const id = uuid()
  const next = materialize(c)
  const q: CustomQuestion = { id, type, label: { en: label }, ...(isChoiceQuestion(type) ? { options: defaultOptions() } : {}) }
  next.customQuestions.push(q)
  const anchor = afterKey === undefined ? -1 : next.fields.findIndex((f) => f.key === afterKey)
  if (anchor >= 0) {
    next.fields.splice(anchor + 1, 0, { key: `custom:${id}`, stepId: next.fields[anchor]!.stepId, required: false })
    return { config: next, id }
  }
  let last = -1
  next.fields.forEach((f, i) => {
    if (f.stepId === stepId) last = i
  })
  next.fields.splice(last + 1, 0, { key: `custom:${id}`, stepId, required: false })
  return { config: next, id }
}

/**
 * Copies an own question right below itself: a new id, new option ids, the label with `suffix` added (cut so the label stays
 * within its limit; an empty Portuguese label gets none) and the same Required flag. Refused at ten own questions.
 */
export function duplicateQuestion(c: ApplyFormConfig, id: string, suffix: { en: string; pt: string }): { config: ApplyFormConfig; id: string | null } {
  const source = c.customQuestions.find((q) => q.id === id)
  if (!source || c.customQuestions.length >= MAX_CUSTOM_QUESTIONS) return { config: c, id: null }
  const next = materialize(c)
  const copyId = uuid()
  const withSuffix = (text: string, add: string): string => (text.length + add.length > MAX_QUESTION_LABEL ? text.slice(0, MAX_QUESTION_LABEL - add.length) : text) + add
  const copy = clone(source)
  copy.id = copyId
  copy.label = { en: withSuffix(source.label.en, suffix.en), ...(source.label.pt ? { pt: withSuffix(source.label.pt, suffix.pt) } : {}) }
  if (copy.options) copy.options = copy.options.map((o) => ({ ...o, id: uuid() }))
  next.customQuestions.push(copy)
  const at = next.fields.findIndex((f) => f.key === `custom:${id}`)
  const required = next.fields[at]?.required ?? false
  next.fields.splice(at < 0 ? next.fields.length : at + 1, 0, { key: `custom:${copyId}`, stepId: next.fields[at]?.stepId ?? placeableSteps(next)[0]!.id, required })
  return { config: next, id: copyId }
}

export function deleteQuestion(c: ApplyFormConfig, id: string): ApplyFormConfig {
  if (!c.customQuestions.some((q) => q.id === id)) return c
  const next = materialize(c)
  next.customQuestions = next.customQuestions.filter((q) => q.id !== id)
  next.fields = next.fields.filter((f) => f.key !== `custom:${id}`)
  return next
}

/** Replaces fields of one question. A type change keeps the label; options appear (two empty ones) or go as the type needs. */
export function updateQuestion(c: ApplyFormConfig, id: string, patch: Partial<Pick<CustomQuestion, 'type' | 'label' | 'help' | 'options'>>): ApplyFormConfig {
  const next = clone(c)
  const q = next.customQuestions.find((x) => x.id === id)
  if (!q) return c
  Object.assign(q, patch)
  if (patch.help !== undefined && !patch.help.en && !patch.help.pt) delete q.help
  if (isChoiceQuestion(q.type)) q.options = q.options?.length ? q.options : defaultOptions()
  else delete q.options
  return next
}

export function addOption(c: ApplyFormConfig, id: string): ApplyFormConfig {
  const q = c.customQuestions.find((x) => x.id === id)
  if (!q || !isChoiceQuestion(q.type) || (q.options?.length ?? 0) >= MAX_CHOICE_OPTIONS) return c
  return updateQuestion(c, id, { options: [...(q.options ?? []), { id: uuid(), label: { en: '' } }] })
}

export function removeOption(c: ApplyFormConfig, id: string, optionId: string): ApplyFormConfig {
  const q = c.customQuestions.find((x) => x.id === id)
  if (!q?.options || q.options.length <= MIN_CHOICE_OPTIONS) return c
  return updateQuestion(c, id, { options: q.options.filter((o) => o.id !== optionId) })
}

export function moveOption(c: ApplyFormConfig, id: string, optionId: string, dir: -1 | 1): ApplyFormConfig {
  const q = c.customQuestions.find((x) => x.id === id)
  const at = q?.options?.findIndex((o) => o.id === optionId) ?? -1
  const to = at + dir
  if (!q?.options || at < 0 || to < 0 || to >= q.options.length) return c
  const options = [...q.options]
  ;[options[at], options[to]] = [options[to]!, options[at]!]
  return updateQuestion(c, id, { options })
}

// ---- wording ----------------------------------------------------------------------------------------------------------
/** Sets the wording of one `apply.*` text in one language. Empty removes that language; both empty removes the key. */
export function setText(c: ApplyFormConfig, key: string, lang: Lang, value: string): ApplyFormConfig {
  const texts = { ...c.texts }
  const entry = { ...(texts[key] ?? {}) }
  if (value) entry[lang] = value
  else delete entry[lang]
  if (Object.keys(entry).length) texts[key] = entry
  else delete texts[key]
  return { ...c, texts }
}

/** Back to the original wording in both languages. */
export function resetText(c: ApplyFormConfig, key: string): ApplyFormConfig {
  if (!(key in c.texts)) return c
  const texts = { ...c.texts }
  delete texts[key]
  return { ...c, texts }
}
