import { expect, test } from '@playwright/test'

test('landing page recreates the Sanctus reference and leads into the demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '3D and AR catalogues for furniture brands.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How it works for your business.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Shapes that connect.' })).toBeVisible()

  // The account icon in the header opens the demo account picker.
  await page.getByRole('banner').getByRole('link', { name: 'Open the demo' }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
})

test('landing page shows the client copy in Portuguese and links only to the showcase pieces', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'PT' }).first().click()
  await expect(page.getByRole('heading', { name: 'Formas que conectam.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Catálogos 3D e RA para marcas de mobiliário.' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Candidatar a sua empresa' })).toHaveAttribute('href', '/apply')

  // "Ver coleção" opens the collection's own page (never a business catalogue).
  await page.getByRole('link', { name: /^Mesas/ }).click()
  await expect(page).toHaveURL(/\/collections\/tables$/)

  // The 3D card shows one of the admin's own showcase pieces in place (ADR-0047), never links to a business product.
  await page.goto('/')
  await expect(page.locator('#experiencia a[href^="/products/"], #experiencia a[href^="/catalog/"]')).toHaveCount(0)
  await expect(page.locator('#experiencia').getByRole('button', { name: '3D', exact: true })).toBeVisible()
})

test('the header apply button and the one hero action go to real pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Apply as a business' })).toHaveAttribute('href', '/apply')
  const hero = page.locator('#hero-title').locator('xpath=ancestor::section')
  // One action in the hero (ADR-0047): the apply button lives in the header and the closing banners.
  await expect(hero.getByRole('link', { name: /Apply as a business/ })).toHaveCount(0)
  const example = hero.getByRole('link', { name: 'See a live example' })
  await expect(example).toHaveAttribute('href', /^\/showcase\/[\w-]+$/)
  await example.click()
  await expect(page).toHaveURL(/\/showcase\/[\w-]+$/)
  await expect(page.getByRole('link', { name: /Apply as a business/ }).last()).toHaveAttribute('href', '/apply')
})

test('old "/?next=" links still reach the account picker', async ({ page }) => {
  await page.goto('/?next=%2Fadmin%2Fanalytics')
  await expect(page).toHaveURL(/\/demo\?next=%2Fadmin%2Fanalytics/)
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page).toHaveURL(/\/admin\/analytics$/)
})

test('/login forwards to the demo picker when no backend is configured', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/demo$/)
})
