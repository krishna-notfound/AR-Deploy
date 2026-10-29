import type { Lang, LocalizedText } from '@/domain/types'
import { type TranslationKey, enCore } from './dictionaries/en'
import { ptCore } from './dictionaries/pt'
import { localeOf } from './locale'

type Dict = Partial<Record<TranslationKey, string>>

// The first-load dictionaries are always there. The dashboard dictionaries are registered when a dashboard route loads them
// (dashboardDictionaries.ts, ADR-0045); until then a dashboard key falls through to the key itself, which the dashboard
// routes avoid by waiting for the load before they render.
const CORE: Record<Lang, Dict> = { en: enCore, pt: ptCore }
const DASHBOARD: Record<Lang, Dict | undefined> = { en: undefined, pt: undefined }

/** Adds the dashboard dictionary of a language (idempotent). */
export function registerDashboardDictionary(lang: Lang, dict: Dict) {
  DASHBOARD[lang] = dict
}

/** Forgets the dashboard dictionaries (tests of the loading path only). */
export function unregisterDashboardDictionaries() {
  DASHBOARD.en = undefined
  DASHBOARD.pt = undefined
}

export function isDashboardDictionaryLoaded(lang: Lang): boolean {
  return DASHBOARD[lang] !== undefined
}

const lookup = (lang: Lang, key: TranslationKey): string | undefined => DASHBOARD[lang]?.[key] ?? CORE[lang][key]

export type Vars = Record<string, string | number>

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Whether the English dictionary (loaded so far) has this key: for keys built at run time from data. */
export function hasTranslation(key: string): key is TranslationKey {
  return lookup('en', key as TranslationKey) !== undefined
}

/** Current language → English → key itself. */
export function translate(lang: Lang, key: TranslationKey, vars?: Vars): string {
  const hit = lookup(lang, key)
  if (hit !== undefined) return interpolate(hit, vars)
  if (import.meta.env.DEV && lang !== 'en') console.warn(`[i18n] missing "${key}" for ${lang}`)
  const fallback = lookup('en', key)
  return fallback !== undefined ? interpolate(fallback, vars) : key
}

/** Keys that come as a `<base>.one` / `<base>.other` pair, as the base name `tn()` takes. */
export type PluralBase = TranslationKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never

/** `<base>.one` or `<base>.other` for `n`, by the language's plural rules (pt-PT: only exactly 1 is "one"). */
export function pluralKey(lang: Lang, base: string, n: number): string {
  return `${base}.${new Intl.PluralRules(localeOf(lang)).select(n) === 'one' ? 'one' : 'other'}`
}

/** Counted text: `{n}` is always available to the template next to `vars`. */
export function translatePlural(lang: Lang, base: PluralBase, n: number, vars?: Vars): string {
  return translate(lang, pluralKey(lang, base, n) as TranslationKey, { n, ...vars })
}

/** Product content: the requested language, falling back to English. */
export function pickLocalized(text: LocalizedText | undefined, lang: Lang): { text: string; lang: Lang; isFallback: boolean } {
  if (!text) return { text: '', lang: 'en', isFallback: false }
  const v = text[lang]
  if (v && v.trim()) return { text: v, lang, isFallback: false }
  return { text: text.en, lang: 'en', isFallback: lang !== 'en' }
}

/** The shape of `useI18n().t`, for helpers that take a translator. */
export type TFn = (key: TranslationKey, vars?: Vars) => string

/** English translator: the default for a helper's optional `t` argument, so callers that omit it stay English. */
export const tEn: TFn = (key, vars) => translate('en', key, vars)
