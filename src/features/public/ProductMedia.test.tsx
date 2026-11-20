// ADR-0081: a main photo's product-page copy is what the product page shows (stage, thumbnails), in its own shape; the catalogue
// card keeps the 4:5 `url` copy. A photo without a page copy shows `url` in the 4:5 stage as before.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Product, ProductImage } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ProductCard } from './ProductCard'
import { type MediaMode, ProductMedia } from './ProductMedia'

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
// The original product page box (owner 2026-11-21): square on phones, 5:4 from sm, the same for photos and 3D.
const OLD_BOX = ['aspect-square', 'sm:aspect-[5/4]']

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('product page photos (ADR-0081, original stage box)', () => {
  it('shows the page copy on the stage and in the square thumbnails, whole, in the original box', () => {
    media([wide, old])
    expect(stageImage().getAttribute('src')).toBe(wide.pageUrl)
    expect(stageImage().className).toContain('object-contain')
    const thumbs = Array.from(screen.getByRole('list', { name: 'Product media' }).querySelectorAll('img'))
    expect(thumbs.map((i) => i.getAttribute('src'))).toEqual([wide.pageUrl, old.url])
    for (const b of within(screen.getByRole('list', { name: 'Product media' })).getAllByRole('button')) expect(b.className).toContain('size-[4.5rem]')
    for (const c of OLD_BOX) expect(stage().className).toContain(c)
  })

  it('falls back to url for a photo without a page copy, in the same box', () => {
    media([wide, old])
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' }))
    expect(stageImage().getAttribute('src')).toBe(old.url)
    for (const c of OLD_BOX) expect(stage().className).toContain(c)
  })

  it('a page copy without a stored crop shows in the same box', () => {
    media([uncropped])
    expect(stageImage().getAttribute('src')).toBe(uncropped.pageUrl)
    for (const c of OLD_BOX) expect(stage().className).toContain(c)
  })

  it('the 3D view has the same box as the photos', () => {
    media([wide], '3d')
    for (const c of OLD_BOX) expect(stage().className).toContain(c)
    expect(stage().className).not.toContain('aspect-[4/5]')
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
