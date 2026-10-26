// Demo implementation of the platform team methods (ADR-0029). The demo account picker is not authentication: the
// "current role" is whatever was picked on /demo. Rules mirror the database so the demo behaves like the real thing.
// No email is ever sent in demo mode; an invitation is recorded as sent with the sample label on the page.
import { ALL_PERMISSIONS, isPermission } from '@/domain/permissions'
import type { AccessAction, AccessEvent, InviteInspection, InviteOutcome, MemberInvite, PlatformAccess, PlatformMember, PlatformRole } from '@/domain/types'
import { newId } from '@/lib/id'
import { PASSWORD_MIN } from '../accountService'
import { type CatalogService, type Result, ok, teamFail } from '../catalogService'
import type { Db } from './db'
import { type DemoTeam, DEMO_OWNER_EMAIL, createDemoTeam } from './teamSeed'
// Circular with mockAccount (it reads demoPlatformRole): both use the other only inside functions, never at load.
import { mockAccountService } from './mockAccount'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIVE = new Set(['pending', 'sent', 'email_failed'])

type TeamMethods = Pick<
  CatalogService,
  | 'getMyAccess' | 'listMembers' | 'getMember' | 'listMemberInvites' | 'inviteMember' | 'resendMemberInvite' | 'revokeMemberInvite'
  | 'setMemberRole' | 'deactivateMember' | 'reactivateMember' | 'getRolePermissions' | 'setRolePermissions' | 'getAccessEvents'
  | 'inspectInvite' | 'acceptInviteCreate' | 'acceptInviteExisting'
>

type Run = <T>(fn: () => Result<T>) => Promise<Result<T>>

/** The role picked on /demo. A super-admin session without a platform role is the Owner (the original demo). */
export function demoPlatformRole(): PlatformRole | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    const s = raw ? (JSON.parse(raw) as { role?: unknown; platformRole?: unknown }) : null
    if (s?.role !== 'super_admin') return null
    return s.platformRole === 'admin' || s.platformRole === 'team' ? s.platformRole : 'owner'
  } catch {
    return null
  }
}

const team = (db: Db): DemoTeam => (db.team ??= createDemoTeam())
const effective = (i: MemberInvite) => (LIVE.has(i.status) && Date.parse(i.expiresAt) <= Date.now() ? 'expired' : i.status)
const nowIso = () => new Date().toISOString()
const actor = () => (demoPlatformRole() === 'owner' ? DEMO_OWNER_EMAIL : `demo ${demoPlatformRole() ?? 'visitor'}`)

function record(t: DemoTeam, e: { action: AccessAction; member?: string | null; fromRole?: string; toRole?: string; details: string; outcome?: 'ok' | 'denied' }) {
  const event: AccessEvent = { id: newId('acc'), at: nowIso(), actor: actor(), member: e.member ?? null, action: e.action, outcome: e.outcome ?? 'ok', details: e.details }
  if (e.fromRole) event.fromRole = e.fromRole
  if (e.toRole) event.toRole = e.toRole
  t.events.unshift(event)
}

/** Owner-only guard: records the refusal like the database does. */
function denied(what: string): boolean {
  if (demoPlatformRole() === 'owner') return false
  store.update((db) => record(team(db), { action: 'denied', outcome: 'denied', details: `Tried to ${what}` }))
  return true
}

function withInvite(t: DemoTeam, m: PlatformMember): PlatformMember {
  const latest = t.invites[m.id]?.[0]
  return { ...m, invite: latest ? { status: effective(latest), expiresAt: latest.expiresAt } : null }
}

/** The demo person signed in for each platform role (the same people as the sample team, auth/accounts.ts). */
const DEMO_VIEWER: Record<PlatformRole, string> = { owner: 'usr_platform', admin: 'usr_mem_ana', team: 'usr_mem_joao' }

/**
 * The profiles join, demo style: the sample team has no photos, but the signed-in demo person's row shows the name and
 * photo they set in Profile settings (kept in memory by the demo account service, so gone on reload).
 */
async function withDemoProfile(r: Result<PlatformMember[]>): Promise<Result<PlatformMember[]>> {
  if (!r.ok) return r
  const role = demoPlatformRole()
  const me = role ? DEMO_VIEWER[role] : null
  const profile = me && r.data.some((m) => m.userId === me) ? await mockAccountService.getProfile() : null
  return ok(
    r.data.map((m) =>
      m.userId === me && profile?.ok
        ? { ...m, fullName: profile.data.displayName || m.fullName, avatarUrl: profile.data.avatarUrl }
        : { ...m, avatarUrl: m.avatarUrl ?? null },
    ),
  )
}

function issueInvite(t: DemoTeam, m: PlatformMember): InviteOutcome {
  for (const i of t.invites[m.id] ?? []) if (LIVE.has(i.status)) Object.assign(i, { status: 'revoked', revokedAt: nowIso() })
  const sentAt = nowIso()
  const invite: MemberInvite = {
    id: newId('inv'), status: 'sent', createdAt: sentAt, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdBy: DEMO_OWNER_EMAIL, lastEmailAt: sentAt, lastEmailResult: 'demo: no email sent', acceptedAt: null, revokedAt: null,
  }
  ;(t.invites[m.id] ??= []).unshift(invite)
  record(t, { action: 'invite_email_sent', member: m.email, toRole: m.role, details: 'Demo: recorded as sent, no email is sent' })
  return { memberId: m.id, status: 'sent', sentAt, expiresAt: invite.expiresAt }
}

export function createMockTeam(run: Run): TeamMethods {
  return {
    getMyAccess: () =>
      run(() => {
        const role = demoPlatformRole()
        if (!role) return ok<PlatformAccess | null>(null)
        const t = store.get().team ?? createDemoTeam()
        return ok<PlatformAccess | null>({ role, permissions: role === 'owner' ? [...ALL_PERMISSIONS] : [...t.rolePermissions[role]] })
      }),

    listMembers: async () =>
      withDemoProfile(
        await run(() => {
          if (denied('open Team & Access')) return teamFail('forbidden')
          const t = team(store.get())
          return ok(t.members.map((m) => withInvite(t, m)))
        }),
      ),

    getMember: async (id) => {
      const r = await run(() => {
        if (denied('open a team member')) return teamFail('forbidden')
        const t = team(store.get())
        const m = t.members.find((x) => x.id === id)
        return m ? ok(withInvite(t, m)) : teamFail('not_found')
      })
      if (!r.ok) return r
      const joined = await withDemoProfile(ok([r.data]))
      return joined.ok ? ok(joined.data[0]!) : joined
    },

    listMemberInvites: (id) =>
      run(() => {
        if (denied('open invitation history')) return teamFail('forbidden')
        return ok((team(store.get()).invites[id] ?? []).map((i) => ({ ...i, status: effective(i) })))
      }),

    inviteMember: ({ email, role, note }) =>
      run(() => {
        if (denied('invite a member')) return teamFail('forbidden')
        const clean = email.trim().toLowerCase()
        if (!EMAIL.test(clean) || clean.length > 254) return teamFail('invalid_email')
        if (note && note.length > 500) return teamFail('note_too_long')
        if (role !== 'admin' && role !== 'team') return teamFail('invalid_role')
        const db = store.get()
        const t = team(db)
        const existing = t.members.find((m) => m.email === clean)
        if (existing?.role === 'owner') return teamFail('owner_protected')
        if (existing && !(existing.status === 'deactivated' && !existing.userId)) return teamFail('already_member')
        if (db.businesses.some((b) => b.contact.email?.toLowerCase() === clean)) return teamFail('business_owner')
        let outcome: InviteOutcome | undefined
        store.update((d) => {
          const tt = team(d)
          let m = tt.members.find((x) => x.email === clean)
          if (m) Object.assign(m, { role, status: 'invited', deactivatedAt: null, invitedBy: DEMO_OWNER_EMAIL })
          else {
            m = { id: newId('mem'), userId: null, email: clean, fullName: null, role, status: 'invited', invitedBy: DEMO_OWNER_EMAIL, createdAt: nowIso(), activatedAt: null, deactivatedAt: null, lastSignInAt: null, invite: null }
            tt.members.push(m)
          }
          record(tt, { action: 'invite_created', member: clean, toRole: role, details: `Invited as ${role === 'admin' ? 'Admin' : 'Team'}` })
          outcome = issueInvite(tt, m)
        })
        return ok(outcome!)
      }),

    resendMemberInvite: (id) =>
      run(() => {
        if (denied('resend an invitation')) return teamFail('forbidden')
        const m = team(store.get()).members.find((x) => x.id === id)
        if (!m) return teamFail('not_found')
        if (m.status !== 'invited') return teamFail('not_invited')
        let outcome: InviteOutcome | undefined
        store.update((d) => {
          outcome = issueInvite(team(d), team(d).members.find((x) => x.id === id)!)
        })
        return ok(outcome!)
      }),

    revokeMemberInvite: (id) =>
      run(() => {
        if (denied('revoke an invitation')) return teamFail('forbidden')
        const t = team(store.get())
        const m = t.members.find((x) => x.id === id)
        if (!m) return teamFail('not_found')
        if (!(t.invites[id] ?? []).some((i) => LIVE.has(i.status))) return teamFail('no_live_invite')
        store.update((d) => {
          const tt = team(d)
          for (const i of tt.invites[id] ?? []) if (LIVE.has(i.status)) Object.assign(i, { status: 'revoked', revokedAt: nowIso() })
          record(tt, { action: 'invite_revoked', member: m.email, details: 'Invitation revoked' })
        })
        return ok(undefined)
      }),

    setMemberRole: (id, role) =>
      run(() => {
        if (denied('change a role')) return teamFail('forbidden')
        const m = team(store.get()).members.find((x) => x.id === id)
        if (!m) return teamFail('not_found')
        if (m.role === 'owner') return teamFail('owner_protected')
        if (m.role === role) return ok(undefined)
        store.update((d) => {
          const mm = team(d).members.find((x) => x.id === id)!
          record(team(d), { action: 'role_changed', member: mm.email, fromRole: mm.role, toRole: role, details: `Role changed to ${role === 'admin' ? 'Admin' : 'Team'}` })
          mm.role = role
        })
        return ok(undefined)
      }),

    deactivateMember: (id) =>
      run(() => {
        if (denied('deactivate a member')) return teamFail('forbidden')
        const m = team(store.get()).members.find((x) => x.id === id)
        if (!m) return teamFail('not_found')
        if (m.role === 'owner') return teamFail('owner_protected')
        if (m.status === 'deactivated') return ok({})
        store.update((d) => {
          const tt = team(d)
          const mm = tt.members.find((x) => x.id === id)!
          for (const i of tt.invites[id] ?? []) if (LIVE.has(i.status)) Object.assign(i, { status: 'revoked', revokedAt: nowIso() })
          Object.assign(mm, { status: 'deactivated', deactivatedAt: nowIso() })
          record(tt, { action: 'member_deactivated', member: mm.email, fromRole: mm.role, details: 'Deactivated and signed out' })
        })
        return ok({})
      }),

    reactivateMember: (id) =>
      run(() => {
        if (denied('reactivate a member')) return teamFail('forbidden')
        const m = team(store.get()).members.find((x) => x.id === id)
        if (!m) return teamFail('not_found')
        if (m.status !== 'deactivated') return teamFail('not_deactivated')
        store.update((d) => {
          const mm = team(d).members.find((x) => x.id === id)!
          Object.assign(mm, { status: mm.userId ? 'active' : 'invited', deactivatedAt: null })
          record(team(d), { action: 'member_reactivated', member: mm.email, toRole: mm.role, details: mm.userId ? 'Reactivated' : 'Reactivated; needs a new invitation' })
        })
        return ok(undefined)
      }),

    getRolePermissions: () =>
      run(() => {
        const t = store.get().team ?? createDemoTeam()
        return ok({ admin: [...t.rolePermissions.admin], team: [...t.rolePermissions.team] })
      }),

    setRolePermissions: (role, permissions) =>
      run(() => {
        if (denied('change role permissions')) return teamFail('forbidden')
        if (!permissions.every(isPermission)) return teamFail('unknown_permission')
        const next = [...new Set(permissions)].sort()
        const prev = [...team(store.get()).rolePermissions[role]].sort()
        const added = next.filter((p) => !prev.includes(p))
        const removed = prev.filter((p) => !next.includes(p))
        if (!added.length && !removed.length) return ok(undefined)
        store.update((d) => {
          team(d).rolePermissions[role] = next
          record(team(d), {
            action: 'permissions_changed',
            details: `${role === 'admin' ? 'Admin' : 'Team'}: ${[...added.map((p) => `+${p}`), ...removed.map((p) => `-${p}`)].join(', ')}`,
          })
        })
        return ok(undefined)
      }),

    getAccessEvents: (query = {}) =>
      run(() => {
        const role = demoPlatformRole()
        if (role !== 'owner' && !(store.get().team ?? createDemoTeam()).rolePermissions[role as 'admin' | 'team']?.includes('access.view')) {
          return teamFail('forbidden')
        }
        const q = query.q?.trim().toLowerCase()
        const items = (store.get().team ?? createDemoTeam()).events.filter(
          (e) =>
            (!query.action || e.action === query.action) &&
            (!query.outcome || e.outcome === query.outcome) &&
            (!query.from || e.at.slice(0, 10) >= query.from) &&
            (!query.to || e.at.slice(0, 10) <= query.to) &&
            (!q || [e.actor, e.member, e.details].some((v) => v?.toLowerCase().includes(q))),
        )
        const size = query.pageSize ?? 20
        const page = query.page ?? 1
        return ok({ items: items.slice((page - 1) * size, page * size), total: items.length })
      }),

    inspectInvite: (token) =>
      run<InviteInspection>(() => {
        const t = store.get().team ?? createDemoTeam()
        const ref = t.tokens[token]
        const invite = ref && t.invites[ref.memberId]?.find((i) => i.id === ref.inviteId)
        const m = ref && t.members.find((x) => x.id === ref.memberId)
        if (!ref || !invite || !m) return ok({ state: 'invalid' })
        const st = effective(invite)
        if (st === 'accepted') return ok({ state: 'used' })
        if (st === 'revoked' || m.status !== 'invited') return ok({ state: 'revoked' })
        if (st === 'expired') return ok({ state: 'expired' })
        return ok({ state: 'valid', email: m.email, role: m.role as 'admin' | 'team', invitedBy: invite.createdBy ?? undefined, expiresAt: invite.expiresAt, accountExists: false })
      }),

    acceptInviteCreate: ({ token, fullName, password }) =>
      run(() => {
        // The same limits as accept-member-invite (R-W1-7): 12 to 72 characters.
        if (password.length < PASSWORD_MIN) return teamFail('weak_password', `Use at least ${PASSWORD_MIN} characters.`)
        if (password.length > 72) return teamFail('weak_password', 'Use at most 72 characters.')
        const t = team(store.get())
        const ref = t.tokens[token]
        const invite = ref && t.invites[ref.memberId]?.find((i) => i.id === ref.inviteId)
        const m = ref && t.members.find((x) => x.id === ref.memberId)
        if (!ref || !invite || !m) return teamFail('invite_invalid')
        const st = effective(invite)
        if (st === 'accepted') return teamFail('invite_used')
        if (st === 'revoked' || m.status !== 'invited') return teamFail('invite_revoked')
        if (st === 'expired') return teamFail('invite_expired')
        store.update((d) => {
          const tt = team(d)
          const mm = tt.members.find((x) => x.id === ref.memberId)!
          const ii = tt.invites[ref.memberId]!.find((i) => i.id === ref.inviteId)!
          Object.assign(mm, { status: 'active', userId: `usr_${mm.id}`, fullName: fullName.trim() || null, activatedAt: nowIso(), lastSignInAt: nowIso() })
          Object.assign(ii, { status: 'accepted', acceptedAt: nowIso() })
          tt.events.unshift({ id: newId('acc'), at: nowIso(), actor: mm.email, member: mm.email, action: 'invite_accepted', outcome: 'ok', toRole: mm.role, details: `Joined as ${mm.role === 'admin' ? 'Admin' : 'Team'}` })
        })
        return ok({ email: m.email })
      }),

    // Demo mode has no existing accounts to sign in with; the create path covers the demo.
    acceptInviteExisting: () => run(() => teamFail('invite_invalid')),
  }
}
