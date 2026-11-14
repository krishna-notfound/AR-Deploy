import { act, render, screen } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { OfflineBanner } from './OfflineBanner'
import { RouteError } from './RouteError'

function Boom(): never {
  throw new Error('boom')
}

function renderCrash() {
  const router = createMemoryRouter(
    [{ element: <div><nav aria-label="Shell">Sidebar</nav><Outlet /></div>, children: [{ errorElement: <RouteError shell />, children: [{ path: '/', element: <Boom /> }] }] }],
    { initialEntries: ['/'] },
  )
  return render(
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('route error boundary (QA EF-17)', () => {
  it('a crash inside a layout is shown in the layout: the shell stays, the text follows the chosen language', () => {
    localStorage.setItem(LANG_KEY, 'pt')
    renderCrash()
    expect(screen.getByRole('navigation', { name: 'Shell' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ocorreu um erro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })

  it('says it in English when English is chosen, even if the browser is Portuguese', () => {
    localStorage.setItem(LANG_KEY, 'en')
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-PT')
    renderCrash()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})

describe('offline banner (QA EF-19)', () => {
  it('appears while the browser is offline and goes when it is back', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(
      <LanguageProvider>
        <OfflineBanner />
      </LanguageProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    online.mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toHaveTextContent('You are offline')
    online.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event('online')))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
