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
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { AccessHistory } from './AccessHistory'
import { InvitationPanel } from './InvitationPanel'
import { InvitationsTable } from './InvitationsTable'
import { InviteMemberDialog } from './InviteMemberDialog'
import { MembersTable } from './MembersTable'

type Tab = 'members' | 'invitations' | 'history'
const TABS: Tab[] = ['members', 'invitations', 'history']

export default function TeamPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'members'
  const members = useServiceQuery(() => service.listMembers(), [])
  const list = useMemo(() => members.data ?? [], [members.data])
  const inviteFor = list.find((m) => m.id === params.get('invite')) ?? null

  const counts = useMemo(
    () => ({
      active: list.filter((m) => m.status === 'active').length,
      pending: list.filter((m) => m.status === 'invited').length,
      admins: list.filter((m) => m.role === 'admin').length,
      team: list.filter((m) => m.role === 'team').length,
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
        title="Team & Access"
        description="Who can use the platform console, and what each role can do."
        actions={
          <>
            <ButtonLink to="/admin/team/permissions" icon={<KeyRound className="size-4" aria-hidden />}>
              Role permissions
            </ButtonLink>
            <Button variant="primary" icon={<MailPlus className="size-4" aria-hidden />} onClick={startInvite}>
              Invite member
            </Button>
          </>
        }
      />

      <StatGroup
        className="mb-6"
        loading={members.status === 'loading' && !members.data}
        stats={[
          { label: 'Active members', value: counts.active, hint: 'Owner included' },
          { label: 'Pending invitations', value: counts.pending },
          { label: 'Admins', value: counts.admins },
          { label: 'Team', value: counts.team },
        ]}
        footer={isDemoMode ? <SampleDataTag /> : undefined}
      />

      <Tabs
        className="mb-4"
        variant="pill"
        label="Team sections"
        value={tab}
        onChange={(v) => setParam('tab', v === 'members' ? null : v)}
        tabs={[
          { value: 'members', label: 'Members', badge: members.data ? list.length : undefined },
          { value: 'invitations', label: 'Invitations', badge: members.data ? counts.pending : undefined },
          { value: 'history', label: (<span className="inline-flex items-center gap-1.5"><History className="size-3.5" aria-hidden />Access history</span>) },
        ]}
      />

      <Card>
        {tab === 'history' ? (
          <AccessHistory />
        ) : members.status === 'loading' && !members.data ? (
          <SkeletonRows rows={5} />
        ) : members.status === 'error' ? (
          <ErrorState message={`Could not load the team. ${members.error.message}`} onRetry={members.refetch} className="m-6" />
        ) : tab === 'invitations' ? (
          <InvitationsTable members={list} onOpen={openInvite} />
        ) : (
          <MembersTable members={list} onInvite={startInvite} onOpenInvite={openInvite} />
        )}
      </Card>

      <InvitationPanel member={inviteFor} onClose={() => setParam('invite', null)} />
      <InviteMemberDialog open={params.get('new') === '1'} onClose={() => setParam('new', null)} onInvited={() => members.refetch()} />
    </>
  )
}
