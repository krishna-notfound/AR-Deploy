// Team & Access (ADR-0029): who can use the platform console, their invitations and the access history.
// Owner only (route guard). Every change is enforced and recorded by the database.
import { History, KeyRound, MailPlus } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SampleDataTag } from '@/components/ui/Badge'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatGroup } from '@/components/ui/StatGroup'
import { ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import type { PlatformMember } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { errorText } from '@/i18n/errorText'
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { AccessHistory } from './AccessHistory'
import { InvitationPanel } from './InvitationPanel'
import { InvitationsTable } from './InvitationsTable'
import { InviteMemberDialog } from './InviteMemberDialog'
import { MembersTable } from './MembersTable'

type Tab = 'members' | 'invitations' | 'history'
const TABS: Tab[] = ['members', 'invitations', 'history']

/** An invitation link that can still be used: sent or pending, and not past its expiry. */
const liveLink = (m: PlatformMember) =>
  !!m.invite && (m.invite.status === 'sent' || m.invite.status === 'pending') && Date.parse(m.invite.expiresAt) > Date.now()

export default function TeamPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'members'
  const members = useServiceQuery(() => service.listMembers(), [])
  const list = useMemo(() => members.data ?? [], [members.data])
  const inviteFor = list.find((m) => m.id === params.get('invite')) ?? null

  const counts = useMemo(
    () => ({
      active: list.filter((m) => m.status === 'active').length,
      invited: list.filter((m) => m.status === 'invited').length,
      // R-W6-9: only links that can still be used (sent or pending, not past their expiry).
      pending: list.filter((m) => m.status === 'invited' && liveLink(m)).length,
      admins: list.filter((m) => m.role === 'admin' && m.status === 'active').length,
      team: list.filter((m) => m.role === 'team' && m.status === 'active').length,
    }),
    [list],
  )

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (value) n.set(key, value)
        else n.delete(key)
        return n
      },
      { replace: key !== 'tab' },
    )
  const openInvite = (m: PlatformMember) => setParam('invite', m.id)
  const startInvite = () => setParam('new', '1')

  return (
    <>
      <PageHeader
        title={t('nav.team')}
        description={t('team.page.description')}
        actions={
          <>
            <ButtonLink to="/admin/team/permissions" icon={<KeyRound className="size-4" aria-hidden />}>
              {t('team.page.rolePermissions')}
            </ButtonLink>
            <Button variant="primary" icon={<MailPlus className="size-4" aria-hidden />} onClick={startInvite}>
              {t('team.page.invite')}
            </Button>
          </>
        }
      />

      <StatGroup
        className="mb-6"
        loading={members.status === 'loading' && !members.data}
        stats={[
          { label: t('team.page.stat.active'), value: counts.active, hint: t('team.page.stat.activeHint') },
          { label: t('team.page.stat.pending'), value: counts.pending },
          { label: t('team.page.stat.admins'), value: counts.admins },
          { label: t('team.page.stat.team'), value: counts.team },
        ]}
        footer={isDemoMode ? <SampleDataTag /> : undefined}
      />

      <Tabs
        className="mb-4"
        variant="pill"
        label={t('team.page.tabs')}
        value={tab}
        onChange={(v) => setParam('tab', v === 'members' ? null : v)}
        tabs={[
          { value: 'members', label: t('team.page.tab.members'), badge: members.data ? list.length : undefined },
          { value: 'invitations', label: t('team.page.tab.invitations'), badge: members.data ? counts.invited : undefined },
          { value: 'history', label: (<span className="inline-flex items-center gap-1.5"><History className="size-3.5" aria-hidden />{t('team.page.tab.history')}</span>) },
        ]}
      />

      <Card>
        {tab === 'history' ? (
          <AccessHistory />
        ) : members.status === 'loading' && !members.data ? (
          <SkeletonRows rows={5} />
        ) : members.status === 'error' ? (
          <ErrorState message={`${t('team.page.loadFailed')} ${errorText(members.error, t)}`} onRetry={members.refetch} className="m-6" />
        ) : tab === 'invitations' ? (
          <InvitationsTable members={list} onOpen={openInvite} />
        ) : (
          <MembersTable members={list} onInvite={startInvite} onOpenInvite={openInvite} />
        )}
      </Card>

      <InvitationPanel member={inviteFor} onClose={() => setParam('invite', null)} />
      <InviteMemberDialog open={params.get('new') === '1'} onClose={() => setParam('new', null)} onInvited={() => members.refetch()} members={list} />
    </>
  )
}
