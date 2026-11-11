// Turns the validator's problems (document paths such as `steps.2.title.en` or `customQuestions.0.label.en`) into links to
// the card where each one is fixed: one entry per card, with what to call it and the language the problem is in.
import { APPLY_BUILTIN_KEYS, type ApplyFormConfig, type ContentErrors, type Lang } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { originalName } from './TextOverride'
import { cardOfTextKey } from './textGroups'

export interface Problem {
  /** The card to open and focus: `header`, `step:<id>`, `field:<key>`, `review`, `after` or `panel`. */
  card: string
  /** What the person calls it ("Section 2", "Business name"). */
  where: string
  /** The sentence for the first problem found there. */
  message: string
  /** The language the problem is in, when it is in a text. */
  lang?: Lang
  /** For a text in the Button & message texts panel: which one. */
  textKey?: string
}

type T = (key: TranslationKey, params?: Record<string, string | number>) => string

export function problemsOf(config: ApplyFormConfig, errors: ContentErrors, t: T, appLang: Lang): Problem[] {
  const out = new Map<string, Problem>()
  const firstStep = config.steps.find((s) => s.builtin !== 'review')?.id ?? config.steps[0]?.id ?? ''
  const fieldName = (key: string): string => (key.startsWith('custom:') ? config.customQuestions.find((q) => q.id === key.slice(7))?.label.en || t('applications.builder.untitledQuestion') : originalName(`apply.f.${key}`, appLang, 40))
  for (const [path, code] of Object.entries(errors)) {
    const lang = (/\.(en|pt)$/.exec(path)?.[1] as Lang | undefined) ?? undefined
    const message = t(`editor.err.${code}` as TranslationKey)
    let card = 'header'
    let where = t('applications.builder.headerCard')
    let textKey: string | undefined
    const [head, idx] = path.split('.')
    const i = Number(idx)
    if (head === 'steps' && Number.isInteger(i) && config.steps[i]) {
      const st = config.steps[i]!
      card = `step:${st.id}`
      where = t('applications.builder.problemSection', { n: i + 1 })
    } else if (head === 'steps') {
      card = `step:${firstStep}`
      where = t('applications.builder.problemSections')
    } else if (head === 'customQuestions' && Number.isInteger(i) && config.customQuestions[i]) {
      card = `field:custom:${config.customQuestions[i]!.id}`
      where = fieldName(`custom:${config.customQuestions[i]!.id}`)
    } else if (head === 'customQuestions') {
      card = `step:${firstStep}`
      where = t('applications.builder.problemQuestions')
    } else if (head === 'fields') {
      const f = Number.isInteger(i) ? config.fields[i] : undefined
      if (f && (f.key.startsWith('custom:') || (APPLY_BUILTIN_KEYS as readonly string[]).includes(f.key))) {
        card = `field:${f.key}`
        where = fieldName(f.key)
      } else {
        card = `step:${firstStep}`
        where = t('applications.builder.problemSections')
      }
    } else if (head === 'hiddenOptions' && idx) {
      card = `field:${idx}`
      where = fieldName(idx)
    } else if (head === 'texts') {
      textKey = path.slice(6).replace(/\.(en|pt)$/, '')
      const target = cardOfTextKey(textKey)
      if (target.card === 'field') {
        card = `field:${target.field}`
        where = fieldName(target.field)
      } else if (target.card === 'header') {
        card = 'header'
        where = t('applications.builder.headerCard')
      } else if (target.card === 'review') {
        card = 'review'
        where = t('applications.builder.problemReview')
      } else if (target.card === 'after') {
        card = 'after'
        where = t('applications.builder.afterCard')
      } else {
        card = 'panel'
        where = originalName(textKey, appLang, 40)
      }
    }
    const id = card === 'panel' ? `${card}:${textKey}` : card
    if (!out.has(id)) out.set(id, { card, where, message, ...(lang ? { lang } : {}), ...(textKey ? { textKey } : {}) })
  }
  return [...out.values()]
}
