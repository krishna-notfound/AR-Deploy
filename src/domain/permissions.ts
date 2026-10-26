// Platform permission keys and the default role sets (ADR-0029). Shared by the services and the UI; the database
// holds the same keys (platform_role_permissions check constraint).
import type { Permission, RolePermissions } from './types'

export const ALL_PERMISSIONS: Permission[] = [
  'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
  'applications.view', 'applications.approve', 'applications.reject',
  'products.view', 'products.edit', 'products.publish', 'products.delete',
  'analytics.view', 'records.view', 'access.view',
]

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: [...ALL_PERMISSIONS],
  team: ['businesses.view', 'applications.view', 'products.view', 'analytics.view', 'products.edit'],
}

export const isPermission = (v: unknown): v is Permission => typeof v === 'string' && (ALL_PERMISSIONS as string[]).includes(v)

/**
 * What each permission needs to be usable (R-W3-3, spec §4 and §16): a role holding a key also holds its
 * prerequisites, transitively. The database keeps the same map in private.permission_prerequisites(), which
 * admin_set_role_permissions and the S1.5 backfill apply; a PGlite test pins the two to each other.
 */
export const PERMISSION_PREREQUISITES: Readonly<Record<Permission, readonly Permission[]>> = {
  'businesses.view': [],
  'businesses.edit': ['businesses.view'],
  'businesses.status': ['businesses.edit'],
  'businesses.delete': ['businesses.edit', 'products.delete'],
  'owners.manage': ['businesses.view'],
  'applications.view': [],
  'applications.approve': ['applications.view'],
  'applications.reject': ['applications.view'],
  'products.view': [],
  'products.edit': ['products.view'],
  'products.publish': ['products.edit'],
  'products.delete': ['products.edit'],
  'analytics.view': [],
  'records.view': [],
  'access.view': [],
}

/** `set` plus every permission it needs (transitive closure), once each, in the order of ALL_PERMISSIONS. */
export function withPrerequisites(set: readonly Permission[]): Permission[] {
  const out = new Set<Permission>()
  const add = (p: Permission) => {
    if (out.has(p)) return
    out.add(p)
    for (const r of PERMISSION_PREREQUISITES[p] ?? []) add(r)
  }
  for (const p of set) add(p)
  return ALL_PERMISSIONS.filter((p) => out.has(p))
}
