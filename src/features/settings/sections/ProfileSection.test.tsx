import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { ACCOUNT_ERRORS, account, service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { resetMyProfileStore } from '../useMyProfile'

// The crop dialog (needs a canvas) is replaced by a stand-in with its Save and Cancel; what the page does with its result is under test.
const resized = new Blob([new Uint8Array(2048)], { type: 'image/webp' })
const CROP = { x: 10, y: 20, width: 300, height: 300 }
const dialogProps = vi.hoisted(() => ({ last: null as null | { aspect: number; output?: { maxSide?: number; quality?: number }; title: string; file?: File } }))
vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: (props: { aspect: number; output?: { maxSide?: number; quality?: number }; title: string; file?: File; onSave: (r: { blob: Blob; crop: typeof CROP; whole: boolean }) => void; onCancel: () => void }) => {
    dialogProps.last = props
    return (
      <div role="dialog" aria-label={props.title}>
        <button type="button" onClick={() => props.onSave({ blob: resized, crop: CROP, whole: false })}>Save crop</button>
        <button type="button" onClick={props.onCancel}>Cancel crop</button>
      </div>
    )
  },
}))
const renderCrop = vi.hoisted(() => vi.fn())
vi.mock('@/lib/imageCrop', async (original) => ({ ...(await original<typeof import('@/lib/imageCrop')>()), renderCrop }))

function open(url = '/dashboard/settings/profile') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_casa' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('./ProfileSection'), import('@/features/business/BusinessOverviewPage')])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  resetMockAccount()
  resetMyProfileStore()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const photoCard = () => screen.getByRole('region', { name: 'Photo' })
const preview = () => photoCard().querySelector('[data-avatar]')!
const hubIdentity = () => document.querySelector('[data-settings-identity]') as HTMLElement
const fail = (reason: string, message: string) => ({ ok: false as const, error: { code: 'VALIDATION' as const, reason, message } })
const goodPhoto = () => new File([new Uint8Array(900 * 1024)], 'me.png', { type: 'image/png' })
/** Chooses a photo and saves the crop dialog it opens. */
async function uploadPhoto(user: ReturnType<typeof userEvent.setup>, file = goodPhoto()) {
  await user.upload(await screen.findByLabelText('Upload photo'), file)
  await user.click(await screen.findByRole('button', { name: 'Save crop' }))
}

describe('ProfileSection', () => {
  it('name: empty and 81-character names are refused; save updates the sidebar name', async () => {
    const user = userEvent.setup()
    open()
    const field = await screen.findByRole('textbox', { name: 'Name' })
    const save = screen.getByRole('button', { name: 'Save name' })

    await user.clear(field)
    await user.click(save)
    expect(await screen.findByText('Use 1 to 80 characters for your name.')).toBeInTheDocument()

    await user.type(field, 'a'.repeat(81))
    await user.click(save)
    expect(screen.getByText('Use 1 to 80 characters for your name.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')

    const update = vi.spyOn(account, 'updateProfile')
    await user.clear(field)
    await user.type(field, '  Marta Silva ')
    await user.click(save)
    expect(await screen.findByText('Name saved')).toBeInTheDocument()
    expect(update).toHaveBeenCalledWith({ displayName: 'Marta Silva' })
    expect(update).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('button', { name: 'Account menu, Marta Silva' })).toBeInTheDocument()
  })

  it('name: a failed save rolls back and says why', async () => {
    const user = userEvent.setup()
    open()
    const field = await screen.findByRole('textbox', { name: 'Name' })
    vi.spyOn(account, 'updateProfile').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', reason: 'unknown', message: 'Could not save. Try again.' } })
    await user.clear(field)
    await user.type(field, 'Nope')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    // The preview initials come back to the saved name.
    await waitFor(() => expect(preview().textContent).not.toBe('N'))
  })

  it('photo: a non-image or a file over 5 MB before resize is refused with a message; a valid image opens the square crop dialog and is uploaded as the person cropped it; Remove returns to initials', async () => {
    const user = userEvent.setup({ applyAccept: false })
    open()
    const input = (await screen.findByLabelText('Upload photo')) as HTMLInputElement
    const upload = vi.spyOn(account, 'uploadAvatar')

    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument()

    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('That image is larger than 5 MB. Choose a smaller one.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()

    const good = new File([new Uint8Array(900 * 1024)], 'me.png', { type: 'image/png' })
    await user.upload(input, good)
    // The dialog opens first, 1:1, writing at most 512 px; nothing is uploaded until the person saves.
    expect(await screen.findByRole('dialog', { name: 'Adjust your profile photo' })).toBeInTheDocument()
    expect(dialogProps.last).toMatchObject({ aspect: 1, output: { maxSide: 512 }, file: good })
    expect(upload).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save crop' }))
    expect(await screen.findByText('Photo updated')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(resized)
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(preview().querySelector('img')).not.toBeNull())
    expect(screen.queryByText('Choose a JPEG, PNG or WebP image.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(await screen.findByText('Photo removed')).toBeInTheDocument()
    await waitFor(() => expect(preview().querySelector('img')).toBeNull())
    expect(preview().textContent).toMatch(/^[A-Z]{1,2}$/)
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull()
  })

  it('prefills the name with the account name when the profile has none', async () => {
    open()
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Casa Lisboa Interiors owner')
  })

  it('the settings hub header shows the new name and photo after a save', async () => {
    const user = userEvent.setup()
    open()
    const field = await screen.findByRole('textbox', { name: 'Name' })
    expect(hubIdentity().querySelector('[data-avatar] img')).toBeNull()
    await user.clear(field)
    await user.type(field, 'Marta Silva')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await screen.findByText('Name saved')
    await uploadPhoto(user)
    await screen.findByText('Photo updated')
    await waitFor(() => expect(within(hubIdentity()).getByText('Marta Silva')).toBeInTheDocument())
    expect(hubIdentity().querySelector('[data-avatar] img')).not.toBeNull()
  })

  it('photo: cancelling the crop dialog uploads nothing and keeps the current photo', async () => {
    const user = userEvent.setup()
    open()
    const upload = vi.spyOn(account, 'uploadAvatar')
    await user.upload(await screen.findByLabelText('Upload photo'), goodPhoto())
    await user.click(await screen.findByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
    expect(preview().querySelector('img')).toBeNull()
  })

  it('photo: a crop that is still over the 512 KB upload limit is written again, smaller', async () => {
    const user = userEvent.setup()
    open()
    const big = new Blob([new Uint8Array(600 * 1024)], { type: 'image/webp' })
    const small = new Blob([new Uint8Array(100 * 1024)], { type: 'image/webp' })
    renderCrop.mockReset()
    renderCrop.mockResolvedValueOnce(small)
    const upload = vi.spyOn(account, 'uploadAvatar')
    const original = resized
    Object.defineProperty(original, 'size', { value: big.size, configurable: true })
    await uploadPhoto(user)
    await screen.findByText('Photo updated')
    expect(renderCrop).toHaveBeenCalledWith(expect.anything(), CROP, { maxSide: 384, quality: 0.8 })
    expect(upload).toHaveBeenCalledWith(small)
    Object.defineProperty(original, 'size', { value: 2048, configurable: true })
  })

  it('photo: says so when writing the smaller copy fails, and uploads nothing', async () => {
    const user = userEvent.setup()
    open()
    renderCrop.mockReset()
    renderCrop.mockRejectedValue(new Error('decode'))
    Object.defineProperty(resized, 'size', { value: 600 * 1024, configurable: true })
    const upload = vi.spyOn(account, 'uploadAvatar')
    await uploadPhoto(user)
    expect(await screen.findByText("That image couldn't be read. Try another file.")).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
    Object.defineProperty(resized, 'size', { value: 2048, configurable: true })
  })
  it('photo: shows the service message when the upload is refused', async () => {
    const user = userEvent.setup()
    open()
    const message = ACCOUNT_ERRORS.invalid_avatar!.message
    vi.spyOn(account, 'uploadAvatar').mockResolvedValue(fail('invalid_avatar', message))
    await uploadPhoto(user)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText('Photo updated')).toBeNull()
    expect(preview().querySelector('img')).toBeNull()
  })

  it('photo: keeps the photo and says why when Remove fails', async () => {
    const user = userEvent.setup()
    open()
    await uploadPhoto(user)
    await screen.findByText('Photo updated')
    vi.spyOn(account, 'removeAvatar').mockResolvedValue(fail('unknown', 'Could not remove the photo. Try again.'))
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    expect(preview().querySelector('img')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
  })

  it('shows an error with a retry when the profile cannot be loaded', async () => {
    const get = vi.spyOn(account, 'getProfile').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', reason: 'unknown', message: 'Network down.' } })
    open()
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    get.mockRestore()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })
})
