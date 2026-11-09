// The landing 3D/AR card shows one of the admin's own showcase pieces (ADR-0047): the featured one, else the newest piece
// with a model, else the labelled illustration. "3D" switches the card to the live viewer in place; "AR" launches AR in the
// card (ADR-0035). A piece of a business is never shown.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOUSE_BUSINESS_SLUG, type ProductRef } from '@/domain/siteContent'
import type { Product } from '@/domain/types'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'

const data = vi.hoisted(() => ({ products: [] as unknown[] }))

vi.mock('@/services', () => ({
  service: {
    getShowcase: async () => ({ ok: true, data: { business: { id: 'biz_house', slug: 'sanctus-showcase', name: 'Sanctus', house: true }, products: data.products } }),
    getProducts: async () => {
      throw new Error('the landing must never read business products')
    },
    getBusinesses: async () => {
      throw new Error('the landing must never read businesses')
    },
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

import { LandingShowcase, type ShowcaseView, pickShowcasePiece, useShowcaseCardView } from './LandingShowcase'

// The section's wiring: a showcase piece, else the illustration. `override` stands for a hand-made view.
function Section({ featured, override }: { featured?: ProductRef; override?: ShowcaseView }) {
  const { view, loading } = useShowcaseCardView(featured)
  return <LandingShowcase view={override ?? view} loading={!override && loading} />
}

const glb = { id: 'a', url: 'https://cdn.example/m.glb', name: 'm.glb', format: 'glb', size: 1 }
const prod = (id: string, slug: string, category: Product['category'], withGlb: boolean, updatedAt: string, status: Product['status'] = 'published') =>
  ({
    id,
    slug,
    businessId: 'biz_house',
    status,
    category,
    updatedAt,
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

const sofa = prod('p1', 'sofa-one', 'sofa', true, '2026-01-01T00:00:00Z')
const chair = prod('p2', 'chair-one', 'chair', true, '2026-02-01T00:00:00Z') // newest with a model
const table = prod('p3', 'table-one', 'table', false, '2026-03-01T00:00:00Z') // newest, but no model
const house = (slug: string): ProductRef => ({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: slug })

function renderCard(featured?: ProductRef, lang: 'en' | 'pt' = 'en', override?: ShowcaseView) {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <Section featured={featured} override={override} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('pickShowcasePiece', () => {
  it('uses the featured piece when it is a house ref to a piece in the list', () => {
    expect(pickShowcasePiece([chair, sofa], house('sofa-one'))?.id).toBe('p1')
  })
  it('falls back to the first piece with a model (newest first) when the featured one is missing or not a house ref', () => {
    expect(pickShowcasePiece([table, chair, sofa], house('gone'))?.id).toBe('p2')
    expect(pickShowcasePiece([table, chair, sofa], { businessSlug: 'some-business', productSlug: 'sofa-one' })?.id).toBe('p2')
    expect(pickShowcasePiece([table, chair, sofa])?.id).toBe('p2')
  })
  it('no piece with a model and no featured piece means nothing (the illustration)', () => {
    expect(pickShowcasePiece([table])).toBeUndefined()
    expect(pickShowcasePiece([])).toBeUndefined()
  })
})

describe('landing showcase card', () => {
  beforeEach(() => {
    localStorage.clear()
    data.products = [sofa, chair, table]
  })

  it('shows the featured showcase piece with its category, name, material and dimensions, and no price', async () => {
    renderCard(house('sofa-one'))
    expect(await screen.findByText('Name sofa-one')).toBeInTheDocument()
    expect(screen.getByText('Sofa')).toBeInTheDocument()
    expect(screen.getByText('Oak')).toBeInTheDocument()
    expect(screen.getByText(/W 80 × H 70 × D 60 cm/)).toBeInTheDocument()
    expect(screen.queryByText(/€|EUR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Illustrative piece/)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Name sofa-one' })).toHaveAttribute('src', 'https://cdn.example/sofa-one.jpg')
  })

  it('without a featured piece shows the newest piece that has a model', async () => {
    renderCard()
    expect(await screen.findByText('Name chair-one')).toBeInTheDocument()
  })

  it('a ref to a business (not the showcase) is ignored', async () => {
    renderCard({ businessSlug: 'alpha', productSlug: 'sofa-one' })
    expect(await screen.findByText('Name chair-one')).toBeInTheDocument()
  })

  it('switches between the image and the live 3D viewer in place, with toggle state for assistive tech', async () => {
    const user = userEvent.setup()
    renderCard(house('sofa-one'))
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
    renderCard(house('sofa-one'))
    await user.click(await screen.findByRole('button', { name: '3D' }))
    await user.click(screen.getByRole('button', { name: 'fail' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The 3D model could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
  })

  it('has an AR chip button (AR runs in the card) and no "By" line', async () => {
    renderCard(house('sofa-one'))
    expect(await screen.findByRole('button', { name: 'View in your room' })).toBeInTheDocument()
    expect(screen.queryByText(/By /)).not.toBeInTheDocument()
  })

  it('speaks Portuguese', async () => {
    renderCard(house('sofa-one'), 'pt')
    expect(await screen.findByText('Nome sofa-one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imagem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver na sua sala' })).toBeInTheDocument()
  })

  it('is the labelled illustration, without 3D or AR chips, when no piece has a model', async () => {
    data.products = [table]
    renderCard()
    expect(await screen.findByText(/Illustrative piece/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3D' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View in your room' })).not.toBeInTheDocument()
  })

  it('is the illustration when the showcase has no pieces at all', async () => {
    data.products = []
    renderCard()
    expect(await screen.findByText(/Illustrative piece/)).toBeInTheDocument()
  })

  it('does not show a draft piece', async () => {
    data.products = [prod('p9', 'draft-one', 'chair', true, '2026-05-01T00:00:00Z', 'draft'), sofa]
    renderCard()
    expect(await screen.findByText('Name sofa-one')).toBeInTheDocument()
    expect(screen.queryByText('Name draft-one')).not.toBeInTheDocument()
  })
})

describe('showcase view', () => {
  const view: ShowcaseView = {
    eyebrow: 'Signature',
    title: 'Hand-made Lounge',
    text: 'Made by hand.',
    dimensions: 'W 90 x H 80 x D 70 cm',
    materials: 'Walnut',
    imageUrl: 'https://cdn.example/admin.jpg',
    glbUrl: 'https://cdn.example/admin.glb',
  }
  beforeEach(() => {
    localStorage.clear()
    data.products = [sofa, chair]
  })

  it('renders its own texts and image', async () => {
    renderCard(undefined, 'en', view)
    expect(await screen.findByText('Hand-made Lounge')).toBeInTheDocument()
    expect(screen.getByText('Made by hand.')).toBeInTheDocument()
    expect(screen.getByText('Walnut')).toBeInTheDocument()
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Hand-made Lounge' })).toHaveAttribute('src', view.imageUrl)
  })

  it('the 3D toggle uses glbUrl and the AR chip is present with a model', async () => {
    const user = userEvent.setup()
    renderCard(undefined, 'en', view)
    await user.click(await screen.findByRole('button', { name: '3D' }))
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-src', view.glbUrl)
    expect(screen.getByRole('button', { name: 'View in your room' })).toBeInTheDocument()
  })

  it('with only a page link the AR chip links there; without a model there is no 3D toggle', async () => {
    renderCard(undefined, 'en', { title: 'Linked', imageUrl: view.imageUrl, productHref: '/showcase/sofa-one' })
    expect(await screen.findByRole('link', { name: 'View in your room' })).toHaveAttribute('href', '/showcase/sofa-one')
    expect(screen.queryByRole('button', { name: '3D' })).not.toBeInTheDocument()
  })
})
