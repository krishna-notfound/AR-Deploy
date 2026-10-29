// Text of the application form: the `apply.*` dictionary with the Editor's overrides on top (spec section 10).
// `makeApplyTexts(config, lang)` is pure so the page, the live preview in the builder and the tests share it.
import type { ApplyFormConfig, CustomQuestion, ResolvedStep } from '@/domain/siteContent'
import type { Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { type Vars, pickLocalized, translate } from '@/i18n/translate'

const fill = (s: string, vars?: Vars): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s)

export interface ApplyTexts {
  lang: Lang
  /** The override for this language if it is not empty, else the dictionary text. */
  text(key: TranslationKey, vars?: Vars): string
  /** Title of a step: its own text for this language, else the original (built-in) or the English text (a new step). */
  stepTitle(step: Pick<ResolvedStep, 'id' | 'builtin' | 'title'>): string
  stepHint(step: Pick<ResolvedStep, 'id' | 'builtin' | 'hint'>): string
  /** A question's label or help, or an option label, falling back to English. */
  local(text: { en: string; pt?: string } | undefined): string
  question(q: CustomQuestion): string
}

export function makeApplyTexts(config: ApplyFormConfig | null, lang: Lang): ApplyTexts {
  const overrides = config?.texts ?? {}
  const text = (key: TranslationKey, vars?: Vars): string => {
    const own = overrides[key]?.[lang]
    return typeof own === 'string' && own.trim() ? fill(own, vars) : translate(lang, key, vars)
  }
  const own = (v: { en?: string; pt?: string } | undefined, builtin: boolean): string => {
    const here = v?.[lang]?.trim()
    if (here) return here
    // An empty text means the original for a built-in step; a new step has no original, so it shows its English text.
    return builtin ? '' : (v?.en?.trim() ?? '')
  }
  return {
    lang,
    text,
    stepTitle: (step) => own(step.title, !!step.builtin) || (step.builtin ? translate(lang, `apply.step.${step.builtin}` as TranslationKey) : ''),
    stepHint: (step) => own(step.hint, !!step.builtin) || (step.builtin ? translate(lang, `apply.step.${step.builtin}.hint` as TranslationKey) : ''),
    local: (v) => pickLocalized(v, lang).text,
    question: (q) => pickLocalized(q.label, lang).text,
  }
}
