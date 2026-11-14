// Settings > My account > "Sign-in emails" (ADR-0077): the platform Owner's primary email and up to 3 aliases, in demo mode.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { LANG_KEY } from '@/i18n/LanguageProvider'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import { resetMyProfileStore } from '../useMyProfile'

type As = { role: 'super_admin'; platformRole?: 'owner' | 'admin' | 'team' } | { role: 'business_admin'; businessId: string }
const OWNER: As = { role: 'super_admin' }

function open(as: As, url = '/admin/settings/account') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const card = () => screen.getByRole('region', { name: /^(Sign-in emails|Emails de início de sessão)$/ })
const ready = () => screen.findByRole('region', { name: 'Sign-in emails' })

/** Two-step verification on and at aal2 (what the real function needs for "Make primary" and "Remove"). */
async function withTwoFactor() {
  asOwner()
  const e = await account.startTotpEnrollment()
  if (!e.ok) throw new Error('enrol')
  await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
}
/** The demo account service reads who is signed in from the stored demo account. */
const asOwner = () => localStorage.setItem(ACCOUNT_KEY, JSON.stringify(OWNER))
async function addAlias(email: string) {
  asOwner()
  await account.sendAliasCode(email)
  await account.addAlias(email, DEMO_CODE)
}

beforeAll(async () => {
  await Promise.all([import('../SettingsSectionPage'), import('./AccountSection'), import('./SignInEmailsCard'), import('@/features/demo/DemoEntryPage')])
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

describe('Sign-in emails card', () => {
  it('shows the primary with its label, no aliases yet, and an Add alias button, to the Owner only', async () => {
    open(OWNER)
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const c = await ready()
    expect(await within(c).findByText('demo@demo.example')).toBeInTheDocument()
    expect(within(c).getByText('Primary')).toBeInTheDocument()
    expect(within(c).getByText('No extra sign-in emails yet.')).toBeInTheDocument()
    expect(within(c).getByText('0 of 3 extra sign-in emails')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Add alias' })).toBeEnabled()
    // The primary is not removable and cannot be "made primary".
    expect(within(c).queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(within(c).queryByRole('button', { name: 'Make primary' })).toBeNull()
  })

  it.each([
    ['an Admin', { role: 'super_admin', platformRole: 'admin' } as As, '/admin/settings/account'],
    ['a Team member', { role: 'super_admin', platformRole: 'team' } as As, '/admin/settings/account'],
    ['a business owner', { role: 'business_admin', businessId: 'biz_casa' } as As, '/dashboard/settings/account'],
  ])('is not shown to %s', async (_who, as, url) => {
    const list = vi.spyOn(account, 'listSignInEmails')
    open(as, url)
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await screen.findByRole('button', { name: 'Change password' })
    expect(screen.queryByRole('region', { name: 'Sign-in emails' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })

  it('add: email → code sent to the new address → right code adds it, with Make primary and Remove next to it', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(account, 'sendAliasCode')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Add alias' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a sign-in email' })

    // A bad address is refused before anything is sent.
    await user.type(within(dialog).getByLabelText('Email address'), 'not-an-email')
    await user.click(within(dialog).getByRole('button', { name: 'Send code' }))
    expect(await within(dialog).findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()

    // The primary address is refused by the server (email_in_use).
    await user.clear(within(dialog).getByLabelText('Email address'))
    await user.type(within(dialog).getByLabelText('Email address'), 'demo@demo.example')
    await user.click(within(dialog).getByRole('button', { name: 'Send code' }))
    expect(await within(dialog).findByText('This email is already used by an account or by another sign-in email.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Email address'))
    await user.type(within(dialog).getByLabelText('Email address'), 'client@client.test')
    await user.click(within(dialog).getByRole('button', { name: 'Send code' }))
    expect(await within(dialog).findByText(/We sent a code to c•••@client\.test/)).toBeInTheDocument()
    expect(send).toHaveBeenLastCalledWith('client@client.test')

    const code = within(dialog).getByLabelText('6-digit code')
    await user.type(code, '000000')
    await user.click(within(dialog).getByRole('button', { name: 'Add email' }))
    expect(await within(dialog).findByText("That code isn't right. Check it and try again.")).toBeInTheDocument()

    await user.clear(code)
    await user.type(code, DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Add email' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const list = within(card()).getByRole('list', { name: 'Sign-in emails' })
    const row = within(list).getByText('client@client.test').closest('li') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Make primary' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(within(card()).getByText('1 of 3 extra sign-in emails')).toBeInTheDocument()
  })

  it('the code step can send a new code, and a failed send is shown', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(account, 'sendAliasCode')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Add alias' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a sign-in email' })
    await user.type(within(dialog).getByLabelText('Email address'), 'client@client.test')
    await user.click(within(dialog).getByRole('button', { name: 'Send code' }))
    await within(dialog).findByText(/We sent a code to/)
    send.mockResolvedValueOnce(accountFail('email_failed'))
    await user.click(within(dialog).getByRole('button', { name: 'Send a new code' }))
    expect(await within(dialog).findByText("We couldn't send the email. Try again.")).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('at 3 aliases Add alias is disabled and says why', async () => {
    for (const e of ['a@client.test', 'b@client.test', 'c@client.test']) await addAlias(e)
    open(OWNER)
    const c = await ready()
    expect(await within(c).findByText('3 of 3 extra sign-in emails')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Add alias' })).toBeDisabled()
    expect(within(c).getByText('You have 3 extra sign-in emails. Remove one to add another.')).toBeInTheDocument()
  })

  it('make primary: needs the authenticator code; swaps the two addresses and says so', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    await addAlias('client@client.test')
    await withTwoFactor()
    const make = vi.spyOn(account, 'makeAliasPrimary')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Make primary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Make client@client.test your primary email?' })
    expect(dialog).toHaveTextContent('Sanctus will send every email and reset code to client@client.test. demo@demo.example stays as a sign-in email.')

    // An empty code is refused before any call.
    await user.click(within(dialog).getByRole('button', { name: 'Make primary' }))
    expect(await within(dialog).findByText('Enter the 6-digit code from your authenticator app.')).toBeInTheDocument()
    expect(make).not.toHaveBeenCalled()

    const totp = within(dialog).getByLabelText('Authenticator code')
    await user.type(totp, '000000')
    await user.click(within(dialog).getByRole('button', { name: 'Make primary' }))
    expect(await within(dialog).findByText("That authenticator code isn't right. Enter the newest code from the app.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Authenticator code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Make primary' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(make).toHaveBeenLastCalledWith('client@client.test', DEMO_CODE)
    const list = within(card()).getByRole('list', { name: 'Sign-in emails' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('client@client.test')
    expect(rows[0]).toHaveTextContent('Primary')
    expect(rows[1]).toHaveTextContent('demo@demo.example')
    expect(within(rows[1]!).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('without 2FA the server asks for it: the reason is shown in the dialog and nothing changes', async () => {
    const user = userEvent.setup()
    await addAlias('client@client.test')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Make primary' }))
    const dialog = await screen.findByRole('dialog', { name: /Make client@client.test your primary email/ })
    await user.type(within(dialog).getByLabelText('Authenticator code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Make primary' }))
    expect(await within(dialog).findByText('This needs 2FA. Sign in with your authenticator code first.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(within(card()).getByRole('list', { name: 'Sign-in emails' })).getAllByRole('listitem')[0]).toHaveTextContent('demo@demo.example')
  })

  it('remove: asks first; Cancel keeps it; Remove takes it off the list', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    await addAlias('client@client.test')
    await withTwoFactor()
    const remove = vi.spyOn(account, 'removeAlias')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Remove' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remove client@client.test?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()
    await user.click(within(card()).getByRole('button', { name: 'Remove' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Remove client@client.test?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(card()).queryByText('client@client.test')).toBeNull())
    expect(remove).toHaveBeenCalledWith('client@client.test')
  })

  it('remove without 2FA: the refusal is shown and the alias stays', async () => {
    const user = userEvent.setup()
    await addAlias('client@client.test')
    open(OWNER)
    const c = await ready()
    await user.click(await within(c).findByRole('button', { name: 'Remove' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('This needs 2FA. Sign in with your authenticator code first.')).toBeInTheDocument()
    expect(within(card()).getByText('client@client.test')).toBeInTheDocument()
  })

  it('a failed read has a Try again that reloads', async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'listSignInEmails').mockResolvedValueOnce(accountFail('unknown'))
    open(OWNER)
    const c = await screen.findByRole('region', { name: 'Sign-in emails' })
    expect(await within(c).findByText(/Could not load your sign-in emails/)).toBeInTheDocument()
    await user.click(within(c).getByRole('button', { name: 'Try again' }))
    expect(await within(c).findByText('demo@demo.example')).toBeInTheDocument()
  })
})

describe('Sign-in emails card in Portuguese (PT-PT)', () => {
  it('shows the card, the add dialog and the refusals in pt-PT', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const user = userEvent.setup()
    open(OWNER)
    const c = await screen.findByRole('region', { name: 'Emails de início de sessão' })
    expect(within(await within(c).findByRole('list', { name: 'Emails de início de sessão' })).getByText('Principal')).toBeInTheDocument()
    expect(within(c).getByText('Ainda não tem emails de início de sessão adicionais.')).toBeInTheDocument()
    await user.click(within(c).getByRole('button', { name: 'Adicionar alias' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar email de início de sessão' })
    await user.type(within(dialog).getByLabelText('Endereço de email'), 'client@client.test')
    await user.click(within(dialog).getByRole('button', { name: 'Enviar código' }))
    expect(await within(dialog).findByText(/Enviámos um código para c•••@client\.test/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Código de 6 dígitos'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar email' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(card()).getByRole('button', { name: 'Tornar principal' })).toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Remover' })).toBeInTheDocument()
    expect(within(card()).getByText('1 de 3 emails de início de sessão adicionais')).toBeInTheDocument()
  })
})
