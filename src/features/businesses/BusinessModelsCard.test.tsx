import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { BusinessModelsCard } from './BusinessModelsCard'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

async function business(id: string): Promise<Business> {
  const r = await service.getBusinessById(id)
  if (!r.ok) throw new Error('seed')
  return r.data
}

async function renderCard(b: Business, onChanged = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BusinessModelsCard business={b} onChanged={onChanged} />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
  return onChanged
}

describe('BusinessModelsCard', () => {
  it('with models.manage: the switch, its hint and the open-request count linking to the queue', async () => {
    const casa = await business('biz_casa') // off, with two open requests in the seed
    await renderCard(casa)
    const sw = await screen.findByRole('switch', { name: 'Can upload its own 3D files' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText("The business requests 3D models from the Sanctus team and can't add, replace or remove 3D files itself.")).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: /2 open requests/ })
    expect(link).toHaveAttribute('href', modelRequestsAdminPath({ status: 'open', businessId: 'biz_casa' }))
  })

  it('shows the on hint for a business that may upload', async () => {
    await renderCard(await business('biz_nord'))
    expect(await screen.findByRole('switch', { name: 'Can upload its own 3D files' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('The business can upload its own GLB and USDZ files, and can still request models.')).toBeInTheDocument()
    expect(await screen.findByText('No open requests')).toBeInTheDocument()
  })

  it('turning it on does not ask, and says it saved', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'setBusinessOwnModels')
    const onChanged = await renderCard(await business('biz_casa'))
    await user.click(await screen.findByRole('switch', { name: 'Can upload its own 3D files' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(spy).toHaveBeenCalledWith('biz_casa', true))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it("turning it off asks \"Stop {businessName} uploading its own 3D files?\" with 'Turn off' / 'Cancel'", async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'setBusinessOwnModels')
    await renderCard(await business('biz_nord'))
    await user.click(await screen.findByRole('switch', { name: 'Can upload its own 3D files' }))
    const dialog = await screen.findByRole('dialog', { name: 'Stop Nordhaus Living uploading its own 3D files?' })
    expect(dialog).toHaveTextContent('Its current 3D files stay on its products and public pages.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(spy).not.toHaveBeenCalled()
    await user.click(screen.getByRole('switch', { name: 'Can upload its own 3D files' }))
    await user.click(await screen.findByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('biz_nord', false))
  })

  it('a refused save shows the error and keeps the switch as it was', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'setBusinessOwnModels').mockResolvedValue(fail('PERMISSION', "You don't have permission to do this."))
    await renderCard(await business('biz_casa'))
    const sw = await screen.findByRole('switch', { name: 'Can upload its own 3D files' })
    await user.click(sw)
    expect(await screen.findByText("Couldn't save the change")).toBeInTheDocument()
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('count: loading, then an error with Retry', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'getModelRequests').mockResolvedValue(fail('UNKNOWN', 'boom'))
    await renderCard(await business('biz_casa'))
    expect(await screen.findByText("Couldn't load 3D model requests.")).toBeInTheDocument()
    spy.mockResolvedValue(ok({ items: [], total: 1 }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: /1 open request$/ })).toBeInTheDocument()
  })

  it("without models.manage: a read-only line, no switch and no count", async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions: ['businesses.view'], status: 'active' }))
    const spy = vi.spyOn(service, 'getModelRequests')
    await renderCard(await business('biz_nord'))
    expect(await screen.findByText("Own 3D uploads: allowed. Changing this needs 'Handle 3D model requests'.")).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('link', { name: /open request/ })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
