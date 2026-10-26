// S1.5 Task 9 (R-W6-8): platform access follows the security state's refresh cadence (focus, visibility, the aal1
// interval) and any PERMISSION error, so a role or permission change made elsewhere reaches an open session.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { adminNav } from '@/components/layout/nav'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Permission, PlatformAccess } from '@/domain/types'
import { type AccountService, type AuthService, type SignedInAccount, service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { fakeAccount, fakeAuth } from '@/test/securityFakes'
import { AccountProvider } from './AccountProvider'
import { RequireRole } from './RequireRole'

const fake = vi.hoisted(() => ({ auth: null as AuthService | null, account: null as AccountService | null }))
vi.mock('@/services', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services')>()
  return {
    ...mod,
    get auth() {
      return fake.auth
    },
    get account() {
      return fake.account ?? mod.account
    },
  }
})

const CHANGED = 'Your access changed. This page was updated.'
const ADMIN_PERMS: Permission[] = ['analytics.view', 'businesses.view', 'products.view']
const access = (permissions: Permission[]): PlatformAccess => ({ role: 'admin', permissions, status: 'active' })
const STAFF: SignedInAccount = { email: 'ana@test', user: { id: 'u1', name: 'Ana', email: 'ana@test', role: 'super_admin', platform: access(ADMIN_PERMS) } }

/** A page that loads something the database refuses. */
function Refused() {
  const q = useServiceQuery(() => Promise.resolve(fail<string>('PERMISSION', "You don't have permission to do this.")), [])
  return <p>{q.status === 'error' ? 'Refused page' : 'Loading page'}</p>
}

function renderAdmin(path = '/admin') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole allow="super_admin"><DashboardShell nav={adminNav} variant="admin" /></RequireRole>}>
              <Route index element={<p>Admin home</p>} />
              <Route path="refused" element={<Refused />} />
            </Route>
            {/* RequireRole's sign-in path (/demo in a demo build, /login with Supabase). */}
            <Route path="/login" element={<p>Sign-in page</p>} />
            <Route path="/demo" element={<p>Sign-in page</p>} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function setup(session: SignedInAccount = STAFF) {
  const a = fakeAuth(session)
  const acc = fakeAccount({ requires2fa: false, factor: false, aal: 'aal1' }, a.fire)
  fake.auth = a.auth
  fake.account = acc.account
  return { ...a, ...acc }
}

const later = (ms: number) => {
  const t = Date.now() + ms
  vi.spyOn(Date, 'now').mockReturnValue(t)
}
const navLink = (name: string) => screen.queryByRole('link', { name: new RegExp(`^${name}`) })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  fake.auth = null
  fake.account = null
  vi.restoreAllMocks()
})

describe('AccountProvider: platform access refresh (S1.5 Task 9, R-W6-8)', () => {
  it("a changed permission set on focus updates the nav and shows 'Your access changed. This page was updated.'", async () => {
    setup()
    const getMyAccess = vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok(access(ADMIN_PERMS)))
    renderAdmin()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(navLink('Analytics')).toBeInTheDocument()

    // The Owner removes analytics.view from Admin on another device.
    getMyAccess.mockResolvedValue(ok(access(['businesses.view', 'products.view'])))
    // Same cadence as the security state: not within 30 s of the last load…
    fireEvent.focus(window)
    expect(getMyAccess).not.toHaveBeenCalled()
    // …then on focus.
    later(31_000)
    fireEvent.focus(window)
    expect(await screen.findByText(CHANGED)).toBeInTheDocument()
    expect(getMyAccess).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(navLink('Analytics')).toBeNull())
    expect(navLink('Businesses')).toBeInTheDocument()
    expect(screen.getByText('Admin home')).toBeInTheDocument()
  })

  it('the same access on a later refresh changes nothing and says nothing', async () => {
    setup()
    const getMyAccess = vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok(access([...ADMIN_PERMS].reverse())))
    renderAdmin()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    later(31_000)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(getMyAccess).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(CHANGED)).toBeNull()
    expect(navLink('Analytics')).toBeInTheDocument()
  })

  it('a PERMISSION error triggers a refetch', async () => {
    setup()
    const getMyAccess = vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok(access(['businesses.view'])))
    renderAdmin('/admin/refused')
    expect(await screen.findByText('Refused page')).toBeInTheDocument()
    await waitFor(() => expect(getMyAccess).toHaveBeenCalled())
    expect(await screen.findByText(CHANGED)).toBeInTheDocument()
    await waitFor(() => expect(navLink('Analytics')).toBeNull())
  })

  it('access turned off while signed in: the account reloads and the dashboard is left', async () => {
    const a = setup()
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: null, permissions: [], status: 'deactivated' }))
    renderAdmin()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    a.setSession({ email: 'ana@test', user: null, deactivated: true })
    later(31_000)
    fireEvent.focus(window)
    expect(await screen.findByText('Sign-in page')).toBeInTheDocument()
    expect(screen.queryByText(CHANGED)).toBeNull()
  })

  it('a business owner session never asks for platform access', async () => {
    setup({ email: 'rui@test', user: { id: 'u2', name: 'Rui', email: 'rui@test', role: 'business_admin', businessId: 'biz_casa' } })
    const getMyAccess = vi.spyOn(service, 'getMyAccess')
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AccountProvider>
            <Routes>
              <Route path="/dashboard" element={<Refused />} />
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(await screen.findByText('Refused page')).toBeInTheDocument()
    later(31_000)
    fireEvent.focus(window)
    await new Promise((r) => setTimeout(r, 20))
    expect(getMyAccess).not.toHaveBeenCalled()
  })
})
