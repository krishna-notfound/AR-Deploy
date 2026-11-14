// The "Email preferences" link at the foot of every email (ADR-0078) opens the right settings for whoever is signed in.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import EmailPreferencesRedirect from './EmailPreferencesRedirect'

const account = vi.hoisted(() => ({ user: undefined as undefined | null | { role: string } }))
vi.mock('@/auth/AccountProvider', () => ({ useOptionalAccount: () => ({ user: account.user }) }))
vi.mock('@/auth/RequireRole', () => ({ SIGN_IN_PATH: '/login' }))

function renderAt(user: undefined | null | { role: string }) {
  account.user = user
  return render(
    <MemoryRouter initialEntries={['/email/preferences']}>
      <Routes>
        <Route path="/email/preferences" element={<EmailPreferencesRedirect />} />
        <Route path="/admin/settings/notifications" element={<p>Admin notifications</p>} />
        <Route path="/dashboard/settings/notifications" element={<p>Business notifications</p>} />
        <Route path="/login" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('email preferences link', () => {
  it('opens the console notifications for platform staff', async () => {
    renderAt({ role: 'super_admin' })
    expect(await screen.findByText('Admin notifications')).toBeInTheDocument()
  })
  it('opens the dashboard notifications for a business owner', async () => {
    renderAt({ role: 'business_admin' })
    expect(await screen.findByText('Business notifications')).toBeInTheDocument()
  })
  it('sends a visitor who is not signed in to sign in first', async () => {
    renderAt(null)
    expect(await screen.findByText('Sign-in page')).toBeInTheDocument()
  })
  it('waits while the account loads', () => {
    renderAt(undefined)
    expect(screen.queryByText('Sign-in page')).toBeNull()
    expect(screen.queryByText('Admin notifications')).toBeNull()
  })
})
