// LogoUpload (ADR-0063): the logo is cropped to a square in the crop dialog on upload; no original is kept and there is no re-edit.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { LogoUpload } from './LogoUpload'

vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub'))

const png = (name = 'logo.png', size = 64) => new File([new Uint8Array(size)], name, { type: 'image/png' })

function setup(value?: string) {
  const onChange = vi.fn()
  render(
    <LanguageProvider>
      <LogoUpload {...(value ? { value } : {})} onChange={onChange} name="Casa Nord" businessId="biz_nord" />
    </LanguageProvider>,
  )
  return onChange
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('LogoUpload: crop on upload', () => {
  it('a chosen logo opens the square dialog (writing at most 1024 px) before anything is uploaded', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    setup()
    await userEvent.upload(screen.getByLabelText('Upload logo'), png())
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the logo' })
    expect(dialog).toHaveAttribute('data-aspect', '1')
    expect(dialog).toHaveAttribute('data-file', 'logo.png')
    expect(JSON.parse(dialog.getAttribute('data-output')!)).toEqual({ maxSide: 1024 })
    expect(upload).not.toHaveBeenCalled()
  })

  it('Save uploads only the edited WebP copy as the logo (no original is kept) and reports its address', async () => {
    const upload = vi.spyOn(service, 'uploadAsset').mockResolvedValue(ok({ url: 'https://files.test/logo.webp', status: 'valid' } as never))
    const onChange = setup()
    await userEvent.upload(screen.getByLabelText('Upload logo'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://files.test/logo.webp'))
    expect(upload).toHaveBeenCalledTimes(1)
    const arg = upload.mock.calls[0]![0] as { kind: string; file: File; businessId: string }
    expect(arg).toMatchObject({ kind: 'logo', businessId: 'biz_nord' })
    expect(arg.file.name).toBe('logo.webp')
    expect(arg.file.type).toBe('image/webp')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel uploads nothing and leaves the logo as it was', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    const onChange = setup('https://files.test/old.webp')
    await userEvent.upload(screen.getByLabelText('Replace logo'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a picture, or is over 2 MB, before the dialog opens', async () => {
    const upload = vi.spyOn(service, 'uploadAsset')
    setup()
    const input = screen.getByLabelText('Upload logo')
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.upload(input, png('big.png', 2 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/big\.png/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })

  it('says why when the upload fails, and does not change the logo', async () => {
    vi.spyOn(service, 'uploadAsset').mockResolvedValue(fail('UNKNOWN', 'The file could not be uploaded.'))
    const onChange = setup()
    await userEvent.upload(screen.getByLabelText('Upload logo'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Save crop' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Remove still clears the logo without a dialog', async () => {
    const onChange = setup('https://files.test/old.webp')
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
