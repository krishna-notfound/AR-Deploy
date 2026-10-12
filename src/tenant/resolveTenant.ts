// Hostname-based tenant resolution, ready for real business subdomains.
// Local development uses path mode (/catalog/:businessSlug).

export type Tenant = { mode: 'hostname'; slug: string } | { mode: 'path' }

const RESERVED = new Set(['www', 'admin', 'app', 'api'])

export function resolveTenant(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  rootDomain: string | undefined = import.meta.env.VITE_ROOT_DOMAIN,
): Tenant {
  if (!rootDomain) return { mode: 'path' }
  const host = hostname.toLowerCase()
  const root = rootDomain.toLowerCase()
  if (!host.endsWith(`.${root}`)) return { mode: 'path' }
  const sub = host.slice(0, -(root.length + 1))
  if (!sub || sub.includes('.') || RESERVED.has(sub)) return { mode: 'path' }
  return { mode: 'hostname', slug: sub }
}
