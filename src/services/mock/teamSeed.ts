// Sample platform team for demo mode (ADR-0029). Labelled sample data; no real accounts or emails.
import { DEFAULT_ROLE_PERMISSIONS } from '@/domain/permissions'
import type { AccessEvent, MemberInvite, PlatformMember, RolePermissions } from '@/domain/types'

export interface DemoTeam {
  members: PlatformMember[]
  invites: Record<string, MemberInvite[]>
  rolePermissions: RolePermissions
  events: DemoAccessEvent[]
  /** Demo link tokens → member id (real links only store a hash; this is demo data). */
  tokens: Record<string, { memberId: string; inviteId: string }>
}

/** A recorded access event plus the exact ids a member's history filters on (R-W6-4), as the database stores them. */
export type DemoAccessEvent = AccessEvent & { memberId?: string; actorId?: string }

export const DEMO_OWNER_EMAIL = 'admin@platform.example'
export const DEMO_INVITE_TOKEN = 'demo-invite-token'

export function createDemoTeam(now: number = Date.now()): DemoTeam {
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString()
  const member = (m: Partial<PlatformMember> & Pick<PlatformMember, 'id' | 'email' | 'role' | 'status'>): PlatformMember => ({
    userId: m.status === 'invited' ? null : `usr_${m.id}`,
    fullName: null,
    invitedBy: DEMO_OWNER_EMAIL,
    createdAt: at(-40),
    activatedAt: m.status === 'invited' ? null : at(-39),
    deactivatedAt: null,
    lastSignInAt: null,
    invite: null,
    has2fa: false,
    ...m,
  })
  const martaInvite: MemberInvite = {
    id: 'inv_marta',
    status: 'sent',
    createdAt: at(-1),
    expiresAt: at(6),
    createdBy: DEMO_OWNER_EMAIL,
    lastEmailAt: at(-1),
    lastEmailResult: 'accepted',
    acceptedAt: null,
    revokedAt: null,
  }
  const members: PlatformMember[] = [
    member({ id: 'usr_platform', userId: 'usr_platform', email: DEMO_OWNER_EMAIL, fullName: 'Platform Admin', role: 'owner', status: 'active', invitedBy: null, createdAt: at(-120), activatedAt: at(-120), lastSignInAt: at(0), has2fa: true }),
    member({ id: 'mem_ana', email: 'ana.ribeiro@sanctus.example', fullName: 'Ana Ribeiro', role: 'admin', status: 'active', lastSignInAt: at(-1), has2fa: true }),
    member({ id: 'mem_joao', email: 'joao.costa@sanctus.example', fullName: 'João Costa', role: 'team', status: 'active', createdAt: at(-20), activatedAt: at(-19), lastSignInAt: at(-3), has2fa: true }),
    member({ id: 'mem_marta', email: 'marta.lopes@sanctus.example', role: 'team', status: 'invited', createdAt: at(-1), invite: { status: 'sent', expiresAt: martaInvite.expiresAt } }),
    member({ id: 'mem_pedro', email: 'pedro.alves@sanctus.example', fullName: 'Pedro Alves', role: 'admin', status: 'deactivated', deactivatedAt: at(-5), lastSignInAt: at(-9) }),
  ]
  const ev = (id: string, days: number, e: Omit<DemoAccessEvent, 'id' | 'at' | 'outcome'> & { outcome?: AccessEvent['outcome'] }): DemoAccessEvent => ({ id, at: at(days), outcome: 'ok', ...e })
  return {
    members,
    invites: {
      mem_ana: [{ ...martaInvite, id: 'inv_ana', status: 'accepted', createdAt: at(-40), expiresAt: at(-33), acceptedAt: at(-39) }],
      mem_joao: [{ ...martaInvite, id: 'inv_joao', status: 'accepted', createdAt: at(-20), expiresAt: at(-13), acceptedAt: at(-19) }],
      mem_marta: [martaInvite],
      mem_pedro: [{ ...martaInvite, id: 'inv_pedro', status: 'accepted', createdAt: at(-40), expiresAt: at(-33), acceptedAt: at(-39) }],
    },
    rolePermissions: { admin: [...DEFAULT_ROLE_PERMISSIONS.admin], team: [...DEFAULT_ROLE_PERMISSIONS.team] },
    events: [
      ev('acc_6', -1, { memberId: 'mem_marta', actor: DEMO_OWNER_EMAIL, member: 'marta.lopes@sanctus.example', action: 'invite_email_sent', toRole: 'team', details: 'Invitation email accepted by the provider' }),
      ev('acc_5', -1, { memberId: 'mem_marta', actor: DEMO_OWNER_EMAIL, member: 'marta.lopes@sanctus.example', action: 'invite_created', toRole: 'team', details: 'Invited as Team' }),
      ev('acc_4', -2, { actorId: 'usr_mem_joao', actor: 'joao.costa@sanctus.example', member: null, action: 'denied', outcome: 'denied', details: 'Tried to open Team & Access' }),
      ev('acc_3', -5, { memberId: 'mem_pedro', actor: DEMO_OWNER_EMAIL, member: 'pedro.alves@sanctus.example', action: 'member_deactivated', fromRole: 'admin', details: 'Deactivated' }),
      ev('acc_2', -19, { memberId: 'mem_joao', actorId: 'usr_mem_joao', actor: 'joao.costa@sanctus.example', member: 'joao.costa@sanctus.example', action: 'invite_accepted', toRole: 'team', details: 'Joined as Team' }),
      ev('acc_1', -39, { memberId: 'mem_ana', actorId: 'usr_mem_ana', actor: 'ana.ribeiro@sanctus.example', member: 'ana.ribeiro@sanctus.example', action: 'invite_accepted', toRole: 'admin', details: 'Joined as Admin' }),
    ],
    tokens: { [DEMO_INVITE_TOKEN]: { memberId: 'mem_marta', inviteId: 'inv_marta' } },
  }
}
