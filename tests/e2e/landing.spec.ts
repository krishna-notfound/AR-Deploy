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

test('landing page shows the client copy in Portuguese and links to real catalogues and products', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'PT' }).first().click()
  await expect(page.getByRole('heading', { name: 'Formas que conectam.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Catálogos 3D e RA para marcas de mobiliário.' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Candidatar a sua empresa' })).toHaveAttribute('href', '/apply')

  // "Ver coleção" opens the collection's own page (never a business catalogue).
  await page.getByRole('link', { name: /^Mesas/ }).click()
  await expect(page).toHaveURL(/\/collections\/tables$/)

  // The illustrative piece (no product record, no 3D model) never links to another product's 3D/AR page.
  await page.goto('/')
  await expect(page.getByText('Peça ilustrativa: a imagem e o preço são exemplos, não um produto à venda.')).toBeVisible()
  await expect(page.locator('#experiencia figure').getByRole('link')).toHaveCount(0)
})

test('the header apply button and the hero calls to action go to real pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Apply as a business' })).toHaveAttribute('href', '/apply')
  const example = page.getByRole('link', { name: 'See a live example' })
  await expect(example).toHaveAttribute('href', /\/catalog\/|\/[\w-]+\/[\w-]+/)
  await example.click()
  await expect(page).not.toHaveURL(/\/$/)
  await page.goto('/')
  await page.locator('#hero-title').locator('xpath=ancestor::section').getByRole('link', { name: /Apply as a business/ }).click()
  await expect(page).toHaveURL(/\/apply$/)
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
