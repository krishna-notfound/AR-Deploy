import { type Page, expect, test } from '@playwright/test'
import { confirmDialog, expectToast, signInAsPlatform, signInAsSuperAdmin } from './helpers'

// Website Editor and bilingual dashboards (spec 14, ADR-0042 / ADR-0044), demo mode. The same flows run in the desktop
// and the mobile project: `content-editor.spec.ts` and `content-editor.mobile.spec.ts` each call this once.

const TERMS_NEW = 'E2E edited terms paragraph, version one.'

/** The Editor's top bar: Preview, History, Publish. */
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Editor actions' })

/** Publish from the Editor top bar and confirm the dialog. Returns the published version number. */
async function publishDraft(page: Page): Promise<void> {
  await toolbar(page).getByRole('button', { name: 'Publish', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expectToast(page, /^Published version \d+/)
  await expect(toolbar(page).getByText(/Live: version \d+/)).toBeVisible()
}

/** The dashboard navigation as text: the sidebar on desktop, the drawer on a phone. */
async function navText(page: Page, mobile: boolean): Promise<string> {
  if (!mobile) return page.getByRole('navigation', { name: /^(Main|Principal)$/ }).innerText()
  await page.getByRole('button', { name: /^(Open navigation|Abrir navegação)$/ }).click()
  const drawer = page.getByRole('dialog', { name: /^(Navigation|Navegação)$/ })
  await expect(drawer).toBeVisible()
  const text = await drawer.innerText()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  return text
}

/** Use the language switch of the dashboard: the top bar on desktop, the navigation drawer on a phone. */
async function switchDashboardLang(page: Page, mobile: boolean, to: 'en' | 'pt'): Promise<void> {
  if (mobile) {
    await page.getByRole('button', { name: /^(Open navigation|Abrir navegação)$/ }).click()
    const drawer = page.getByRole('dialog', { name: /^(Navigation|Navegação)$/ })
    await drawer.getByRole('radio', { name: to.toUpperCase() }).click()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    return
  }
  await page.getByRole('banner').getByRole('radio', { name: to.toUpperCase() }).click()
}

const EN_NAV = ['Overview', 'Applications', 'Businesses', 'All Products', '3D requests', 'Analytics', 'Catalogs & QR Codes', 'Team & Access', 'Audit log']
const PT_NAV = ['Visão geral', 'Candidaturas', 'Empresas', 'Todos os produtos', 'Pedidos 3D', 'Análises', 'Catálogos e códigos QR', 'Equipa e acessos', 'Registo de atividade']

export function registerEditorFlows(mobile: boolean) {
  test('editing Terms: the draft is previewed, and only Publish changes the public page', async ({ page, context }) => {
    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/editor/pages/terms')
    await expect(page.getByRole('heading', { level: 2, name: 'Terms', exact: true })).toBeVisible()
    await page.locator('textarea[lang="en"]').fill(`# Terms and Conditions\n\n${TERMS_NEW}`)

    // Preview shows the draft, under the "Not live" bar.
    await toolbar(page).getByRole('button', { name: 'Preview' }).click()
    await expect(page).toHaveURL(/\/admin\/editor\/preview\/page\/terms$/)
    await expect(page.getByRole('region', { name: 'Preview of the draft. Not live.' })).toBeVisible()
    await expect(page.getByText(TERMS_NEW)).toBeVisible()

    // Before publishing, the public page still has the original text.
    const publicPage = await context.newPage()
    await publicPage.goto('/terms?lang=en')
    await expect(publicPage.getByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeVisible()
    await expect(publicPage.getByText(TERMS_NEW)).toHaveCount(0)
    await publicPage.close()

    // Back in the Editor the saved draft is still there. Publish it.
    await page.getByRole('link', { name: 'Back to the editor' }).click()
    await expect(page.locator('textarea[lang="en"]')).toHaveValue(new RegExp(TERMS_NEW))
    await publishDraft(page)

    await page.goto('/terms?lang=en')
    await expect(page.getByText(TERMS_NEW)).toBeVisible()
    // Portuguese was not edited: it keeps the shipped text.
    await page.goto('/terms?lang=pt')
    await expect(page.getByText(TERMS_NEW)).toHaveCount(0)
  })

  test('a custom page with "Show in footer" appears in the footers and opens at /pages/<slug>, in Portuguese or with the English fallback', async ({ page }) => {
    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/editor/pages')
    await expect(page.getByRole('heading', { level: 2, name: 'Pages', exact: true })).toBeVisible()

    // Page one: English and Portuguese.
    await page.getByRole('button', { name: 'New page' }).click()
    await page.getByLabel(/^Title \(English\)/).fill('Shipping and returns')
    await expect(page.getByRole('textbox', { name: 'Address' })).toHaveValue('shipping-and-returns')
    await page.getByLabel(/^Title \(Portuguese\)/).fill('Envios e devoluções')
    await page.getByRole('switch', { name: 'Show in footer' }).click()
    await page.locator('textarea[lang="en"]').fill('We ship across Portugal within five days.')
    await page.locator('textarea[lang="pt"]').fill('Enviamos para todo o Portugal em cinco dias.')

    // Page two: English only, so Portuguese visitors get the English text.
    await page.getByRole('link', { name: 'All pages' }).click()
    await page.getByRole('button', { name: 'New page' }).click()
    await page.getByLabel(/^Title \(English\)/).fill('Care guide')
    await page.getByRole('switch', { name: 'Show in footer' }).click()
    await page.locator('textarea[lang="en"]').fill('Dust with a dry cloth.')

    await page.getByRole('link', { name: 'All pages' }).click()
    await expect(page.getByTestId('footer-preview')).toContainText('Privacy  ·  Terms  ·  Shipping and returns  ·  Care guide')
    await publishDraft(page)

    // Landing page footer.
    await page.goto('/?lang=en')
    const landingFooter = page.getByRole('contentinfo')
    await expect(landingFooter.getByRole('link', { name: 'Shipping and returns' })).toBeVisible()
    await expect(landingFooter.getByRole('link', { name: 'Care guide' })).toBeVisible()

    // A catalogue page footer (a business subdomain-style shell on the platform domain).
    await page.goto('/catalog/casa-lisboa?lang=en')
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Shipping and returns' })).toBeVisible()

    // The page itself.
    await page.getByRole('contentinfo').getByRole('link', { name: 'Shipping and returns' }).click()
    await expect(page).toHaveURL(/\/pages\/shipping-and-returns$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Shipping and returns' })).toBeVisible()
    await expect(page.getByText('We ship across Portugal within five days.')).toBeVisible()

    // Portuguese: own text where it exists, the English text (marked as English) where it does not.
    await page.goto('/pages/shipping-and-returns?lang=pt')
    await expect(page.getByRole('heading', { level: 1, name: 'Envios e devoluções' })).toBeVisible()
    await expect(page.getByText('Enviamos para todo o Portugal em cinco dias.')).toBeVisible()
    await page.goto('/pages/care-guide?lang=pt')
    await expect(page.getByRole('heading', { level: 1, name: 'Care guide' })).toBeVisible()
    await expect(page.getByText('Dust with a dry cloth.')).toBeVisible()
    await expect(page.locator('[lang="en"]').filter({ hasText: 'Dust with a dry cloth.' }).first()).toBeVisible()

    // An address nobody published is a not-found page.
    await page.goto('/pages/not-a-page')
    await expect(page.getByText('Dust with a dry cloth.')).toHaveCount(0)
  })

  test('application form builder: move and hide fields, add a required question, publish, apply, and review the answer', async ({ page }) => {
    const QUESTION_EN = 'Preferred showroom hours'
    const QUESTION_PT = 'Horário preferido do showroom'
    const CONSENT_PT = 'Confirmo (teste E2E) que a informação está correta.'

    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/editor/apply')
    await expect(page.getByRole('tab', { name: 'Form' })).toBeVisible()

    // Move "Phone" from the contact step to the location step (step 2).
    await page.getByRole('combobox', { name: 'Move Phone to another step' }).selectOption('location')
    await expect(page.getByRole('status').filter({ hasText: 'Moved to step 2, position 3' })).toBeAttached()

    // Hide the optional "Website" field.
    await page.getByRole('button', { name: 'Edit Website' }).click()
    const hideDialog = page.getByRole('dialog', { name: 'Website' })
    await hideDialog.getByRole('switch', { name: 'Hidden' }).click()
    await hideDialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('button', { name: 'Show Website' })).toBeVisible()

    // Add a required short-text question on step 2, worded in English and Portuguese.
    await page.getByRole('button', { name: 'Add question to step 2' }).click()
    const question = page.getByRole('dialog')
    await question.getByRole('textbox', { name: 'Label (English)' }).fill(QUESTION_EN)
    await question.getByRole('textbox', { name: 'Label (Português)' }).fill(QUESTION_PT)
    await question.getByRole('switch', { name: 'Required' }).click()
    await question.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('region', { name: /^Step 2/ }).getByText(QUESTION_EN)).toBeVisible()

    // The consent sentence in Portuguese (Messages tab).
    await page.getByRole('tab', { name: 'Messages' }).click()
    await page.locator('[data-text-key="apply.f.consent"] textarea[lang="pt"]').fill(CONSENT_PT)

    await publishDraft(page)

    // Portuguese form: the question, the moved phone and the consent text.
    await page.goto('/apply?lang=pt&step=location')
    await expect(page.getByLabel(new RegExp(QUESTION_PT))).toBeVisible()
    await expect(page.getByRole('textbox', { name: /^Telefone/ })).toBeVisible()
    await page.goto('/apply?lang=pt&step=review')
    await expect(page.getByText(CONSENT_PT)).toBeVisible()

    // English form: no Website, a required question on step 2, then submit.
    // A visit resumes the step saved in this tab, so name the first step.
    await page.goto('/apply?lang=en&step=business')
    await expect(page.getByRole('heading', { level: 1, name: 'Apply as a business' })).toBeVisible()
    await expect(page.getByLabel('Website')).toHaveCount(0)
    await page.getByLabel('Business name').fill('Extra Questions Co')
    await page.getByLabel('What do you sell?').selectOption({ label: 'Furniture' })
    await page.getByLabel('About the business').fill('Solid oak furniture, made to order in Porto.')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Location' })).toBeVisible()
    await page.getByLabel('Country').fill('Portugal')
    await page.getByLabel('City').fill('Porto')
    await expect(page.getByRole('textbox', { name: /^Phone/ })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    // The question is required.
    await expect(page.getByText('This field is required.').first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Location' })).toBeVisible()
    await page.getByLabel(new RegExp(QUESTION_EN)).fill('Weekdays 10:00 to 18:00')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Contact person' })).toBeVisible()
    await page.getByLabel('Your name').fill('Rita Sousa')
    await page.getByRole('textbox', { name: /^Email/ }).fill('rita@extra-questions.test')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Your catalogue' })).toBeVisible()
    await page.getByRole('radio', { name: '11 to 50' }).check()
    await page.getByRole('group', { name: /product photos/ }).getByRole('radio', { name: 'Yes, for every product' }).check()
    await page.getByRole('group', { name: /3D models/ }).getByRole('radio', { name: 'We need help creating them' }).check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Review and send' })).toBeVisible()
    await expect(page.getByText(QUESTION_EN)).toBeVisible()
    await expect(page.getByText('Weekdays 10:00 to 18:00')).toBeVisible()
    await expect(page.getByText('Website', { exact: true })).toHaveCount(0)
    await page.getByLabel(/I confirm the information is accurate/).check()
    await page.getByRole('checkbox', { name: /^I agree to the Terms/ }).check()
    await page.getByRole('button', { name: 'Send application' }).click()
    await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()

    // The reviewer sees the question and the answer, "Not given" for the hidden field, and can approve it.
    await signInAsSuperAdmin(page)
    await page.goto('/admin/applications')
    await page.getByRole('link', { name: 'Extra Questions Co' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Extra Questions Co' })).toBeVisible()
    await expect(page.getByText('Extra questions', { exact: true })).toBeVisible()
    const questionRow = page.locator('dt', { hasText: QUESTION_EN })
    await expect(questionRow).toBeVisible()
    await expect(questionRow.locator('xpath=following-sibling::dd')).toHaveText('Weekdays 10:00 to 18:00')
    await expect(page.locator('dt', { hasText: 'Website' }).locator('xpath=following-sibling::dd')).toHaveText('Not given')

    await page.getByRole('button', { name: 'Start review' }).click()
    await expectToast(page, 'Marked as under review')
    await page.getByRole('button', { name: 'Approve' }).click()
    await confirmDialog(page, 'Approve')
    await expectToast(page, 'Application approved')
  })

  test('the dashboards switch to Portuguese from the top bar, keep it across a reload, and switch back', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await switchDashboardLang(page, mobile, 'pt')

    const places: { path: string; heading: string }[] = [
      { path: '/admin', heading: 'Visão geral' },
      { path: '/admin/applications', heading: 'Candidaturas' },
      { path: '/admin/businesses', heading: 'Empresas' },
      { path: '/admin/products', heading: 'Todos os produtos' },
    ]
    for (const { path, heading } of places) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      const nav = await navText(page, mobile)
      for (const label of PT_NAV) expect(nav, `${label} on ${path}`).toContain(label)
      for (const label of EN_NAV) expect(nav, `${label} on ${path}`).not.toContain(label)
    }
    // Settings is a full-screen hub outside the shell, with its own switch.
    await page.goto('/admin/settings/account')
    await expect(page.getByRole('heading', { level: 1, name: 'A minha conta' })).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'Idioma' }).first()).toBeVisible()
    await expect(page.getByText('My account')).toHaveCount(0)

    // The choice is remembered on this device.
    await page.goto('/admin/applications')
    await expect(page.getByRole('heading', { level: 1, name: 'Candidaturas' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Candidaturas' })).toBeVisible()

    await switchDashboardLang(page, mobile, 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible()
    const nav = await navText(page, mobile)
    for (const label of EN_NAV) expect(nav).toContain(label)
  })

  test('the language switch is the same component on the landing page, the sign-in page and the dashboard', async ({ page }) => {
    const shape = async (p: Page) => {
      const group = p.getByRole('radiogroup', { name: 'Language' }).first()
      await expect(group).toBeVisible()
      await expect(group.getByRole('radio')).toHaveText(['EN', 'PT'])
      return (await group.innerText()).replace(/\s+/g, ' ').trim()
    }
    await page.goto('/?lang=en')
    if (mobile) await page.getByRole('button', { name: /menu/i }).first().click().catch(() => {})
    const landing = await shape(page).catch(() => null)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/demo$/)
    const login = await shape(page)
    expect(login).toBe('EN / PT')
    if (landing) expect(landing).toBe(login)

    await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    if (mobile) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      const drawer = page.getByRole('dialog', { name: 'Navigation' })
      await expect(drawer.getByRole('radiogroup', { name: 'Language' })).toBeVisible()
      expect((await drawer.getByRole('radiogroup', { name: 'Language' }).innerText()).replace(/\s+/g, ' ').trim()).toBe(login)
    } else {
      expect(await shape(page)).toBe(login)
    }
  })

  test('Team cannot see or open the Editor; Admin can', async ({ page }) => {
    await signInAsPlatform(page, 'team')
    expect(await navText(page, mobile)).not.toContain('Website editor')
    await page.goto('/admin/editor')
    await expect(page.getByText("You don't have access to this page")).toBeVisible()
    await page.goto('/admin/editor/apply')
    await expect(page.getByText("You don't have access to this page")).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Editor actions' })).toHaveCount(0)

    await signInAsPlatform(page, 'admin')
    expect(await navText(page, mobile)).toContain('Website editor')
    await page.goto('/admin/editor')
    await expect(page.getByRole('heading', { level: 1, name: 'Website editor' })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Editor actions' })).toBeVisible()
  })
}
