// Pure edits of the application form document (ApplyFormConfig) for the builder. Every function returns a new config and
// leaves its input alone; a change the rules refuse (a locked field hidden, an eleventh question, the last visible option,
// a field on Review) returns the same config. The document keeps one placement per field in array order, so these first
// write every field out explicitly (`materialize`) and then move entries around.
import {
  type ApplyChoiceField,
  type ApplyFieldPlacement,
  type ApplyFormConfig,
  type ApplyStep,
  type CustomQuestion,
  type CustomQuestionType,
  type Lang,
  LOCKED_FIELDS,
  MAX_APPLY_STEPS,
  MAX_CHOICE_OPTIONS,
  MAX_CUSTOM_QUESTIONS,
  MIN_CHOICE_OPTIONS,
  type ResolvedField,
  type ResolvedStep,
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
/** Adds a step before Review (7 new steps at most). `title` is the English title the new step starts with. */
export function addStep(c: ApplyFormConfig, title: string): { config: ApplyFormConfig; id: string | null } {
  if (c.steps.length >= MAX_APPLY_STEPS) return { config: c, id: null }
  const id = uuid()
  const next = materialize(c)
  const review = next.steps.findIndex((s) => s.builtin === 'review')
  next.steps.splice(review < 0 ? next.steps.length : review, 0, { id, title: { en: title } })
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

/** Removes a step the client added; its fields move to the step before it (or the first step). Built-in steps stay. */
export function deleteStep(c: ApplyFormConfig, id: string): ApplyFormConfig {
  const at = c.steps.findIndex((s) => s.id === id)
  const step = c.steps[at]
  if (!step || step.builtin) return c
  const next = materialize(c)
  const target = next.steps.slice(0, at).reverse().find((s) => s.builtin !== 'review') ?? next.steps.find((s, i) => i > at && s.builtin !== 'review')
  if (!target) return c
  next.fields = next.fields.map((f) => (f.stepId === id ? { ...f, stepId: target.id } : f))
  next.steps = next.steps.filter((s) => s.id !== id)
  return next
}

// ---- questions ------------------------------------------------------------------------------------------------------
export const questionCount = (c: ApplyFormConfig): number => c.customQuestions.length

const defaultOptions = (): NonNullable<CustomQuestion['options']> => [
  { id: uuid(), label: { en: '' } },
  { id: uuid(), label: { en: '' } },
]

/** Adds a question at the end of a step (never Review; 10 at most). `label` is the English text it starts with. */
export function addQuestion(c: ApplyFormConfig, stepId: string, type: CustomQuestionType, label: string): { config: ApplyFormConfig; id: string | null } {
  if (c.customQuestions.length >= MAX_CUSTOM_QUESTIONS || !placeableSteps(c).some((s) => s.id === stepId)) return { config: c, id: null }
  const id = uuid()
  const next = materialize(c)
  const q: CustomQuestion = { id, type, label: { en: label }, ...(isChoiceQuestion(type) ? { options: defaultOptions() } : {}) }
  next.customQuestions.push(q)
  let last = -1
  next.fields.forEach((f, i) => {
    if (f.stepId === stepId) last = i
  })
  next.fields.splice(last + 1, 0, { key: `custom:${id}`, stepId, required: false })
  return { config: next, id }
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
