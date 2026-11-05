import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { ProductEditorForm } from './ProductEditorForm'

// Client feedback 2026-11-05, piece 1: the "Show the button on the product page" switch in the Call to action section.
vi.mock('./ModelRequestPanel', () => ({ ModelRequestPanel: () => <div data-testid="request-panel" /> }))
vi.mock('@/auth/usePermission', async (orig) => ({ ...(await orig<typeof import('@/auth/usePermission')>()), useCan: () => () => true }))

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderEditor(productId: string, businessId: string) {
  const b = await service.getBusinessById(businessId)
  const p = await service.getProductById(productId)
  if (!b.ok || !p.ok) throw new Error('seed missing')
  const router = createMemoryRouter(
    [
      { path: '/edit', element: <ProductEditorForm scope="admin" product={p.data} currentStatus={p.data.status} businesses={[b.data]} breadcrumbs={[{ label: 'Products', to: '/admin/products' }]} /> },
      { path: '*', element: <p data-testid="other-route" /> },
    ],
    { initialEntries: ['/edit'] },
  )
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  )
  return p.data
}
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /Save (draft|changes)/ }))
const showSwitch = () => screen.getByRole('switch', { name: 'Show the button on the product page' })
const stored = async () => {
  const r = await service.getProductById('prd_glam_sofa')
  if (!r.ok) throw new Error('product missing')
  return r.data
}

describe('product editor: the button switch', () => {
  it('is on by default; off disables the label and link but keeps their values', async () => {
    const user = userEvent.setup()
    const before = await renderEditor('prd_glam_sofa', 'biz_casa')
    expect(before.cta.url).toBeTruthy()
    expect(before.cta.hidden).toBeUndefined()
    expect(showSwitch()).toHaveAttribute('aria-checked', 'true')
    const link = screen.getByRole('textbox', { name: /^Button link/ })
    const label = screen.getByRole('textbox', { name: /^Button label/ })
    expect(link).toBeEnabled()
    expect(label).toBeEnabled()

    await user.click(showSwitch())
    expect(showSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(link).toBeDisabled()
    expect(label).toBeDisabled()
    expect(link).toHaveValue(before.cta.url)
  })

  it('round-trips through save: hidden is stored with the label and link kept, and turning it on again stores no `hidden`', async () => {
    const user = userEvent.setup()
    const before = await renderEditor('prd_glam_sofa', 'biz_casa')
    await user.click(showSwitch())
    await save(user)
    await waitFor(async () => expect((await stored()).cta.hidden).toBe(true))
    const hidden = await stored()
    expect(hidden.cta.url).toBe(before.cta.url)
    expect(hidden.cta.label).toEqual(before.cta.label)

    cleanup()
    await renderEditor('prd_glam_sofa', 'biz_casa')
    expect(showSwitch()).toHaveAttribute('aria-checked', 'false')
    await user.click(showSwitch())
    expect(screen.getByRole('textbox', { name: /^Button link/ })).toBeEnabled()
    await save(user)
    await waitFor(async () => expect((await stored()).cta.hidden).toBeUndefined())
    expect((await stored()).cta.url).toBe(before.cta.url)
  })
})
