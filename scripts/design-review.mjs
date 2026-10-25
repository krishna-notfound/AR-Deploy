#!/usr/bin/env node
// Design review screenshots on REAL data (Supabase mode), paired with Stitch screens by design-sheet.py.
//
//   1. Start a dev server in Supabase mode:   npx vite --port 5346 --strictPort
//   2. node scripts/design-review.mjs --port 5346 [--out design/review] [--stitch <dir>]
//   3. python scripts/design-sheet.py [--out design/review]
//
// READ-ONLY: it signs in, navigates and takes screenshots. It never clicks a save, publish, delete, approve or invite control.
// Credentials come from .env.qa (parsed here, never printed). Exits 1 when a page shows the error boundary or a console error.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]

// ---- args ------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const PORT = Number(arg('port', '5346'))
const OUT = path.resolve(arg('out', 'design/review'))
const BASE = `http://localhost:${PORT}`
const CWD = process.cwd()

// ---- env (never printed) ---------------------------------------------------
function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}
const env = readEnv(path.join(CWD, '.env.qa'))
function creds(prefix) {
  const email = env[`${prefix}_EMAIL`]
  const password = env[`${prefix}_PASSWORD`]
  if (!email || !password) throw new Error(`.env.qa is missing ${prefix}_EMAIL / ${prefix}_PASSWORD`)
  return { email, password }
}

// ---- Stitch screens --------------------------------------------------------
// The worktree may not carry the (large) screenshot PNGs, so fall back to the main checkout.
function findStitchDir() {
  const given = arg('stitch', null)
  const candidates = []
  if (given) candidates.push(path.resolve(given))
  candidates.push(path.join(CWD, 'design/stitch/dashboard'))
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(path.dirname(path.resolve(CWD, common)), 'design/stitch/dashboard'))
  } catch {
    /* not a git checkout: the other candidates still apply */
  }
  const hasShots = (d) => existsSync(d) && readdirSync(d).some((n) => existsSync(path.join(d, n, 'screenshot.png')))
  return candidates.find(hasShots) ?? null
}
const STITCH_DIR = findStitchDir()
const STITCH_FOLDERS = STITCH_DIR ? new Set(readdirSync(STITCH_DIR).filter((n) => existsSync(path.join(STITCH_DIR, n, 'screenshot.png')))) : new Set()

/** Stitch folder for a route at a width, or null. `spec` = { d: desktop folder, m: mobile folder }; only folders that exist count. */
function stitchFor(spec, width) {
  const name = width >= 1024 ? spec?.d : spec?.m
  if (!name || !STITCH_FOLDERS.has(name)) return null
  const file = path.join(STITCH_DIR, name, 'screenshot.png')
  const rel = path.relative(CWD, file)
  return (rel.startsWith('..') || path.isAbsolute(rel) ? file : rel).split(path.sep).join('/')
}

// ---- routes ----------------------------------------------------------------
// d = desktop Stitch folder (A-*), m = mobile Stitch folder (A-m-*). Missing = no Stitch screen = null in the manifest.
const S = {
  adminOverview: { d: 'A-a-overview' },
  applications: { d: 'A-a-applications' },
  applicationDetail: { d: 'A-a-app-review' },
  businesses: { d: 'A-a-businesses' },
  businessDetail: { d: 'A-a-business-detail' },
  catalogs: { d: 'A-a-catalogs' },
  adminProducts: { d: 'A-a-products' },
  editor: { d: 'A-editor', m: 'A-m-editor' },
  adminAnalytics: { d: 'A-a-analytics' },
  audit: { d: 'A-a-audit' },
  adminSettings: { d: 'A-a-settings' },
  team: { d: 'A-team', m: 'A-m-team' },
  member: { d: 'A-a-member' },
  roles: { d: 'A-a-roles' },
  bizOverview: { d: 'A-overview', m: 'A-m-overview' },
  bizCatalog: { d: 'A-b-catalog' },
  bizSettings: { d: 'A-b-settings' },
}

/**
 * A step is { key, url | from: { list, pick, viaMenu? }, stitch }. `from` opens a list page and follows the first row link that matches `pick`.
 * Where the list has no row link (the team table), `viaMenu` opens the first non-owner row's actions menu and reads where its navigate-only item
 * (for example "View") goes. It only navigates; no destructive item is ever clicked.
 */
const ADMIN = [
  { key: 'admin-overview', url: '/admin', stitch: S.adminOverview },
  { key: 'admin-applications', url: '/admin/applications', stitch: S.applications },
  { key: 'admin-application-detail', from: { list: '/admin/applications', pick: /^\/admin\/applications\/[^/?#]+$/ }, stitch: S.applicationDetail },
  { key: 'admin-businesses', url: '/admin/businesses', stitch: S.businesses },
  { key: 'admin-business-detail', from: { list: '/admin/businesses', pick: /^\/admin\/businesses\/(?!new$)[^/?#]+$/ }, stitch: S.businessDetail },
  { key: 'admin-business-products', sameAs: 'admin-business-detail', query: '?tab=products', stitch: null },
  { key: 'admin-business-owners', sameAs: 'admin-business-detail', query: '?tab=owners', stitch: null },
  { key: 'admin-business-qr', sameAs: 'admin-business-detail', query: '?tab=qr', stitch: null },
  { key: 'admin-catalogs', url: '/admin/catalogs', stitch: S.catalogs },
  { key: 'admin-products', url: '/admin/products', stitch: S.adminProducts },
  { key: 'admin-product-edit', from: { list: '/admin/products', pick: /^\/admin\/products\/(?!new$)[^/?#]+\/edit$/ }, stitch: S.editor },
  { key: 'admin-product-new', url: '/admin/products/new', stitch: S.editor },
  { key: 'admin-analytics', url: '/admin/analytics', stitch: S.adminAnalytics },
  { key: 'admin-audit', url: '/admin/activity', stitch: S.audit },
  { key: 'admin-settings', url: '/admin/settings', stitch: S.adminSettings },
  { key: 'admin-team', url: '/admin/team', stitch: S.team },
  { key: 'admin-member', from: { list: '/admin/team', pick: /^\/admin\/team\/(?!permissions$)[^/?#]+$/, viaMenu: 'View' }, stitch: S.member },
  { key: 'admin-roles', url: '/admin/team/permissions', stitch: S.roles },
]
const BUSINESS = [
  { key: 'biz-overview', url: '/dashboard', stitch: S.bizOverview },
  { key: 'biz-catalog', url: '/dashboard/catalog', stitch: S.bizCatalog },
  { key: 'biz-products', url: '/dashboard/products', stitch: null },
  { key: 'biz-product-edit', from: { list: '/dashboard/products', pick: /^\/dashboard\/products\/(?!new$)[^/?#]+\/edit$/ }, stitch: S.editor },
  { key: 'biz-analytics', url: '/dashboard/analytics', stitch: null },
  { key: 'biz-settings', url: '/dashboard/settings', stitch: S.bizSettings },
]

// ---- browser helpers -------------------------------------------------------
const manifest = []
const problems = [] // { key, width, kind, detail }
const resolvedUrls = {} // key -> resolved path, so tab variants reuse the detail id

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  // Skeletons are role=status "Loading…" blocks; buttons mid-request use aria-busy.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], [role="status"][aria-label^="Loading"]'), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
}

async function signIn(context, who) {
  const { email, password } = creds(who)
  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  await settle(page)
  return page
}

async function firstRowLink(page, list, pick, viaMenu) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}${list}`)
  await settle(page)
  if (viaMenu) {
    const trigger = page.getByRole('button', { name: /^Actions for / }).first()
    if (!(await trigger.isVisible().catch(() => false))) return null
    await trigger.click()
    await page.getByRole('menuitem', { name: viaMenu, exact: true }).first().click()
    await page.waitForURL((u) => pick.test(u.pathname), { timeout: 10000 }).catch(() => {})
    const here = new URL(page.url()).pathname
    return pick.test(here) ? here : null
  }
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
  return hrefs.map((h) => h.split('#')[0]).find((h) => pick.test(h.split('?')[0])) ?? null
}

async function visit(page, step) {
  const before = problems.length
  let target = step.url
  if (step.sameAs) {
    const base = resolvedUrls[step.sameAs]
    if (!base) {
      problems.push({ key: step.key, width: 0, kind: 'skipped', detail: `no ${step.sameAs} page to open` })
      return false
    }
    target = base + step.query
  } else if (step.from) {
    target = await firstRowLink(page, step.from.list, step.from.pick, step.from.viaMenu)
    if (!target) {
      problems.push({ key: step.key, width: 0, kind: 'skipped', detail: `no row link on ${step.from.list}` })
      return false
    }
  }
  resolvedUrls[step.key] = target.split('?')[0]

  for (const { w, h } of WIDTHS) {
    const errors = []
    const onConsole = (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`)
    }
    const onPageError = (e) => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`)
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    try {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`${BASE}${target}`)
      await settle(page)
      const boundary = await page.getByText('Something went wrong', { exact: false }).first().isVisible().catch(() => false)
      if (boundary) problems.push({ key: step.key, width: w, kind: 'error-boundary', detail: target })
      for (const e of errors) problems.push({ key: step.key, width: w, kind: 'console-error', detail: e })
      const file = path.join(OUT, `${step.key}-${w}.png`)
      await page.screenshot({ path: file, fullPage: true })
      manifest.push({
        key: step.key,
        width: w,
        url: target,
        shot: path.relative(CWD, file).split(path.sep).join('/'),
        stitch: step.stitch === null ? null : stitchFor(step.stitch, w),
      })
      console.log(`ok   ${step.key} @${w}  ${target}`)
    } catch (e) {
      problems.push({ key: step.key, width: w, kind: 'failed', detail: String(e.message).split('\n')[0] })
      console.log(`FAIL ${step.key} @${w}  ${String(e.message).split('\n')[0]}`)
    } finally {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
    }
  }
  return problems.length === before
}

// ---- run -------------------------------------------------------------------
mkdirSync(OUT, { recursive: true })
if (!STITCH_DIR) console.log('warn: no Stitch screenshots found; every manifest entry will have stitch: null')
else console.log(`stitch screens: ${path.relative(CWD, STITCH_DIR) || '.'}`)

const browser = await chromium.launch()
try {
  for (const [who, steps] of [
    ['SANCTUS_ADMIN', ADMIN],
    ['MUSE_OWNER', BUSINESS],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    try {
      const page = await signIn(context, who)
      for (const step of steps) await visit(page, step)
      // QA Muse has no products, so its product edit page has no row to open: borrow the second business owner for that one step.
      const missing = problems.findIndex((p) => p.key === 'biz-product-edit' && p.kind === 'skipped')
      if (who === 'MUSE_OWNER' && missing > -1 && env.QA_ATELIER_OWNER_EMAIL) {
        const second = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        try {
          const p2 = await signIn(second, 'QA_ATELIER_OWNER')
          const [skipped] = problems.splice(missing, 1)
          if (!(await visit(p2, steps.find((s) => s.key === 'biz-product-edit')))) problems.push(skipped)
        } finally {
          await second.close()
        }
      }
    } catch (e) {
      problems.push({ key: who, width: 0, kind: 'sign-in-failed', detail: String(e.message).split('\n')[0].replace(/\S+@\S+/g, '<email>') })
      console.log(`FAIL sign-in as ${who}`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`\n${manifest.length} screenshots, manifest: ${path.relative(CWD, path.join(OUT, 'manifest.json'))}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const p of problems) console.log(`  [${p.kind}] ${p.key}${p.width ? ` @${p.width}` : ''}: ${p.detail}`)
  process.exit(1)
}
