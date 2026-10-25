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

/** Plain bullets for the invitation email: what the role is for, not the exact permission list. */
export const ROLE_SUMMARY: Record<MemberRole, string[]> = {
  admin: [
    'Review and approve business applications',
    'Manage businesses and their owners',
    'Create, publish and manage products',
    'View analytics and records',
  ],
  team: ['View businesses and applications', 'Create and edit products', 'View analytics'],
}

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
