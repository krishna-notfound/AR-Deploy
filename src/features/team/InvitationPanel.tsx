// One person's invitation (ADR-0030): status, dates and email result, with Resend and Revoke. Opened from the
// Invitations tab (?invite=<member id>). There is no "copy link": only the link's hash is stored.
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import type { PlatformMember } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { PERMISSION_LABEL, ROLE_LABEL } from './permissions'
import { INVITE_STATUS, InviteStatusBadge, RoleBadge } from './teamLabels'
import { useMemberActions } from './useMemberActions'

export function InvitationPanel({ member, onClose }: { member: PlatformMember | null; onClose: () => void }) {
  const actions = useMemberActions()
  const invites = useServiceQuery(() => (member ? service.listMemberInvites(member.id) : Promise.resolve({ ok: true as const, data: [] })), [member?.id])
  const perms = useServiceQuery(() => service.getRolePermissions(), [])
  const latest = invites.data?.[0]
  const live = latest && ['pending', 'sent', 'email_failed'].includes(latest.status)

  return (
    <Modal open={!!member} onClose={onClose} title={member ? `Invitation for ${member.email}` : ''} size="lg">
      {!member ? null : invites.status === 'loading' && !invites.data ? (
        <SkeletonRows rows={4} />
      ) : invites.status === 'error' ? (
        <ErrorState message={`Could not load the invitation. ${invites.error.message}`} onRetry={invites.refetch} />
      ) : (
        <div className="space-y-6">
          <dl className="grid gap-x-6 gap-y-4 text-ui-body sm:grid-cols-2">
            <Field label="Status">
              {latest ? (
                <div className="space-y-1">
                  <InviteStatusBadge status={latest.status} />
                  <p className="text-ui-small text-ink-muted">{INVITE_STATUS[latest.status].help}</p>
                </div>
              ) : (
                'No invitation sent'
              )}
            </Field>
            <Field label="Role">
              <RoleBadge role={member.role} />
            </Field>
            <Field label="Invited by">{latest?.createdBy ?? member.invitedBy ?? 'Unknown'}</Field>
            <Field label="Created">{latest ? formatDateTime(latest.createdAt) : '—'}</Field>
            <Field label="Last email attempt">
              {latest?.lastEmailAt ? `${formatDateTime(latest.lastEmailAt)} · ${latest.lastEmailResult ?? ''}` : 'Not sent'}
            </Field>
            <Field label="Expires">{latest ? formatDateTime(latest.expiresAt) : '—'}</Field>
            {latest?.acceptedAt && <Field label="Accepted">{formatDateTime(latest.acceptedAt)}</Field>}
            {latest?.revokedAt && <Field label="Revoked">{formatDateTime(latest.revokedAt)}</Field>}
          </dl>

          {member.role !== 'owner' && perms.data && (
            <section>
              <h3 className="text-ui-body font-semibold text-ink">What {ROLE_LABEL[member.role]} can do</h3>
              <p className="mt-2 text-ui-body text-ink-body">{perms.data[member.role].map((p) => PERMISSION_LABEL[p]).join(' · ') || 'Nothing yet'}</p>
            </section>
          )}

          {member.status === 'invited' && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-5">
              <Button onClick={() => void actions.resend(member).then((ok) => ok && invites.refetch())}>Resend invitation</Button>
              {live && (
                <Button variant="danger" onClick={() => void actions.revoke(member).then((ok) => ok && invites.refetch())}>
                  Revoke invitation
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ui-small font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1.5 text-ink">{children}</dd>
    </div>
  )
}
