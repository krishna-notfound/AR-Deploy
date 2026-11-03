// The landing 3D/AR card shows a real product: the featured one, else the first published one with a model (an armchair
// first), else the labelled illustration. "3D" switches the card to the live viewer in place; "AR" and the call to action
// open the product page (AR itself runs there, ADR-0035).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business, Product } from '@/domain/types'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'

const data = vi.hoisted(() => ({ products: [] as unknown[], businesses: [] as unknown[] }))

vi.mock('@/services', () => ({
  service: {
    getProducts: async () => ({ ok: true, data: data.products }),
    getBusinesses: async () => ({ ok: true, data: data.businesses }),
    getCatalogs: async () => ({ ok: false, error: { code: 'unauthorized', message: 'staff only' } }),
    subscribe: () => () => {},
  },
}))
vi.mock('@/components/three/ModelViewer', () => ({
  ModelViewer: ({ src, onError }: { src: string; onError?: () => void }) => (
    <div data-testid="viewer" data-src={src}>
      <button type="button" onClick={onError}>
        fail
      </button>
    </div>
  ),
}))

import { LandingShowcase, type ShowcaseView, resolveShowcase, useProductShowcaseView, useShowcaseProduct } from './LandingShowcase'

// The section's wiring: the admin's view first, else the product fallback, else the illustration.
function Section({ featured, adminView }: { featured?: { businessSlug: string; productSlug: string }; adminView?: ShowcaseView }) {
  const state = useShowcaseProduct(featured)
  const fallback = useProductShowcaseView(state)
  return <LandingShowcase view={adminView ?? fallback} loading={!adminView && state.status === 'loading'} />
}

const biz = (id: string, slug: string, name: string, status: Business['status'] = 'active') => ({ id, slug, name, status }) as Business
const glb = { id: 'a', url: 'https://cdn.example/m.glb', name: 'm.glb', format: 'glb', size: 1 }
const prod = (id: string, slug: string, businessId: string, category: Product['category'], withGlb: boolean, status: Product['status'] = 'published') =>
  ({
    id,
    slug,
    businessId,
    status,
    category,
    name: { en: `Name ${slug}`, pt: `Nome ${slug}` },
    material: { en: 'Oak', pt: 'Carvalho' },
    shortDescription: { en: '' },
    description: { en: '' },
    price: 120000,
    currency: 'EUR',
    images: [{ id: 'i1', url: `https://cdn.example/${slug}.jpg`, isPrimary: true, kind: 'gallery' }],
    models: withGlb ? { glb } : {},
    dimensions: { width: 80, height: 70, depth: 60, unit: 'cm' },
    variants: [],
  }) as unknown as Product

const A = biz('b1', 'alpha', 'Alpha')
const B = biz('b2', 'beta', 'Beta')
const sofa = prod('p1', 'sofa-one', 'b1', 'sofa', true)
const chair = prod('p2', 'chair-one', 'b2', 'chair', true)
const table = prod('p3', 'table-one', 'b1', 'table', false)

function renderCard(featured?: { businessSlug: string; productSlug: string }, lang: 'en' | 'pt' = 'en', adminView?: ShowcaseView) {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <Section featured={featured} adminView={adminView} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('resolveShowcase', () => {
  it('uses the featured product when it is published and its business is active', () => {
    expect(resolveShowcase([sofa, chair], [A, B], { businessSlug: 'alpha', productSlug: 'sofa-one' })?.product.id).toBe('p1')
  })
  it('falls back to a chair with a model, then to any product with a model, when the featured one is missing', () => {
    expect(resolveShowcase([sofa, chair, table], [A, B], { businessSlug: 'alpha', productSlug: 'gone' })?.product.id).toBe('p2')
    expect(resolveShowcase([sofa, table], [A, B])?.product.id).toBe('p1')
  })
  it('skips drafts, inactive businesses and products without a model; nothing left means no product', () => {
    expect(resolveShowcase([prod('p4', 'draft', 'b1', 'chair', true, 'draft')], [A])).toBeUndefined()
    expect(resolveShowcase([chair], [biz('b2', 'beta', 'Beta', 'inactive')])).toBeUndefined()
    expect(resolveShowcase([table], [A])).toBeUndefined()
  })
})

describe('landing showcase card', () => {
  beforeEach(() => {
    localStorage.clear()
    data.products = [sofa, chair, table]
    data.businesses = [A, B]
  })

  it('shows the real product with its category, name, material, dimensions and price in euros', async () => {
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' })
    expect(await screen.findByText('Name sofa-one')).toBeInTheDocument()
    expect(screen.getByText('Sofas')).toBeInTheDocument()
    expect(screen.getByText('Oak')).toBeInTheDocument()
    expect(screen.getByText(/W 80 × H 70 × D 60 cm/)).toBeInTheDocument()
    expect(screen.getByText(/€/)).toBeInTheDocument()
    expect(screen.queryByText(/Illustrative piece/)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Name sofa-one' })).toHaveAttribute('src', 'https://cdn.example/sofa-one.jpg')
  })

  it('without a featured product shows the armchair that has a model', async () => {
    renderCard()
    expect(await screen.findByText('Name chair-one')).toBeInTheDocument()
  })

  it('switches between the image and the live 3D viewer in place, with toggle state for assistive tech', async () => {
    const user = userEvent.setup()
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' })
    const image = await screen.findByRole('button', { name: 'Image' })
    const three = screen.getByRole('button', { name: '3D' })
    expect(image).toHaveAttribute('aria-pressed', 'true')
    expect(three).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('viewer')).not.toBeInTheDocument()

    await user.click(three)
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-src', glb.url)
    expect(three).toHaveAttribute('aria-pressed', 'true')
    expect(image).toHaveAttribute('aria-pressed', 'false')

    await user.click(image)
    expect(screen.queryByTestId('viewer')).not.toBeInTheDocument()
  })

  it('reports a failed model with Try again, then mounts the viewer again', async () => {
    const user = userEvent.setup()
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' })
    await user.click(await screen.findByRole('button', { name: '3D' }))
    await user.click(screen.getByRole('button', { name: 'fail' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The 3D model could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
  })

  it('the product fallback has an AR chip button (AR runs in the card) and keeps the By line', async () => {
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' })
    expect(await screen.findByRole('button', { name: 'View in your room' })).toBeInTheDocument()
    expect(screen.getByText(/By Alpha/)).toBeInTheDocument()
  })

  it('speaks Portuguese', async () => {
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' }, 'pt')
    expect(await screen.findByText('Nome sofa-one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imagem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver na sua sala' })).toBeInTheDocument()
  })

  it('is the labelled illustration, without 3D or AR chips, when no product has a model', async () => {
    data.products = [table]
    renderCard()
    expect(await screen.findByText(/Illustrative piece/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3D' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View in your room' })).not.toBeInTheDocument()
  })
})

describe('admin showcase view', () => {
  const admin: ShowcaseView = {
    eyebrow: 'Signature',
    title: 'Admin Lounge',
    text: 'Made by hand.',
    dimensions: 'W 90 x H 80 x D 70 cm',
    materials: 'Walnut',
    priceLabel: 'EUR 1,234',
    imageUrl: 'https://cdn.example/admin.jpg',
    glbUrl: 'https://cdn.example/admin.glb',
  }
  beforeEach(() => {
    localStorage.clear()
    data.products = [sofa, chair]
    data.businesses = [A, B]
  })

  it('renders its own texts and image, not the product, and no By line', async () => {
    renderCard(undefined, 'en', admin)
    expect(await screen.findByText('Admin Lounge')).toBeInTheDocument()
    expect(screen.getByText('Made by hand.')).toBeInTheDocument()
    expect(screen.getByText('Walnut')).toBeInTheDocument()
    expect(screen.getByText('EUR 1,234')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Admin Lounge' })).toHaveAttribute('src', admin.imageUrl)
    expect(screen.queryByText('Name chair-one')).not.toBeInTheDocument()
    expect(screen.queryByText(/By /)).not.toBeInTheDocument()
  })

  it('the 3D toggle uses glbUrl and the AR chip is present with a model', async () => {
    const user = userEvent.setup()
    renderCard(undefined, 'en', admin)
    await user.click(await screen.findByRole('button', { name: '3D' }))
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-src', admin.glbUrl)
    expect(screen.getByRole('button', { name: 'View in your room' })).toBeInTheDocument()
  })

  it('with only a product link the AR chip links there; without a model there is no 3D toggle', async () => {
    renderCard(undefined, 'en', { title: 'Linked', imageUrl: admin.imageUrl, productHref: '/products/alpha/sofa-one' })
    expect(await screen.findByRole('link', { name: 'View in your room' })).toHaveAttribute('href', '/products/alpha/sofa-one')
    expect(screen.queryByRole('button', { name: '3D' })).not.toBeInTheDocument()
  })
})
