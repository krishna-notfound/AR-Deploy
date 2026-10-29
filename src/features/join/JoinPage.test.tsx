import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { ok, teamFail } from '@/services/catalogService'

function open(hash = '') {
  window.history.replaceState(null, '', `/join${hash}`)
  return render(<App />)
}

beforeAll(async () => {
  await import('@/features/join/JoinPage')
}, 60_000)
beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Join page (ADR-0030)', () => {
  it('says a link without a token is not valid', { timeout: 20_000 }, async () => {
    open()
    expect(await screen.findByText(/This link isn't valid/)).toBeInTheDocument()
  })

  it('shows the invitation and removes the secret from the address bar', { timeout: 20_000 }, async () => {
    open('#t=demo-invite-token')
    expect(await screen.findByDisplayValue('marta.lopes@sanctus.example')).toHaveAttribute('readonly')
    expect(screen.getByText(/as Team/)).toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })

  it('checks the passwords match', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('#t=demo-invite-token')
    await screen.findByDisplayValue('marta.lopes@sanctus.example')
    await user.type(screen.getByLabelText('Full name'), 'Marta Lopes')
    await user.type(screen.getByLabelText('Password'), 'a-long-passphrase')
    await user.type(screen.getByLabelText('Confirm password'), 'something-else')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
  })

  it("shows 'Use at least 12 characters.' for 11 characters and does not submit", { timeout: 20_000 }, async () => {
    const create = vi.spyOn(service, 'acceptInviteCreate')
    const user = userEvent.setup()
    open('#t=demo-invite-token')
    await screen.findByDisplayValue('marta.lopes@sanctus.example')
    expect(screen.getByText(/At least 12 characters/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Full name'), 'Marta Lopes')
    await user.type(screen.getByLabelText('Password'), 'a'.repeat(11))
    await user.type(screen.getByLabelText('Confirm password'), 'a'.repeat(11))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument()
    // Supabase Auth hashes only the first 72 bytes: a longer password is refused here too.
    await user.clear(screen.getByLabelText('Password'))
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Password'), 'a'.repeat(73))
    await user.type(screen.getByLabelText('Confirm password'), 'a'.repeat(73))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at most 72 characters.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates the account once and opens the console', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'acceptInviteCreate')
    open('#t=demo-invite-token')
    await screen.findByDisplayValue('marta.lopes@sanctus.example')
    await user.type(screen.getByLabelText('Full name'), 'Marta Lopes')
    await user.type(screen.getByLabelText('Password'), 'a-long-passphrase')
    await user.type(screen.getByLabelText('Confirm password'), 'a-long-passphrase')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(window.location.pathname).toBe('/admin'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
  })

  it.each([
    ['expired', 'This invitation has expired. Ask the platform owner to send a new one.'],
    ['revoked', 'This invitation was revoked. Ask the platform owner if you still need access.'],
    ['used', 'This invitation has already been accepted. Sign in instead.'],
  ] as const)('explains a %s invitation', { timeout: 20_000 }, async (state, text) => {
    vi.spyOn(service, 'inspectInvite').mockResolvedValue(ok({ state }))
    open('#t=whatever')
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('offers sign-in when an account already exists', { timeout: 20_000 }, async () => {
    vi.spyOn(service, 'inspectInvite').mockResolvedValue(ok({ state: 'valid', email: 'a@studio.test', role: 'admin', invitedBy: 'o@x.test', expiresAt: '2026-11-01T10:00:00Z', accountExists: true }))
    open('#t=whatever')
    expect(await screen.findByText('You already have an account. Sign in to accept.')).toBeInTheDocument()
  })

  it('shows the server reason when creating fails', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'acceptInviteCreate').mockResolvedValue(teamFail('weak_password', 'Password is known to be weak'))
    open('#t=demo-invite-token')
    await screen.findByDisplayValue('marta.lopes@sanctus.example')
    await user.type(screen.getByLabelText('Full name'), 'Marta')
    await user.type(screen.getByLabelText('Password'), 'password1234')
    await user.type(screen.getByLabelText('Confirm password'), 'password1234')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Choose a stronger password.')).toBeInTheDocument()
  })
})
