// The one validator for business applications (design/24-applications.md). Used by the public wizard
// (step by step), the demo service and the submit-application Edge Function, so client and server agree.
// Pure TypeScript, no imports: it also runs under Deno. Errors are codes; the UI translates them.

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

export interface NormalizedApplication {
  businessName: string
  website: string | null
  description: string
  category: string
  country: string
  city: string
  applicantName: string
  applicantRole: string | null
  applicantEmail: string
  applicantPhone: string | null
  language: 'en' | 'pt'
  productCount: (typeof PRODUCT_COUNT_RANGES)[number]
  photoReadiness: (typeof PHOTO_READINESS)[number]
  modelReadiness: (typeof MODEL_READINESS)[number]
  notes: string | null
  submissionKey: string
}

export type ApplicationValidation = { ok: true; value: NormalizedApplication } | { ok: false; errors: Record<string, ApplicationErrorCode> }

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

export function validateApplication(input: unknown): ApplicationValidation {
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const errors: Record<string, ApplicationErrorCode> = {}
  const need = (field: string, value: string, min: number, max: number) => {
    if (!value) errors[field] = 'required'
    else if (value.length < min) errors[field] = 'too_short'
    else if (value.length > max) errors[field] = 'too_long'
  }
  const optional = (field: string, value: string, max: number) => {
    if (value.length > max) errors[field] = 'too_long'
  }
  const choice = <T extends string>(field: string, value: unknown, options: readonly T[]): T => {
    if (typeof value !== 'string' || !value) errors[field] = 'required'
    else if (!options.includes(value as T)) errors[field] = 'invalid_choice'
    return value as T
  }

  const v = {
    businessName: str(i.businessName),
    website: normalizeWebsite(i.website),
    description: text(i.description),
    category: str(i.category),
    country: str(i.country),
    city: str(i.city),
    applicantName: str(i.applicantName),
    applicantRole: str(i.applicantRole) || null,
    applicantEmail: str(i.applicantEmail).toLowerCase(),
    applicantPhone: str(i.applicantPhone) || null,
    notes: text(i.notes) || null,
  }
  need('businessName', v.businessName, 2, 80)
  need('description', v.description, 20, 1000)
  need('category', v.category, 2, 80)
  need('country', v.country, 2, 80)
  need('city', v.city, 1, 80)
  need('applicantName', v.applicantName, 2, 120)
  optional('applicantRole', v.applicantRole ?? '', 80)
  optional('applicantPhone', v.applicantPhone ?? '', 50)
  optional('notes', v.notes ?? '', 1000)
  if (v.website && (v.website.length > 2048 || !/^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v.website))) errors.website = 'invalid_url'
  if (!v.applicantEmail) errors.applicantEmail = 'required'
  else if (v.applicantEmail.length > 320 || !EMAIL.test(v.applicantEmail)) errors.applicantEmail = 'invalid_email'
  const language = choice('language', i.language, ['en', 'pt'] as const)
  const productCount = choice('productCount', i.productCount, PRODUCT_COUNT_RANGES)
  const photoReadiness = choice('photoReadiness', i.photoReadiness, PHOTO_READINESS)
  const modelReadiness = choice('modelReadiness', i.modelReadiness, MODEL_READINESS)
  if (i.consent !== true) errors.consent = 'consent_required'
  if (i.acceptedTerms !== true) errors.acceptedTerms = 'terms_required'
  const submissionKey = typeof i.submissionKey === 'string' && UUID.test(i.submissionKey) ? i.submissionKey : ''
  if (!submissionKey) errors.submissionKey = 'required'

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { ...v, language, productCount, photoReadiness, modelReadiness, submissionKey } }
}
