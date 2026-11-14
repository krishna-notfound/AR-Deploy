import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import type { Vars } from '@/i18n/translate'
import type { ServiceError } from '@/services/catalogService'

/** A failed Editor upload in the person's language: the service's own sentence is English and never shown (QA EF-03). */
export function uploadErrorText(error: ServiceError, t: (key: TranslationKey, vars?: Vars) => string): string {
  return error.code === 'UNKNOWN' || error.code === 'STORAGE' ? t('editor.upload.failed') : errorText(error, t)
}
