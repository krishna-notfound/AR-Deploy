import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_COLOR,
  THEME_KEY,
  applyTheme,
  getThemeChoice,
  isThemedPath,
  readStoredChoice,
  reloadThemeChoice,
  resolveTheme,
  setThemeChoice,
  systemPrefersDark,
  useSystemPrefersDark,
  useThemeChoice,
} from './theme'

type Listener = () => void
/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystem(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    })),
  )
  return (next: boolean) => {
    matches = next
    for (const l of listeners) l()
  }
}

beforeEach(() => {
  localStorage.clear()
  setThemeChoice('light')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme choice storage', () => {
  it('defaults to light when nothing is saved', () => {
    expect(readStoredChoice()).toBe('light')
    reloadThemeChoice()
    expect(getThemeChoice()).toBe('light')
  })

  it('remembers a saved choice per device', () => {
    setThemeChoice('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(readStoredChoice()).toBe('dark')
    setThemeChoice('system')
    expect(readStoredChoice()).toBe('system')
    expect(getThemeChoice()).toBe('system')
  })

  it('falls back to light for a value it does not know', () => {
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(readStoredChoice()).toBe('light')
  })

  it('falls back to light when storage cannot be read, and keeps working when it cannot be written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredChoice()).toBe('light')
    expect(() => setThemeChoice('dark')).not.toThrow()
    // The choice lasts until the page closes even when it cannot be saved.
    expect(getThemeChoice()).toBe('dark')
  })

  it('ignores a choice that is not one of the three', () => {
    setThemeChoice('dark')
    // @ts-expect-error a bad value from outside TypeScript
    setThemeChoice('blue')
    expect(getThemeChoice()).toBe('dark')
  })

  it('notifies subscribers and follows another tab through the storage event', () => {
    const { result } = renderHook(() => useThemeChoice())
    expect(result.current[0]).toBe('light')
    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')
    act(() => {
      localStorage.setItem(THEME_KEY, 'system')
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    })
    expect(result.current[0]).toBe('system')
  })
})

describe('System follows prefers-color-scheme', () => {
  it('resolves each choice', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('reads the device setting and changes with it', () => {
    const change = mockSystem(false)
    expect(systemPrefersDark()).toBe(false)
    const { result } = renderHook(() => useSystemPrefersDark())
    expect(result.current).toBe(false)
    act(() => change(true))
    expect(result.current).toBe(true)
  })

  it('is light where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(systemPrefersDark()).toBe(false)
  })
})

describe('which routes may be dark', () => {
  it('only the signed-in dashboards', () => {
    for (const p of ['/admin', '/admin/', '/admin/products', '/admin/settings/preferences', '/admin/editor/preview/page/terms', '/dashboard', '/dashboard/analytics'])
      expect(isThemedPath(p), p).toBe(true)
    for (const p of ['/', '/demo', '/login', '/apply', '/join', '/accept-invite', '/reset-password', '/c/atelier-verde', '/administrator', '/dashboards', '/terms'])
      expect(isThemedPath(p), p).toBe(false)
  })
})

describe('applyTheme', () => {
  it('sets and removes data-theme and the browser colour', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = THEME_COLOR.light
    document.head.append(meta)
    applyTheme('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(meta.content).toBe(THEME_COLOR.dark)
    applyTheme(null)
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(meta.content).toBe(THEME_COLOR.light)
    meta.remove()
  })
})

describe('index.css tokens', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const block = (open: RegExp) => {
    const start = css.search(open)
    expect(start, String(open)).toBeGreaterThan(-1)
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
    return Object.fromEntries([...body.matchAll(/(--color-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim().toLowerCase()]))
  }
  const base = block(/@theme\s*\{/)
  const light = block(/\n\[data-theme='light'\]\s*\{/)
  const dark = block(/:root\[data-theme='dark'\]/)

  it('a light island restores every token the dark theme changes', () => {
    for (const name of Object.keys(dark)) expect(light[name], `light island is missing ${name}`).toBeDefined()
  })

  it('the light island repeats the public palette exactly', () => {
    for (const [name, value] of Object.entries(light)) expect(base[name], name).toBe(value)
  })

  it('the dark theme only redefines tokens that exist', () => {
    for (const name of Object.keys(dark)) expect(base[name], `${name} is not in @theme`).toBeDefined()
  })

  it('keeps the browser colour in step with the dark canvas', () => {
    expect(dark['--color-canvas']).toBe(THEME_COLOR.dark.toLowerCase())
    expect(base['--color-canvas']).toBe(THEME_COLOR.light.toLowerCase())
  })
})
