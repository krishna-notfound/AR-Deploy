// People who were invited and have not joined yet (ADR-0030), with the state of their latest link.
import { MailPlus, MoreHorizontal } from 'lucide-react'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { DropdownMenu } from '@/components/ui/Menu'
import { EmptyState } from '@/components/ui/States'
import type { PlatformMember } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { InviteStatusBadge, RoleBadge } from './teamLabels'
import { useMemberActions } from './useMemberActions'

export function InvitationsTable({ members, onOpen }: { members: PlatformMember[]; onOpen: (m: PlatformMember) => void }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const actions = useMemberActions()
  const rows = members.filter((m) => m.status === 'invited')
  const live = (m: PlatformMember) => !!m.invite && ['pending', 'sent', 'email_failed'].includes(m.invite.status)

  const menu = (m: PlatformMember) => (
    <DropdownMenu
      label={t('team.members.actionsFor', { who: m.email })}
      trigger={<MoreHorizontal className="size-4" aria-hidden />}
      items={[
        { label: t('team.menu.invitationDetails'), onSelect: () => onOpen(m) },
        { label: t('team.menu.resend'), onSelect: () => void actions.resend(m) },
        ...(live(m) ? [{ label: t('team.menu.revoke'), destructive: true, onSelect: () => void actions.revoke(m) }] : []),
      ]}
    />
  )

  const columns: Column<PlatformMember>[] = [
    {
      key: 'email',
      header: t('team.invitations.col.email'),
      cell: (m) => (
        <button type="button" className="block max-w-full truncate text-left text-ui-body font-medium text-ink hover:underline" title={m.email} onClick={() => onOpen(m)}>
          {m.email}
        </button>
      ),
      sortValue: (m) => m.email,
      className: 'max-w-[280px]',
    },
    { key: 'role', header: t('team.col.role'), cell: (m) => <RoleBadge role={m.role} /> },
    { key: 'status', header: t('team.invitations.col.invitation'), cell: (m) => (m.invite ? <InviteStatusBadge status={m.invite.status} /> : <span className="text-ink-muted">{t('team.invitations.notSent')}</span>) },
    { key: 'expires', header: t('team.invitations.col.expires'), align: 'right', cell: (m) => <span className="whitespace-nowrap text-ink-muted">{m.invite ? fmt.date(m.invite.expiresAt) : '—'}</span>, sortValue: (m) => m.invite?.expiresAt ?? '' },
    { key: 'by', header: t('team.invitations.col.by'), cell: (m) => <span className="text-ink-muted">{m.invitedBy ?? '—'}</span>, priority: 'low' },
    { key: 'actions', header: t('common.actions'), srOnlyHeader: true, align: 'right', cell: menu },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(m) => m.id}
      caption={t('team.invitations.caption')}
      noun={t('team.invitations.noun')}
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
              {m.invite ? t('team.invitations.expiresOn', { date: fmt.date(m.invite.expiresAt) }) : t('team.invitations.notSent')}
              {m.invitedBy ? ` · ${t('team.invitations.invitedBy', { who: m.invitedBy })}` : ''}
            </p>
          </div>
          {menu(m)}
        </div>
      )}
      empty={<EmptyState icon={MailPlus} title={t('team.invitations.empty.title')} body={t('team.invitations.empty.body')} />}
    />
  )
}
