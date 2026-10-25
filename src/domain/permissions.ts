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
