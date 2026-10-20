// Admin-facing labels for applications, email attempts and audit events (dashboards are English-only).
import { Badge, type Tone } from '@/components/ui/Badge'
import type { ApplicationStatus, EmailAttemptStatus } from '@/domain/types'

const APP_LABEL: Record<ApplicationStatus, [string, Tone]> = {
  submitted: ['Submitted', 'info'],
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

/** Why an email was not sent or failed, in plain words. Unknown text is the provider's own (sanitized) message. */
export function emailReason(error?: string): string | undefined {
  if (!error) return undefined
  const known: Record<string, string> = {
    demo_mode: 'Demo mode: no email is sent.',
    email_not_configured: 'The email service is not configured on the server yet.',
    test_sender_recipient_not_allowed: 'The Resend test sender can only email the Resend account owner until a domain is verified.',
    invalid_recipient: 'The email address is not valid.',
    admin_recipient_not_configured: 'No admin notification address (ADMIN_NOTIFICATION_EMAIL) is configured.',
  }
  return known[error] ?? error
}

export const EMAIL_KIND_LABEL: Record<string, string> = {
  owner_invitation: 'Owner invitation',
  invitation_resend: 'Invitation resent',
  application_confirmation: 'Application confirmation',
  admin_notification: 'Admin notification',
  test: 'Test email',
}

const EVENT_LABEL: Record<string, string> = {
  application_submitted: 'Application submitted',
  application_status_changed: 'Status changed',
  business_created: 'Business created',
  business_status_changed: 'Catalogue status changed',
  business_slug_changed: 'Catalogue address changed',
  business_deleted: 'Business deleted',
  owner_provisioned: 'Owner provisioned',
  owner_removed: 'Owner removed',
  owner_onboarding_completed: 'Owner completed onboarding',
  invitation_requested: 'Invitation requested',
  invitation_resent: 'Invitation resent',
  invitation_failed: 'Invitation failed',
}

export const eventLabel = (type: string) => EVENT_LABEL[type] ?? type.replace(/_/g, ' ')

const STATUS_WORD: Record<string, string> = { submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', active: 'Active', inactive: 'Inactive', draft: 'Draft' }
export const statusWord = (s?: string) => (s ? (STATUS_WORD[s] ?? s) : '')
