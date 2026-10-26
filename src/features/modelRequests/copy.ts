// Dashboard copy for 3D model requests (S4 spec §9.1; English only).
import type { ModelRequest } from '@/domain/modelRequests'
import { type DatePrefs, formatDate } from '@/lib/format'

type StatusFields = Pick<ModelRequest, 'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'deliveredAt' | 'closedAt' | 'reason'>

/** The request's status line in the product editor. `optionName`: the request was for that option. */
export function statusLine(r: StatusFields, optionName?: string, prefs?: DatePrefs): string {
  const date = (iso: string | undefined) => formatDate(iso ?? r.updatedAt, 'en', prefs)
  switch (r.status) {
    case 'requested':
      return `Requested on ${date(r.createdAt)}. The Sanctus team will start on it soon.`
    case 'in_progress':
      return `In progress since ${date(r.startedAt)}. We'll email you when it's ready.`
    case 'delivered':
      return `Ready since ${date(r.deliveredAt ?? r.closedAt)}. The 3D model is attached to ${optionName ?? 'the product'}.`
    case 'rejected':
      return `Declined on ${date(r.closedAt)}. Reason: ${r.reason ?? ''}`.trimEnd()
    case 'cancelled':
      return `Cancelled on ${date(r.closedAt)}.`
  }
}

export const LOAD_ERROR = "Couldn't load 3D model requests."
/** R-S4-19: demo deliver and decline toasts. */
export const DEMO_NO_EMAIL = 'Demo: no email was sent.'
export const DEMO_SESSION_PHOTOS = 'Demo: these photos are kept only until you reload.'
export const SAMPLE_PHOTOS = 'Sample photos'
