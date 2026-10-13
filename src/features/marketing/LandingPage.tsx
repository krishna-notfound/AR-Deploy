import { Box, Info, Move3d, Ruler, ScanLine, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { ModelViewer } from '@/components/three/ModelViewer'
import { ButtonLink } from '@/components/ui/Button'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { formatMoney } from '@/lib/format'
import { primaryImage } from '@/lib/product'
import { absoluteLocalUrl, productLocalPath } from '@/lib/urls'
import { useQrCode } from '@/lib/useQrCode'
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { DemoAccounts } from '../demo/DemoAccounts'
import { SiteFooter, SiteHeader } from './SiteChrome'

// Marketing assets: a Khronos sample model (CC BY 4.0) with a poster rendered from it, and Unsplash photos.
const HERO_MODEL = {
  name: 'Glam Velvet Sofa',
  glb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb',
  poster: '/images/models/glam-velvet-sofa.webp',
}
const unsplash = (id: string, w: number) => `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`
const PHOTOS = {
  emptyCorner: unsplash('photo-1586023492125-27b2c045efd7', 1400),
  orangeChairRoom: unsplash('photo-1618220179428-22790b461013', 1100),
}

type Showcase = { product: Product; business: Business }

export default function LandingPage() {
  useDocumentTitle('3D furniture catalogs with AR')
  const [params] = useSearchParams()
  const showcase = useShowcase()
  // Old links sent people to "/?next=…" for the account picker, which now lives at /demo.
  if (params.has('next')) return <Navigate to={`/demo?${params.toString()}`} replace />
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader />
      <main>
        <Hero showcase={showcase} />
        <Experience />
        <HowItWorks />
        <ShowcaseSection showcase={showcase} />
        <BusinessValue />
        <Features />
        <TryOnPhone showcase={showcase} />
        <section id="demo" className="scroll-mt-20 border-t border-line" aria-labelledby="demo-title">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:py-28">
            <div>
              <h2 id="demo-title" className="text-headline font-light">
                Open the platform and look around.
              </h2>
              <p className="mt-5 max-w-md text-lead text-ink-muted">
                {isDemoMode
                  ? 'Every screen works with sample businesses and products. Edit, publish and print QR codes; changes stay in this browser.'
                  : 'Sign in to manage catalogs, or open a public catalog as a customer would.'}
              </p>
            </div>
            <DemoAccounts headingLevel="h3" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function useShowcase() {
  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const items = useMemo<Showcase[]>(() => {
    const active = new Map((catalogs.data ?? []).filter((c) => c.business.status === 'active').map((c) => [c.business.id, c.business]))
    return (products.data ?? [])
      .filter((p) => active.has(p.businessId) && primaryImage(p))
      .map((p) => ({ product: p, business: active.get(p.businessId)! }))
      .sort((a, b) => Number(!!b.product.models.glb) - Number(!!a.product.models.glb) || a.product.name.en.localeCompare(b.product.name.en))
  }, [products.data, catalogs.data])
  const error = products.status === 'error' ? products.error : catalogs.status === 'error' ? catalogs.error : null
  const loading = !error && (products.status === 'loading' || catalogs.status === 'loading') && !products.data
  const retry = () => {
    products.refetch()
    catalogs.refetch()
  }
  return { items, error, loading, retry }
}

type ShowcaseData = ReturnType<typeof useShowcase>

function Hero({ showcase: { items } }: { showcase: ShowcaseData }) {
  const [dims, setDims] = useState<{ x: number; y: number; z: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const heroProduct = items.find((i) => i.product.models.glb?.url === HERO_MODEL.glb)
  const cm = (m: number) => Math.round(m * 100)

  return (
    <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pt-12 pb-16 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:pt-20 lg:pb-24">
      <div className="lg:col-span-6">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="size-2 rounded-full bg-accent-bright" aria-hidden />
          3D catalogs and AR for furniture businesses
        </p>
        <h1 className="mt-6 text-display font-light">Let customers place the sofa before they buy it.</h1>
        <p className="mt-6 max-w-md text-lead text-ink-muted">
          Each store gets a catalog of true-to-size 3D products. Customers turn them on any screen, then tap <em className="not-italic text-ink">View in my home</em> to see them in
          their own room.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink to="/demo" variant="primary" size="lg" className="rounded-full px-6">
            Open the demo
          </ButtonLink>
          <ButtonLink to={heroProduct ? productLocalPath(heroProduct.business, heroProduct.product) : '/#showcase'} size="lg" className="rounded-full px-6">
            {heroProduct ? 'See a product page' : 'Browse the showcase'}
          </ButtonLink>
        </div>
      </div>

      <figure className="lg:col-span-6">
        <div className="relative aspect-[6/5] overflow-hidden rounded-[var(--radius-stage)] bg-[radial-gradient(120%_90%_at_50%_30%,#ffffff_0%,#efeee9_70%)]">
          {failed ? (
            <img src={HERO_MODEL.poster} alt={`${HERO_MODEL.name}, rendered from its 3D model`} className="size-full object-contain p-10" />
          ) : (
            <ModelViewer
              src={HERO_MODEL.glb}
              poster={HERO_MODEL.poster}
              alt={`${HERO_MODEL.name} 3D model. Drag to rotate.`}
              autoRotate
              className="size-full"
              onLoad={(info) => setDims(info.dimensions)}
              onError={() => setFailed(true)}
            />
          )}
          <span className="pointer-events-none absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-xs text-ink shadow-[var(--shadow-card)]">
            <Move3d className="size-3.5" aria-hidden /> {failed ? 'Photo of the 3D model' : 'Live 3D model, drag to turn'}
          </span>
        </div>
        <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-ink-muted">
          <span>{HERO_MODEL.name}</span>
          <span className="inline-flex items-center gap-1.5">
            <Ruler className="size-3.5 text-accent" aria-hidden />
            {dims ? `Measured from the model: ${cm(dims.x)} × ${cm(dims.y)} × ${cm(dims.z)} cm (W × H × D)` : 'Measuring the model…'}
          </span>
        </figcaption>
      </figure>
    </section>
  )
}

const FACTS = [
  {
    icon: Ruler,
    title: 'True to size',
    body: 'Each model is measured in the browser and compared with the width, height and depth you enter. When they disagree, the product page says the AR scale is unverified instead of guessing.',
  },
  {
    icon: Smartphone,
    title: 'No app to install',
    body: 'AR opens straight from the product page: Quick Look on iPhone and iPad, Google Scene Viewer on Android.',
  },
  {
    icon: Box,
    title: 'Still useful without AR',
    body: 'On a laptop, or a phone without AR, customers get the 3D view, photos, a measured drawing and a QR code to continue on their phone.',
  },
]

function Experience() {
  return (
    <section id="experience" className="scroll-mt-16 border-t border-line" aria-labelledby="exp-title">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-7">
          <img
            src={PHOTOS.emptyCorner}
            alt="A living room corner with a yellow armchair, floor lamp and open floor space"
            className="aspect-[4/3] w-full rounded-[var(--radius-stage)] bg-subtle object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex flex-col justify-center lg:col-span-5">
          <h2 id="exp-title" className="text-headline font-light">
            Turn it on screen. Then put it in the room.
          </h2>
          <p className="mt-5 text-lead text-ink-muted">The customer points their phone at the empty spot and the piece appears at its real size, so they can walk around it.</p>
          <dl className="mt-10 divide-y divide-line border-y border-line">
            {FACTS.map((f) => (
              <div key={f.title} className="grid grid-cols-[auto_1fr] gap-x-4 py-5">
                <dt className="contents">
                  <f.icon className="mt-0.5 size-5 text-accent" aria-hidden />
                  <span className="font-medium text-ink">{f.title}</span>
                </dt>
                <dd className="col-start-2 mt-1.5 text-sm leading-6 text-ink-muted">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Add the product', body: 'Photos, the GLB and USDZ files from your 3D artist, and the real dimensions. The editor checks the model’s scale before you publish.' },
  { title: 'Publish to the catalog', body: 'Each business has its own catalog address, in English and Portuguese, with its own accent colour.' },
  { title: 'Put the QR code in the showroom', body: 'The code always opens the catalog, so it keeps working as products come and go.' },
]

function HowItWorks() {
  return (
    <section className="border-t border-line bg-surface" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-24">
        <h2 id="how-title" className="max-w-xl text-headline font-light">
          From a 3D file to a customer’s living room in three steps.
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-ink pt-5">
              <span className="text-sm font-medium text-accent-ink">Step {i + 1}</span>
              <h3 className="mt-3 text-xl font-normal tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ShowcaseSection({ showcase: { items, error, loading, retry } }: { showcase: ShowcaseData }) {
  const shown = items.slice(0, 6)
  return (
    <section id="showcase" className="scroll-mt-16 border-t border-line" aria-labelledby="show-title">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="show-title" className="text-headline font-light">
              From the sample catalogs
            </h2>
            <p className="mt-3 text-ink-muted">
              {isDemoMode ? 'Real 3D models on sample products from demo businesses.' : 'Published products from the catalogs on this platform.'} Open one to try the
              product page.
            </p>
          </div>
        </div>
        {error ? (
          <ErrorState className="mt-10" message={error.message} onRetry={retry} />
        ) : loading ? (
          <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-10 border-y border-line py-10 text-center text-sm text-ink-muted">No published products yet. Publish one from the dashboard and it appears here.</p>
        ) : (
          <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(({ product, business }) => (
              <li key={product.id}>
                <Link to={productLocalPath(business, product)} className="group block">
                  <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-subtle">
                    <SmartImage
                      src={primaryImage(product)?.url}
                      alt={primaryImage(product)?.alt ?? product.name.en}
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    {product.models.glb && (
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-xs text-ink">
                        <ScanLine className="size-3.5 text-accent" aria-hidden /> 3D and AR
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-4">
                    <h3 className="text-[15px] font-medium text-ink group-hover:underline group-hover:underline-offset-4">{product.name.en}</h3>
                    <span className="shrink-0 text-sm text-ink-body">{formatMoney(product.price, product.currency)}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">{business.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function BusinessValue() {
  return (
    <section className="border-t border-line bg-surface" aria-labelledby="value-title">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-6">
          <h2 id="value-title" className="text-headline font-light">
            Answer “will it fit?” before the customer has to ask.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-ink">For the customer</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                They can check the size, colour and proportions at home, on their own time, with the room they are furnishing in front of them.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">For the store</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                The showroom floor keeps working after closing: a QR code on the price tag leads to the same piece in 3D, with your contact button next to it.
              </p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <img
            src={PHOTOS.orangeChairRoom}
            alt="An orange armchair beside a brass sideboard and plants"
            className="aspect-[4/5] w-full rounded-[var(--radius-stage)] bg-subtle object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { title: 'A catalog per business', body: 'Its own address, logo and accent colour. English and Portuguese for customers.' },
  { title: 'One product editor', body: 'Translations, photos, GLB and USDZ files, variants, dimensions and a scale check, shared by both dashboards.' },
  { title: 'QR codes for the showroom', body: 'Generated in the browser, always pointing at the catalog, downloadable as a print-ready PNG.' },
  { title: 'Views and AR taps', body: 'Per product and per business for the last 30 days, with a table view of every chart.' },
  { title: 'Two dashboards', body: 'The platform team manages every business; each business manages only its own catalog.' },
  { title: 'Honest labels', body: 'Sample data, demo addresses and unverified AR scale are always marked as such.' },
]

function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-t border-line" aria-labelledby="feat-title">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-28">
        <h2 id="feat-title" className="text-headline font-light lg:col-span-4">
          What the platform does
        </h2>
        <dl className="grid border-t border-line sm:grid-cols-2 lg:col-span-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-b border-line py-6 sm:odd:pr-8 sm:even:border-l sm:even:pl-8">
              <dt className="font-medium text-ink">{f.title}</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-muted">{f.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function TryOnPhone({ showcase: { items } }: { showcase: ShowcaseData }) {
  const target = items.find((i) => i.product.models.glb?.url === HERO_MODEL.glb) ?? items.find((i) => i.product.models.glb)
  const path = target ? productLocalPath(target.business, target.product) : null
  const url = path ? absoluteLocalUrl(path) : ''
  const qr = useQrCode(url || 'about:blank', 480)
  const isLocal = /^(localhost|127\.|\[::1\])/.test(window.location.hostname)
  if (!target || !path) return null

  return (
    <section className="border-t border-line bg-ink text-white" aria-labelledby="try-title">
      <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-20 sm:px-8 md:grid-cols-[auto_1fr] md:gap-16 lg:py-24">
        <div className="hidden w-56 rounded-[var(--radius-card)] bg-white p-3 md:block">
          {qr.url ? (
            <img src={qr.url} alt={`QR code for the ${target.product.name.en} product page`} className="aspect-square w-full" />
          ) : (
            <div className="aspect-square w-full animate-shimmer bg-subtle" />
          )}
        </div>
        <div>
          <h2 id="try-title" className="max-w-xl text-headline font-light text-white">
            Try it in your own room.
          </h2>
          <p className="mt-5 max-w-lg text-lead text-white/75">
            <span className="hidden md:inline">Scan the code with your phone to open the {target.product.name.en}, then tap View in my home.</span>
            <span className="md:hidden">Open the {target.product.name.en} and tap View in my home.</span> AR needs a recent iPhone, iPad or ARCore-capable Android phone.
          </p>
          <ButtonLink to={path} variant="accent" size="lg" className="mt-8 rounded-full px-6">
            Open the product page
          </ButtonLink>
          {isLocal && (
            <p className="mt-6 flex max-w-lg items-start gap-2 text-xs leading-5 text-white/60">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This demo is running on {window.location.host}, so the QR code only works on a phone that can reach this computer.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
