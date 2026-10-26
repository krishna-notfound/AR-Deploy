// The status of a 3D model request (S4). The stored `rejected` reads "Declined" (A3 wording).
import { Badge, type Tone } from '@/components/ui/Badge'
import type { ModelRequestStatus } from '@/domain/modelRequests'

const STATUS: Record<ModelRequestStatus, [string, Tone]> = {
  requested: ['Requested', 'accent'],
  in_progress: ['In progress', 'warning'],
  delivered: ['Delivered', 'success'],
  rejected: ['Declined', 'danger'],
  cancelled: ['Cancelled', 'neutral'],
}

export const modelRequestStatusLabel = (s: ModelRequestStatus) => STATUS[s][0]

export function ModelRequestStatusBadge({ status }: { status: ModelRequestStatus }) {
  const [label, tone] = STATUS[status]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}
