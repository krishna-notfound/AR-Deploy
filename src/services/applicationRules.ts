// Application lifecycle rules. The database enforces them for real (admin_review_application in
// 20261020091428_applications_and_owner_access); the demo service and the UI use this copy.
import type { ApplicationStatus, ID, ReviewAction } from '@/domain/types'

/** The ordinary transitions; reopen is its own rule (below). */
const TARGET: Record<Exclude<ReviewAction, 'reopen'>, ApplicationStatus> = { start_review: 'under_review', approve: 'approved', reject: 'rejected' }

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  rejected: ['under_review'],
  approved: [],
}

export type TransitionResult =
  | { ok: true; status: ApplicationStatus; noop: boolean }
  | { ok: false; reason: 'invalid_transition' | 'reason_required' | 'reopen_not_allowed' }

/**
 * Reopen (R-W2-2): only an approved application whose business was deleted, back to under_review. Callers pass the
 * application's businessId (null or undefined when it has none), so a missing link is never assumed.
 */
function canReopen(status: ApplicationStatus, businessId: ID | null | undefined): boolean {
  return status === 'approved' && !businessId
}

export function applyReview(current: ApplicationStatus, action: ReviewAction, reason: string | undefined, opts: { businessId: ID | null | undefined }): TransitionResult {
  if (action === 'reopen') return canReopen(current, opts.businessId) ? { ok: true, status: 'under_review', noop: false } : { ok: false, reason: 'reopen_not_allowed' }
  const next = TARGET[action]
  if (next === current) return { ok: true, status: current, noop: true }
  if (!ALLOWED[current].includes(next)) return { ok: false, reason: 'invalid_transition' }
  if (next === 'rejected' && !reason?.trim()) return { ok: false, reason: 'reason_required' }
  return { ok: true, status: next, noop: false }
}

/** Actions an admin can take from a status (drives which buttons are shown); reopen only for approved with no business. */
export function availableActions(status: ApplicationStatus, opts: { businessId: ID | null | undefined }): ReviewAction[] {
  const actions: ReviewAction[] = (Object.keys(TARGET) as (keyof typeof TARGET)[]).filter((a) => ALLOWED[status].includes(TARGET[a]))
  return canReopen(status, opts.businessId) ? [...actions, 'reopen'] : actions
}

const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
const PLAIN = 'aaaaaeeeeiiiiooooouuuucn'

/**
 * The business-name key for possible duplicates (R-W2-9), the same rule as private.normalize_business_name in SQL:
 * lower-cased and trimmed, Portuguese accents folded, one trailing legal-form word dropped, then only a-z and 0-9.
 * An empty key matches nothing.
 */
export function normalizeBusinessName(name: string): string {
  const folded = [...name.trim().toLowerCase()].map((c) => {
    const i = ACCENTED.indexOf(c)
    return i < 0 ? c : PLAIN[i]
  }).join('')
  return folded.replace(/(^|[^a-z0-9])(lda|limitada|unipessoal|sa|ltd|limited|llc|inc)[^a-z0-9]*$/, '$1').replace(/[^a-z0-9]/g, '')
}

/** The longest rejection reason (business_applications.decision_reason; review-application refuses longer ones). */
export const REASON_MAX_LENGTH = 1000

/** Seconds between invitation emails for one business; and the most attempts kept per business. */
export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_INVITATION_ATTEMPTS = 10
