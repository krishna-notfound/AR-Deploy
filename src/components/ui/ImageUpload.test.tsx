import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductImage } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { ImageUpload } from './ImageUpload'

// The crop dialog needs a laid-out browser (its own tests: components/image). Here it is a stand-in that shows what it
// was given and whose Save sends an edited copy with a fixed crop.
const CROP = { x: 10, y: 20, width: 800, height: 1000 }
/** What the stand-in saves when it was given shapes (the product page crop, ADR-0081). */
const PAGE_CROP = { x: 0, y: 0, width: 1600, height: 1200 }
vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: (p: {
    file?: File
    src?: string
    aspect: number
    initialCrop?: unknown
    shapes?: boolean
    title: string
    note?: string
    onSave: (r: { blob: Blob; crop: typeof CROP; whole: boolean }) => void | Promise<void>
    onCancel: () => void
  }) => (
    <div role="dialog" aria-label={p.title} data-note={p.note ?? ''} data-file={p.file?.name ?? ''} data-src={p.src ?? ''} data-aspect={p.aspect} data-initial={JSON.stringify(p.initialCrop ?? null)} data-shapes={p.shapes === undefined ? 'unset' : String(p.shapes)}>
      <button type="button" onClick={() => void p.onSave({ blob: new Blob([p.shapes ? 'page copy' : 'edited'], { type: 'image/webp' }), crop: p.shapes ? PAGE_CROP : CROP, whole: false })}>
        Save crop
      </button>
      <button type="button" onClick={p.onCancel}>
        Cancel crop
      </button>
    </div>
  ),
}))

const png = (name: string) => new File([new Uint8Array(64)], name, { type: 'image/png' })

let current: ProductImage[] = []
function Harness({ initial = [], max, shapes, pageCrop, kind = 'gallery' }: { initial?: ProductImage[]; max?: number; shapes?: boolean; pageCrop?: boolean; kind?: ProductImage['kind'] }) {
  const [images, setImages] = useState<ProductImage[]>(initial)
  current = images
  return (
    <LanguageProvider>
      <ImageUpload
        label="Upload product images"
        kind={kind}
        images={images}
        onChange={(fn) => setImages(fn)}
        businessId="biz_nord"
        {...(max ? { max } : {})}
        {...(shapes ? { shapes } : {})}
        {...(pageCrop ? { pageCrop } : {})}
      />
    </LanguageProvider>
  )
}

const stored = (over: Partial<ProductImage> = {}): ProductImage => ({ id: 'img_1', url: 'data:image/png;base64,AAAA', alt: 'sofa', isPrimary: true, kind: 'gallery', ...over })

beforeEach(() => {
  localStorage.clear()
  current = []
})
afterEach(() => vi.restoreAllMocks())

describe('ImageUpload: crop on upload', () => {
  it('a chosen photo opens the dialog in the product frame (4:5) before anything is uploaded', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the photo' })
    expect(dialog).toHaveAttribute('data-file', 'sofa.png')
    expect(Number(dialog.getAttribute('data-aspect'))).toBeCloseTo(4 / 5)
    expect(upload).not.toHaveBeenCalled()
  })

  it('passes shapes to the dialog (new photo and Edit picture) only when set', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness initial={[stored({ originalUrl: 'data:image/png;base64,ORIGINAL' })]} />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    expect(await screen.findByRole('dialog', { name: 'Adjust the photo' })).toHaveAttribute('data-shapes', 'unset')
    unmount()

    render(<Harness shapes initial={[stored({ originalUrl: 'data:image/png;base64,ORIGINAL' })]} />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    expect(await screen.findByRole('dialog', { name: 'Adjust the photo' })).toHaveAttribute('data-shapes', 'true')
    await user.click(screen.getByRole('button', { name: 'Cancel crop' }))
    await user.click(screen.getByRole('button', { name: 'Edit picture sofa' }))
    expect(await screen.findByRole('dialog', { name: 'Adjust the photo' })).toHaveAttribute('data-shapes', 'true')
  })

  it('Save uploads the original and the edited copy and adds one photo with both and the crop', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current).toHaveLength(1))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0]![0].file.name).toBe('sofa.png') // the untouched original first
    expect(upload.mock.calls[1]![0].file.name).toBe('sofa.webp') // then the edited copy
    expect(upload.mock.calls[1]![0].file.type).toBe('image/webp')
    const [photo] = current
    expect(photo).toMatchObject({ alt: 'sofa', crop: CROP, isPrimary: true, kind: 'gallery' })
    expect(photo!.url).toMatch(/^data:/)
    expect(photo!.originalUrl).toMatch(/^data:/)
    expect(photo!.url).not.toBe(photo!.originalUrl)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Cancel adds nothing and uploads nothing', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    await user.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(current).toHaveLength(0)
    expect(upload).not.toHaveBeenCalled()
  })

  it('several photos open the dialog one after the other; cancelling one skips only that one', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), [png('a.png'), png('b.png')])
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-file', 'a.png')
    await user.click(screen.getByRole('button', { name: 'Cancel crop' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-file', 'b.png'))
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current.map((i) => i.alt)).toEqual(['b']))
  })

  it('refuses a wrong type without opening the dialog', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stops at the maximum number of photos', async () => {
    const user = userEvent.setup()
    render(<Harness max={1} initial={[stored()]} />)
    await user.upload(screen.getByLabelText('Upload product images'), png('more.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 1 images')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the upload error and adds nothing when the service refuses', async () => {
    vi.spyOn(service, 'uploadAsset').mockResolvedValue(fail('STORAGE', 'Upload failed: no space'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/\S/)
    expect(current).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('ImageUpload: Edit picture', () => {
  it('opens the stored original with the crop it had and replaces only the edited copy', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    const before = stored({ originalUrl: 'data:image/png;base64,ORIGINAL', crop: { x: 1, y: 2, width: 3, height: 4 } })
    render(<Harness initial={[before]} />)
    await user.click(screen.getByRole('button', { name: 'Edit picture sofa' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-src', 'data:image/png;base64,ORIGINAL')
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current[0]!.crop).toEqual(CROP))
    expect(upload).toHaveBeenCalledTimes(1) // one new edited copy; the original is not uploaded again
    expect(current[0]).toMatchObject({ id: 'img_1', originalUrl: 'data:image/png;base64,ORIGINAL', alt: 'sofa' })
    expect(current[0]!.url).not.toBe(before.url)
  })

  it('a photo from before the dialog becomes its own original (and starts from the whole picture)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[stored({ url: 'data:image/png;base64,OLD', storagePath: 'biz_nord/old.png' })]} />)
    await user.click(screen.getByRole('button', { name: 'Edit picture sofa' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-src', 'data:image/png;base64,OLD')
    expect(dialog).toHaveAttribute('data-initial', 'null')
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current[0]!.crop).toEqual(CROP))
    expect(current[0]).toMatchObject({ originalPath: 'biz_nord/old.png', originalUrl: 'data:image/png;base64,OLD' })
  })

  it('asks the service for a fresh link to a stored original', async () => {
    const link = vi.spyOn(service, 'getMediaUrl').mockResolvedValue(ok('https://signed.test/original.png?t=1'))
    const user = userEvent.setup()
    render(<Harness initial={[stored({ storagePath: 'biz_nord/copy.webp', originalPath: 'biz_nord/orig.png', crop: CROP })]} />)
    await user.click(screen.getByRole('button', { name: 'Edit picture sofa' }))
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-src', 'https://signed.test/original.png?t=1')
    expect(link).toHaveBeenCalledWith('biz_nord/orig.png')
  })

  it('says so, and opens nothing, when the original cannot be reached', async () => {
    vi.spyOn(service, 'getMediaUrl').mockResolvedValue(fail('STORAGE', 'nope'))
    const user = userEvent.setup()
    render(<Harness initial={[stored({ originalPath: 'biz_nord/orig.png' })]} />)
    await user.click(screen.getByRole('button', { name: 'Edit picture sofa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The original of sofa could not be opened.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ImageUpload: two crops per main photo (ADR-0081)', () => {
  it('a new photo goes through the card crop, then the product page crop, and keeps both', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness pageCrop />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    const card = await screen.findByRole('dialog', { name: 'Catalogue card crop' })
    expect(card).toHaveAttribute('data-shapes', 'unset')
    expect(Number(card.getAttribute('data-aspect'))).toBeCloseTo(4 / 5)
    expect(card).toHaveAttribute('data-note', 'Step 1 of 2. How the photo looks on catalogue cards.')
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    const page = await screen.findByRole('dialog', { name: 'Product page crop' })
    expect(page).toHaveAttribute('data-shapes', 'true')
    expect(page).toHaveAttribute('data-file', 'sofa.png') // cut from the same original
    expect(page).toHaveAttribute('data-initial', 'null') // starts at Original, the whole photo
    expect(upload).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current).toHaveLength(1))
    expect(upload).toHaveBeenCalledTimes(3) // the original once, then the card copy and the page copy
    expect(upload.mock.calls.map((c) => c[0].file.name)).toEqual(['sofa.png', 'sofa.webp', 'sofa.webp'])
    const [photo] = current
    expect(photo).toMatchObject({ crop: CROP, pageCrop: PAGE_CROP, kind: 'gallery' })
    expect(photo!.pageUrl).toMatch(/^data:/)
    expect(photo!.pageUrl).not.toBe(photo!.url)
    expect(photo!.pageUrl).not.toBe(photo!.originalUrl)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cancelling the product page crop keeps the photo with its card copy', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness pageCrop />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    await screen.findByRole('dialog', { name: 'Product page crop' })
    await user.click(screen.getByRole('button', { name: 'Cancel crop' }))
    await waitFor(() => expect(current).toHaveLength(1))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(current[0]).toMatchObject({ crop: CROP, alt: 'sofa' })
    expect(current[0]!.pageUrl).toBeUndefined()
    expect(current[0]!.pageCrop).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cancelling the card crop adds nothing and skips the page crop', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness pageCrop />)
    await user.upload(screen.getByLabelText('Upload product images'), png('sofa.png'))
    await user.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(current).toHaveLength(0)
    expect(upload).not.toHaveBeenCalled()
  })

  it('"Edit product page crop" opens the original at the page crop and changes only the page copy', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    const before = stored({
      storagePath: 'biz_nord/card.webp',
      originalUrl: 'data:image/png;base64,ORIGINAL',
      crop: { x: 1, y: 2, width: 3, height: 4 },
      pageUrl: 'data:image/webp;base64,OLDPAGE',
      pagePath: 'biz_nord/oldpage.webp',
      pageCrop: { x: 5, y: 6, width: 7, height: 8 },
    })
    render(<Harness pageCrop initial={[before]} />)
    await user.click(screen.getByRole('button', { name: 'Edit product page crop of sofa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Product page crop' })
    expect(dialog).toHaveAttribute('data-src', 'data:image/png;base64,ORIGINAL')
    expect(dialog).toHaveAttribute('data-shapes', 'true')
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual({ x: 5, y: 6, width: 7, height: 8 })
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current[0]!.pageCrop).toEqual(PAGE_CROP))
    expect(upload).toHaveBeenCalledTimes(1)
    const after = current[0]!
    expect(after).toMatchObject({ url: before.url, storagePath: 'biz_nord/card.webp', crop: before.crop, originalUrl: before.originalUrl })
    expect(after.pageUrl).not.toBe(before.pageUrl)
    expect(after.pagePath).toBeUndefined() // demo uploads have no path: the old page path must not survive
  })

  it('"Edit catalogue crop" changes only the card copy', async () => {
    const user = userEvent.setup()
    const before = stored({ originalUrl: 'data:image/png;base64,ORIGINAL', crop: { x: 1, y: 2, width: 3, height: 4 }, pageUrl: 'data:image/webp;base64,PAGE', pageCrop: PAGE_CROP })
    render(<Harness pageCrop initial={[before]} />)
    await user.click(screen.getByRole('button', { name: 'Edit catalogue crop of sofa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Catalogue card crop' })
    expect(dialog).toHaveAttribute('data-shapes', 'unset')
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current[0]!.crop).toEqual(CROP))
    expect(current[0]).toMatchObject({ pageUrl: 'data:image/webp;base64,PAGE', pageCrop: PAGE_CROP })
  })

  it('an older photo without a page crop starts the page crop at Original from its own original', async () => {
    const user = userEvent.setup()
    render(<Harness pageCrop initial={[stored({ url: 'data:image/png;base64,OLD', storagePath: 'biz_nord/old.png' })]} />)
    await user.click(screen.getByRole('button', { name: 'Edit product page crop of sofa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Product page crop' })
    expect(dialog).toHaveAttribute('data-src', 'data:image/png;base64,OLD')
    expect(dialog).toHaveAttribute('data-initial', 'null')
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current[0]!.pageCrop).toEqual(PAGE_CROP))
    expect(current[0]).toMatchObject({ url: 'data:image/png;base64,OLD', originalPath: 'biz_nord/old.png', originalUrl: 'data:image/png;base64,OLD' })
  })

  it('more photos (no pageCrop) keep one crop and one edit button', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const user = userEvent.setup()
    render(<Harness kind="additional" shapes initial={[stored({ kind: 'additional', isPrimary: false })]} />)
    expect(screen.getByRole('button', { name: 'Edit picture sofa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /product page crop/ })).not.toBeInTheDocument()
    await user.upload(screen.getByLabelText('Upload product images'), png('detail.png'))
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(current).toHaveLength(2))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(current[1]!.pageUrl).toBeUndefined()
  })
})

describe('ImageUpload: order (P3D-02)', () => {
  const three = [stored({ id: 'a', alt: 'front' }), stored({ id: 'b', alt: 'side', isPrimary: false }), stored({ id: 'c', alt: 'back', isPrimary: false })]

  it('moves a photo later and earlier with buttons, keeping the primary photo', async () => {
    const user = userEvent.setup()
    render(<Harness initial={three} />)
    await user.click(screen.getByRole('button', { name: 'Move front later' }))
    expect(current.map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect(current.find((i) => i.isPrimary)?.id).toBe('a')
    await user.click(screen.getByRole('button', { name: 'Move back earlier' }))
    expect(current.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('disables the move past either end, and shows no buttons for a single photo', () => {
    const { unmount } = render(<Harness initial={three} />)
    expect(screen.getByRole('button', { name: 'Move front earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move back later' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move side earlier' })).toBeEnabled()
    unmount()
    render(<Harness initial={[stored()]} />)
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
  })

  it('announces the new position', async () => {
    const user = userEvent.setup()
    render(<Harness initial={three} />)
    await user.click(screen.getByRole('button', { name: 'Move front later' }))
    expect(screen.getByRole('status')).toHaveTextContent('front is now number 2 of 3')
  })

  it('reorders only its own kind and leaves the other photos where they are', async () => {
    const user = userEvent.setup()
    const extra = stored({ id: 'x', alt: 'detail', isPrimary: false, kind: 'additional' })
    render(<Harness initial={[...three, extra]} />)
    await user.click(screen.getByRole('button', { name: 'Move front later' }))
    expect(current.filter((i) => i.kind === 'gallery').map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect(current.filter((i) => i.kind === 'additional').map((i) => i.id)).toEqual(['x'])
  })
})

describe('ImageUpload: the product frame', () => {
  it('shows every photo in a 4:5 frame, whole (contain), never stretched', () => {
    render(<Harness initial={[stored()]} />)
    const img = screen.getByRole('img', { name: 'sofa' })
    expect(img.className).toContain('aspect-[4/5]')
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
  })
})
