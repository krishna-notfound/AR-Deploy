// Role and status pills for the team screens (ADR-0029).
import { Badge, type Tone } from '@/components/ui/Badge'
import type { InviteStatus, MemberStatus, PlatformRole } from '@/domain/types'
import { ROLE_LABEL } from './permissions'

const ROLE_TONE: Record<PlatformRole, Tone> = { owner: 'neutral', admin: 'accent', team: 'neutral' }

export function RoleBadge({ role }: { role: PlatformRole }) {
  return <Badge tone={ROLE_TONE[role]} className={role === 'owner' ? 'bg-obsidian text-chalk' : undefined}>{ROLE_LABEL[role]}</Badge>
}

const MEMBER_STATUS: Record<MemberStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const s = MEMBER_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export const INVITE_STATUS: Record<InviteStatus, { label: string; tone: Tone; help: string }> = {
  pending: { label: 'Pending', tone: 'info', help: 'Created; the email has not been sent yet.' },
  sent: { label: 'Sent', tone: 'info', help: "Accepted by the email provider. This doesn't mean it was read." },
  email_failed: { label: 'Email failed', tone: 'warning', help: 'The invitation exists but its email was not delivered. Resend it.' },
  accepted: { label: 'Accepted', tone: 'success', help: 'The person created their account.' },
  expired: { label: 'Expired', tone: 'neutral', help: 'The link no longer works. Resend to send a new one.' },
  revoked: { label: 'Revoked', tone: 'danger', help: 'The link was cancelled and can no longer be used.' },
}

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const s = INVITE_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}
