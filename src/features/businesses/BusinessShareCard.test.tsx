import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { BusinessShareCard } from './BusinessShareCard'

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

function renderCard(b: Business, onChanged = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <BusinessShareCard business={b} onChanged={onChanged} />
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
  return onChanged
}

describe('BusinessShareCard (ADR-0054)', () => {
  it('every company starts with the Share button on', async () => {
    renderCard(await business('biz_casa'))
    expect(await screen.findByRole('switch', { name: 'Show the Share button' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText("The Share button shows on this business's product pages.")).toBeInTheDocument()
  })

  it('turning it off saves the company setting and says what stays', async () => {
    const user = userEvent.setup()
    const onChanged = renderCard(await business('biz_casa'))
    await user.click(await screen.findByRole('switch', { name: 'Show the Share button' }))
    await waitFor(async () => expect((await business('biz_casa')).shareEnabled).toBe(false))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('a refused save shows the error and keeps the switch as it was', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'setBusinessShareEnabled').mockResolvedValue(fail('PERMISSION', "You don't have permission to do this."))
    renderCard(await business('biz_casa'))
    const sw = await screen.findByRole('switch', { name: 'Show the Share button' })
    await user.click(sw)
    expect(await screen.findByText("Couldn't save the change")).toBeInTheDocument()
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it("without 'Create and edit businesses': a read-only line and no switch", async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions: ['businesses.view'], status: 'active' }))
    renderCard(await business('biz_nord'))
    expect(await screen.findByText("Share button: shown. Changing this needs 'Create and edit businesses'.")).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('the service refuses a company owner and staff without businesses.edit (as the database does)', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_casa' }))
    const owner = await service.setBusinessShareEnabled('biz_casa', false)
    expect(owner.ok).toBe(false)
    expect((await business('biz_casa')).shareEnabled).toBe(true)
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    expect((await service.setBusinessShareEnabled('biz_casa', false)).ok).toBe(false)
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    expect((await service.setBusinessShareEnabled('biz_casa', false)).ok).toBe(true)
    expect((await business('biz_casa')).shareEnabled).toBe(false)
  })
})
