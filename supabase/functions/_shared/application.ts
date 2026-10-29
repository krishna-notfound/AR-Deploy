// The one validator for business applications (design/24-applications.md). Used by the public wizard
// (step by step), the demo service and the submit-application Edge Function, so client and server agree.
// Pure TypeScript; its only import is the equally pure form model (no further imports), so it also runs under Deno.
// Errors are codes; the UI translates them.
//
// `validateApplication(input, rules?)`: without rules it is today's form. `rules` come from `rulesFromConfig` (applyForm.ts)
// for the published application form (Content Editor, spec section 10): a hidden field is ignored and stored as null, a
// required flag can flip, questions are checked and snapshotted, and an answer that names something the form no longer has
// (an unknown question or option id, a hidden built-in option) is `stale`: the form was republished since the visitor loaded it.
import { APPLY_CATEGORY_KEYS, type ApplyBuiltinField, type ApplyRules, BUILTIN_FIELDS, type CustomAnswer, type RuledQuestion } from './applyForm.ts'

export const PRODUCT_COUNT_RANGES = ['1-10', '11-50', '51-200', '200+'] as const
export const PHOTO_READINESS = ['all', 'some', 'none'] as const
export const MODEL_READINESS = ['glb_usdz', 'some', 'none', 'need_help'] as const

export type ApplicationErrorCode = 'required' | 'too_short' | 'too_long' | 'invalid_email' | 'invalid_url' | 'invalid_choice' | 'consent_required' | 'terms_required'

/** Wizard steps and the fields each one owns. */
export const APPLICATION_STEPS = {
  business: ['businessName', 'website', 'category', 'description'],
  location: ['country', 'city'],
  contact: ['applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language'],
  catalogue: ['productCount', 'photoReadiness', 'modelReadiness', 'notes'],
  review: ['consent', 'acceptedTerms'],
} as const

/** Longest short-text and long-text answer to a custom question. */
export const MAX_SHORT_ANSWER = 200
export const MAX_LONG_ANSWER = 1000
/** The `answers.custom` block may not exceed this many bytes once serialised. */
export const MAX_CUSTOM_BYTES = 40_000

export interface NormalizedApplication {
  businessName: string
  website: string | null
  /** The seven fields below are null when the form hides them (and, with rules, when optional and left empty). */
  description: string | null
  category: string | null
  country: string | null
  city: string | null
  applicantName: string
  applicantRole: string | null
  applicantEmail: string
  applicantPhone: string | null
  language: 'en' | 'pt'
  productCount: (typeof PRODUCT_COUNT_RANGES)[number] | null
  photoReadiness: (typeof PHOTO_READINESS)[number] | null
  modelReadiness: (typeof MODEL_READINESS)[number] | null
  notes: string | null
  /** Answers to the form's questions in form order, with label snapshots. */
  custom: CustomAnswer[]
  /** The published form version the rules came from (0 = the built-in form). */
  formVersion: number
  submissionKey: string
}

/** `stale`: the answers do not fit the form the server has (republished meanwhile); the page reloads the form. */
export type ApplicationValidation = { ok: true; value: NormalizedApplication } | { ok: false; errors: Record<string, ApplicationErrorCode>; stale?: true }

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Adds https:// when the scheme is missing ("www.example.com"); null when empty. */
export function normalizeWebsite(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

const LOCKED: readonly string[] = ['businessName', 'applicantName', 'applicantEmail']
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validateApplication(input: unknown, rules?: ApplyRules | null): ApplicationValidation {
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const errors: Record<string, ApplicationErrorCode> = {}
  let stale = false

  /** The effective rule of a built-in field. Locked fields ignore the rules; no rules is today's form. */
  const rule = (k: ApplyBuiltinField) => {
    if (LOCKED.includes(k)) return { hidden: false, required: true }
    const r = rules?.fields[k]
    return r ? { hidden: r.hidden, required: r.required } : { hidden: false, required: BUILTIN_FIELDS[k].defaultRequired }
  }
  /** A text field: null when hidden or (optional and empty); length checks apply to anything filled. */
  const field = (k: ApplyBuiltinField, value: string, min: number, max: number): string | null => {
    const r = rule(k)
    if (r.hidden) return null
    if (!value) {
      if (r.required) errors[k] = 'required'
      return null
    }
    if (value.length < min) errors[k] = 'too_short'
    else if (value.length > max) errors[k] = 'too_long'
    return value
  }
  const hiddenOption = (k: keyof ApplyRules['hiddenOptions'], value: string) => !!rules?.hiddenOptions[k]?.includes(value)
  /** A fixed-set choice: null when hidden or (optional and empty); a hidden option makes the answer stale. */
  const choice = <T extends string>(k: 'productCount' | 'photoReadiness' | 'modelReadiness', value: unknown, options: readonly T[]): T | null => {
    const r = rule(k)
    if (r.hidden) return null
    if (typeof value !== 'string' || !value) {
      if (r.required) errors[k] = 'required'
      return null
    }
    if (!options.includes(value as T)) errors[k] = 'invalid_choice'
    else if (hiddenOption(k, value)) stale = true
    return value as T
  }

  const businessName = field('businessName', str(i.businessName), 2, 80) ?? ''
  const description = field('description', text(i.description), 20, 1000)
  const category = field('category', str(i.category), 2, 80)
  if (category !== null && !errors.category) {
    // A value outside the fixed list is the free text of "Other".
    const known = (APPLY_CATEGORY_KEYS as readonly string[]).includes(category)
    if (hiddenOption('category', known ? category : 'other')) stale = true
  }
  const country = field('country', str(i.country), 2, 80)
  const city = field('city', str(i.city), 1, 80)
  const applicantName = field('applicantName', str(i.applicantName), 2, 120) ?? ''
  const applicantRole = field('applicantRole', str(i.applicantRole), 1, 80)
  const applicantPhone = field('applicantPhone', str(i.applicantPhone), 1, 50)
  const notes = field('notes', text(i.notes), 1, 1000)

  const websiteRule = rule('website')
  const website = websiteRule.hidden ? null : normalizeWebsite(i.website)
  if (!websiteRule.hidden) {
    if (!website) {
      if (websiteRule.required) errors.website = 'required'
    } else if (website.length > 2048 || !/^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(website)) errors.website = 'invalid_url'
  }

  const applicantEmail = str(i.applicantEmail).toLowerCase()
  if (!applicantEmail) errors.applicantEmail = 'required'
  else if (applicantEmail.length > 320 || !EMAIL.test(applicantEmail)) errors.applicantEmail = 'invalid_email'

  // A hidden language takes the language of the page the visitor used (English when it is not one of ours).
  const language: 'en' | 'pt' = i.language === 'pt' ? 'pt' : 'en'
  if (!rule('language').hidden) {
    if (typeof i.language !== 'string' || !i.language) errors.language = 'required'
    else if (i.language !== 'en' && i.language !== 'pt') errors.language = 'invalid_choice'
  }
  const productCount = choice('productCount', i.productCount, PRODUCT_COUNT_RANGES)
  const photoReadiness = choice('photoReadiness', i.photoReadiness, PHOTO_READINESS)
  const modelReadiness = choice('modelReadiness', i.modelReadiness, MODEL_READINESS)

  const custom = validateCustom(i.custom, rules ?? null, errors, () => {
    stale = true
  })

  if (i.consent !== true) errors.consent = 'consent_required'
  if (i.acceptedTerms !== true) errors.acceptedTerms = 'terms_required'
  const submissionKey = typeof i.submissionKey === 'string' && UUID.test(i.submissionKey) ? i.submissionKey : ''
  if (!submissionKey) errors.submissionKey = 'required'

  if (stale) return { ok: false, errors, stale: true }
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      businessName,
      website,
      description,
      category,
      country,
      city,
      applicantName,
      applicantRole,
      applicantEmail,
      applicantPhone,
      language,
      productCount,
      photoReadiness,
      modelReadiness,
      notes,
      custom,
      formVersion: rules?.version ?? 0,
      submissionKey,
    },
  }
}

/** Checks the answers to the form's questions and returns their snapshots in form order. Errors go to `custom.<id>`. */
function validateCustom(raw: unknown, rules: ApplyRules | null, errors: Record<string, ApplicationErrorCode>, markStale: () => void): CustomAnswer[] {
  const given = isRecord(raw) ? raw : {}
  const questions: RuledQuestion[] = rules?.questions ?? []
  const ids = new Set(questions.map((q) => q.id))
  // The visitor answered something this form does not ask: it was republished (or unpublished) since the page loaded.
  if (raw !== undefined && raw !== null && !isRecord(raw)) markStale()
  if (Object.keys(given).some((id) => !ids.has(id))) markStale()

  const out: CustomAnswer[] = []
  for (const q of questions) {
    const path = `custom.${q.id}`
    const v = given[q.id]
    const base = { id: q.id, type: q.type, label: { ...q.label } }
    const missing = () => {
      if (q.required) errors[path] = 'required'
    }
    if (q.type === 'short_text' || q.type === 'long_text') {
      const s = q.type === 'short_text' ? str(v) : text(v)
      if (!s) missing()
      else if (s.length > (q.type === 'short_text' ? MAX_SHORT_ANSWER : MAX_LONG_ANSWER)) errors[path] = 'too_long'
      else out.push({ ...base, value: s })
    } else if (q.type === 'yes_no') {
      if (v === undefined || v === null || v === '') missing()
      else if (typeof v !== 'boolean') errors[path] = 'invalid_choice'
      else out.push({ ...base, value: v })
    } else if (q.type === 'single_choice') {
      if (v === undefined || v === null || v === '') missing()
      else if (typeof v !== 'string') errors[path] = 'invalid_choice'
      else {
        const opt = q.options?.find((o) => o.id === v)
        if (!opt) markStale()
        else out.push({ ...base, value: v, valueLabels: [{ ...opt.label }] })
      }
    } else {
      if (v === undefined || v === null || (Array.isArray(v) && !v.length)) missing()
      else if (!Array.isArray(v) || v.some((x) => typeof x !== 'string') || new Set(v).size !== v.length) errors[path] = 'invalid_choice'
      else {
        const chosen = (v as string[]).map((id) => q.options?.find((o) => o.id === id))
        if (chosen.some((o) => !o)) markStale()
        else out.push({ ...base, value: v as string[], valueLabels: chosen.map((o) => ({ ...o!.label })) })
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_CUSTOM_BYTES) errors.custom = 'too_long'
  return out
}
