// QA #39 (F2): the page behind an open mobile menu must not scroll (public header menu and the dashboard drawer).
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { SiteHeader } from '@/features/marketing/SiteChrome'
import { lockBodyScroll } from '@/lib/scrollLock'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { DashboardShell } from './DashboardShell'
import { adminNav } from './nav'

afterEach(() => {
  document.body.style.overflow = ''
})

describe('lockBodyScroll', () => {
  it('locks the body, and restores what it was when the last lock is released', () => {
    document.body.style.overflow = 'auto'
    const a = lockBodyScroll()
    const b = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    a()
    a() // releasing twice changes nothing
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('dashboard mobile drawer', () => {
  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    resetMockAccount()
    await service.resetDemoData()
  })

  it('locks the page scroll while open and restores it on close', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <AccountProvider>
            <Routes>
              <Route path="/admin" element={<DashboardShell nav={adminNav} variant="admin" />}>
                <Route index element={<p>Admin home</p>} />
              </Route>
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Open navigation' }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(document.body.style.overflow).toBe('')
  })
})

describe('public header menu', () => {
  it('locks the page scroll when the menu dialog opens and restores it when it closes', () => {
    // jsdom has no <dialog> modal support: stand in for it, firing the same events the browser does.
    const proto = HTMLDialogElement.prototype
    const orig = { showModal: proto.showModal, close: proto.close }
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
    try {
      render(
        <MemoryRouter>
          <SiteHeader />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: /open/i }))
      expect(document.body.style.overflow).toBe('hidden')
      fireEvent.click(document.querySelector('dialog button')!)
      expect(document.body.style.overflow).toBe('')
    } finally {
      proto.showModal = orig.showModal
      proto.close = orig.close
    }
  })
})
