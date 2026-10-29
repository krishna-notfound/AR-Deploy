// One person's invitation (ADR-0030): status, dates and email result, with Resend and Revoke. Opened from the
// Invitations tab (?invite=<member id>). There is no "copy link": only the link's hash is stored.
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import type { PlatformMember } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { INVITE_STATUS_KEY, InviteStatusBadge, RoleBadge, useTeamText } from './teamLabels'
import { useMemberActions } from './useMemberActions'

export function InvitationPanel({ member, onClose }: { member: PlatformMember | null; onClose: () => void }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const words = useTeamText()
  const actions = useMemberActions()
  const invites = useServiceQuery(() => (member ? service.listMemberInvites(member.id) : Promise.resolve({ ok: true as const, data: [] })), [member?.id])
  const perms = useServiceQuery(() => service.getRolePermissions(), [])
  const latest = invites.data?.[0]
  const live = latest && ['pending', 'sent', 'email_failed'].includes(latest.status)

  return (
    <Modal open={!!member} onClose={onClose} title={member ? t('team.panel.title', { email: member.email }) : ''} size="lg">
      {!member ? null : invites.status === 'loading' && !invites.data ? (
        <SkeletonRows rows={4} />
      ) : invites.status === 'error' ? (
        <ErrorState message={`${t('team.panel.loadFailed')} ${errorText(invites.error, t)}`} onRetry={invites.refetch} />
      ) : (
        <div className="space-y-6">
          <dl className="grid gap-x-6 gap-y-4 text-ui-body sm:grid-cols-2">
            <Field label={t('common.status')}>
              {latest ? (
                <div className="space-y-1">
                  <InviteStatusBadge status={latest.status} />
                  <p className="text-ui-small text-ink-muted">{t(INVITE_STATUS_KEY[latest.status].help)}</p>
                </div>
              ) : (
                t('team.panel.noInvite')
              )}
            </Field>
            <Field label={t('team.col.role')}>
              <RoleBadge role={member.role} />
            </Field>
            <Field label={t('team.panel.invitedBy')}>{latest?.createdBy ?? member.invitedBy ?? t('team.panel.unknown')}</Field>
            <Field label={t('common.created')}>{latest ? fmt.dateTime(latest.createdAt) : '—'}</Field>
            <Field label={t('team.panel.lastEmail')}>
              {latest?.lastEmailAt ? `${fmt.dateTime(latest.lastEmailAt)} · ${latest.lastEmailResult ?? ''}` : t('team.invitations.notSent')}
            </Field>
            <Field label={t('team.invitations.col.expires')}>{latest ? fmt.dateTime(latest.expiresAt) : '—'}</Field>
            {latest?.acceptedAt && <Field label={t('team.panel.accepted')}>{fmt.dateTime(latest.acceptedAt)}</Field>}
            {latest?.revokedAt && <Field label={t('team.panel.revoked')}>{fmt.dateTime(latest.revokedAt)}</Field>}
          </dl>

          {member.role !== 'owner' && perms.data && (
            <section>
              <h3 className="text-ui-body font-semibold text-ink">{t('team.whatCanDo', { role: words.role(member.role) })}</h3>
              <p className="mt-2 text-ui-body text-ink-body">{perms.data[member.role].map((p) => words.perm(p)).join(' · ') || t('team.nothingYet')}</p>
            </section>
          )}

          {member.status === 'invited' && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-5">
              <Button onClick={() => void actions.resend(member).then((ok) => ok && invites.refetch())}>{t('team.menu.resend')}</Button>
              {live && (
                <Button variant="danger" onClick={() => void actions.revoke(member).then((ok) => ok && invites.refetch())}>
                  {t('team.menu.revoke')}
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
