import { type Locator, type Page, expect, test } from '@playwright/test'
import { signInAsBusiness, signInAsSuperAdmin } from './helpers'

// Dashboard type and layout checks (A1 dashboard clarity pass, ADR-0031, demo mode). On every in-scope dashboard
// route: nothing under 12px inside <main>, no uppercase text in the dashboard scope (the wordmark is exempt) and,
// at phone width, no horizontal page scroll. The mobile project only runs *.mobile.spec.ts, so the phone pass is a
// describe block below with a 390px viewport.

type Route = {
  name: string
  path: string
  ready: (page: Page) => Promise<void>
  /** Data routes: an element that only exists once the (delayed) mock data has rendered. */
  loaded?: (page: Page) => Locator
  act?: (page: Page) => Promise<void>
  /** Fewest text elements the audit must measure inside <main>, so an empty or half-rendered page cannot pass. */
  min?: number
  /** Only exists at phone width (the settings section list is its own screen below 640px). */
  phoneOnly?: boolean
}

const h1 = (name: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** First visible match in <main>: the desktop table and the phone list render the same text, one of them hidden. */
const inMain = (text: string | RegExp) => (page: Page) => page.locator('main').getByText(text).locator('visible=true').first()
const chart = (page: Page) => page.locator('main').getByRole('img', { name: /last 30 days/ }).first()
// Dashboard labels append " Required", so match the start of the label.
const field = (label: string) => (page: Page) => page.locator('main').getByLabel(new RegExp(`^${label}`)).first()
/** A data row: a table body row on desktop, a list item in the phone list. */
const row = (listName: string) => (page: Page) =>
  page.locator('main').locator('tbody tr').or(page.locator('main').getByRole('list', { name: listName }).getByRole('listitem')).locator('visible=true').first()
const qr = (page: Page) => page.locator('main').getByRole('img', { name: /^QR code linking to/ }).first()
/** A settings card title (settings sections render their cards as <h2>), so the audit runs on loaded content. */
const card = (title: string | RegExp) => (page: Page) => page.locator('main').getByRole('heading', { level: 2, name: title }).first()

const showTable = async (page: Page) => {
  await page.getByRole('button', { name: 'Show as table' }).first().click()
  await expect(page.getByRole('table', { name: /Daily page and embed views/ })).toBeVisible()
}

const ADMIN_ROUTES: Route[] = [
  { name: 'admin overview', path: '/admin', ready: h1('Overview'), loaded: chart },
  { name: 'admin overview: chart as a table', path: '/admin', ready: h1('Overview'), loaded: chart, act: showTable },
  { name: 'applications list', path: '/admin/applications', ready: h1('Applications'), loaded: inMain(/No applications yet|Atelier Claro/) },
  { name: 'businesses list', path: '/admin/businesses', ready: h1('Businesses'), loaded: inMain('Nordhaus Living') },
  { name: 'new business', path: '/admin/businesses/new', ready: h1(/./), loaded: field('Business name') },
  { name: 'business detail: details', path: '/admin/businesses/biz_casa', ready: h1('Casa Lisboa Interiors'), loaded: field('Business name') },
  { name: 'business detail: products', path: '/admin/businesses/biz_casa?tab=products', ready: h1('Casa Lisboa Interiors'), loaded: inMain('Glam Velvet Sofa') },
  {
    name: 'business detail: owners',
    path: '/admin/businesses/biz_casa?tab=owners',
    ready: h1('Casa Lisboa Interiors'),
    // biz_casa has no owner in demo: the invite form replaces the owner row once the members query has answered.
    loaded: (page) => page.locator('main').getByRole('textbox', { name: /^Owner email/ }).or(page.locator('main').getByText(/@/)).first(),
  },
  { name: 'business detail: QR', path: '/admin/businesses/biz_casa?tab=qr', ready: h1('Casa Lisboa Interiors'), loaded: qr },
  { name: 'catalogs', path: '/admin/catalogs', ready: h1(/catalog/i), loaded: qr },
  { name: 'products list', path: '/admin/products', ready: h1('All products'), loaded: row('Products') },
  { name: 'analytics', path: '/admin/analytics', ready: h1('Analytics'), loaded: chart },
  // The demo audit log lists sample events (Task 14); the list is the unnamed <ul> under the "Events" heading. An empty state also counts as loaded.
  { name: 'audit log', path: '/admin/activity', ready: h1(/./), loaded: (page) => page.locator('main').getByRole('heading', { name: 'No events yet' }).or(page.locator('main ul > li').locator('visible=true')).first(), min: 5 },
  { name: 'settings: my account', path: '/admin/settings/account', ready: h1('My account'), loaded: card('Password'), min: 10 },
  { name: 'settings: profile', path: '/admin/settings/profile', ready: h1('Profile'), loaded: field('Name'), min: 8 },
  { name: 'settings: security and 2FA', path: '/admin/settings/security', ready: h1('Security & 2FA'), loaded: card('Two-step verification (2FA)'), min: 10 },
  { name: 'settings: notifications', path: '/admin/settings/notifications', ready: h1('Notifications'), loaded: card('Applications'), min: 8 },
  { name: 'settings: preferences', path: '/admin/settings/preferences', ready: h1('Preferences'), loaded: card('Date and time format'), min: 8 },
  { name: 'settings: security activity', path: '/admin/settings/activity', ready: h1('Security activity'), loaded: inMain('No security activity yet'), min: 3 },
  { name: 'settings: security policy', path: '/admin/settings/security-policy', ready: h1('Security policy'), loaded: card('Two-step verification'), min: 8 },
  { name: 'settings: platform general', path: '/admin/settings/platform', ready: h1('General'), loaded: inMain('Sample asset credits') },
  { name: 'settings: section list', path: '/admin/settings', ready: h1('Settings'), loaded: inMain('Security policy'), min: 10, phoneOnly: true },
  { name: 'team list', path: '/admin/team', ready: h1('Team & Access'), loaded: inMain('ana.ribeiro@sanctus.example') },
  { name: 'member detail', path: '/admin/team/mem_joao', ready: h1('João Costa'), loaded: inMain('joao.costa@sanctus.example') },
  { name: 'role permissions', path: '/admin/team/permissions', ready: h1(/./), loaded: (page) => page.locator('main').getByRole('checkbox').first() },
  { name: 'new product', path: '/admin/products/new', ready: h1(/./), loaded: field('Product name') },
  { name: 'product editor', path: '/admin/products/prd_sheen_chair/edit', ready: h1(/./), loaded: field('Product name') },
  { name: 'page not found in the shell', path: '/admin/no-such-page', ready: h1('Page not found'), min: 3 },
]

const BUSINESS_ROUTES: Route[] = [
  { name: 'business overview', path: '/dashboard', ready: h1('Overview'), loaded: chart },
  { name: 'business overview: chart as a table', path: '/dashboard', ready: h1('Overview'), loaded: chart, act: showTable },
  { name: 'business catalog', path: '/dashboard/catalog', ready: h1(/./), loaded: qr },
  { name: 'business products', path: '/dashboard/products', ready: h1(/./), loaded: inMain('Glam Velvet Sofa') },
  { name: 'business analytics', path: '/dashboard/analytics', ready: h1('Analytics'), loaded: chart },
  { name: 'business product editor', path: '/dashboard/products/prd_glam_sofa/edit', ready: h1('Glam Velvet Sofa'), loaded: field('Product name') },
  { name: 'settings: my account', path: '/dashboard/settings/account', ready: h1('My account'), loaded: card('Password'), min: 10 },
  { name: 'settings: profile', path: '/dashboard/settings/profile', ready: h1('Profile'), loaded: field('Name'), min: 8 },
  { name: 'settings: security and 2FA', path: '/dashboard/settings/security', ready: h1('Security & 2FA'), loaded: card('Two-step verification (2FA)'), min: 10 },
  { name: 'settings: notifications', path: '/dashboard/settings/notifications', ready: h1('Notifications'), loaded: card('Account security'), min: 6 },
  { name: 'settings: preferences', path: '/dashboard/settings/preferences', ready: h1('Preferences'), loaded: card('Date and time format'), min: 8 },
  { name: 'settings: security activity', path: '/dashboard/settings/activity', ready: h1('Security activity'), loaded: inMain('No security activity yet'), min: 3 },
  { name: 'settings: business profile', path: '/dashboard/settings/business', ready: h1('Business profile'), loaded: field('Business name') },
  { name: 'settings: section list', path: '/dashboard/settings', ready: h1('Settings'), loaded: inMain('Business profile'), min: 10, phoneOnly: true },
]

/** Demo has no seeded applications: send one through the public form so the detail page has a record. */
async function submitApplication(page: Page) {
  await page.goto('/apply?lang=en')
  await page.getByLabel('Business name').fill('Atelier Claro')
  await page.getByLabel('Website').fill('www.atelier-claro.example')
  await page.getByLabel('What do you sell?').selectOption({ label: 'Furniture' })
  await page.getByLabel('About the business').fill('Solid oak furniture, made to order in Porto.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Country').fill('Portugal')
  await page.getByLabel('City').fill('Porto')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Your name').fill('Rita Sousa')
  await page.getByRole('textbox', { name: /^Email/ }).fill('rita@atelier-claro.test')
  await page.getByRole('radio', { name: 'Português' }).check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('radio', { name: '11 to 50' }).check()
  await page.getByRole('group', { name: /product photos/ }).getByRole('radio', { name: 'Yes, for every product' }).check()
  await page.getByRole('group', { name: /3D models/ }).getByRole('radio', { name: 'We need help creating them' }).check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(/I confirm the information is accurate/).check()
  await page.getByRole('checkbox', { name: /^I agree to the Terms/ }).check()
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()
}

type Offender = { tag: string; cls: string; text: string; value: string }

/** Anything in <main> that means data is still on its way: busy controls, skeleton bars, loading statuses, spinners. */
const LOADING = ['[aria-busy="true"]', '[role="status"][aria-label="Loading"]', 'span.block.bg-subtle[aria-hidden="true"]', '.animate-spin']
  .map((s) => `main ${s}`)
  .join(', ')

/** Waits until the route has rendered its data: its own `loaded` element, then no loading indicator left in <main>. */
async function waitForLoaded(page: Page, route: Route, afterAction = false) {
  await expect(page.locator('main'), 'the dashboard renders a <main> landmark').toHaveCount(1)
  if (route.loaded && !afterAction) await expect(route.loaded(page), `${route.path} shows its data`).toBeVisible()
  await expect(page.locator(LOADING), `${route.path} has no loading indicator left`).toHaveCount(0)
  // Charts size themselves after the first paint: measure once their axis text is drawn.
  if (await page.locator('main .recharts-responsive-container').count()) {
    await expect(page.locator('main .recharts-cartesian-axis-tick-value').first()).toBeVisible()
  }
}

/** Runs the three checks in the page and returns the offending elements, so a failure says what to fix. */
async function audit(page: Page, checkOverflow: boolean) {
  // Let fonts, lazy chunks and charts settle before measuring.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  return page.evaluate((overflow) => {
    const ownText = (el: Element) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
    const describe = (el: Element, value: string): Offender => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') ?? '').slice(0, 160),
      text: (ownText(el) || (el as HTMLInputElement).placeholder || '').slice(0, 60),
      value,
    })
    // Visibility rule (both checks and the overflow list): an element counts only when a sighted person can see it.
    // Skipped: anything inside .sr-only or [aria-hidden="true"]; anything checkVisibility() rejects (display:none or a
    // collapsed tree, content-visibility, visibility:hidden, opacity 0); and boxes of 1px or less in either direction,
    // which is how clipped screen-reader-only text renders.
    const visible = (el: Element) => {
      if (el.closest('.sr-only, [aria-hidden="true"]')) return false
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
      const r = el.getBoundingClientRect()
      return r.width > 1 && r.height > 1
    }
    const isField = (el: Element) => el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, select')

    const small: Offender[] = []
    const main = document.querySelector('main')
    let measuredMain = 0
    for (const el of Array.from(main?.querySelectorAll('*') ?? [])) {
      // Chart text (SVG ticks and labels) counts too.
      if (el.closest('[data-wordmark]')) continue
      if (!ownText(el) && !isField(el)) continue
      if (!visible(el)) continue
      measuredMain++
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 12) small.push(describe(el, `${size}px`))
    }

    const upper: Offender[] = []
    // <body> and the shell root both carry the marker: walk only the outermost scopes so nothing is counted twice.
    const scopes = Array.from(document.querySelectorAll('[data-surface="dashboard"]'))
    const outer = scopes.filter((s) => !scopes.some((o) => o !== s && o.contains(s)))
    let measuredScope = 0
    for (const scope of outer) {
      for (const el of [scope, ...Array.from(scope.querySelectorAll('*'))]) {
        if (el.closest('[data-wordmark]') || el.closest('svg')) continue
        if (!ownText(el) && !isField(el)) continue
        if (!visible(el)) continue
        measuredScope++
        if (getComputedStyle(el).textTransform === 'uppercase') upper.push(describe(el, 'uppercase'))
      }
    }

    const scroll = overflow ? { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth } : null
    const wide: Offender[] = []
    if (scroll && scroll.scrollWidth > scroll.innerWidth) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect()
        if (r.right > window.innerWidth + 1 && r.width > 0 && visible(el)) wide.push(describe(el, `right ${Math.round(r.right)}px`))
      }
    }
    return {
      hasMain: !!main,
      scopes: scopes.length,
      measuredMain,
      measuredScope,
      small,
      upper: Array.from(new Map(upper.map((o) => [JSON.stringify(o), o])).values()),
      scroll,
      wide: wide.slice(0, 15),
    }
  }, checkOverflow)
}

const list = (items: Offender[]) => items.map((o) => `  <${o.tag} class="${o.cls}"> "${o.text}" (${o.value})`).join('\n')

async function checkRoute(page: Page, route: Route, mobile: boolean) {
  await page.goto(route.path)
  await route.ready(page)
  await waitForLoaded(page, route)
  if (route.act) {
    await route.act(page)
    await waitForLoaded(page, route, true)
  }
  const r = await audit(page, mobile)
  // Guard against a false green: the audit must have found the page and measured a real amount of text.
  const counts = `${r.measuredMain} text elements in <main>, ${r.measuredScope} in the dashboard scope`
  test.info().annotations.push({ type: 'audited', description: `${route.path}: ${counts}` })
  console.log(`[a11y] ${mobile ? '390' : 'desktop'} ${route.path}${route.act ? ' (after action)' : ''}: ${counts}`)
  expect(r.hasMain, `${route.path} has a <main> element`).toBe(true)
  expect(r.scopes, `${route.path} is inside [data-surface="dashboard"]`).toBeGreaterThan(0)
  expect(r.measuredMain, `Too little text measured in <main> on ${route.path} (${counts})`).toBeGreaterThanOrEqual(route.min ?? 15)
  expect(r.small, `Text under 12px inside <main> on ${route.path}:\n${list(r.small)}`).toEqual([])
  expect(r.upper, `Uppercase text in the dashboard scope on ${route.path}:\n${list(r.upper)}`).toEqual([])
  if (r.scroll) {
    expect(
      r.scroll.scrollWidth,
      `Horizontal scroll at ${r.scroll.innerWidth}px on ${route.path} (scrollWidth ${r.scroll.scrollWidth}). Elements past the edge:\n${list(r.wide)}`,
    ).toBeLessThanOrEqual(r.scroll.innerWidth)
  }
}

function suite(mobile: boolean) {
  for (const route of ADMIN_ROUTES.filter((r) => mobile || !r.phoneOnly)) {
    test(`${route.name} (Owner)`, async ({ page }) => {
      await signInAsSuperAdmin(page)
      await checkRoute(page, route, mobile)
    })
  }

  test('application detail (Owner)', async ({ page }) => {
    await submitApplication(page)
    await signInAsSuperAdmin(page)
    await page.goto('/admin/applications')
    await page.getByRole('link', { name: /Atelier Claro/ }).or(page.getByRole('button', { name: /Atelier Claro|Review/ })).first().click()
    const route: Route = {
      name: 'application detail',
      path: page.url().replace(/^https?:\/\/[^/]+/, ''),
      ready: h1(/Atelier Claro/),
      loaded: inMain('rita@atelier-claro.test'),
    }
    await checkRoute(page, route, mobile)
  })

  for (const route of BUSINESS_ROUTES.filter((r) => mobile || !r.phoneOnly)) {
    test(`${route.name} (biz_casa owner)`, async ({ page }) => {
      await signInAsBusiness(page, 'Casa Lisboa Interiors')
      await checkRoute(page, route, mobile)
    })
  }
}

test.describe('dashboard a11y at desktop width', () => {
  suite(false)

  test('overview cards draw one combined chart with the series toggle above it', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await expect(page.getByRole('img', { name: /last 30 days/ })).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Series shown in the chart' }).getByRole('button', { pressed: true })).toHaveCount(2)
    await signInAsBusiness(page, 'Casa Lisboa Interiors')
    await expect(page.getByRole('img', { name: /last 30 days/ })).toHaveCount(1)
  })

  test('a right-aligned sortable header keeps its label on the right edge, with the arrow on its left', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await page.goto('/admin/team')
    const th = page.getByRole('columnheader', { name: /Joined or invited/ })
    await th.getByRole('button').click()
    await expect(th).toHaveAttribute('aria-sort', /ascending|descending/)
    const box = await th.evaluate((cell) => {
      const button = cell.querySelector('button')!
      const icon = button.querySelector('svg')!.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(Array.from(button.childNodes).find((n) => n.nodeType === Node.TEXT_NODE)!)
      const text = range.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(cell).paddingRight)
      return { iconRight: icon.right, textLeft: text.left, textRight: text.right, contentRight: cell.getBoundingClientRect().right - pad }
    })
    expect(box.iconRight).toBeLessThanOrEqual(box.textLeft)
    expect(Math.abs(box.contentRight - box.textRight)).toBeLessThanOrEqual(1)
  })

  test('the team search label focuses the search box', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await page.goto('/admin/team')
    await page.locator('label', { hasText: 'Search members' }).click({ timeout: 5_000 })
    await expect(page.getByRole('searchbox', { name: 'Search members' })).toBeFocused()
  })

  test('public embed: small uppercase labels are at least 12px with at most 0.08em tracking', async ({ page }) => {
    await page.goto('/embed/products/casa-lisboa/glam-velvet-sofa')
    await expect(page.getByRole('heading', { level: 1, name: 'Glam Velvet Sofa' })).toBeVisible()
    const bad = await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => getComputedStyle(el).textTransform === 'uppercase' && Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
        .map((el) => {
          const st = getComputedStyle(el)
          const size = parseFloat(st.fontSize)
          return { text: el.textContent?.trim().slice(0, 40), size, tracking: (parseFloat(st.letterSpacing) || 0) / size }
        })
        .filter((o) => o.size < 12 || o.tracking > 0.0801),
    )
    expect(bad, JSON.stringify(bad, null, 1)).toEqual([])
  })
})

test.describe('dashboard a11y at phone width (390)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  suite(true)
})
