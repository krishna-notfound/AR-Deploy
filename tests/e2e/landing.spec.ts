import { expect, test } from '@playwright/test'

test('landing page recreates the Sanctus reference and leads into the demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Beyond What Is Seen.' })).toBeVisible()
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
  await expect(page.getByText('Design atemporal que transcende o visível e transforma espaços em experiências.')).toBeVisible()
  await expect(page.getByText('“O design é a ponte entre o visível e o intangível.”')).toBeVisible()

  // "Ver coleção" opens a published catalogue filtered to that category.
  await page.getByRole('link', { name: 'Mesas: Ver coleção' }).click()
  await expect(page).toHaveURL(/\/catalog\/[\w-]+\?category=table$/)

  // The illustrative piece (no product record, no 3D model) never links to another product's 3D/AR page.
  await page.goto('/')
  await expect(page.getByText('Peça ilustrativa: imagem e preço das referências da marca.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver em 3D / AR' })).toHaveCount(0)
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
