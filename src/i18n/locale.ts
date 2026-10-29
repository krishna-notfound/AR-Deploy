import type { Lang } from '@/domain/types'

/** The one place that maps the app language to an Intl locale. Portuguese is Portugal Portuguese. */
export function localeOf(lang: Lang): string {
  return lang === 'pt' ? 'pt-PT' : 'en-US'
}

/** The `lang` attribute value for the document and for marked-up fragments. */
export function htmlLangOf(lang: Lang): string {
  return lang === 'pt' ? 'pt-PT' : 'en'
}
