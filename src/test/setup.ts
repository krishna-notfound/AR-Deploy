import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Lazy pages and simulated typing are slow on a fully loaded parallel run: wait up to 5 s for elements to appear
// instead of the 1 s default, so the result depends on behaviour, not machine load. Assertions are unchanged.
configure({ asyncUtilTimeout: 5_000 })

afterEach(() => {
  cleanup()
})
