// UploadButton and EditPictureButton (ADR-0063): a picture with a frame opens the crop dialog first and uploads the original and the
// edited copy; other files go straight up. The dialog is a stand-in (the real one needs a laid-out browser; see components/image).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteAsset } from '@/domain/siteContent'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { content } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { CROP } from '@/test/cropDialogStub'
import { EditPictureButton } from './EditPictureButton'
import { UploadButton } from './UploadButton'

vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub'))

const png = (name = 'sofa.png', size = 64) => new File([new Uint8Array(size)], name, { type: 'image/png' })
const asset = (path: string): SiteAsset => ({ path })

beforeEach(() => {
  localStorage.clear()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test/1') })
})
afterEach(() => vi.restoreAllMocks())

function pictureButton(onUploaded = vi.fn(), frame: 'hero' | 'imageText' | 'aboutThird' | null = 'imageText') {
  render(
    <LanguageProvider>
      <UploadButton kind="image" label="Upload picture" onUploaded={onUploaded} {...(frame ? { frame } : {})} />
    </LanguageProvider>,
  )
  return onUploaded
}

describe('UploadButton with a frame', () => {
  it('opens the dialog in the frame before anything is uploaded; Save uploads the original, then the edited WebP copy, and hands both over with the crop', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset')
    upload.mockResolvedValueOnce(ok(asset('landing/orig-1.png'))).mockResolvedValueOnce(ok(asset('landing/copy-1.webp')))
    const onUploaded = pictureButton()
    await userEvent.upload(screen.getByTestId('upload-image'), png())

    const dialog = await screen.findByRole('dialog', { name: 'Adjust the picture' })
    expect(dialog).toHaveAttribute('data-aspect', String(4 / 3))
    expect(dialog).toHaveAttribute('data-file', 'sofa.png')
    expect(upload).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(onUploaded).toHaveBeenCalledWith({ path: 'landing/copy-1.webp', originalPath: 'landing/orig-1.png', crop: CROP })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0]![0].name).toBe('sofa.png')
    expect(upload.mock.calls[1]![0].name).toBe('sofa.webp')
    expect(upload.mock.calls[1]![0].type).toBe('image/webp')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('each frame gives the dialog its shape', async () => {
    for (const [frame, aspect] of [['hero', 16 / 9], ['aboutThird', 2 / 3]] as const) {
      const { unmount } = render(
        <LanguageProvider>
          <UploadButton kind="image" frame={frame} label="Upload picture" onUploaded={() => {}} />
        </LanguageProvider>,
      )
      await userEvent.upload(screen.getByTestId('upload-image'), png())
      expect(await screen.findByRole('dialog')).toHaveAttribute('data-aspect', String(aspect))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel crop' }))
      unmount()
    }
  })

  it('Cancel uploads nothing and reports nothing', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset')
    const onUploaded = pictureButton()
    await userEvent.upload(screen.getByTestId('upload-image'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a picture, or is over 25 MB, before the dialog opens', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset')
    const onUploaded = pictureButton()
    const input = screen.getByTestId('upload-image')
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPG, PNG or WebP picture up to 25 MB.')
    await userEvent.upload(input, png('huge.png', 25 * 1024 * 1024 + 1))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('huge.png is too large (25 MB). Choose a JPG, PNG or WebP picture up to 25 MB.'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('takes a phone photo between 5 and 25 MB: the crop dialog opens', async () => {
    pictureButton()
    await userEvent.upload(screen.getByTestId('upload-image'), png('phone.png', 12 * 1024 * 1024))
    expect(await screen.findByRole('dialog', { name: 'Adjust the picture' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says why a file is refused in Portuguese too', async () => {
    localStorage.setItem('arfurn:lang', 'pt')
    render(
      <LanguageProvider>
        <UploadButton kind="image" frame="imageText" label="Carregar imagem" onUploaded={() => {}} />
      </LanguageProvider>,
    )
    const input = screen.getByTestId('upload-image')
    await userEvent.upload(input, new File(['x'], 'notas.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha uma imagem JPG, PNG ou WebP até 25 MB.')
    await userEvent.upload(input, png('enorme.png', 26 * 1024 * 1024))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('enorme.png é demasiado grande (26 MB). Escolha uma imagem JPG, PNG ou WebP até 25 MB.'))
  })

  it('when the original cannot be uploaded it says so, keeps nothing, and does not try the copy', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(fail('UNKNOWN', 'The file could not be uploaded. Try again.'))
    const onUploaded = pictureButton()
    await userEvent.upload(screen.getByTestId('upload-image'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be uploaded. Try again.')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('when the edited copy cannot be uploaded it says so and reports nothing', async () => {
    vi.spyOn(content, 'uploadSiteAsset').mockResolvedValueOnce(ok(asset('landing/orig-1.png'))).mockResolvedValueOnce(fail('UNKNOWN', 'The file could not be uploaded. Try again.'))
    const onUploaded = pictureButton()
    await userEvent.upload(screen.getByTestId('upload-image'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be uploaded. Try again.')
    expect(onUploaded).not.toHaveBeenCalled()
  })
})

describe('UploadButton without a frame', () => {
  it('uploads the file as it is, with no dialog (3D files)', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(ok(asset('landing/model-1.glb')))
    const onUploaded = vi.fn()
    render(
      <LanguageProvider>
        <UploadButton kind="glb" label="Upload model" onUploaded={onUploaded} />
      </LanguageProvider>,
    )
    await userEvent.upload(screen.getByTestId('upload-glb'), new File([new Uint8Array(64)], 'sofa.glb', { type: 'model/gltf-binary' }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ path: 'landing/model-1.glb' }))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a picture without a frame (the favicon check) is uploaded as it is too', async () => {
    const upload = vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(ok(asset('landing/icon-1.png')))
    const onUploaded = pictureButton(vi.fn(), null)
    await userEvent.upload(screen.getByTestId('upload-image'), png('icon.png'))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ path: 'landing/icon-1.png' }))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('EditPictureButton', () => {
  const edit = (image: SiteAsset, onEdited = vi.fn()) => {
    render(
      <LanguageProvider>
        <EditPictureButton image={image} frame="aboutMain" label="Edit picture: Main" onEdited={onEdited} />
      </LanguageProvider>,
    )
    return onEdited
  }
  /** Gives the demo store a file under a path, so that its address resolves. */
  async function stored(name: string) {
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const r = await content.uploadSiteAsset(png(name), 'image')
    if (!r.ok) throw new Error('upload')
    return r.data
  }

  it('opens the ORIGINAL with the crop it had; Save uploads one new copy and keeps the original', async () => {
    const original = await stored('original.png')
    const shown = await stored('shown.png')
    const upload = vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(ok(asset('landing/copy-2.webp')))
    const onEdited = edit({ ...shown, originalPath: original.path, crop: { x: 1, y: 2, width: 3, height: 4 } })
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: Main' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the picture' })
    expect(dialog).toHaveAttribute('data-src', 'blob:test/1')
    expect(dialog).toHaveAttribute('data-aspect', String(4 / 5))
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual({ x: 1, y: 2, width: 3, height: 4 })

    await userEvent.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onEdited).toHaveBeenCalledWith({ path: 'landing/copy-2.webp', originalPath: original.path, crop: CROP }))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a picture from before the dialog is its own original: it opens the file shown, and that file becomes the original', async () => {
    const old = await stored('old.png')
    vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(ok(asset('landing/copy-3.webp')))
    const onEdited = edit(old)
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: Main' }))
    const dialog = await screen.findByRole('dialog')
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toBeNull() // no stored crop: the whole picture
    await userEvent.click(screen.getByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onEdited).toHaveBeenCalledWith({ path: 'landing/copy-3.webp', originalPath: old.path, crop: CROP }))
  })

  it('Cancel changes nothing', async () => {
    const old = await stored('old.png')
    const upload = vi.spyOn(content, 'uploadSiteAsset')
    const onEdited = edit(old)
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: Main' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(upload).not.toHaveBeenCalled()
    expect(onEdited).not.toHaveBeenCalled()
  })

  it('says so when the original is gone (a demo upload from an earlier session) instead of opening an empty dialog', async () => {
    const onEdited = edit({ path: 'landing/never-uploaded.png' })
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: Main' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The original could not be opened. Upload the picture again.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onEdited).not.toHaveBeenCalled()
  })

  it('a failed upload of the new copy says so and changes nothing', async () => {
    const old = await stored('old.png')
    vi.spyOn(content, 'uploadSiteAsset').mockResolvedValue(fail('UNKNOWN', 'The file could not be uploaded. Try again.'))
    const onEdited = edit(old)
    await userEvent.click(screen.getByRole('button', { name: 'Edit picture: Main' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be uploaded. Try again.')
    expect(onEdited).not.toHaveBeenCalled()
  })
})
