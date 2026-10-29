// The public pages must not need the lazily loaded dashboard text (ADR-0045): a key that only the dashboard dictionary holds
// would show as a raw key on a customer's phone. This reads the source of everything a public page, the sign-in pages or
// an app-wide provider imports, and fails when it names a key that lives in the dashboard dictionary.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { enDashboard } from './dictionaries/en.dashboard'

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

// Entry points of everything that renders outside the dashboards. Add a new public page here.
const ROOTS = [
  'auth/AccountProvider.tsx',
  'components/ui/ConfirmProvider.tsx',
  'components/ui/ToastProvider.tsx',
  'lib/preferences.tsx',
  'i18n/LanguageProvider.tsx',
  'app/RootLayout.tsx',
  'app/RouteError.tsx',
  'app/BackendConfigError.tsx',
  'components/layout/FullPageSpinner.tsx',
  'features/marketing/LandingPage.tsx',
  'features/marketing/SiteContentProvider.tsx',
  'features/marketing/PublicNotFoundPage.tsx',
  'features/demo/DemoEntryPage.tsx',
  'features/demo/NotFoundPage.tsx',
  'features/auth/LoginPage.tsx',
  'features/auth/ResetPasswordPage.tsx',
  'features/auth/AcceptInvitePage.tsx',
  'features/apply/ApplyPage.tsx',
  'features/legal/LegalPage.tsx',
  'features/legal/CustomPage.tsx',
  'features/join/JoinPage.tsx',
  'features/public/CatalogPage.tsx',
  'features/public/ProductPage.tsx',
  'features/public/EmbedProductPage.tsx',
  'features/public/LowercaseSlugs.tsx',
  'services/index.ts',
]

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolvePath(dirname(from), spec) : null
  if (!base) return null
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((c) => existsSync(c) && statSync(c).isFile()) ?? null
}

/** Source files reachable from the roots through value imports (type-only imports are erased and load nothing). */
function reachable(): Map<string, string> {
  const files = new Map<string, string>()
  const stack = ROOTS.map((r) => join(SRC, r))
  while (stack.length) {
    const file = stack.pop()!
    if (files.has(file) || !existsSync(file) || file.includes(join('i18n', 'dictionaries'))) continue
    const text = readFileSync(file, 'utf8')
    files.set(file, text)
    const specs = [
      ...text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/g),
      ...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...text.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g),
    ].map((m) => m[1]!)
    for (const spec of specs) {
      const target = resolveImport(file, spec)
      if (target) stack.push(target)
    }
  }
  return files
}

describe('public pages and the dashboard dictionary', () => {
  it('no file a public page imports names a dashboard-only key', () => {
    const dashboardKeys = Object.keys(enDashboard)
    const files = reachable()
    expect(files.size).toBeGreaterThan(50) // the walk found the pages, not just the roots
    const found: string[] = []
    for (const [file, text] of files) {
      const name = relative(SRC, file).replace(/\\/g, '/')
      const literals = new Set([...text.matchAll(/(['"`])([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)\1/g)].map((m) => m[2]!))
      // `prefix.${x}` and 'prefix.' + x name every key under the prefix.
      const prefixes = [...text.matchAll(/['"`]([A-Za-z][A-Za-z0-9_.-]*\.)(?:\$\{|['"`])/g)].map((m) => m[1]!)
      for (const key of dashboardKeys) {
        if (literals.has(key) || prefixes.some((p) => key.startsWith(p))) found.push(`${name}: ${key}`)
      }
    }
    // Fix: move the key from its area file into en.shared.ts / pt.shared.ts (it then ships with the public pages).
    expect(found).toEqual([])
  })
})
