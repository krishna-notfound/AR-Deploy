// Which wording the client edits where. The Messages tab shows the groups below; the field panel shows the label, hint and
// option wording of one field. Together they cover every APPLY_EDITABLE_KEYS entry (a test checks it).
import type { ApplyBuiltinField, ApplyChoiceField } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'

export interface MessageGroup {
  id: 'page' | 'buttons' | 'sending' | 'errors' | 'consent' | 'thanks'
  title: TranslationKey
  keys: readonly string[]
}

export const MESSAGE_GROUPS: readonly MessageGroup[] = [
  { id: 'page', title: 'applications.builder.group.page', keys: ['apply.eyebrow', 'apply.title', 'apply.intro', 'apply.progress', 'apply.stepOf', 'apply.optional', 'apply.choose', 'apply.notGiven', 'apply.edit'] },
  { id: 'buttons', title: 'applications.builder.group.buttons', keys: ['apply.back', 'apply.next', 'apply.submit', 'apply.retry'] },
  { id: 'sending', title: 'applications.builder.group.sending', keys: ['apply.failed', 'apply.rateLimited', 'apply.duplicate', 'apply.fixFields'] },
  {
    id: 'errors',
    title: 'applications.builder.group.errors',
    keys: ['apply.err.required', 'apply.err.too_short', 'apply.err.too_long', 'apply.err.invalid_email', 'apply.err.invalid_url', 'apply.err.invalid_choice', 'apply.err.consent_required', 'apply.err.terms_required'],
  },
  { id: 'consent', title: 'applications.builder.group.consent', keys: ['apply.f.consent'] },
  {
    id: 'thanks',
    title: 'applications.builder.group.thanks',
    keys: [
      'apply.done.title',
      'apply.done.body',
      'apply.done.reference',
      'apply.done.copy',
      'apply.done.copied',
      'apply.done.keepReference',
      'apply.done.nextTitle',
      'apply.done.next1',
      'apply.done.next2',
      'apply.done.next2NoEmail',
      'apply.done.next3',
      'apply.done.another',
      'apply.done.home',
    ],
  },
]

const OPTION_PREFIX: Record<ApplyChoiceField, string> = { category: 'apply.cat', productCount: 'apply.count', photoReadiness: 'apply.photos', modelReadiness: 'apply.models' }

/** The wording key of one option of a built-in choice field (apply.cat.furniture, apply.count.1-10, ...). */
export const optionTextKey = (field: ApplyChoiceField, value: string): string => `${OPTION_PREFIX[field]}.${value}`

const HINTS: Partial<Record<ApplyBuiltinField, string>> = {
  website: 'apply.f.website.hint',
  description: 'apply.f.description.hint',
  applicantEmail: 'apply.f.applicantEmail.hint',
  modelReadiness: 'apply.f.modelReadiness.hint',
}

/** The label, hint and extra wording keys of a built-in field (option wording comes from `optionTextKey`). */
export function fieldTextKeys(key: ApplyBuiltinField): { label: string; hint?: string; extra?: string } {
  return { label: `apply.f.${key}`, ...(HINTS[key] ? { hint: HINTS[key] } : {}), ...(key === 'category' ? { extra: 'apply.f.categoryOther' } : {}) }
}

/** Every wording key some part of the builder edits. */
export function allEditedTextKeys(builtinKeys: readonly ApplyBuiltinField[], options: Readonly<Record<ApplyChoiceField, readonly string[]>>): string[] {
  const keys = new Set<string>(MESSAGE_GROUPS.flatMap((g) => g.keys))
  for (const k of builtinKeys) {
    const f = fieldTextKeys(k)
    keys.add(f.label)
    if (f.hint) keys.add(f.hint)
    if (f.extra) keys.add(f.extra)
  }
  for (const [field, values] of Object.entries(options) as [ApplyChoiceField, readonly string[]][]) for (const v of values) keys.add(optionTextKey(field, v))
  return [...keys]
}
