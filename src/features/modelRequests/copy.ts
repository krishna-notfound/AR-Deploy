// Dashboard copy for 3D model requests (S4 spec §9.1), in the person's language (ADR-0044). The English constants
// below are kept for files that still import them; new code passes `t` or reads the keys.
import type { ModelRequest } from '@/domain/modelRequests'
import { type TranslationKey, en } from '@/i18n/dictionaries/en'
import { type Vars, translate } from '@/i18n/translate'

export type T = (key: TranslationKey, vars?: Vars) => string

/** English `t`, the default for callers that do not pass one (tests, files not yet translated). */
export const tEn: T = (key, vars) => translate('en', key, vars)

type StatusFields = Pick<ModelRequest, 'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'deliveredAt' | 'closedAt' | 'reason'>

/** The request's status line in the product editor. `optionName`: the request was for that option. `formatDate` is `useFormat().date`. */
export function statusLine(r: StatusFields, optionName: string | undefined, formatDate: (iso: string) => string, t: T = tEn): string {
  const date = (iso: string | undefined) => formatDate(iso ?? r.updatedAt)
  switch (r.status) {
    case 'requested':
      return t('business.modelRequests.line.requested', { date: date(r.createdAt) })
    case 'in_progress':
      return t('business.modelRequests.line.inProgress', { date: date(r.startedAt) })
    case 'delivered':
      return optionName
        ? t('business.modelRequests.line.deliveredOption', { date: date(r.deliveredAt ?? r.closedAt), name: optionName })
        : t('business.modelRequests.line.delivered', { date: date(r.deliveredAt ?? r.closedAt) })
    case 'rejected':
      return t('business.modelRequests.line.rejected', { date: date(r.closedAt), reason: r.reason ?? '' }).trimEnd()
    case 'cancelled':
      return t('business.modelRequests.line.cancelled', { date: date(r.closedAt) })
  }
}

export const LOAD_ERROR = en['business.modelRequests.loadError']
/** R-S4-19: demo deliver and decline toasts. */
export const DEMO_NO_EMAIL = en['business.modelRequests.demoNoEmail']
export const DEMO_SESSION_PHOTOS = en['business.modelRequests.demoSessionPhotos']
export const SAMPLE_PHOTOS = en['business.modelRequests.samplePhotos']
