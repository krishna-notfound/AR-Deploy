// Platform team roles (ADR-0029) and link invitations (ADR-0030): shared by the team edge functions.
// Web-standard APIs only, so it runs in Edge Functions and under Vitest.
import { sha256Hex } from './http.ts'

/** The 15 permission keys; the same list as the platform_role_permissions check constraint. */
export const PERMISSIONS = [
  'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
  'applications.view', 'applications.approve', 'applications.reject',
  'products.view', 'products.edit', 'products.publish', 'products.delete',
  'analytics.view', 'records.view', 'access.view',
] as const

export type MemberRole = 'admin' | 'team'

/**
 * The dashboard label of each permission, mirrored from src/features/team/permissions.ts (team.test.ts checks they are
 * equal). The invitation email lists the role's permissions at send time with these labels (R-W6-5).
 */
export const PERMISSION_LABELS: Record<string, string> = {
  'businesses.view': 'View businesses',
  'businesses.edit': 'Create and edit businesses',
  'businesses.status': 'Activate or deactivate businesses',
  'businesses.delete': 'Delete businesses',
  'owners.manage': 'Invite and remove business owners',
  'applications.view': 'View applications',
  'applications.approve': 'Approve applications',
  'applications.reject': 'Reject applications',
  'products.view': 'View products and catalogues',
  'products.edit': 'Create and edit products',
  'products.publish': 'Publish and unpublish',
  'products.delete': 'Delete products',
  'analytics.view': 'View analytics',
  'records.view': 'View the audit log and email log',
  'access.view': 'View access history',
}

/** The labels of a role's permissions, in the dashboard order; unknown keys are left out. */
export const permissionBullets = (permissions: readonly string[]): string[] =>
  PERMISSIONS.filter((p) => permissions.includes(p)).map((p) => PERMISSION_LABELS[p]!)

/**
 * Staff passwords (R-W1-7): at least 12 characters, as for every account (src/services PASSWORD_MIN), and at most 72
 * because Supabase Auth (bcrypt) hashes only the first 72 bytes.
 */
export const STAFF_PASSWORD_MIN = 12
export const STAFF_PASSWORD_MAX = 72

/** 32 random bytes, base64url without padding (43 characters). Only its hash is ever stored. */
export function newInviteSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const hashSecret = (secret: string) => sha256Hex(secret)

/** A link secret as newInviteSecret makes it; anything else is refused before reaching the database. */
export const looksLikeSecret = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)
