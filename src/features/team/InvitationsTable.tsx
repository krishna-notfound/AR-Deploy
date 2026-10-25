// People who were invited and have not joined yet (ADR-0030), with the state of their latest link.
import { MailPlus, MoreHorizontal } from 'lucide-react'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { DropdownMenu } from '@/components/ui/Menu'
import { EmptyState } from '@/components/ui/States'
import type { PlatformMember } from '@/domain/types'
import { formatDate } from '@/lib/format'
import { InviteStatusBadge, RoleBadge } from './teamLabels'
import { useMemberActions } from './useMemberActions'

export function InvitationsTable({ members, onOpen }: { members: PlatformMember[]; onOpen: (m: PlatformMember) => void }) {
  const actions = useMemberActions()
  const rows = members.filter((m) => m.status === 'invited')
  const live = (m: PlatformMember) => !!m.invite && ['pending', 'sent', 'email_failed'].includes(m.invite.status)

  const menu = (m: PlatformMember) => (
    <DropdownMenu
      label={`Actions for ${m.email}`}
      trigger={<MoreHorizontal className="size-4" aria-hidden />}
      items={[
        { label: 'Invitation details', onSelect: () => onOpen(m) },
        { label: 'Resend invitation', onSelect: () => void actions.resend(m) },
        ...(live(m) ? [{ label: 'Revoke invitation', destructive: true, onSelect: () => void actions.revoke(m) }] : []),
      ]}
    />
  )

  const columns: Column<PlatformMember>[] = [
    {
      key: 'email',
      header: 'Invited email',
      cell: (m) => (
        <button type="button" className="block max-w-full truncate text-left text-ui-body font-medium text-ink hover:underline" title={m.email} onClick={() => onOpen(m)}>
          {m.email}
        </button>
      ),
      sortValue: (m) => m.email,
      className: 'max-w-[280px]',
    },
    { key: 'role', header: 'Role', cell: (m) => <RoleBadge role={m.role} /> },
    { key: 'status', header: 'Invitation', cell: (m) => (m.invite ? <InviteStatusBadge status={m.invite.status} /> : <span className="text-ink-muted">Not sent</span>) },
    { key: 'expires', header: 'Expires', align: 'right', cell: (m) => <span className="whitespace-nowrap text-ink-muted">{m.invite ? formatDate(m.invite.expiresAt) : '—'}</span>, sortValue: (m) => m.invite?.expiresAt ?? '' },
    { key: 'by', header: 'Invited by', cell: (m) => <span className="text-ink-muted">{m.invitedBy ?? '—'}</span>, priority: 'low' },
    { key: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: menu },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(m) => m.id}
      caption="Open invitations"
      noun="invitations"
      pageSize={25}
      mobileRow={(m) => (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="truncate text-ui-body font-medium text-ink" title={m.email}>
              {m.email}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <RoleBadge role={m.role} />
              {m.invite && <InviteStatusBadge status={m.invite.status} />}
            </div>
            <p className="text-ui-body text-ink-muted tabular-nums">
              {m.invite ? `Expires ${formatDate(m.invite.expiresAt)}` : 'Not sent'}
              {m.invitedBy ? ` · Invited by ${m.invitedBy}` : ''}
            </p>
          </div>
          {menu(m)}
        </div>
      )}
      empty={<EmptyState icon={MailPlus} title="No open invitations" body="Everyone you invited has joined, or their invitation was revoked." />}
    />
  )
}
