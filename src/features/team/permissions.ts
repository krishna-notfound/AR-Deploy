// The 16 platform permissions (ADR-0029) as the dashboards show them: labels, groups, warnings and defaults.
// The database holds the same keys (platform_role_permissions check constraint); this is the single UI source.
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@/domain/permissions'
import type { MemberRole, Permission, PlatformRole } from '@/domain/types'

export { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS }

export interface PermissionItem {
  key: Permission
  label: string
  description: string
  /** Shown next to the permission and in confirmations: the action cannot be undone. */
  warning?: string
}

export const PERMISSION_GROUPS: { title: string; items: PermissionItem[] }[] = [
  {
    title: 'Businesses & applications',
    items: [
      { key: 'businesses.view', label: 'View businesses', description: 'See every business, its owner and its catalogue, including drafts.' },
      { key: 'businesses.edit', label: 'Create and edit businesses', description: 'Add businesses and change their details, logo and catalogue address.' },
      { key: 'businesses.status', label: 'Activate or deactivate businesses', description: 'Take a catalogue live or offline. Needs "Create and edit businesses".' },
      {
        key: 'businesses.delete',
        label: 'Delete businesses',
        description: 'Remove a business for good.',
        warning: "Deletes the business, its products and media. This can't be undone.",
      },
      { key: 'owners.manage', label: 'Invite and remove business owners', description: 'Send owner invitations, resend them and remove an owner.' },
      { key: 'applications.view', label: 'View applications', description: 'Read business applications and their email history.' },
      { key: 'applications.approve', label: 'Approve applications', description: 'Start a review and approve an application, which creates a draft business.' },
      { key: 'applications.reject', label: 'Reject applications', description: 'Reject an application with a reason.' },
    ],
  },
  {
    title: 'Products & catalogues',
    items: [
      { key: 'products.view', label: 'View products and catalogues', description: 'See every product, including drafts, and the catalogue QR codes.' },
      { key: 'products.edit', label: 'Create and edit products', description: 'Add and change products, photos and 3D models.' },
      { key: 'products.publish', label: 'Publish and unpublish', description: 'Make a product visible in its public catalogue, or hide it.' },
      {
        key: 'products.delete',
        label: 'Delete products',
        description: 'Remove a product for good.',
        warning: "Deletes the product and its media. This can't be undone.",
      },
      {
        key: 'models.manage',
        label: 'Handle 3D model requests',
        description: 'See request photos, upload models, and deliver or decline requests. Also changes whether a business may upload its own 3D files.',
      },
    ],
  },
  {
    title: 'Insight & records',
    items: [
      { key: 'analytics.view', label: 'View analytics', description: 'Product views and AR launches, across the platform and per business.' },
      { key: 'records.view', label: 'View the audit log and email log', description: 'Every recorded change and every email the platform sent.' },
      { key: 'access.view', label: 'View access history', description: 'Invitations, role and permission changes, and refused attempts.' },
    ],
  },
]

export const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label]))) as Record<Permission, string>

export const ROLE_LABEL: Record<PlatformRole, string> = { owner: 'Owner', admin: 'Admin', team: 'Team' }

export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  admin: 'Runs day-to-day operations with the permissions you set.',
  team: 'Helps with assigned tasks, usually with view and edit access only.',
}
