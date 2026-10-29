import type { TranslationKey } from './dictionaries/en'
import type { Vars } from './translate'

/** A translatable message: a dictionary key plus the values for its `{tokens}`. Validators return these, never English text. */
export interface FieldMessage {
  key: TranslationKey
  vars?: Vars
}

/** What a service puts next to a field: a translatable message, or text the caller already decided on (a server code or a path-keyed note). */
export type FieldError = string | FieldMessage

export const msg = (key: TranslationKey, vars?: Vars): FieldMessage => (vars ? { key, vars } : { key })

export const isFieldMessage = (e: FieldError | undefined): e is FieldMessage => typeof e === 'object' && e !== null && 'key' in e
