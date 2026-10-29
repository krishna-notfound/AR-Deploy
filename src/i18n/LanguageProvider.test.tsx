import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RootLayout } from '@/app/RootLayout'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider, useI18n } from './LanguageProvider'
import { pluralKey } from './translate'

function Probe() {
  const { lang, t, tn } = useI18n()
  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p data-testid="one">{tn('zz.test' as never, 1)}</p>
      <p data-testid="other">{tn('zz.test' as never, 5)}</p>
      <p>{t('ar.button')}</p>
    </div>
  )
}

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setUrl('')
})
afterEach(() => {
  vi.restoreAllMocks()
  setUrl('')
})

describe('LanguageProvider choice order', () => {
  it('defaults to English when nothing is set and the browser is not Portuguese', () => {
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
  })

  it('uses the browser language when nothing is saved (pt* is Portuguese)', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('pt')
  })

  it('a saved choice beats the browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-PT')
    localStorage.setItem(LANG_KEY, 'en')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
  })

  it('?lang= beats the saved choice for that visit and is not stored', () => {
    localStorage.setItem(LANG_KEY, 'en')
    setUrl('?lang=pt')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('pt')
    expect(localStorage.getItem(LANG_KEY)).toBe('en')
  })

  it('migrates the old sessionStorage choice to localStorage once', () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('pt')
    expect(localStorage.getItem(LANG_KEY)).toBe('pt')
    expect(sessionStorage.getItem(LANG_KEY)).toBeNull()
  })

  it('does not overwrite an existing localStorage choice with the session one', () => {
    localStorage.setItem(LANG_KEY, 'en')
    sessionStorage.setItem(LANG_KEY, 'pt')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    expect(localStorage.getItem(LANG_KEY)).toBe('en')
  })

  it('setLang remembers the choice on the device and sets the document language', async () => {
    const user = userEvent.setup()
    function Setter() {
      const { setLang } = useI18n()
      return <button type="button" onClick={() => setLang('pt')}>go</button>
    }
    render(<LanguageProvider><Setter /><Probe /></LanguageProvider>)
    await user.click(screen.getByText('go'))
    expect(localStorage.getItem(LANG_KEY)).toBe('pt')
    expect(document.documentElement.lang).toBe('pt-PT')
    expect(screen.getByText('Ver na minha casa')).toBeInTheDocument()
  })

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
  })
})

describe('tn (plurals)', () => {
  it('picks .one for 1 and .other otherwise (missing keys come back as the key)', () => {
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByTestId('one')).toHaveTextContent('zz.test.one')
    expect(screen.getByTestId('other')).toHaveTextContent('zz.test.other')
  })

  it('pluralKey follows Intl.PluralRules: pt-PT treats 0 as other, 1 as one', () => {
    expect(pluralKey('pt', 'x', 1)).toBe('x.one')
    expect(pluralKey('pt', 'x', 0)).toBe('x.other')
    expect(pluralKey('en', 'x', 1)).toBe('x.one')
    expect(pluralKey('en', 'x', 2)).toBe('x.other')
  })
})

describe('provider at the app root', () => {
  it('a component under /admin can call useI18n and follows the saved language', () => {
    localStorage.setItem(LANG_KEY, 'pt')
    function AdminThing() {
      const { t } = useI18n()
      return <p>{t('ar.button')}</p>
    }
    const router = createMemoryRouter([{ element: <RootLayout />, children: [{ path: '/admin', element: <AdminThing /> }] }], { initialEntries: ['/admin'] })
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    )
    expect(screen.getByText('Ver na minha casa')).toBeInTheDocument()
  })
})
