// The one place that turns a service failure into a sentence in the person's language (spec 12/13). `ServiceError.message`
// stays English for logs; the UI shows errorText(error, t) and never the raw message.
import type { ServiceError } from '@/services/catalogService'
import { type TranslationKey, en } from './dictionaries/en'
import { type FieldError, isFieldMessage } from './fieldMessage'
import type { Vars } from './translate'

type T = (key: TranslationKey, vars?: Vars) => string

const has = (key: string): key is TranslationKey => key in en

/** `common.error.reason.<reason>` if there is one, else `common.error.<code>`, else the generic sentence. */
export function errorKey(error: Pick<ServiceError, 'code' | 'reason'>): TranslationKey {
  const byReason = `common.error.reason.${error.reason ?? ''}`
  if (error.reason && has(byReason)) return byReason
  const byCode = `common.error.${error.code}`
  return has(byCode) ? byCode : 'common.error.generic'
}

export function errorText(error: ServiceError, t: T): string {
  return t(errorKey(error))
}

/** A field error as text: messages are translated, plain strings are shown as they are. */
export function fieldText(e: FieldError | undefined, t: T): string | undefined {
  if (e === undefined) return undefined
  return isFieldMessage(e) ? t(e.key, e.vars) : e
}

/** All field errors as text, for forms that keep their errors as strings. */
export function fieldTexts(errors: Record<string, FieldError> | undefined, t: T): Record<string, string> {
  return Object.fromEntries(Object.entries(errors ?? {}).map(([k, v]) => [k, fieldText(v, t) ?? '']))
}
