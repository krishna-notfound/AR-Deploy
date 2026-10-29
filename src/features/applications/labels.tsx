// Labels for applications, email attempts and audit events, in English or Portuguese (dashboards are bilingual, ADR-0044).
// The plain functions take the language as their last argument (default English, so older call sites keep working); pass
// `lang` from `useI18n()` to get Portuguese. The badges read the language themselves.
import { Badge, type Tone } from '@/components/ui/Badge'
import type { ApplicationStatus, EmailAttemptStatus, Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { hasTranslation, translate } from '@/i18n/translate'

const has = hasTranslation
const word = (lang: Lang, key: string, fallback: string): string => (has(key) ? translate(lang, key) : fallback)

const APP_TONE: Record<ApplicationStatus, Tone> = { submitted: 'accent', under_review: 'warning', approved: 'success', rejected: 'danger' }

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const { lang } = useI18n()
  return (
    <Badge tone={APP_TONE[status]} dot>
      {applicationStatusLabel(status, lang)}
    </Badge>
  )
}

export const applicationStatusLabel = (s: ApplicationStatus, lang: Lang = 'en') => translate(lang, `applications.status.${s}`)

// Only statuses backed by provider evidence say anything about delivery (design/23-email.md).
const EMAIL_TONE: Record<EmailAttemptStatus, Tone> = {
  blocked: 'warning',
  failed: 'danger',
  accepted: 'info',
  sent: 'info',
  delivered: 'success',
  delayed: 'warning',
  bounced: 'danger',
  complained: 'danger',
}

export function EmailStatusBadge({ status }: { status: EmailAttemptStatus }) {
  const { lang } = useI18n()
  return <Badge tone={EMAIL_TONE[status]}>{translate(lang, `applications.emailStatus.${status}`)}</Badge>
}

const EMAIL_REASONS = ['demo_mode', 'email_not_configured', 'test_sender_recipient_not_allowed', 'invalid_recipient', 'admin_recipient_not_configured', 'no_recipient'] as const

/** Why an email was not sent or failed, in plain words, for the email log. Unknown text is the provider's own (sanitized) message. */
export function emailReason(error?: string, lang: Lang = 'en'): string | undefined {
  if (!error) return undefined
  return knownEmailReason(error, lang) ?? error
}

/** Fixed copy for a known reason code only; undefined for anything else. Toasts use this: raw provider text is never shown. */
export function knownEmailReason(error?: string, lang: Lang = 'en'): string | undefined {
  return error && (EMAIL_REASONS as readonly string[]).includes(error) ? translate(lang, `applications.emailReason.${error}` as TranslationKey) : undefined
}

const EMAIL_KINDS = [
  'owner_invitation',
  'invitation_resend',
  'application_confirmation',
  'application_decision',
  'business_notice',
  'team_invitation',
  'security_code',
  'security_notice',
  'closure_request',
  'team_notice',
  'admin_notification',
  'test',
  'model_request_update',
] as const

/** The label of an email kind; an unknown kind shows as it is. */
export const emailKindLabel = (kind: string, lang: Lang = 'en'): string => ((EMAIL_KINDS as readonly string[]).includes(kind) ? translate(lang, `applications.emailKind.${kind}` as TranslationKey) : kind)

/** The English labels, for code that does not know the language. Prefer `emailKindLabel(kind, lang)`. */
export const EMAIL_KIND_LABEL: Record<string, string> = Object.fromEntries(EMAIL_KINDS.map((k) => [k, emailKindLabel(k, 'en')]))

/** An audit event's label; `metadata` picks the wording where the event carries its direction (S4 §9.1). */
export const eventLabel = (type: string, metadata?: Record<string, unknown>, lang: Lang = 'en'): string =>
  type === 'business_own_models_changed'
    ? translate(lang, metadata?.to === true ? 'applications.event.ownModelsOn' : 'applications.event.ownModelsOff')
    : word(lang, `applications.event.${type}`, word(lang, `editor.audit.${type}`, type.replace(/_/g, ' ')))

export const statusWord = (s?: string, lang: Lang = 'en'): string => (s ? word(lang, `applications.status.${s}`, s) : '')

/** City and country joined with a comma, leaving out whichever the application form did not ask for (no stray comma). */
export function joinPlace(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
}
