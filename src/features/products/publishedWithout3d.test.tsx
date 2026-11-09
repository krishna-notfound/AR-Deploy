// ADR-0054: products published before the 3D-only rule stay published; staff find them with the "Published without 3D"
// filter and can unpublish them there.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { DEMO_REQUEST_TARGET_SLUG } from '@/services/mock/seed'
import { service } from '@/services'
import { applyProductFilters, CLEARED_PRODUCT_FILTERS } from './ProductFilters'

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const FILTERS = { ...CLEARED_PRODUCT_FILTERS, page: 1 }

describe('published without 3D', () => {
  it('keeps only published products that have no GLB of their own', async () => {
    const all = await service.getProducts()
    if (!all.ok) throw new Error('seed')
    const found = applyProductFilters(all.data, { ...FILTERS, status: 'published-no3d' })
    expect(found.length).toBeGreaterThan(0)
    for (const p of found) {
      expect(p.status).toBe('published')
      expect(p.models.glb).toBeUndefined()
    }
    // The demo's published photo-only piece is among them; drafts and products with a model are not.
    expect(found.some((p) => p.slug === DEMO_REQUEST_TARGET_SLUG)).toBe(true)
    expect(found.some((p) => p.status === 'draft' || !!p.models.glb)).toBe(false)
    // The plain statuses are unchanged.
    expect(applyProductFilters(all.data, { ...FILTERS, status: 'published' }).length).toBeGreaterThan(found.length)
  })

  it('the admin list offers the filter, reads it from the address, and staff can unpublish from the result', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/admin/products?status=published-no3d')
    render(<App />)
    const status = await screen.findByRole('combobox', { name: 'Filter by status' })
    expect(status).toHaveValue('published-no3d')
    expect(within(status).getByRole('option', { name: 'Published without 3D' })).toBeInTheDocument()
    const table = await screen.findByRole('table')
    const row = (await within(table).findByRole('link', { name: /Mustard Tufted Armchair/i })).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /^Actions for / }))
    await user.click(await screen.findByRole('menuitem', { name: 'Unpublish' }))
    const confirm = screen.queryByRole('button', { name: 'Unpublish' })
    if (confirm) await user.click(confirm)
    const after = await service.getProducts()
    if (!after.ok) throw new Error('seed')
    expect(after.data.find((p) => p.slug === DEMO_REQUEST_TARGET_SLUG)?.status).toBe('draft')
  })
})
