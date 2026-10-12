import type { Lang, LocalizedText } from '@/domain/types'
import { type TranslationKey, en } from './dictionaries/en'
import { pt } from './dictionaries/pt'

const DICTS: Record<Lang, Partial<Record<TranslationKey, string>>> = { en, pt }

export type Vars = Record<string, string | number>

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Current language → English → key itself. */
export function translate(lang: Lang, key: TranslationKey, vars?: Vars): string {
  const hit = DICTS[lang][key]
  if (hit !== undefined) return interpolate(hit, vars)
  if (import.meta.env.DEV && lang !== 'en') console.warn(`[i18n] missing "${key}" for ${lang}`)
  const fallback = en[key] as string | undefined
  return fallback !== undefined ? interpolate(fallback, vars) : key
}

/** Product content: the requested language, falling back to English. */
export function pickLocalized(text: LocalizedText | undefined, lang: Lang): { text: string; lang: Lang; isFallback: boolean } {
  if (!text) return { text: '', lang: 'en', isFallback: false }
  const v = text[lang]
  if (v && v.trim()) return { text: v, lang, isFallback: false }
  return { text: text.en, lang: 'en', isFallback: lang !== 'en' }
}
