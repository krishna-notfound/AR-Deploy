// BannerUpload (ADR-0065): a company's own catalogue banner, cropped to 2:1 in the dialog on upload; the untouched original and the
// edited copy are both uploaded; Edit picture reopens the original with its crop; Remove goes back to the default.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessBanner } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { CROP } from '@/test/cropDialogStub'
import { BannerUpload } from './BannerUpload'

vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub'))

const png = (name = 'banner.png', size = 64) => new File([new Uint8Array(size)], name, { type: 'image/png' })
const OLD: BusinessBanner = { url: 'https://files.test/copy.webp', originalUrl: 'https://files.test/original.jpg', crop: { x: 5, y: 6, width: 700, height: 350 } }

function setup(value?: BusinessBanner, businessId: string | null = 'biz_nord') {
  const onChange = vi.fn()
  render(
    <LanguageProvider>
      <BannerUpload {...(value ? { value } : {})} onChange={onChange} {...(businessId ? { businessId } : {})} />
    </LanguageProvider>,
  )
  return onChange
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('BannerUpload', () => {
  it('without a banner it says the catalogue uses the default, and offers Upload only', () => {
    setup()
    expect(screen.getAllByText('No banner of its own: the catalogue shows the default banner.').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Upload banner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit picture/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })

  it('tells that the picture may be trimmed on small screens, and that the original is kept', () => {
    setup()
    expect(screen.getByText(/on a narrow screen its sides are trimmed/)).toBeInTheDocument()
    expect(screen.getByText(/The original is kept/)).toBeInTheDocument()
  })

  it('a company that is not saved yet gets a sentence instead of buttons (a banner needs its folder)', () => {
    setup(undefined, null)
    expect(screen.getByText('Save the company first, then you can add a banner.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload banner')).toBeNull()
  })

  it('a chosen picture opens the 2:1 dialog before anything is uploaded', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    setup()
    await userEvent.upload(screen.getByLabelText('Upload banner'), png())
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the banner' })
    expect(dialog).toHaveAttribute('data-aspect', '2')
    expect(dialog).toHaveAttribute('data-file', 'banner.png')
    expect(upload).not.toHaveBeenCalled()
  })

  it('Save uploads the untouched original and the edited WebP copy, and reports both with the crop', async () => {
    const upload = vi
      .spyOn(service, 'uploadAsset')
      .mockImplementation(async ({ kind }) => ok({ url: kind === 'bannerOriginal' ? 'https://files.test/o.png' : 'https://files.test/c.webp', status: 'valid' } as never))
    const onChange = setup()
    await userEvent.upload(screen.getByLabelText('Upload banner'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: 'https://files.test/c.webp', originalUrl: 'https://files.test/o.png', crop: CROP }))
    expect(upload).toHaveBeenCalledTimes(2)
    const [first, second] = upload.mock.calls.map((c) => c[0] as { kind: string; file: File; businessId: string })
    expect(first).toMatchObject({ kind: 'bannerOriginal', businessId: 'biz_nord' })
    expect(first!.file.name).toBe('banner.png')
    expect(second).toMatchObject({ kind: 'banner', businessId: 'biz_nord' })
    expect(second!.file.type).toBe('image/webp')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel uploads nothing and leaves the banner as it was', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const onChange = setup(OLD)
    await userEvent.upload(screen.getByLabelText('Replace banner'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a picture, or is over 5 MB, before the dialog opens', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    setup()
    const input = screen.getByLabelText('Upload banner')
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.upload(input, png('big.png', 5 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/big\.png/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })

  it('says why when an upload fails and changes nothing (the original failing stops before the copy)', async () => {
    const upload = vi.spyOn(service, 'uploadAsset').mockResolvedValue(fail('UNKNOWN', 'The file could not be uploaded.'))
    const onChange = setup()
    await userEvent.upload(screen.getByLabelText('Upload banner'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Edit picture reopens the ORIGINAL with the crop it had, and Save uploads only a new copy, keeping the original', async () => {
    const upload = vi.spyOn(service, 'uploadAsset').mockResolvedValue(ok({ url: 'https://files.test/copy2.webp', status: 'valid' } as never))
    const onChange = setup(OLD)
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: catalogue banner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the banner' })
    expect(dialog).toHaveAttribute('data-src', OLD.originalUrl)
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual(OLD.crop)
    await userEvent.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: 'https://files.test/copy2.webp', originalUrl: OLD.originalUrl, crop: CROP }))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0]![0]).toMatchObject({ kind: 'banner', businessId: 'biz_nord' })
  })

  it('a banner from before the crop dialog is its own original: editing it makes the old file the original', async () => {
    vi.spyOn(service, 'uploadAsset').mockResolvedValue(ok({ url: 'https://files.test/new.webp', status: 'valid' } as never))
    const onChange = setup({ url: 'https://files.test/legacy.webp' })
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: catalogue banner' }))
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-src', 'https://files.test/legacy.webp')
    await userEvent.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: 'https://files.test/new.webp', originalUrl: 'https://files.test/legacy.webp', crop: CROP }))
  })

  it('Remove clears the whole banner (back to the default) without a dialog', async () => {
    const onChange = setup(OLD)
    await userEvent.click(screen.getByRole('button', { name: 'Remove the banner (use the default)' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
