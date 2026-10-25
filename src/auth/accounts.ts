import type { Business, User } from '@/domain/types'

/** Mock accounts for the demo. There are no passwords and no real sign-in. */
export const SUPER_ADMIN: User = {
  id: 'usr_platform',
  name: 'Platform Admin',
  email: 'admin@platform.example',
  role: 'super_admin',
}

/** Demo platform staff (ADR-0029): the same people as the sample team on Team & Access. */
export const DEMO_PLATFORM_USERS: Record<'admin' | 'team', User> = {
  admin: { id: 'usr_mem_ana', name: 'Ana Ribeiro', email: 'ana.ribeiro@sanctus.example', role: 'super_admin' },
  team: { id: 'usr_mem_joao', name: 'João Costa', email: 'joao.costa@sanctus.example', role: 'super_admin' },
}

export function businessAdminFor(b: Business): User {
  return {
    id: `usr_${b.id}`,
    name: `${b.name} owner`,
    email: b.contact.email ?? `owner@${b.slug}.example`,
    role: 'business_admin',
    businessId: b.id,
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
