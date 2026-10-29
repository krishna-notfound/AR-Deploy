import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'
import { enDashboard } from '@/i18n/dictionaries/en.dashboard'
import { ptDashboard } from '@/i18n/dictionaries/pt.dashboard'
import { registerDashboardDictionary } from '@/i18n/translate'

// Lazy pages and simulated typing are slow on a fully loaded parallel run: wait up to 5 s for elements to appear
// instead of the 1 s default, so the result depends on behaviour, not machine load. Assertions are unchanged.
configure({ asyncUtilTimeout: 5_000 })

// The dashboard text loads lazily in the app (ADR-0045); tests render single screens without the route that loads it, so install both
// languages up front. The load itself is tested in i18n/dashboardDictionaries.test.tsx.
registerDashboardDictionary('en', enDashboard)
registerDashboardDictionary('pt', ptDashboard)

afterEach(() => {
  cleanup()
})
