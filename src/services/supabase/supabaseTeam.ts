// Supabase implementation of the platform team methods (ADR-0029, ADR-0030). Filled in by Task 10.
import type { SupabaseClient } from '@supabase/supabase-js'
import { type CatalogService, fail } from '../catalogService'

type TeamMethods = Pick<
  CatalogService,
  | 'getMyAccess' | 'listMembers' | 'getMember' | 'listMemberInvites' | 'inviteMember' | 'resendMemberInvite' | 'revokeMemberInvite'
  | 'setMemberRole' | 'deactivateMember' | 'reactivateMember' | 'getRolePermissions' | 'setRolePermissions' | 'getAccessEvents'
  | 'inspectInvite' | 'acceptInviteCreate' | 'acceptInviteExisting'
>

export function createSupabaseTeam(_sb: SupabaseClient): TeamMethods {
  const todo = async () => fail<never>('UNSUPPORTED', 'Team management is not connected yet.')
  return {
    getMyAccess: todo, listMembers: todo, getMember: todo, listMemberInvites: todo, inviteMember: todo, resendMemberInvite: todo,
    revokeMemberInvite: todo, setMemberRole: todo, deactivateMember: todo, reactivateMember: todo, getRolePermissions: todo,
    setRolePermissions: todo, getAccessEvents: todo, inspectInvite: todo, acceptInviteCreate: todo, acceptInviteExisting: todo,
  }
}
