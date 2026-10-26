// Admin-facing labels for applications, email attempts and audit events (dashboards are English-only).
import { Badge, type Tone } from '@/components/ui/Badge'
import type { ApplicationStatus, EmailAttemptStatus } from '@/domain/types'

const APP_LABEL: Record<ApplicationStatus, [string, Tone]> = {
  submitted: ['Submitted', 'accent'],
  under_review: ['Under review', 'warning'],
  approved: ['Approved', 'success'],
  rejected: ['Rejected', 'danger'],
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const [label, tone] = APP_LABEL[status]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

export const applicationStatusLabel = (s: ApplicationStatus) => APP_LABEL[s][0]

// Only statuses backed by provider evidence say anything about delivery (design/23-email.md).
const EMAIL_LABEL: Record<EmailAttemptStatus, [string, Tone]> = {
  blocked: ['Not sent', 'warning'],
  failed: ['Failed', 'danger'],
  accepted: ['Accepted by Resend', 'info'],
  sent: ['Sent by Resend', 'info'],
  delivered: ['Delivered', 'success'],
  delayed: ['Delayed', 'warning'],
  bounced: ['Bounced', 'danger'],
  complained: ['Marked as spam', 'danger'],
}

export function EmailStatusBadge({ status }: { status: EmailAttemptStatus }) {
  const [label, tone] = EMAIL_LABEL[status]
  return <Badge tone={tone}>{label}</Badge>
}

const EMAIL_REASON: Record<string, string> = {
  demo_mode: 'Demo mode: no email is sent.',
  email_not_configured: 'The email service is not configured on the server yet.',
  test_sender_recipient_not_allowed: 'The Resend test sender can only email the Resend account owner until a domain is verified.',
  invalid_recipient: 'The email address is not valid.',
  admin_recipient_not_configured: 'No admin notification address (ADMIN_NOTIFICATION_EMAIL) is configured.',
  no_recipient: 'The account has no email address.',
}

/** Why an email was not sent or failed, in plain words, for the email log. Unknown text is the provider's own (sanitized) message. */
export function emailReason(error?: string): string | undefined {
  if (!error) return undefined
  return knownEmailReason(error) ?? error
}

/** Fixed copy for a known reason code only; undefined for anything else. Toasts use this: raw provider text is never shown. */
export function knownEmailReason(error?: string): string | undefined {
  return error && Object.hasOwn(EMAIL_REASON, error) ? EMAIL_REASON[error] : undefined
}

export const EMAIL_KIND_LABEL: Record<string, string> = {
  owner_invitation: 'Owner invitation',
  invitation_resend: 'Invitation resent',
  application_confirmation: 'Application confirmation',
  application_decision: 'Application decision',
  business_notice: 'Business notice',
  team_invitation: 'Team invitation',
  security_code: 'Security code',
  security_notice: 'Security notice',
  closure_request: 'Closure request',
  team_notice: 'Team notice',
  admin_notification: 'Admin notification',
  test: 'Test email',
  model_request_update: '3D model update',
}

const EVENT_LABEL: Record<string, string> = {
  application_submitted: 'Application submitted',
  application_status_changed: 'Status changed',
  business_created: 'Business created',
  business_status_changed: 'Catalogue status changed',
  business_slug_changed: 'Catalogue address changed',
  business_deleted: 'Business deleted',
  product_created: 'Product added',
  product_published: 'Product published',
  product_unpublished: 'Product unpublished',
  product_slug_changed: 'Product address changed',
  product_deleted: 'Product deleted',
  owner_provisioned: 'Owner provisioned',
  owner_removed: 'Owner removed',
  account_closure_voided: 'Closure request cancelled: owner removed',
  owner_onboarding_completed: 'Owner completed onboarding',
  invitation_requested: 'Invitation requested',
  invitation_resent: 'Invitation resent',
  invitation_failed: 'Invitation failed',
  model_request_created: '3D model requested',
  model_request_cancelled: '3D model request cancelled',
  model_request_started: '3D model work started',
  model_request_delivered: '3D model delivered',
  model_request_rejected: '3D model request declined',
}

/** An audit event's label; `metadata` picks the wording where the event carries its direction (S4 §9.1). */
export const eventLabel = (type: string, metadata?: Record<string, unknown>) =>
  type === 'business_own_models_changed'
    ? metadata?.to === true ? 'Own 3D uploads allowed' : 'Own 3D uploads turned off'
    : (EVENT_LABEL[type] ?? type.replace(/_/g, ' '))

const STATUS_WORD: Record<string, string> = { submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', active: 'Active', inactive: 'Inactive', draft: 'Draft' }
export const statusWord = (s?: string) => (s ? (STATUS_WORD[s] ?? s) : '')
