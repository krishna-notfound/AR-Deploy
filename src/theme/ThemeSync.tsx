import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router'
import { applyTheme, isThemedPath, resolveTheme, useSystemPrefersDark, useThemeChoice } from './theme'

/**
 * Keeps `data-theme` on <html> in step with the route and the saved choice (ADR-0060). Dashboard routes get the
 * resolved theme; every other route gets none, so the public site is light whatever the person chose.
 * Renders nothing. `public/theme-init.js` has already set the first value before the first paint.
 */
export function ThemeSync() {
  const { pathname } = useLocation()
  const [choice] = useThemeChoice()
  const systemDark = useSystemPrefersDark()
  const theme = isThemedPath(pathname) ? resolveTheme(choice, systemDark) : null
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])
  return null
}
