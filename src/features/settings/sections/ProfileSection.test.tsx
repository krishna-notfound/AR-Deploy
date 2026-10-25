import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'

const resized = new Blob([new Uint8Array(2048)], { type: 'image/webp' })
vi.mock('@/lib/image', () => ({ squareResize: vi.fn(async () => resized) }))
const { squareResize } = await import('@/lib/image')

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
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const photoCard = () => screen.getByRole('region', { name: 'Photo' })
const preview = () => photoCard().querySelector('[data-avatar]')!

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
    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    // The preview initials come back to the saved name.
    await waitFor(() => expect(preview().textContent).not.toBe('N'))
  })

  it('photo: a non-image or a file over 5 MB before resize is refused with a message; a valid image is resized and uploaded; Remove returns to initials', async () => {
    const user = userEvent.setup({ applyAccept: false })
    open()
    const input = (await screen.findByLabelText('Upload photo')) as HTMLInputElement
    const upload = vi.spyOn(account, 'uploadAvatar')

    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument()

    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('That image is larger than 5 MB. Choose a smaller one.')).toBeInTheDocument()
    expect(squareResize).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()

    const good = new File([new Uint8Array(900 * 1024)], 'me.png', { type: 'image/png' })
    await user.upload(input, good)
    expect(await screen.findByText('Photo updated')).toBeInTheDocument()
    expect(squareResize).toHaveBeenCalledWith(good, 256)
    expect(upload).toHaveBeenCalledWith(resized)
    await waitFor(() => expect(preview().querySelector('img')).not.toBeNull())
    expect(screen.queryByText('Choose a JPEG, PNG or WebP image.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(await screen.findByText('Photo removed')).toBeInTheDocument()
    await waitFor(() => expect(preview().querySelector('img')).toBeNull())
    expect(preview().textContent).toMatch(/^[A-Z]{1,2}$/)
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull()
  })

  it('shows an error with a retry when the profile cannot be loaded', async () => {
    const get = vi.spyOn(account, 'getProfile').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', reason: 'unknown', message: 'Network down.' } })
    open()
    expect(await screen.findByText('Network down.')).toBeInTheDocument()
    get.mockRestore()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })
})
