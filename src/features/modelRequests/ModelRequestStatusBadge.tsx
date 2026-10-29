// The status of a 3D model request (S4). The stored `rejected` reads "Declined" (A3 wording).
import { Badge, type Tone } from '@/components/ui/Badge'
import type { ModelRequestStatus } from '@/domain/modelRequests'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { type T, tEn } from './copy'

const STATUS: Record<ModelRequestStatus, [TranslationKey, Tone]> = {
  requested: ['business.modelRequests.status.requested', 'accent'],
  in_progress: ['business.modelRequests.status.inProgress', 'warning'],
  delivered: ['business.modelRequests.status.delivered', 'success'],
  rejected: ['business.modelRequests.status.rejected', 'danger'],
  cancelled: ['business.modelRequests.status.cancelled', 'neutral'],
}

/** The status word. Pass `t` from `useI18n()`; without it the English word is returned. */
export const modelRequestStatusLabel = (s: ModelRequestStatus, t: T = tEn) => t(STATUS[s][0])

export function ModelRequestStatusBadge({ status }: { status: ModelRequestStatus }) {
  const { t } = useI18n()
  return (
    <Badge tone={STATUS[status][1]} dot>
      {t(STATUS[status][0])}
    </Badge>
  )
}
