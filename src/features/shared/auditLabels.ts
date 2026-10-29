// Audit event and status labels for the dashboards, worded with `t` (English by default). The applications screens keep
// their own English copies in src/features/applications/labels.tsx.
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { en } from '@/i18n/dictionaries/en'
import { type TFn, tEn } from '@/i18n/translate'

const EVENT_PREFIX = 'admin.audit.event.'
const STATUS_PREFIX = 'admin.audit.status.'

const has = (key: string): key is TranslationKey => key in en

/** An audit event's label; `metadata` picks the wording where the event carries its direction (S4 section 9.1). */
export function eventLabel(type: string, metadata?: Record<string, unknown>, t: TFn = tEn): string {
  if (type === 'business_own_models_changed') return t(metadata?.to === true ? 'admin.audit.event.own_models_on' : 'admin.audit.event.own_models_off')
  const key = `${EVENT_PREFIX}${type}`
  return has(key) ? t(key) : type.replace(/_/g, ' ')
}

/** A status as a word (application, catalog or product status); unknown values are shown as they are. */
export function statusWord(s: string | undefined, t: TFn = tEn): string {
  if (!s) return ''
  const key = `${STATUS_PREFIX}${s}`
  return has(key) ? t(key) : s
}
