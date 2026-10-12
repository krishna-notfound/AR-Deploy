import { Link } from 'react-router'
import { Wordmark } from '@/components/ui/BrandMark'
import { ButtonLink } from '@/components/ui/Button'
import { isDemoMode } from '@/services'

const NAV = [
  { href: '/#experience', label: 'How it works' },
  { href: '/#showcase', label: 'Showcase' },
  { href: '/#features', label: 'Platform' },
]

/** Header for the platform's own pages (landing, demo entry, sign-in). Tenant catalogs use PublicShell. */
export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-5 sm:px-8">
        <Link to="/" aria-label="Furnish AR home">
          <Wordmark />
        </Link>
        <nav aria-label="Site" className="hidden md:block">
          <ul className="flex gap-7 text-sm text-ink-muted">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="hover:text-ink">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {cta && (
          <ButtonLink to="/demo" variant="primary" size="sm" className="ml-auto h-9 rounded-full px-4">
            Open the demo
          </ButtonLink>
        )}
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-6 text-ink-muted">3D product pages and in-room AR for furniture businesses.{isDemoMode ? ' This site is a working demo.' : ''}</p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { label: 'How it works', href: '/#experience' },
            { label: 'Showcase', href: '/#showcase' },
            { label: 'Platform', href: '/#features' },
          ]}
        />
        <FooterCol
          title="Demo"
          links={[
            { label: 'Choose a demo account', to: '/demo' },
            { label: 'Super Admin', to: '/admin' },
            { label: 'Business Admin', to: '/dashboard' },
          ]}
        />
        <div>
          <h2 className="text-[13px] font-medium text-ink">Contact</h2>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            hello@furnish.example
            <br />
            <span className="text-xs">Placeholder address. No messages are received.</span>
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1240px] px-5 py-5 text-xs leading-5 text-ink-muted sm:px-8">
          3D models: Khronos glTF Sample Assets (CC BY 4.0). Photos: Unsplash.{isDemoMode ? ' Businesses, products and figures in this demo are sample data.' : ''}
        </p>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: { label: string; to?: string; href?: string }[] }) {
  return (
    <div>
      <h2 className="text-[13px] font-medium text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-muted">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className="hover:text-ink">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} className="hover:text-ink">
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
