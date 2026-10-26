// Application lifecycle rules. The database enforces them for real (admin_review_application in
// 20261020091428_applications_and_owner_access); the demo service and the UI use this copy.
import type { ApplicationStatus, ReviewAction } from '@/domain/types'

const TARGET: Record<ReviewAction, ApplicationStatus> = { start_review: 'under_review', approve: 'approved', reject: 'rejected' }

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  rejected: ['under_review'],
  approved: [],
}

export type TransitionResult = { ok: true; status: ApplicationStatus; noop: boolean } | { ok: false; reason: 'invalid_transition' | 'reason_required' }

export function applyReview(current: ApplicationStatus, action: ReviewAction, reason?: string): TransitionResult {
  const next = TARGET[action]
  if (next === current) return { ok: true, status: current, noop: true }
  if (!ALLOWED[current].includes(next)) return { ok: false, reason: 'invalid_transition' }
  if (next === 'rejected' && !reason?.trim()) return { ok: false, reason: 'reason_required' }
  return { ok: true, status: next, noop: false }
}

/** Actions an admin can take from a status (drives which buttons are shown). */
export function availableActions(status: ApplicationStatus): ReviewAction[] {
  return (Object.keys(TARGET) as ReviewAction[]).filter((a) => ALLOWED[status].includes(TARGET[a]))
}

/** The longest rejection reason (business_applications.decision_reason; review-application refuses longer ones). */
export const REASON_MAX_LENGTH = 1000

/** Seconds between invitation emails for one business; and the most attempts kept per business. */
export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_INVITATION_ATTEMPTS = 10
