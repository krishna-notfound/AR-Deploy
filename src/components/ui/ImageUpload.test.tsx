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
vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: (p: {
    file?: File
    src?: string
    aspect: number
    initialCrop?: unknown
    title: string
    onSave: (r: { blob: Blob; crop: typeof CROP; whole: boolean }) => void | Promise<void>
    onCancel: () => void
  }) => (
    <div role="dialog" aria-label={p.title} data-file={p.file?.name ?? ''} data-src={p.src ?? ''} data-aspect={p.aspect} data-initial={JSON.stringify(p.initialCrop ?? null)}>
      <button type="button" onClick={() => void p.onSave({ blob: new Blob(['edited'], { type: 'image/webp' }), crop: CROP, whole: false })}>
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
function Harness({ initial = [], max }: { initial?: ProductImage[]; max?: number }) {
  const [images, setImages] = useState<ProductImage[]>(initial)
  current = images
  return (
    <LanguageProvider>
      <ImageUpload label="Upload product images" kind="gallery" images={images} onChange={(fn) => setImages(fn)} businessId="biz_nord" {...(max ? { max } : {})} />
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

describe('ImageUpload: the product frame', () => {
  it('shows every photo in a 4:5 frame, whole (contain), never stretched', () => {
    render(<Harness initial={[stored()]} />)
    const img = screen.getByRole('img', { name: 'sofa' })
    expect(img.className).toContain('aspect-[4/5]')
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
  })
})
