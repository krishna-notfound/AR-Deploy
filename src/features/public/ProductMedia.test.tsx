// ADR-0081: a main photo's product-page copy is what the product page shows (stage, thumbnails), in its own shape; the catalogue
// card keeps the 4:5 `url` copy. A photo without a page copy shows `url` in the 4:5 stage as before.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Product, ProductImage } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ProductCard } from './ProductCard'
import { type MediaMode, photoStageRatio, ProductMedia } from './ProductMedia'

const wide: ProductImage = {
  id: 'img_wide',
  url: 'https://x.test/card-wide.jpg',
  pageUrl: 'https://x.test/page-wide.jpg',
  pageCrop: { x: 0, y: 0, width: 1600, height: 900 },
  isPrimary: true,
  kind: 'gallery',
}
const old: ProductImage = { id: 'img_old', url: 'https://x.test/card-old.jpg', isPrimary: false, kind: 'gallery' }
const uncropped: ProductImage = { id: 'img_nocrop', url: 'https://x.test/card-3.jpg', pageUrl: 'https://x.test/page-3.jpg', isPrimary: false, kind: 'gallery' }

function media(gallery: ProductImage[], mode: MediaMode = 'photos') {
  return render(
    <LanguageProvider>
      <ProductMedia name="Chair" gallery={gallery} models={{}} mode={mode} onModeChange={() => {}} viewerRef={{ current: null }} onModelState={() => {}} onArStatus={() => {}} switcher />
    </LanguageProvider>,
  )
}

const stage = () => screen.getByTestId('product-stage')
const stageImage = () => within(screen.getByRole('region', { name: 'Chair' })).getAllByRole('img')[0] as HTMLImageElement
const ratio = () => Number(stage().style.getPropertyValue('--stage-ratio'))

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('product page photos (ADR-0081)', () => {
  it('shows the page copy on the stage and in the thumbnails, in the page crop shape', () => {
    media([wide, old])
    expect(stageImage().getAttribute('src')).toBe(wide.pageUrl)
    const thumbs = Array.from(screen.getByRole('list', { name: 'Product media' }).querySelectorAll('img'))
    expect(thumbs.map((i) => i.getAttribute('src'))).toEqual([wide.pageUrl, old.url])
    // Thumbnails stay a uniform 4:5 tile row.
    for (const b of within(screen.getByRole('list', { name: 'Product media' })).getAllByRole('button')) expect(b.className).toContain('aspect-[4/5]')
    expect(stage().className).toContain('aspect-(--stage-ratio)')
    expect(ratio()).toBeCloseTo(16 / 9, 5)
  })

  it('falls back to url and the 4:5 stage for a photo without a page copy', () => {
    media([wide, old])
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' }))
    expect(stageImage().getAttribute('src')).toBe(old.url)
    expect(ratio()).toBeCloseTo(0.8, 5)
  })

  it('a page copy with no stored crop takes its loaded size (4:5 until then)', () => {
    media([uncropped])
    expect(ratio()).toBeCloseTo(0.8, 5)
    const img = stageImage()
    Object.defineProperty(img, 'naturalWidth', { value: 1500 })
    Object.defineProperty(img, 'naturalHeight', { value: 1000 })
    fireEvent.load(img)
    expect(ratio()).toBeCloseTo(1.5, 5)
  })

  it('the 3D view keeps its 4:5 box', () => {
    media([wide], '3d')
    expect(stage().className).toContain('aspect-[4/5]')
    expect(stage().style.getPropertyValue('--stage-ratio')).toBe('')
  })

  it('photoStageRatio ignores a measurement of another file', () => {
    expect(photoStageRatio(uncropped, { src: 'https://x.test/other.jpg', ratio: 2 })).toBeCloseTo(0.8, 5)
    expect(photoStageRatio(undefined)).toBeCloseTo(0.8, 5)
  })

  it('the catalogue card still shows the 4:5 url copy', async () => {
    await service.resetDemoData()
    const r = await service.getPublicProduct('nordhaus', 'sheen-lounge-chair')
    if (!r.ok) throw new Error('seed')
    const product: Product = { ...r.data.product, images: [wide, old] }
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ProductCard product={product} href="/a" />
        </LanguageProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link').querySelector('img')?.getAttribute('src')).toBe(wide.url)
  })
})
