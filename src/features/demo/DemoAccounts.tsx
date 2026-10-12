import { ArrowUpRight, Building2, LogIn, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/Form'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

/**
 * Demo entry points: pick a mock account (no real authentication) or open a public catalog.
 * Used on /demo and in the landing page's closing section. In Supabase mode it points to real sign-in instead.
 */
export function DemoAccounts({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel
  const { signInAs, user } = useAccount()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const [businessId, setBusinessId] = useState('')

  useEffect(() => {
    if (!businessId && catalogs.data?.[0]) setBusinessId(catalogs.data[0].business.id)
  }, [catalogs.data, businessId])

  const enterAdmin = () => {
    signInAs({ role: 'super_admin' })
    navigate(next?.startsWith('/admin') ? next : '/admin')
  }
  const enterBusiness = () => {
    if (!businessId) return
    signInAs({ role: 'business_admin', businessId })
    navigate(next?.startsWith('/dashboard') ? next : '/dashboard')
  }

  return (
    <div>
      {user && isDemoMode && (
        <p className="mb-5 text-sm text-ink-muted">
          You are using the demo as <strong className="font-medium text-ink">{user.name}</strong>. Choosing another account switches it.
        </p>
      )}

      {isDemoMode ? (
        <div className="grid border-y border-line md:grid-cols-2 md:divide-x md:divide-line">
          <section className="flex flex-col py-8 md:pr-10" aria-labelledby="sa-title">
            <ShieldCheck className="size-5 text-accent" aria-hidden />
            <H id="sa-title" className="mt-4 text-lg font-medium tracking-tight">
              Super Admin
            </H>
            <p className="mt-1.5 flex-1 text-sm leading-6 text-ink-muted">
              For the platform team. Manage every business, product, catalog and QR code, and see platform-wide analytics.
            </p>
            <Button variant="primary" className="mt-6 self-start rounded-full px-5" onClick={enterAdmin}>
              Continue as Super Admin
            </Button>
          </section>

          <section className="flex flex-col border-t border-line py-8 md:border-t-0 md:pl-10" aria-labelledby="ba-title">
            <div className="flex items-start justify-between gap-3">
              <Building2 className="size-5 text-accent" aria-hidden />
              <Badge tone="warning">Scope pending confirmation</Badge>
            </div>
            <H id="ba-title" className="mt-4 text-lg font-medium tracking-tight">
              Business Admin
            </H>
            <p className="mt-1.5 text-sm leading-6 text-ink-muted">For a single furniture business. Manage its own products, catalog, QR code and analytics.</p>
            <div className="mt-5 flex flex-1 flex-col justify-end gap-3 sm:flex-row sm:items-end">
              <FormField label="Business" className="flex-1">
                {catalogs.status === 'loading' && !catalogs.data ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)} disabled={!catalogs.data?.length}>
                    {catalogs.data?.map((c) => (
                      <option key={c.business.id} value={c.business.id}>
                        {c.business.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <Button variant="primary" className="rounded-full px-5" onClick={enterBusiness} disabled={!businessId}>
                Continue
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="border-y border-line py-8">
          <LogIn className="size-5 text-accent" aria-hidden />
          <H className="mt-4 text-lg font-medium tracking-tight">Sign in to the dashboards</H>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-ink-muted">
            This build uses a real Supabase backend, so the demo account picker is turned off. Sign in with an account that a platform admin has
            linked to the platform team or to a business.
          </p>
          <ButtonLink to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} variant="primary" className="mt-6 rounded-full px-5">
            Sign in
          </ButtonLink>
        </div>
      )}

      <section className="mt-12" aria-labelledby="cat-title">
        <H id="cat-title" className="text-lg font-medium tracking-tight">
          Public catalogs
        </H>
        <p className="mt-1.5 text-sm text-ink-muted">What customers see after scanning a store’s QR code. Available in English and Portuguese.</p>
        {catalogs.status === 'error' ? (
          <ErrorState className="mt-5" message={catalogs.error.message} onRetry={catalogs.refetch} />
        ) : (
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {(catalogs.data ?? []).map((c) => (
              <li key={c.business.id}>
                <Link to={c.localPath} className="group flex items-center gap-4 py-4 hover:bg-surface sm:px-3">
                  <SmartImage src={c.business.logoUrl} alt="" className="size-10 rounded-[var(--radius-control)] object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.business.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {c.publishedProductCount} published {c.publishedProductCount === 1 ? 'product' : 'products'}
                    </span>
                  </span>
                  {c.business.status !== 'active' && <BusinessStatusBadge status={c.business.status} />}
                  <ArrowUpRight className="size-4 text-ink-faint transition-colors group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
            {catalogs.status === 'success' && catalogs.data.length === 0 && <li className="py-6 text-sm text-ink-muted">No catalogs yet.</li>}
            {catalogs.status === 'loading' && !catalogs.data && (
              <li className="space-y-3 py-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}
