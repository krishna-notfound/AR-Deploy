// The application form model (Content Editor, spec section 6 and 10): the document the Editor saves, the defaults that
// reproduce today's form, the resolver the page/preview/review use, the rules the validator consumes, and the TypeScript
// twin of the SQL gate private.validate_apply_form. Pure TypeScript with NO imports, like application.ts, so the page,
// the demo service and the submit-application Edge Function (Deno) share it. Keep it in step with the migration.

export type Lang = 'en' | 'pt'

export type ApplyStepKey = 'business' | 'location' | 'contact' | 'catalogue' | 'review'
export type ApplyBuiltinField =
  | 'businessName' | 'website' | 'category' | 'description' | 'country' | 'city'
  | 'applicantName' | 'applicantRole' | 'applicantEmail' | 'applicantPhone' | 'language'
  | 'productCount' | 'photoReadiness' | 'modelReadiness' | 'notes'
export type ApplyChoiceField = 'category' | 'productCount' | 'photoReadiness' | 'modelReadiness'
export const LOCKED_FIELDS = ['businessName', 'applicantName', 'applicantEmail'] as const

export interface ApplyStep {
  /** Built-in: the ApplyStepKey; new step: crypto.randomUUID(). */
  id: string
  builtin?: ApplyStepKey
  /** Empty = original text (built-in) or EN fallback (new: EN required), 1..60. */
  title?: { en?: string; pt?: string }
  /** 0..200. */
  hint?: { en?: string; pt?: string }
}
export interface ApplyFieldPlacement {
  /** `custom:<question id>` for a question. */
  key: ApplyBuiltinField | `custom:${string}`
  /** An existing step, never Review. */
  stepId: string
  /** Built-in only; locked keys never. Delete a question instead of hiding it. */
  hidden?: boolean
  /** Omitted = the default; locked keys always true; `language` has no switch. */
  required?: boolean
}
export type CustomQuestionType = 'short_text' | 'long_text' | 'yes_no' | 'single_choice' | 'multi_choice'
export interface CustomQuestion {
  /** crypto.randomUUID(). */
  id: string
  type: CustomQuestionType
  /** 1..200. */
  label: { en: string; pt?: string }
  /** 0..300. */
  help?: { en: string; pt?: string }
  /** single_choice and multi_choice only, 2..10, label 1..80. */
  options?: { id: string; label: { en: string; pt?: string } }[]
}
export interface ApplyFormConfig {
  /** Overrides on top of the `apply.*` dictionary. Key = a member of APPLY_EDITABLE_KEYS. */
  texts: Record<string, Partial<Record<Lang, string>>>
  /** 1..8 steps in display order. The last one is the Review step. Array order is the order. */
  steps: ApplyStep[]
  /** One placement per built-in field and per question. Array order is the order inside a step. A built-in key left out gets its default placement. */
  fields: ApplyFieldPlacement[]
  /** At most 10. */
  customQuestions: CustomQuestion[]
  /** Option values to hide in a built-in choice field. At least one stays visible. */
  hiddenOptions: Partial<Record<ApplyChoiceField, string[]>>
}
/** Stored in business_applications.answers.custom. */
export interface CustomAnswer {
  id: string
  type: CustomQuestionType
  /** Snapshot at submit time. */
  label: { en: string; pt?: string }
  /** Text, yes_no, one option id, or the chosen option ids (multi_choice). */
  value: string | boolean | string[]
  /** Snapshot of the chosen option labels, same order. */
  valueLabels?: { en: string; pt?: string }[]
}

// ---- limits (the SQL gate repeats the ones marked SQL) ---------------------------------------------------------------
export const MAX_APPLY_STEPS = 8 // SQL
export const MAX_CUSTOM_QUESTIONS = 10 // SQL
export const MIN_CHOICE_OPTIONS = 2 // SQL
export const MAX_CHOICE_OPTIONS = 10 // SQL
export const MAX_TEXT_OVERRIDE = 600 // SQL
export const MAX_STEP_TITLE = 60
export const MAX_STEP_HINT = 200
export const MAX_QUESTION_LABEL = 200
export const MAX_QUESTION_HELP = 300
export const MAX_OPTION_LABEL = 80

/**
 * Why a document path is refused. The Editor translates these (`editor.err.<key>`); this is the full set, shared with
 * siteContent.ts. Keys of a ContentErrors are document paths.
 */
export type ContentErrorKey =
  | 'required' | 'too_long' | 'too_many' | 'duplicate_id' | 'invalid_value'
  | 'review_position' | 'step_unknown' | 'review_misplaced' | 'unknown_key' | 'duplicate_key' | 'missing_placement'
  | 'locked' | 'options_count' | 'options_not_allowed' | 'last_option' | 'unknown_token' | 'missing_token'
  | 'invalid_slug' | 'slug_reserved' | 'slug_duplicate' | 'invalid_link' | 'invalid_url' | 'insecure_url' | 'wrong_host'
export type ContentErrors = Record<string, ContentErrorKey>

const CHOICE_FIELDS: readonly ApplyChoiceField[] = ['category', 'productCount', 'photoReadiness', 'modelReadiness']
export const APPLY_CATEGORY_KEYS = ['furniture', 'lighting', 'decor', 'fashion', 'jewellery', 'electronics', 'industrial', 'other'] as const

export const APPLY_BUILTIN_KEYS: readonly ApplyBuiltinField[] = [
  'businessName', 'website', 'category', 'description', 'country', 'city',
  'applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language',
  'productCount', 'photoReadiness', 'modelReadiness', 'notes',
]

export interface BuiltinFieldInfo {
  /** The step the field sits on in today's form. */
  defaultStep: Exclude<ApplyStepKey, 'review'>
  /** Today's required flag. `language` is always preselected, so it has no switch (true). */
  defaultRequired: boolean
  /** Approval creates the company account from these: never hidden, never optional. */
  locked: boolean
  /** The stored option values of a choice field (the fixed set the database and the review screen know). */
  options?: readonly string[]
}
// The option values equal the constants in application.ts (a unit test checks it); application.ts stays untouched.
export const BUILTIN_FIELDS: Readonly<Record<ApplyBuiltinField, BuiltinFieldInfo>> = {
  businessName: { defaultStep: 'business', defaultRequired: true, locked: true },
  website: { defaultStep: 'business', defaultRequired: false, locked: false },
  category: { defaultStep: 'business', defaultRequired: true, locked: false, options: APPLY_CATEGORY_KEYS },
  description: { defaultStep: 'business', defaultRequired: true, locked: false },
  country: { defaultStep: 'location', defaultRequired: true, locked: false },
  city: { defaultStep: 'location', defaultRequired: true, locked: false },
  applicantName: { defaultStep: 'contact', defaultRequired: true, locked: true },
  applicantRole: { defaultStep: 'contact', defaultRequired: false, locked: false },
  applicantEmail: { defaultStep: 'contact', defaultRequired: true, locked: true },
  applicantPhone: { defaultStep: 'contact', defaultRequired: false, locked: false },
  language: { defaultStep: 'contact', defaultRequired: true, locked: false },
  productCount: { defaultStep: 'catalogue', defaultRequired: true, locked: false, options: ['1-10', '11-50', '51-200', '200+'] },
  photoReadiness: { defaultStep: 'catalogue', defaultRequired: true, locked: false, options: ['all', 'some', 'none'] },
  modelReadiness: { defaultStep: 'catalogue', defaultRequired: true, locked: false, options: ['glb_usdz', 'some', 'none', 'need_help'] },
  notes: { defaultStep: 'catalogue', defaultRequired: false, locked: false },
}

const isLocked = (k: string): boolean => (LOCKED_FIELDS as readonly string[]).includes(k)
const isBuiltin = (k: string): k is ApplyBuiltinField => (APPLY_BUILTIN_KEYS as readonly string[]).includes(k)
const isChoiceField = (k: string): k is ApplyChoiceField => (CHOICE_FIELDS as readonly string[]).includes(k)

/** Today's five steps and 15 fields on their current steps with today's required flags. */
export const DEFAULT_APPLY_FORM: ApplyFormConfig = {
  texts: {},
  steps: (['business', 'location', 'contact', 'catalogue', 'review'] as const).map((k) => ({ id: k, builtin: k })),
  fields: APPLY_BUILTIN_KEYS.map((key) => ({ key, stepId: BUILTIN_FIELDS[key].defaultStep, required: BUILTIN_FIELDS[key].defaultRequired })),
  customQuestions: [],
  hiddenOptions: {},
}

/** Every `apply.*` dictionary key a text override may target: all of them except apply.step.* (kept on the step) and apply.done.demo. */
export const APPLY_EDITABLE_KEYS: readonly string[] = [
  'apply.title', 'apply.intro', 'apply.eyebrow', 'apply.progress', 'apply.stepOf', 'apply.f.businessName',
  'apply.optional', 'apply.f.website', 'apply.f.website.hint', 'apply.f.category', 'apply.f.categoryOther',
  'apply.f.description', 'apply.f.description.hint', 'apply.f.country', 'apply.f.city', 'apply.f.applicantName',
  'apply.f.applicantRole', 'apply.f.applicantEmail', 'apply.f.applicantEmail.hint', 'apply.f.applicantPhone',
  'apply.f.language', 'apply.f.productCount', 'apply.f.photoReadiness', 'apply.f.modelReadiness',
  'apply.f.modelReadiness.hint', 'apply.f.notes', 'apply.f.consent', 'apply.choose', 'apply.cat.furniture',
  'apply.cat.lighting', 'apply.cat.decor', 'apply.cat.fashion', 'apply.cat.jewellery', 'apply.cat.electronics',
  'apply.cat.industrial', 'apply.cat.other', 'apply.count.1-10', 'apply.count.11-50', 'apply.count.51-200',
  'apply.count.200+', 'apply.photos.all', 'apply.photos.some', 'apply.photos.none', 'apply.models.glb_usdz',
  'apply.models.some', 'apply.models.none', 'apply.models.need_help', 'apply.err.required', 'apply.err.too_short',
  'apply.err.too_long', 'apply.err.invalid_email', 'apply.err.invalid_url', 'apply.err.invalid_choice',
  'apply.err.consent_required', 'apply.fixFields', 'apply.edit', 'apply.notGiven', 'apply.back', 'apply.next',
  'apply.submit', 'apply.retry', 'apply.failed', 'apply.rateLimited', 'apply.duplicate', 'apply.done.title',
  'apply.done.body', 'apply.done.copy', 'apply.done.copied', 'apply.done.keepReference', 'apply.done.nextTitle',
  'apply.done.next1', 'apply.done.next2', 'apply.done.next2NoEmail', 'apply.done.next3', 'apply.done.another',
  'apply.done.reference', 'apply.done.home', 'apply.err.terms_required',
]
/** The `{token}`s each editable text may use (the original's). Keys without tokens are absent. */
export const APPLY_TEXT_TOKENS: Readonly<Record<string, readonly string[]>> = {
  'apply.stepOf': ['n', 'total'],
  'apply.f.description.hint': ['n'],
  'apply.err.too_short': ['min'],
  'apply.err.too_long': ['max'],
  'apply.done.next2': ['email'],
  'apply.done.reference': ['ref'],
}

const tokensOf = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// ---- resolver --------------------------------------------------------------------------------------------------------
export interface ResolvedField {
  key: ApplyBuiltinField | `custom:${string}`
  stepId: string
  hidden: boolean
  required: boolean
  locked: boolean
  /** The question for a `custom:<id>` key; null for a built-in field. */
  question: CustomQuestion | null
}
export interface ResolvedStep {
  id: string
  builtin?: ApplyStepKey
  title?: { en?: string; pt?: string }
  hint?: { en?: string; pt?: string }
  /** Visible fields in order (all fields with `includeHidden`). The Review step has none. */
  fields: ResolvedField[]
}

/**
 * Effective steps with their fields in order, defaults filled in (null = today's form). Used by the page, the preview
 * and the review screen. Hidden fields are left out and a step with no visible field is dropped (the Review step
 * stays), unless `includeHidden` (the builder), which keeps both. Tolerates a bad document: a placement on an unknown
 * step or on Review falls back to the first step.
 */
export function resolveApplyForm(config: ApplyFormConfig | null, opts: { includeHidden?: boolean } = {}): ResolvedStep[] {
  const cfg = config ?? DEFAULT_APPLY_FORM
  const steps = cfg.steps?.length ? cfg.steps : DEFAULT_APPLY_FORM.steps
  const review = steps.find((st) => st.builtin === 'review')
  const placeable = steps.filter((st) => st !== review)
  const firstStep = placeable[0]?.id ?? steps[0]!.id
  const stepIds = new Set(placeable.map((st) => st.id))
  const questions = new Map((cfg.customQuestions ?? []).map((q) => [q.id, q]))
  const buckets = new Map<string, ResolvedField[]>(steps.map((st) => [st.id, []]))
  const seen = new Set<string>()

  const add = (key: ResolvedField['key'], stepId: string, p?: ApplyFieldPlacement) => {
    if (seen.has(key)) return
    let question: CustomQuestion | null = null
    if (key.startsWith('custom:')) {
      question = questions.get(key.slice(7)) ?? null
      if (!question) return
    } else if (!isBuiltin(key)) return
    const info = isBuiltin(key) ? BUILTIN_FIELDS[key] : null
    const locked = !!info?.locked
    const where = stepIds.has(stepId) ? stepId : firstStep
    seen.add(key)
    buckets.get(where)!.push({
      key,
      stepId: where,
      hidden: !!info && !locked && p?.hidden === true,
      required: locked ? true : (p?.required ?? info?.defaultRequired ?? false),
      locked,
      question,
    })
  }
  for (const p of cfg.fields ?? []) add(p.key, p.stepId, p)
  for (const k of APPLY_BUILTIN_KEYS) add(k, BUILTIN_FIELDS[k].defaultStep)
  for (const q of cfg.customQuestions ?? []) add(`custom:${q.id}`, placeable[placeable.length - 1]?.id ?? firstStep)

  const out: ResolvedStep[] = []
  for (const st of steps) {
    const all = buckets.get(st.id)!
    const fields = opts.includeHidden ? all : all.filter((f) => !f.hidden)
    if (st !== review && !fields.length && !opts.includeHidden) continue
    out.push({
      id: st.id,
      ...(st.builtin ? { builtin: st.builtin } : {}),
      ...(st.title ? { title: st.title } : {}),
      ...(st.hint ? { hint: st.hint } : {}),
      fields: st === review ? [] : fields,
    })
  }
  return out
}

// ---- rules for the validator (application.ts consumes these) --------------------------------------------------------
/** A question as the validator sees it: the question plus its placement's required flag. */
export type RuledQuestion = CustomQuestion & { required: boolean }
export interface ApplyRules {
  fields: Record<ApplyBuiltinField, { hidden: boolean; required: boolean }>
  questions: RuledQuestion[]
  hiddenOptions: Partial<Record<ApplyChoiceField, string[]>>
  /** The published version these rules come from (0 when unknown). */
  version: number
}

/** The validator's rules for a published config (null = nothing published: today's behaviour). `version` is the published version. */
export function rulesFromConfig(config: ApplyFormConfig | null, version = 0): ApplyRules | null {
  if (!config) return null
  const resolved = resolveApplyForm(config, { includeHidden: true }).flatMap((st) => st.fields)
  const fields = {} as ApplyRules['fields']
  for (const k of APPLY_BUILTIN_KEYS) {
    const f = resolved.find((x) => x.key === k)!
    fields[k] = { hidden: f.hidden, required: f.required }
  }
  const questions = resolved.filter((f) => f.question).map((f): RuledQuestion => ({ ...f.question!, required: f.required }))
  const hiddenOptions: ApplyRules['hiddenOptions'] = {}
  for (const k of CHOICE_FIELDS) {
    const list = config.hiddenOptions?.[k]
    if (list?.length) hiddenOptions[k] = [...list]
  }
  return { fields, questions, hiddenOptions, version }
}

// ---- normalize -------------------------------------------------------------------------------------------------------
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const pair = (v: unknown): { en: string; pt?: string } => {
  const o = obj(v)
  return typeof o.pt === 'string' ? { en: str(o.en), pt: o.pt } : { en: str(o.en) }
}
const optPair = (v: unknown): { en?: string; pt?: string } | undefined => {
  const o = obj(v)
  const r: { en?: string; pt?: string } = {}
  if (typeof o.en === 'string') r.en = o.en
  if (typeof o.pt === 'string') r.pt = o.pt
  return Object.keys(r).length ? r : undefined
}
const QUESTION_TYPES: readonly CustomQuestionType[] = ['short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice']
const STEP_KEYS: readonly ApplyStepKey[] = ['business', 'location', 'contact', 'catalogue', 'review']

/** Fills defaults and drops unknown keys; never throws. A missing or unusable value gives today's form. Does not validate. */
export function normalizeApplyForm(input: unknown): ApplyFormConfig {
  const raw = obj(input)
  if (!Object.keys(raw).length) return clone(DEFAULT_APPLY_FORM)
  const texts: ApplyFormConfig['texts'] = {}
  for (const [k, v] of Object.entries(obj(raw.texts))) {
    const o = obj(v)
    const t: Partial<Record<Lang, string>> = {}
    if (typeof o.en === 'string') t.en = o.en
    if (typeof o.pt === 'string') t.pt = o.pt
    texts[k] = t
  }
  const steps: ApplyStep[] = arr(raw.steps).map((x) => {
    const o = obj(x)
    const st: ApplyStep = { id: str(o.id) }
    if (STEP_KEYS.includes(o.builtin as ApplyStepKey)) st.builtin = o.builtin as ApplyStepKey
    const title = optPair(o.title)
    const hint = optPair(o.hint)
    if (title) st.title = title
    if (hint) st.hint = hint
    return st
  })
  const fields: ApplyFieldPlacement[] = arr(raw.fields).map((x) => {
    const o = obj(x)
    const f: ApplyFieldPlacement = { key: str(o.key) as ApplyFieldPlacement['key'], stepId: str(o.stepId) }
    if (typeof o.hidden === 'boolean') f.hidden = o.hidden
    if (typeof o.required === 'boolean') f.required = o.required
    return f
  })
  const customQuestions: CustomQuestion[] = arr(raw.customQuestions).map((x) => {
    const o = obj(x)
    const q: CustomQuestion = { id: str(o.id), type: o.type as CustomQuestionType, label: pair(o.label) }
    if (o.help !== undefined) q.help = pair(o.help)
    if (o.options !== undefined) q.options = arr(o.options).map((p) => ({ id: str(obj(p).id), label: pair(obj(p).label) }))
    return q
  })
  const hiddenOptions: ApplyFormConfig['hiddenOptions'] = {}
  for (const [k, v] of Object.entries(obj(raw.hiddenOptions))) if (isChoiceField(k)) hiddenOptions[k] = arr(v).filter((x): x is string => typeof x === 'string')
  return { texts, steps: steps.length ? steps : clone(DEFAULT_APPLY_FORM).steps, fields, customQuestions, hiddenOptions }
}

// ---- validate (TypeScript twin of private.validate_apply_form, plus the editor-only length and token checks) ---------
/**
 * Refuses a bad form document. Keys of the result are paths inside the form (`steps.2.title.en`, `fields.4.stepId`,
 * `customQuestions.0.options`, `hiddenOptions.category`, `texts.<dictionary key>.<en|pt>`); SiteContent validation
 * prefixes them with `applyForm.`. The first problem per path wins. An empty object means valid.
 */
export function validateApplyForm(config: ApplyFormConfig): ContentErrors {
  const e: ContentErrors = {}
  const put = (path: string, key: ContentErrorKey) => {
    if (!(path in e)) e[path] = key
  }
  const len = (path: string, v: string | undefined, max: number) => {
    if (v !== undefined && v.length > max) put(path, 'too_long')
  }

  // steps
  const steps = config.steps ?? []
  if (steps.length < 1) put('steps', 'required')
  else if (steps.length > MAX_APPLY_STEPS) put('steps', 'too_many')
  const stepIds = new Set<string>()
  steps.forEach((st, i) => {
    if (!st.id || typeof st.id !== 'string') put(`steps.${i}.id`, 'required')
    else if (stepIds.has(st.id)) put(`steps.${i}.id`, 'duplicate_id')
    stepIds.add(st.id)
    if (st.builtin !== undefined && !STEP_KEYS.includes(st.builtin)) put(`steps.${i}.builtin`, 'invalid_value')
    len(`steps.${i}.title.en`, st.title?.en, MAX_STEP_TITLE)
    len(`steps.${i}.title.pt`, st.title?.pt, MAX_STEP_TITLE)
    len(`steps.${i}.hint.en`, st.hint?.en, MAX_STEP_HINT)
    len(`steps.${i}.hint.pt`, st.hint?.pt, MAX_STEP_HINT)
    if (!st.builtin && !(st.title?.en ?? '').trim()) put(`steps.${i}.title.en`, 'required')
  })
  const reviews = steps.filter((st) => st.builtin === 'review').length
  if (reviews !== 1 || steps[steps.length - 1]?.builtin !== 'review') put('steps', 'review_position')
  const reviewId = steps.find((st) => st.builtin === 'review')?.id

  // questions
  const questions = config.customQuestions ?? []
  if (questions.length > MAX_CUSTOM_QUESTIONS) put('customQuestions', 'too_many')
  const qIds = new Set<string>()
  questions.forEach((q, i) => {
    const p = `customQuestions.${i}`
    if (!q.id || typeof q.id !== 'string') put(`${p}.id`, 'required')
    else if (qIds.has(q.id)) put(`${p}.id`, 'duplicate_id')
    qIds.add(q.id)
    if (!QUESTION_TYPES.includes(q.type)) put(`${p}.type`, 'invalid_value')
    if (!(q.label?.en ?? '').trim()) put(`${p}.label.en`, 'required')
    len(`${p}.label.en`, q.label?.en, MAX_QUESTION_LABEL)
    len(`${p}.label.pt`, q.label?.pt, MAX_QUESTION_LABEL)
    len(`${p}.help.en`, q.help?.en, MAX_QUESTION_HELP)
    len(`${p}.help.pt`, q.help?.pt, MAX_QUESTION_HELP)
    const opts = q.options ?? []
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      if (opts.length < MIN_CHOICE_OPTIONS || opts.length > MAX_CHOICE_OPTIONS) put(`${p}.options`, 'options_count')
      const ids = new Set<string>()
      opts.forEach((o, j) => {
        if (!o.id || typeof o.id !== 'string') put(`${p}.options.${j}.id`, 'required')
        else if (ids.has(o.id)) put(`${p}.options.${j}.id`, 'duplicate_id')
        ids.add(o.id)
        if (!(o.label?.en ?? '').trim()) put(`${p}.options.${j}.label.en`, 'required')
        len(`${p}.options.${j}.label.en`, o.label?.en, MAX_OPTION_LABEL)
        len(`${p}.options.${j}.label.pt`, o.label?.pt, MAX_OPTION_LABEL)
      })
    } else if (opts.length > 0) put(`${p}.options`, 'options_not_allowed')
  })

  // fields
  const keys = new Set<string>()
  ;(config.fields ?? []).forEach((f, i) => {
    const p = `fields.${i}`
    const known = isBuiltin(f.key) || (typeof f.key === 'string' && f.key.startsWith('custom:') && qIds.has(f.key.slice(7)))
    if (!known) put(`${p}.key`, 'unknown_key')
    else if (keys.has(f.key)) put(`${p}.key`, 'duplicate_key')
    keys.add(f.key)
    if (!stepIds.has(f.stepId)) put(`${p}.stepId`, 'step_unknown')
    else if (f.stepId === reviewId) put(`${p}.stepId`, 'review_misplaced')
    if (isLocked(f.key)) {
      if (f.hidden === true) put(`${p}.hidden`, 'locked')
      if (f.required === false) put(`${p}.required`, 'locked')
    }
  })
  questions.forEach((q, i) => {
    if (!keys.has(`custom:${q.id}`)) put(`customQuestions.${i}`, 'missing_placement')
  })

  // hidden options
  for (const [k, list] of Object.entries(config.hiddenOptions ?? {})) {
    const p = `hiddenOptions.${k}`
    if (!isChoiceField(k) || !Array.isArray(list)) {
      put(p, 'invalid_value')
      continue
    }
    const all = BUILTIN_FIELDS[k].options!
    if (list.some((v) => !all.includes(v))) put(p, 'invalid_value')
    else if (all.every((v) => list.includes(v))) put(p, 'last_option')
  }

  // texts
  for (const [k, t] of Object.entries(config.texts ?? {})) {
    if (!APPLY_EDITABLE_KEYS.includes(k)) {
      put(`texts.${k}`, 'unknown_key')
      continue
    }
    for (const lang of ['en', 'pt'] as const) {
      const v = t?.[lang]
      if (v === undefined || v === '') continue
      const p = `texts.${k}.${lang}`
      if (typeof v !== 'string') put(p, 'invalid_value')
      else if (v.length > MAX_TEXT_OVERRIDE) put(p, 'too_long')
      else {
        const allowed = APPLY_TEXT_TOKENS[k] ?? []
        if (tokensOf(v).some((x) => !allowed.includes(x))) put(p, 'unknown_token')
        else if (k === 'apply.done.reference' && !v.includes('{ref}')) put(p, 'missing_token')
      }
    }
  }
  return e
}
