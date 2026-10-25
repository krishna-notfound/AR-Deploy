// One platform member (ADR-0029): who they are, their role and what it allows, their invitations and their
// access history, with Change role, Deactivate or Reactivate. Only real recorded data is shown.
import { ChevronDown, UserX } from 'lucide-react'
import { useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DropdownMenu } from '@/components/ui/Menu'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { MemberRole, PlatformMember } from '@/domain/types'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { Monogram } from '../applications/Monogram'
import { AccessHistory } from './AccessHistory'
import { PERMISSION_GROUPS, ROLE_LABEL } from './permissions'
import { InviteStatusBadge, MemberStatusBadge, RoleBadge } from './teamLabels'
import { useMemberActions } from './useMemberActions'

export default function MemberDetailPage() {
  const { memberId = '' } = useParams()
  // The list includes Owners (who have no membership row), so one query serves every person.
  const members = useServiceQuery(() => service.listMembers(), [])
  const perms = useServiceQuery(() => service.getRolePermissions(), [])
  const m = members.data?.find((x) => x.id === memberId)
  const crumbs = [{ label: 'Team & Access', to: '/admin/team' }]

  if (members.status === 'loading' && !members.data) {
    return (
      <>
        <PageHeader title="Team member" breadcrumbs={crumbs} />
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      </>
    )
  }
  if (members.status === 'error') {
    return (
      <>
        <PageHeader title="Team member" breadcrumbs={crumbs} />
        <ErrorState message={`Could not load this team member. ${members.error.message}`} onRetry={members.refetch} />
      </>
    )
  }
  if (!m) {
    return (
      <>
        <PageHeader title="Team member" breadcrumbs={crumbs} />
        <Card>
          <EmptyState icon={UserX} title="This team member does not exist" body="They may have been removed." action={<ButtonLink to="/admin/team">Back to Team & Access</ButtonLink>} />
        </Card>
      </>
    )
  }

  return <Member m={m} perms={perms.data ?? null} onChanged={() => members.refetch()} crumbs={crumbs} />
}

function Member({ m, perms, onChanged, crumbs }: { m: PlatformMember; perms: Record<MemberRole, string[]> | null; onChanged: () => void; crumbs: { label: string; to?: string }[] }) {
  const actions = useMemberActions()
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
                    label="Change role"
                    triggerClassName="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
                    trigger={
                      <>
                        Change role <ChevronDown className="size-4" aria-hidden />
                      </>
                    }
                    items={[{ label: `Make ${ROLE_LABEL[otherRole]}`, onSelect: roleChange }]}
                  />
                </span>
              )}
              {m.status === 'invited' && <Button onClick={() => after(actions.resend(m))}>Resend invitation</Button>}
              {m.status === 'invited' && live && (
                <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => after(actions.revoke(m))}>
                  Revoke invitation
                </Button>
              )}
              {m.status === 'active' && (
                <Button variant="danger" onClick={() => after(actions.deactivate(m))}>
                  Deactivate
                </Button>
              )}
              {m.status === 'deactivated' && <Button onClick={() => after(actions.reactivate(m))}>Reactivate</Button>}
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Monogram name={m.fullName ?? m.email} />
            <div className="min-w-0">
              <p className="truncate font-medium">{m.fullName ?? 'Name not set yet'}</p>
              <p className="truncate text-sm text-ink-muted">{m.email}</p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Item label="Joined">{m.activatedAt ? formatDate(m.activatedAt) : 'Not yet'}</Item>
            <Item label="Last sign-in">{m.lastSignInAt ? formatRelative(m.lastSignInAt) : 'Never'}</Item>
            <Item label="Invited by">{m.invitedBy ?? '—'}</Item>
            {m.deactivatedAt && <Item label="Deactivated">{formatDate(m.deactivatedAt)}</Item>}
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-normal">What {ROLE_LABEL[m.role]} can do</h2>
          {isOwner ? (
            <p className="mt-3 text-sm text-ink-muted">The Owner always has every permission, including Team & Access and Settings. Ownership can't be changed here.</p>
          ) : !granted ? (
            <SkeletonRows rows={3} />
          ) : granted.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nothing yet. They can sign in but see no data.</p>
          ) : (
            <ul aria-label={`${ROLE_LABEL[m.role]} permissions`} className="mt-3 space-y-3 text-sm">
              {granted.map((g) => (
                <li key={g.title}>
                  <p className="text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">{g.title}</p>
                  <ul className="mt-1 text-ink-body">
                    {g.items.map((i) => (
                      <li key={i.key}>{i.label}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {!isOwner && <p className="mt-4 text-xs text-ink-muted">Permissions belong to the role. Change them on Role permissions.</p>}
        </Card>
      </div>

      {!isOwner && (
        <section aria-label="Invitations" className="mt-6">
          <Card>
            <h2 className="border-b border-line px-4 py-3 font-display text-xl font-normal sm:px-6">Invitations</h2>
            {invites.status === 'loading' && !invites.data ? (
              <SkeletonRows rows={2} />
            ) : invites.status === 'error' ? (
              <ErrorState message={invites.error.message} onRetry={invites.refetch} className="m-6" />
            ) : !invites.data?.length ? (
              <p className="px-4 py-6 text-sm text-ink-muted sm:px-6">No invitations recorded.</p>
            ) : (
              <ol className="divide-y divide-line">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
                    <div>
                      <p className="text-ink">Created {formatDateTime(i.createdAt)}</p>
                      <p className="text-xs text-ink-muted">
                        {i.acceptedAt ? `Accepted ${formatDateTime(i.acceptedAt)}` : i.revokedAt ? `Revoked ${formatDateTime(i.revokedAt)}` : `Expires ${formatDateTime(i.expiresAt)}`}
                        {i.lastEmailResult ? ` · Email: ${i.lastEmailResult}` : ''}
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

      <section aria-label="Access history" className="mt-6">
        <Card>
          <h2 className="border-b border-line px-4 py-3 font-display text-xl font-normal sm:px-6">Access history</h2>
          <AccessHistory member={m.email} />
        </Card>
      </section>
    </>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  )
}
