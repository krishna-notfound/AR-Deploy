import type { ReactNode } from 'react'
import { SiteFooter, SiteHeader } from '../marketing/SiteChrome'
import { PublicShell } from '../public/PublicShell'

/** The chrome of a text page: the Sanctus header and footer on the platform domain, the catalogue chrome on a business subdomain. */
export function PageFrame({ tenant, children }: { tenant?: boolean; children: ReactNode }) {
  if (tenant) return <PublicShell>{children}</PublicShell>
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
