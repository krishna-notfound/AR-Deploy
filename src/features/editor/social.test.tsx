import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'

const open = () => {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', '/admin/editor/social')
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Social media screen', () => {
  it('accepts a link without a scheme, stores it with https and shows the icon', { timeout: 30_000 }, async () => {
    open()
    const box = await screen.findByRole('textbox', { name: /Instagram/ })
    await userEvent.type(box, 'instagram.com/sanctus')
    // What is typed stays as typed while the box has focus; the draft holds the clean link.
    expect(box).toHaveValue('instagram.com/sanctus')
    await userEvent.tab()
    expect(box).toHaveValue('https://instagram.com/sanctus')
    const icons = screen.getByRole('list', { name: 'Icons in the footer' })
    expect(within(icons).getAllByRole('listitem')).toHaveLength(1)
    // Autosaved to the draft after two seconds.
    await waitFor(async () => {
      const s = await content.getContentDraft()
      expect(s.ok && s.data.draft.social).toEqual({ instagram: 'https://instagram.com/sanctus' })
    }, { timeout: 6000 })
  })

  it('refuses a look-alike host, an http link and a link to the wrong network, with a reason', { timeout: 30_000 }, async () => {
    open()
    const box = await screen.findByRole('textbox', { name: /Instagram/ })
    await userEvent.type(box, 'instagram.com.evil.example')
    expect(await screen.findByText('This link is not on the right website for this network.')).toBeInTheDocument()
    await userEvent.clear(box)
    await userEvent.type(box, 'http://instagram.com/x')
    expect(await screen.findByText('Use an https link.')).toBeInTheDocument()
    await userEvent.clear(box)
    await userEvent.type(box, 'https://facebook.com/x')
    expect(await screen.findByText('This link is not on the right website for this network.')).toBeInTheDocument()
    // The problem keeps Publish disabled and is listed in the top bar.
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText('1 problem to fix before publishing')).toBeInTheDocument()
    // Emptying the box removes the link and the problem.
    await userEvent.clear(box)
    await waitFor(() => expect(screen.queryByText('1 problem to fix before publishing')).toBeNull())
  })

  it('every network has its own box, in footer order', { timeout: 30_000 }, async () => {
    open()
    await screen.findByRole('textbox', { name: /Instagram/ })
    const names = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest']
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(6)
    names.forEach((name, i) => expect(boxes[i]).toBe(screen.getByRole('textbox', { name: new RegExp(`^${name}`) })))
  })
})
