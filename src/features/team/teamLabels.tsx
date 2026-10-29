// Role and status pills for the team screens (ADR-0029), and the words for roles, permissions and invitation states
// in the current language. permissions.ts keeps the English master copy; the screens show these keys instead.
import { useMemo } from 'react'
import { Badge, type Tone } from '@/components/ui/Badge'
import type { InviteStatus, MemberStatus, PlatformRole } from '@/domain/types'
import { type TranslationKey, en } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'

const ROLE_TONE: Record<PlatformRole, Tone> = { owner: 'neutral', admin: 'accent', team: 'neutral' }

export const ROLE_KEY: Record<PlatformRole, TranslationKey> = { owner: 'team.role.owner', admin: 'team.role.admin', team: 'team.role.team' }
export const ROLE_DESC_KEY: Record<'admin' | 'team', TranslationKey> = { admin: 'team.roleDesc.admin', team: 'team.roleDesc.team' }
export const MEMBER_STATUS_KEY: Record<MemberStatus, TranslationKey> = {
  active: 'team.status.active',
  invited: 'team.status.invited',
  deactivated: 'team.status.deactivated',
}
const MEMBER_STATUS_TONE: Record<MemberStatus, Tone> = { active: 'success', invited: 'info', deactivated: 'neutral' }

export const INVITE_STATUS_KEY: Record<InviteStatus, { label: TranslationKey; help: TranslationKey }> = {
  pending: { label: 'team.invite.status.pending', help: 'team.invite.help.pending' },
  sent: { label: 'team.invite.status.sent', help: 'team.invite.help.sent' },
  email_failed: { label: 'team.invite.status.email_failed', help: 'team.invite.help.email_failed' },
  accepted: { label: 'team.invite.status.accepted', help: 'team.invite.help.accepted' },
  expired: { label: 'team.invite.status.expired', help: 'team.invite.help.expired' },
  revoked: { label: 'team.invite.status.revoked', help: 'team.invite.help.revoked' },
}
const INVITE_STATUS_TONE: Record<InviteStatus, Tone> = { pending: 'info', sent: 'info', email_failed: 'warning', accepted: 'success', expired: 'neutral', revoked: 'danger' }

const has = (key: string): key is TranslationKey => key in en

/** Role, permission and group words in the current language; an unknown permission falls back to its English label. */
export function useTeamText() {
  const { t } = useI18n()
  return useMemo(() => {
    const opt = (key: string, fallback: string, vars?: Vars) => (has(key) ? t(key, vars) : fallback)
    return {
      role: (r: PlatformRole) => t(ROLE_KEY[r]),
      /** A permission's name from its key. */
      perm: (key: string, fallback?: string) => opt(`team.perm.${key}.label`, fallback ?? key),
      permDescription: (key: string, fallback = '') => opt(`team.perm.${key}.description`, fallback),
      permWarning: (key: string, fallback = '') => opt(`team.perm.${key}.warning`, fallback),
      /** A permission group's title; `index` is its place in PERMISSION_GROUPS. */
      group: (index: number, fallback: string) => opt(`team.permGroup.${index}`, fallback),
    }
  }, [t])
}

export function RoleBadge({ role }: { role: PlatformRole }) {
  const { t } = useI18n()
  return <Badge tone={ROLE_TONE[role]} className={role === 'owner' ? 'bg-obsidian text-chalk' : undefined}>{t(ROLE_KEY[role])}</Badge>
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const { t } = useI18n()
  return <Badge tone={MEMBER_STATUS_TONE[status]}>{t(MEMBER_STATUS_KEY[status])}</Badge>
}

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const { t } = useI18n()
  return <Badge tone={INVITE_STATUS_TONE[status]}>{t(INVITE_STATUS_KEY[status].label)}</Badge>
}

const EMAIL_REASON_KEY: Record<string, TranslationKey> = {
  demo_mode: 'team.emailReason.demo_mode',
  email_not_configured: 'team.emailReason.email_not_configured',
  test_sender_recipient_not_allowed: 'team.emailReason.test_sender_recipient_not_allowed',
  invalid_recipient: 'team.emailReason.invalid_recipient',
  admin_recipient_not_configured: 'team.emailReason.admin_recipient_not_configured',
  no_recipient: 'team.emailReason.no_recipient',
}

/** Fixed sentence for a known email failure code; undefined for anything else (a provider's own words are never shown). */
export function emailReasonKey(error?: string | null): TranslationKey | undefined {
  return error && Object.hasOwn(EMAIL_REASON_KEY, error) ? EMAIL_REASON_KEY[error] : undefined
}
