// One platform member (ADR-0029): who they are, their role and what it allows, their invitations and their
// access history, with Change role, Deactivate, Reactivate or Remove. Only real recorded data is shown.
import { Check, ChevronDown, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DropdownMenu } from '@/components/ui/Menu'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { MemberRole, PlatformMember } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { account, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'
import { AccessHistory } from './AccessHistory'
import { PERMISSION_GROUPS } from './permissions'
import { InviteStatusBadge, MemberStatusBadge, RoleBadge, useTeamText } from './teamLabels'
import { useMemberActions, useNoticeToast } from './useMemberActions'

export default function MemberDetailPage() {
  const { t } = useI18n()
  const { memberId = '' } = useParams()
  // The list includes Owners (who have no membership row), so one query serves every person.
  const members = useServiceQuery(() => service.listMembers(), [])
  const perms = useServiceQuery(() => service.getRolePermissions(), [])
  const m = members.data?.find((x) => x.id === memberId)
  const crumbs = [{ label: t('nav.team'), to: '/admin/team' }]

  if (members.status === 'loading' && !members.data) {
    return (
      <>
        <PageHeader title={t('team.member.title')} breadcrumbs={crumbs} />
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      </>
    )
  }
  if (members.status === 'error') {
    return (
      <>
        <PageHeader title={t('team.member.title')} breadcrumbs={crumbs} />
        <ErrorState message={`${t('team.member.loadFailed')} ${errorText(members.error, t)}`} onRetry={members.refetch} />
      </>
    )
  }
  if (!m) {
    return (
      <>
        <PageHeader title={t('team.member.title')} breadcrumbs={crumbs} />
        <Card>
          <EmptyState icon={UserX} title={t('team.member.missing.title')} body={t('team.member.missing.body')} action={<ButtonLink to="/admin/team">{t('team.member.missing.back')}</ButtonLink>} />
        </Card>
      </>
    )
  }

  return <Member m={m} perms={perms.data ?? null} onChanged={() => members.refetch()} crumbs={crumbs} />
}

function Member({ m, perms, onChanged, crumbs }: { m: PlatformMember; perms: Record<MemberRole, string[]> | null; onChanged: () => void; crumbs: { label: string; to?: string }[] }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const words = useTeamText()
  const actions = useMemberActions()
  const navigate = useNavigate()
  const can = useCan()
  const noticeToast = useNoticeToast()
  const [resetting, setResetting] = useState(false)
  const invites = useServiceQuery(() => (m.role === 'owner' ? Promise.resolve({ ok: true as const, data: [] }) : service.listMemberInvites(m.id)), [m.id, m.role])
  const isOwner = m.role === 'owner'
  const granted = isOwner ? null : PERMISSION_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => perms?.[m.role as MemberRole].includes(i.key)) })).filter((g) => g.items.length)
  const after = (p: Promise<boolean>) => void p.then((ok) => ok && (onChanged(), invites.refetch()))
  const otherRole: MemberRole = m.role === 'admin' ? 'team' : 'admin'
  const roleChange = () => {
    const from = perms?.[m.role as MemberRole] ?? []
    const to = perms?.[otherRole] ?? []
    after(actions.changeRole(m, otherRole, from.filter((p) => !to.includes(p)), to.filter((p) => !from.includes(p))))
  }
  const live = m.invite && ['pending', 'sent', 'email_failed'].includes(m.invite.status)
  // Owner support action (spec 8): only for someone with an account (an invited member has none yet), never the Owner,
  // and only when they have 2FA to reset (R-W6-6).
  const resetTarget = can('owner') && !isOwner && m.has2fa ? m.userId : null
  const name = m.fullName ?? m.email

  return (
    <>
      <PageHeader
        title={m.fullName ?? m.email}
        breadcrumbs={crumbs.concat({ label: m.fullName ?? m.email })}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={m.role} />
            <MemberStatusBadge status={m.status} />
          </div>
        }
        actions={
          isOwner ? undefined : (
            <>
              {m.status !== 'deactivated' && (
                <span id="role">
                  <DropdownMenu
                    label={t('team.menu.changeRole')}
                    triggerClassName="inline-flex h-10! max-sm:h-11! pointer-coarse:h-11! w-auto! items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-ui-body font-medium text-ink hover:bg-subtle"
                    trigger={
                      <>
                        {t('team.menu.changeRole')} <ChevronDown className="size-4" aria-hidden />
                      </>
                    }
                    items={[{ label: t('team.member.makeRole', { role: words.role(otherRole) }), onSelect: roleChange }]}
                  />
                </span>
              )}
              {m.status === 'invited' && <Button onClick={() => after(actions.resend(m))}>{t('team.menu.resend')}</Button>}
              {m.status === 'invited' && live && (
                <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => after(actions.revoke(m))}>
                  {t('team.menu.revoke')}
                </Button>
              )}
              {m.status === 'active' && (
                <Button variant="danger" onClick={() => after(actions.deactivate(m))}>
                  {t('team.menu.deactivate')}
                </Button>
              )}
              {m.status === 'deactivated' && <Button onClick={() => after(actions.reactivate(m))}>{t('team.menu.reactivate')}</Button>}
              {m.status === 'deactivated' && (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => void actions.remove(m).then((ok) => ok && navigate('/admin/team'))}
                >
                  {t('team.member.remove')}
                </Button>
              )}
              {resetTarget && <Button onClick={() => setResetting(true)}>{t('team.member.reset2fa')}</Button>}
            </>
          )
        }
      />
      {resetTarget && (
        <ActionCodeDialog
          open={resetting}
          purpose="owner_reset_2fa"
          title={t('team.member.reset.title', { name })}
          description={t('team.member.reset.body')}
          confirmLabel={t('team.member.reset2fa')}
          destructive
          onClose={() => setResetting(false)}
          onConfirm={async (code) => {
            const r = await account.ownerReset2fa(resetTarget, code)
            if (r.ok) {
              noticeToast(t('team.member.reset.done'), r.data.notice)
              onChanged() // has2fa is now false: the button goes away
            }
            return r
          }}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Avatar name={m.fullName ?? m.email} src={m.avatarUrl} size={48} className="bg-canvas!" />
            <div className="min-w-0">
              <p className="truncate text-[length:var(--text-ui-card)] font-medium text-ink">{m.fullName ?? t('team.members.nameNotSet')}</p>
              <p className="truncate text-ui-body text-ink-muted">{m.email}</p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-subtle border-t border-line text-ui-body">
            <Item label={t('team.member.joined')}>{m.activatedAt ? fmt.date(m.activatedAt) : t('team.member.notYet')}</Item>
            <Item label={t('team.members.col.lastSignIn')}>{m.lastSignInAt ? fmt.relative(m.lastSignInAt) : t('team.members.never')}</Item>
            <Item label={t('team.panel.invitedBy')}>{m.invitedBy ?? '—'}</Item>
            {m.deactivatedAt && <Item label={t('team.member.deactivated')}>{fmt.date(m.deactivatedAt)}</Item>}
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-ui-card font-semibold text-ink">{t('team.whatCanDo', { role: words.role(m.role) })}</h2>
          {isOwner ? (
            <p className="mt-3 text-ui-body text-ink-muted">{t('team.member.ownerAll')}</p>
          ) : !granted ? (
            <SkeletonRows rows={3} />
          ) : granted.length === 0 ? (
            <p className="mt-3 text-ui-body text-ink-muted">{t('team.nothingYetNoData')}</p>
          ) : (
            <ul aria-label={t('team.permissionsOf', { role: words.role(m.role) })} className="mt-4 space-y-5 text-ui-body">
              {granted.map((g) => (
                <li key={g.title} className="border-b border-subtle pb-5 last:border-b-0 last:pb-0">
                  <p className="text-ui-body font-semibold text-ink">{words.group(PERMISSION_GROUPS.findIndex((x) => x.title === g.title), g.title)}</p>
                  <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-ink-body sm:grid-cols-2">
                    {g.items.map((i) => (
                      <li key={i.key} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                        {words.perm(i.key, i.label)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {!isOwner && (
            <p className="mt-5 border-t border-line pt-4 text-ui-small text-ink-muted">
              {t('team.member.permsBelong')}{' '}
              <Link to="/admin/team/permissions" className="text-ink underline">
                {t('team.page.rolePermissions')}
              </Link>
              .
            </p>
          )}
        </Card>
      </div>

      {!isOwner && (
        <section aria-label={t('team.page.tab.invitations')} className="mt-6">
          <Card>
            <h2 className="border-b border-line px-4 py-4 text-ui-card font-semibold text-ink sm:px-6">{t('team.page.tab.invitations')}</h2>
            {invites.status === 'loading' && !invites.data ? (
              <SkeletonRows rows={2} />
            ) : invites.status === 'error' ? (
              <ErrorState message={errorText(invites.error, t)} onRetry={invites.refetch} className="m-6" />
            ) : !invites.data?.length ? (
              <p className="px-4 py-6 text-ui-body text-ink-muted sm:px-6">{t('team.member.noInvites')}</p>
            ) : (
              <ol className="divide-y divide-subtle">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-ui-body sm:px-6">
                    <div>
                      <p className="text-ink">{t('team.member.createdOn', { date: fmt.dateTime(i.createdAt) })}</p>
                      <p className="text-ui-small text-ink-muted">
                        {i.acceptedAt ? t('team.member.acceptedOn', { date: fmt.dateTime(i.acceptedAt) }) : i.revokedAt ? t('team.member.revokedOn', { date: fmt.dateTime(i.revokedAt) }) : t('team.invitations.expiresOn', { date: fmt.dateTime(i.expiresAt) })}
                        {i.lastEmailResult ? ` · ${t('team.member.emailResult', { result: i.lastEmailResult })}` : ''}
                      </p>
                    </div>
                    <InviteStatusBadge status={i.status} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>
      )}

      <section aria-label={t('team.page.tab.history')} className="mt-6">
        <Card>
          <h2 className="border-b border-line px-4 py-4 text-ui-card font-semibold text-ink sm:px-6">{t('team.page.tab.history')}</h2>
          <AccessHistory member={{ id: m.id, userId: m.userId }} />
        </Card>
      </section>
    </>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}
