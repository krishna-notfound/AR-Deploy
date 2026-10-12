import type { Business, User } from '@/domain/types'

/** Mock accounts for the demo. There are no passwords and no real sign-in. */
export const SUPER_ADMIN: User = {
  id: 'usr_platform',
  name: 'Platform Admin',
  email: 'admin@platform.example',
  role: 'super_admin',
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
