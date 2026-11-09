// The landing hero (ADR-0049): the admin's own picture or the built-in photo, its description as alt text and caption, and a
// small "3D" chip only when a model was uploaded. The model is not mounted (so not downloaded) before the chip is tapped.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type LandingHero, emptySiteContent } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { content, service } from '@/services'

vi.mock('@/components/three/ModelViewer', () => ({
  ModelViewer: ({ src, ar, onError }: { src: string; ar?: boolean; onError?: () => void }) => (
    <div data-testid="viewer" data-src={src} data-ar={String(!!ar)}>
      <button type="button" onClick={onError}>
        fail
      </button>
    </div>
  ),
}))

import { HeroMedia } from './HeroMedia'

const file = (name: string, type: string) => new File([new Uint8Array(1024)], name, { type })

/** Uploads what `want` asks for, publishes it as the landing hero and signs the admin out again. */
async function publishHero(want: { image?: boolean; model?: boolean; alt?: LandingHero['alt'] }) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const hero: LandingHero = {}
  if (want.image) {
    const r = await content.uploadSiteAsset(file('hero.webp', 'image/webp'), 'image')
    if (!r.ok) throw new Error('image')
    hero.image = r.data
  }
  if (want.model) {
    const r = await content.uploadSiteAsset(file('hero.glb', 'model/gltf-binary'), 'glb')
    if (!r.ok) throw new Error('glb')
    hero.model = { glb: r.data }
  }
  if (want.alt) hero.alt = want.alt
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), landing: { collections: [], hero } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error('publish')
  localStorage.clear()
}

function renderHero(lang: 'en' | 'pt' = 'en') {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <HeroMedia />
    </LanguageProvider>,
  )
}

let urlSeq = 0
beforeEach(async () => {
  urlSeq = 0
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:hero/${++urlSeq}`) })
  localStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('landing hero picture', () => {
  it('shows the built-in photo with its own alt and caption, and no 3D chip, when nothing was uploaded', async () => {
    renderHero()
    const img = await screen.findByRole('img', { name: /bouclé sofa/ })
    expect(img).toHaveAttribute('src', '/images/sanctus/v2/hero-living.webp')
    expect(img).toHaveClass('size-full', 'object-cover') // full width behind the hero text (round 2)
    expect(screen.getByText('Concrete and travertine living room')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /3D|Photo/ })).not.toBeInTheDocument()
  })

  it('shows the uploaded picture with its description as the alt text and the caption', async () => {
    await publishHero({ image: true, alt: { en: 'Our showroom in Porto', pt: 'A nossa loja no Porto' } })
    renderHero()
    const img = await screen.findByRole('img', { name: 'Our showroom in Porto' })
    expect(img).toHaveAttribute('src', 'blob:hero/1')
    expect(img).toHaveClass('size-full', 'object-cover')
    expect(screen.getByText('Our showroom in Porto', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('shows the Portuguese description to Portuguese visitors', async () => {
    await publishHero({ image: true, alt: { en: 'Our showroom in Porto', pt: 'A nossa loja no Porto' } })
    renderHero('pt')
    expect(await screen.findByRole('img', { name: 'A nossa loja no Porto' })).toBeInTheDocument()
  })

  it('an uploaded picture without a description gets a generic alt text and no caption', async () => {
    await publishHero({ image: true })
    renderHero()
    const img = await screen.findByRole('img', { name: 'Featured picture' })
    expect(img).toHaveAttribute('src', 'blob:hero/1')
    expect(document.querySelector('figcaption')).toBeNull()
  })

  it('a description alone replaces the alt text and caption of the built-in photo', async () => {
    await publishHero({ alt: { en: 'A calm living room' } })
    renderHero()
    expect(await screen.findByRole('img', { name: 'A calm living room' })).toHaveAttribute('src', '/images/sanctus/v2/hero-living.webp')
    expect(screen.getByText('A calm living room', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('has no 3D chip without a model', async () => {
    await publishHero({ image: true })
    renderHero()
    await screen.findByRole('img', { name: 'Featured picture' })
    expect(screen.queryByRole('group', { name: 'Picture or 3D model' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3D' })).not.toBeInTheDocument()
  })

  it('with a model: the chip is there, the viewer loads only after the tap (3D only, no AR), and "Photo" goes back', async () => {
    await publishHero({ image: true, model: true, alt: { en: 'Our showroom' } })
    renderHero()
    const chip = await screen.findByRole('button', { name: '3D' })
    expect(screen.getByRole('group', { name: 'Picture or 3D model' })).toContainElement(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('viewer')).not.toBeInTheDocument()

    await userEvent.click(chip)
    const viewer = await screen.findByTestId('viewer')
    expect(viewer).toHaveAttribute('data-src', 'blob:hero/2')
    expect(viewer).toHaveAttribute('data-ar', 'false')
    const back = screen.getByRole('button', { name: 'Photo' })
    expect(back).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('figcaption')).toHaveAttribute('aria-hidden', 'true') // the caption describes the photo

    await userEvent.click(back)
    await waitFor(() => expect(screen.queryByTestId('viewer')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('figcaption')).not.toHaveAttribute('aria-hidden')
  })

  it('keeps the hero text over the picture and steps it aside (inert, invisible) while the model is shown', async () => {
    await publishHero({ image: true, model: true })
    localStorage.setItem(LANG_KEY, 'en')
    render(
      <LanguageProvider>
        <HeroMedia>
          <h1>Hero headline</h1>
        </HeroMedia>
      </LanguageProvider>,
    )
    const text = screen.getByRole('heading', { name: 'Hero headline' }).parentElement!
    expect(text).not.toHaveAttribute('inert')
    expect(text.className).not.toMatch(/opacity-0/)
    await userEvent.click(await screen.findByRole('button', { name: '3D' }))
    expect(text).toHaveAttribute('inert')
    expect(text.className).toMatch(/pointer-events-none/)
    await userEvent.click(screen.getByRole('button', { name: 'Photo' }))
    expect(text).not.toHaveAttribute('inert')
  })

  it('a model that fails to load offers Retry and the way back to the photo', async () => {
    await publishHero({ image: true, model: true })
    renderHero()
    await userEvent.click(await screen.findByRole('button', { name: '3D' }))
    await userEvent.click(await screen.findByRole('button', { name: 'fail' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    await userEvent.click(alert.querySelectorAll('button')[1]!)
    await waitFor(() => expect(screen.queryByTestId('viewer')).not.toBeInTheDocument())
  })
})
