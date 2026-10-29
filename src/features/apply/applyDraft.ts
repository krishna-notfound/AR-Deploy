// The answers of the application wizard: the draft the visitor edits, how it becomes the validator's input, and how an
// answer is kept in step with the published form (an option or question that no longer exists is dropped).
import type { ApplyFormConfig, ResolvedField, ResolvedStep } from '@/domain/siteContent'
import type { ApplicationInput, Lang } from '@/domain/types'
import { APPLY_CATEGORY_KEYS } from '../../../supabase/functions/_shared/applyForm.ts'

export type CustomValue = string | boolean | string[]
export type Draft = Omit<ApplicationInput, 'category' | 'custom'> & { categoryKey: string; categoryOther: string; custom: Record<string, CustomValue> }

export const emptyDraft = (lang: Lang): Draft => ({
  businessName: '',
  website: '',
  description: '',
  categoryKey: '',
  categoryOther: '',
  country: '',
  city: '',
  applicantName: '',
  applicantRole: '',
  applicantEmail: '',
  applicantPhone: '',
  language: lang,
  productCount: '',
  photoReadiness: '',
  modelReadiness: '',
  notes: '',
  consent: false,
  acceptedTerms: false,
  custom: {},
  submissionKey: crypto.randomUUID(),
})

export const toInput = (d: Draft): ApplicationInput => {
  const { categoryKey, categoryOther, ...rest } = d
  return { ...rest, category: categoryKey === 'other' ? categoryOther : categoryKey }
}

/** A draft saved by an older build has no `custom`. */
export const reviveDraft = (saved: Partial<Draft>, lang: Lang): Draft => ({ ...emptyDraft(lang), ...saved, custom: saved.custom && typeof saved.custom === 'object' ? saved.custom : {} })

/**
 * The answers that still fit the form: answers to questions that are gone are dropped, a chosen option that was removed or
 * hidden is cleared. Hidden built-in fields keep their text (the validator ignores it). The draft itself is not changed,
 * so a visitor who goes back keeps what they typed.
 */
export function fitDraft(draft: Draft, config: ApplyFormConfig | null): Draft {
  const hidden = config?.hiddenOptions ?? {}
  const clear = (field: 'productCount' | 'photoReadiness' | 'modelReadiness', v: string) => (hidden[field]?.includes(v) ? '' : v)
  const known = (APPLY_CATEGORY_KEYS as readonly string[]).includes(draft.categoryKey)
  const custom: Record<string, CustomValue> = {}
  for (const q of config?.customQuestions ?? []) {
    const v = draft.custom[q.id]
    if (v === undefined) continue
    if ((q.type === 'short_text' || q.type === 'long_text') && typeof v === 'string') custom[q.id] = v
    else if (q.type === 'yes_no' && typeof v === 'boolean') custom[q.id] = v
    else if (q.type === 'single_choice' && typeof v === 'string' && q.options?.some((o) => o.id === v)) custom[q.id] = v
    else if (q.type === 'multi_choice' && Array.isArray(v)) {
      const kept = v.filter((id) => q.options?.some((o) => o.id === id))
      if (kept.length) custom[q.id] = kept
    }
  }
  return {
    ...draft,
    categoryKey: draft.categoryKey && hidden.category?.includes(known ? draft.categoryKey : 'other') ? '' : draft.categoryKey,
    productCount: clear('productCount', draft.productCount),
    photoReadiness: clear('photoReadiness', draft.photoReadiness),
    modelReadiness: clear('modelReadiness', draft.modelReadiness),
    custom,
  }
}

/** The validator's error keys that belong to a step: its visible fields, or the closing ticks for Review. */
export const errorKeysOf = (step: Pick<ResolvedStep, 'builtin' | 'fields'>): string[] =>
  step.builtin === 'review' ? ['consent', 'acceptedTerms', 'custom'] : step.fields.map((f: ResolvedField) => (f.question ? `custom.${f.question.id}` : f.key))
