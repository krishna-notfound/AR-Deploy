// Supabase implementation of the platform team methods (ADR-0029, ADR-0030).
// Reads and Owner-only changes go through the admin_* database functions, which answer {"error": "<reason>"} rather
// than raising (so refused calls stay in the audit log). Invitations, member changes that end sessions, and the
// /join page go through the invite-member, manage-member and accept-member-invite Edge Functions.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccessAction, AccessEvent, InviteInspection, InviteOutcome, MemberInvite, PlatformAccess, PlatformMember, RolePermissions } from '@/domain/types'
import { type CatalogService, type Result, fail, ok, teamFail } from '../catalogService'

type TeamMethods = Pick<
  CatalogService,
  | 'getMyAccess' | 'listMembers' | 'getMember' | 'listMemberInvites' | 'inviteMember' | 'resendMemberInvite' | 'revokeMemberInvite'
  | 'setMemberRole' | 'deactivateMember' | 'reactivateMember' | 'getRolePermissions' | 'setRolePermissions' | 'getAccessEvents'
  | 'inspectInvite' | 'acceptInviteCreate' | 'acceptInviteExisting'
>

type Answer = Record<string, unknown> & { error?: string }

const UNREACHABLE = () => fail<never>('UNKNOWN', 'The request could not be completed. Try again in a moment.')

/** Reads `{ error, message? }` from a non-2xx Edge Function response (supabase-js FunctionsHttpError). */
async function functionError(error: unknown): Promise<Result<never>> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx instanceof Response) {
    const body = (await ctx.json().catch(() => null)) as { error?: unknown; message?: unknown } | null
    if (typeof body?.error === 'string') return teamFail(body.error, typeof body.message === 'string' ? body.message : undefined)
  }
  return UNREACHABLE()
}

const ACTION_OF: Record<string, AccessAction> = {
  access_invite_created: 'invite_created',
  access_invite_email_sent: 'invite_email_sent',
  access_invite_email_failed: 'invite_email_failed',
  access_invite_accepted: 'invite_accepted',
  access_invite_revoked: 'invite_revoked',
  access_invite_expired_attempt: 'invite_expired_attempt',
  access_role_changed: 'role_changed',
  access_permissions_changed: 'permissions_changed',
  access_member_deactivated: 'member_deactivated',
  access_member_reactivated: 'member_reactivated',
  access_denied: 'denied',
}
const TYPE_OF = Object.fromEntries(Object.entries(ACTION_OF).map(([k, v]) => [v, k])) as Record<AccessAction, string>

const ROLE = (r: unknown) => (r === 'admin' ? 'Admin' : r === 'team' ? 'Team' : String(r ?? ''))

function details(action: AccessAction, m: Record<string, unknown>, to?: string | null): string {
  switch (action) {
    case 'invite_created':
      return `Invited as ${ROLE(m.role ?? to)}`
    case 'invite_email_sent':
      return 'Invitation email accepted by the provider'
    case 'invite_email_failed':
      return `Invitation email failed${m.reason ? `: ${String(m.reason)}` : ''}`
    case 'invite_accepted':
      return `Joined as ${ROLE(m.role ?? to)}`
    case 'invite_revoked':
      return 'Invitation revoked'
    case 'invite_expired_attempt':
      return 'Tried an expired invitation'
    case 'role_changed':
      return `Role changed to ${ROLE(to)}`
    case 'permissions_changed': {
      const added = Array.isArray(m.added) ? m.added.map((p) => `+${String(p)}`) : []
      const removed = Array.isArray(m.removed) ? m.removed.map((p) => `-${String(p)}`) : []
      return `${ROLE(m.role)}: ${[...added, ...removed].join(', ')}`
    }
    case 'member_deactivated':
      return 'Deactivated and signed out'
    case 'member_reactivated':
      return 'Reactivated'
    case 'denied':
      return `Refused: ${String(m.action ?? 'unknown action').replace(/_/g, ' ')}`
  }
}

export function createSupabaseTeam(sb: SupabaseClient): TeamMethods {
  /** Calls a database function that answers { ok: true, ... } or { error }. */
  async function call(fn: string, args?: Record<string, unknown>): Promise<Result<Answer>> {
    try {
      const { data, error } = await sb.rpc(fn, args)
      if (error) return teamFail(error.code === '42501' ? 'forbidden' : 'unknown')
      const a = (data ?? {}) as Answer
      return a.error ? teamFail(a.error) : ok(a)
    } catch {
      return UNREACHABLE()
    }
  }

  async function invoke<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await sb.functions.invoke(name, { body })
      if (error) return functionError(error)
      return ok(data as T)
    } catch {
      return UNREACHABLE()
    }
  }

  const done = (r: Result<unknown>): Result<void> => (r.ok ? ok(undefined) : r)

  return {
    async getMyAccess() {
      try {
        const { data, error } = await sb.rpc('my_platform_access')
        return error ? teamFail('unknown') : ok((data ?? null) as PlatformAccess | null)
      } catch {
        return UNREACHABLE()
      }
    },

    listMembers: async () => {
      const r = await call('admin_list_members')
      return r.ok ? ok((r.data.members ?? []) as PlatformMember[]) : r
    },
    getMember: async (id) => {
      const r = await call('admin_get_member', { p_member: id })
      return r.ok ? ok(r.data.member as PlatformMember) : r
    },
    listMemberInvites: async (id) => {
      const r = await call('admin_list_member_invites', { p_member: id })
      return r.ok ? ok((r.data.invites ?? []) as MemberInvite[]) : r
    },

    inviteMember: ({ email, role, note }) => invoke<InviteOutcome>('invite-member', { action: 'invite', email, role, ...(note ? { note } : {}) }),
    resendMemberInvite: (id) => invoke<InviteOutcome>('invite-member', { action: 'resend', memberId: id }),
    revokeMemberInvite: async (id) => done(await invoke('manage-member', { action: 'revoke_invite', memberId: id })),
    setMemberRole: async (id, role) => done(await invoke('manage-member', { action: 'set_role', memberId: id, role })),
    deactivateMember: async (id) => done(await invoke('manage-member', { action: 'deactivate', memberId: id })),
    reactivateMember: async (id) => done(await invoke('manage-member', { action: 'reactivate', memberId: id })),

    async getRolePermissions() {
      try {
        const { data, error } = await sb.from('platform_role_permissions').select('role, permission')
        if (error) return teamFail(error.code === '42501' ? 'forbidden' : 'unknown')
        const out: RolePermissions = { admin: [], team: [] }
        for (const r of (data ?? []) as { role: 'admin' | 'team'; permission: RolePermissions['admin'][number] }[]) out[r.role].push(r.permission)
        return ok(out)
      } catch {
        return UNREACHABLE()
      }
    },
    setRolePermissions: async (role, permissions) => done(await call('admin_set_role_permissions', { p_role: role, p_permissions: permissions })),

    async getAccessEvents(query = {}) {
      try {
        const size = query.pageSize ?? 20
        const page = query.page ?? 1
        let q = sb
          .from('audit_events')
          .select('id, created_at, event_type, actor_id, from_status, to_status, metadata', { count: 'exact' })
          .like('event_type', 'access%')
          .order('created_at', { ascending: false })
          .range((page - 1) * size, page * size - 1)
        if (query.action) q = q.eq('event_type', TYPE_OF[query.action])
        if (query.outcome === 'denied') q = q.eq('event_type', 'access_denied')
        if (query.outcome === 'ok') q = q.neq('event_type', 'access_denied')
        if (query.from) q = q.gte('created_at', `${query.from}T00:00:00`)
        if (query.to) q = q.lte('created_at', `${query.to}T23:59:59.999`)
        if (query.q?.trim()) q = q.ilike('metadata->>email', `%${query.q.trim().replace(/[%_]/g, '')}%`)
        const { data, count, error } = await q
        if (error) return teamFail(error.code === '42501' ? 'forbidden' : 'unknown')
        type Row = { id: string; created_at: string; event_type: string; actor_id: string | null; from_status: string | null; to_status: string | null; metadata: Record<string, unknown> }
        const rows = (data ?? []) as Row[]
        const ids = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))]
        const emails = new Map<string, string>()
        if (ids.length) {
          const e = await sb.rpc('admin_user_emails', { p_ids: ids })
          for (const u of (e.data ?? []) as { id: string; email: string }[]) emails.set(u.id, u.email)
        }
        const items: AccessEvent[] = rows.map((r) => {
          const action = ACTION_OF[r.event_type] ?? 'denied'
          return {
            id: r.id,
            at: r.created_at,
            actor: r.actor_id ? (emails.get(r.actor_id) ?? null) : null,
            member: typeof r.metadata.email === 'string' ? r.metadata.email : null,
            action,
            ...(r.from_status ? { fromRole: r.from_status } : {}),
            ...(r.to_status ? { toRole: r.to_status } : {}),
            outcome: action === 'denied' ? 'denied' : 'ok',
            details: details(action, r.metadata, r.to_status),
          }
        })
        return ok({ items, total: count ?? items.length })
      } catch {
        return UNREACHABLE()
      }
    },

    inspectInvite: (token) => invoke<InviteInspection>('accept-member-invite', { action: 'inspect', token }),
    acceptInviteCreate: ({ token, fullName, password }) => invoke<{ email: string }>('accept-member-invite', { action: 'create', token, fullName, password }),
    acceptInviteExisting: async (token) => done(await invoke('accept-member-invite', { action: 'accept', token })),
  }
}
