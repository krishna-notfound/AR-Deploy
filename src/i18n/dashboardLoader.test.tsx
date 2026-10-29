import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enDashboard } from './dictionaries/en.dashboard'
import { ptDashboard } from './dictionaries/pt.dashboard'
import { DashboardDictionaries } from './DashboardDictionaries'
import { dashboardReady } from './dashboardLoader'
import { LanguageProvider, LANG_KEY, useI18n } from './LanguageProvider'
import { isDashboardDictionaryLoaded, registerDashboardDictionary, translate, unregisterDashboardDictionaries } from './translate'

// The test setup installs both dashboard dictionaries; these tests start from the state of a first public page load.
beforeEach(() => {
  unregisterDashboardDictionaries()
  localStorage.clear()
})
afterEach(() => {
  registerDashboardDictionary('en', enDashboard)
  registerDashboardDictionary('pt', ptDashboard)
})

function Probe() {
  const { t, lang, setLang } = useI18n()
  return (
    <div>
      <p data-testid="text">{t('settings.title')}</p>
      <p data-testid="lang">{lang}</p>
      <button type="button" onClick={() => setLang('pt')}>
        pt
      </button>
      <button type="button" onClick={() => setLang('en')}>
        en
      </button>
    </div>
  )
}

describe('dashboard dictionaries', () => {
  it('a dashboard key is not known before the dashboard loads, and the first-load text is', () => {
    expect(translate('en', 'settings.title')).toBe('settings.title')
    expect(translate('en', 'common.save')).toBe('Save')
    expect(dashboardReady('en')).toBe(false)
  })

  it('the dashboard route shows the skeleton, then renders with the text loaded', async () => {
    render(
      <LanguageProvider>
        <DashboardDictionaries>
          <Probe />
        </DashboardDictionaries>
      </LanguageProvider>,
    )
    expect(screen.queryByTestId('text')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('text')).toHaveTextContent(translate('en', 'settings.title')))
    expect(screen.getByTestId('text')).not.toHaveTextContent('settings.title')
    expect(isDashboardDictionaryLoaded('en')).toBe(true)
    expect(isDashboardDictionaryLoaded('pt')).toBe(false) // Portuguese loads only when the language is Portuguese
  })

  it('loads the Portuguese dashboard text when the language is Portuguese', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    render(
      <LanguageProvider>
        <DashboardDictionaries>
          <Probe />
        </DashboardDictionaries>
      </LanguageProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('pt'))
    expect(screen.getByTestId('text')).toHaveTextContent(ptDashboard['settings.title']!)
    expect(isDashboardDictionaryLoaded('en')).toBe(true) // the English fallback comes with it
  })

  it('switching to Portuguese inside a dashboard keeps the English text until the Portuguese text has loaded', async () => {
    render(
      <LanguageProvider>
        <DashboardDictionaries>
          <Probe />
        </DashboardDictionaries>
      </LanguageProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('text')).toBeInTheDocument())
    const english = screen.getByTestId('text').textContent
    act(() => screen.getByText('pt').click())
    // Still English, never a raw key, while the file downloads.
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    expect(screen.getByTestId('text')).toHaveTextContent(english!)
    expect(localStorage.getItem(LANG_KEY)).toBe('pt') // the choice itself is saved at once
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('pt'))
    expect(screen.getByTestId('text')).toHaveTextContent(ptDashboard['settings.title']!)
  })

  it('on a public page (no dashboard text loaded) the language switches at once', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    act(() => screen.getByText('pt').click())
    expect(screen.getByTestId('lang')).toHaveTextContent('pt')
    expect(isDashboardDictionaryLoaded('en')).toBe(false) // nothing dashboard-related was downloaded
  })
})
