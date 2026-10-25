// Everyone with platform access (ADR-0029): search, role and status filters, and per-row actions that make sense
// for that person. The Owner has no actions: ownership is never changed from the app.
import { MoreHorizontal, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { FormField, Select } from '@/components/ui/Form'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/States'
import type { MemberStatus, PlatformMember, PlatformRole } from '@/domain/types'
import { formatDate, formatRelative } from '@/lib/format'
import { Monogram } from '../applications/Monogram'
import { InviteStatusBadge, MemberStatusBadge, RoleBadge } from './teamLabels'
import { useMemberActions } from './useMemberActions'

const ROLES: PlatformRole[] = ['owner', 'admin', 'team']
const STATUSES: MemberStatus[] = ['active', 'invited', 'deactivated']

export function MembersTable({ members, onInvite, onOpenInvite }: { members: PlatformMember[]; onInvite: () => void; onOpenInvite: (m: PlatformMember) => void }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const actions = useMemberActions()
  const q = params.get('q') ?? ''
  const role = (ROLES as string[]).includes(params.get('role') ?? '') ? (params.get('role') as PlatformRole) : ''
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as MemberStatus) : ''

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (value) n.set(key, value)
        else n.delete(key)
        return n
      },
      { replace: true },
    )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return members.filter(
      (m) =>
        (!role || m.role === role) &&
        (!status || m.status === status) &&
        (!needle || m.email.includes(needle) || (m.fullName ?? '').toLowerCase().includes(needle)),
    )
  }, [members, q, role, status])

  const menu = (m: PlatformMember): (MenuItem | 'separator')[] => {
    const live = m.invite && ['pending', 'sent', 'email_failed'].includes(m.invite.status)
    return [
      { label: 'View', onSelect: () => navigate(`/admin/team/${m.id}`) },
      ...(m.status !== 'deactivated' ? [{ label: 'Change role', onSelect: () => navigate(`/admin/team/${m.id}#role`) }] : []),
      ...(m.status === 'invited' ? [{ label: 'Invitation details', onSelect: () => onOpenInvite(m) }, { label: 'Resend invitation', onSelect: () => void actions.resend(m) }] : []),
      ...(m.status === 'invited' && live ? [{ label: 'Revoke invitation', destructive: true, onSelect: () => void actions.revoke(m) }] : []),
      ...(m.status === 'active' ? ['separator' as const, { label: 'Deactivate', destructive: true, onSelect: () => void actions.deactivate(m) }] : []),
      ...(m.status === 'deactivated' ? [{ label: 'Reactivate', onSelect: () => void actions.reactivate(m) }] : []),
    ]
  }

  const name = (m: PlatformMember) => (
    <div className="flex min-w-0 items-center gap-3">
      <Monogram name={m.fullName ?? m.email} />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{m.fullName ?? 'Name not set yet'}</p>
        <p className="truncate text-xs text-ink-muted">{m.email}</p>
      </div>
    </div>
  )
  const statusCell = (m: PlatformMember) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <MemberStatusBadge status={m.status} />
      {m.status === 'invited' && m.invite && <InviteStatusBadge status={m.invite.status} />}
    </div>
  )
  const actionCell = (m: PlatformMember) =>
    m.role === 'owner' ? null : (
      <DropdownMenu label={`Actions for ${m.fullName ?? m.email}`} trigger={<MoreHorizontal className="size-4" aria-hidden />} items={menu(m)} />
    )

  const columns: Column<PlatformMember>[] = [
    { key: 'member', header: 'Member', cell: name, sortValue: (m) => (m.fullName ?? m.email).toLowerCase() },
    { key: 'role', header: 'Role', cell: (m) => <RoleBadge role={m.role} />, sortValue: (m) => m.role },
    { key: 'status', header: 'Access', cell: statusCell, sortValue: (m) => m.status },
    {
      key: 'since',
      header: 'Joined or invited',
      cell: (m) => <span className="text-ink-muted">{formatDate(m.activatedAt ?? m.createdAt)}</span>,
      sortValue: (m) => m.activatedAt ?? m.createdAt,
      priority: 'low',
    },
    {
      key: 'seen',
      header: 'Last sign-in',
      cell: (m) => <span className="text-ink-muted">{m.lastSignInAt ? formatRelative(m.lastSignInAt) : 'Never'}</span>,
      sortValue: (m) => m.lastSignInAt ?? '',
      priority: 'low',
    },
    { key: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: actionCell },
  ]

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:px-6">
        <SearchInput value={q} onChange={(v) => set('q', v)} label="Search members" placeholder="Name or email" className="sm:max-w-xs sm:flex-1" />
        <FormField label="Role" className="sm:w-40">
          <Select value={role} onChange={(e) => set('role', e.target.value)}>
            <option value="">All roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="team">Team</option>
          </Select>
        </FormField>
        <FormField label="Status" className="sm:w-44">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </Select>
        </FormField>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.id}
        caption="Platform members"
        noun="members"
        pageSize={25}
        initialSort={{ key: 'since', dir: 'asc' }}
        mobileRow={(m) => (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-2">
              {name(m)}
              <div className="flex flex-wrap items-center gap-1.5">
                <RoleBadge role={m.role} />
                {statusCell(m)}
              </div>
            </div>
            {actionCell(m)}
          </div>
        )}
        empty={
          members.length === 0 ? (
            <EmptyState icon={Users} title="No team members yet" body="Invite someone to help run the platform." action={<button type="button" className="text-sm font-medium text-accent-ink hover:underline" onClick={onInvite}>Invite member</button>} />
          ) : (
            <EmptyState icon={Users} title="No members match" body="Try another name, role or status." />
          )
        }
      />
    </>
  )
}
