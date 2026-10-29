import type { TranslationKey } from '@/i18n/dictionaries/en'
import { type PluralBase, type Vars, translate, translatePlural } from '@/i18n/translate'
import type { StorageSweep } from '@/services/catalogService'

interface Words {
  t: (key: TranslationKey, vars?: Vars) => string
  tn: (key: PluralBase, n: number, vars?: Vars) => string
}
const english: Words = { t: (k, v) => translate('en', k, v), tn: (k, n, v) => translatePlural('en', k, n, v) }

/** Toast title after a delete: names the files storage could not remove, never claims a clean sweep it did not make. Pass `{ t, tn }` from `useI18n()`. */
export function deletedToast(subject: 'Business' | 'Product', s: StorageSweep, words: Words = english): string {
  const who = subject === 'Business' ? 'business' : 'product'
  if (s.failedFiles === 0) return words.t(`business.shared.deleted.${who}`)
  return words.tn(`business.shared.deletedPartial.${who}`, s.failedFiles)
}
