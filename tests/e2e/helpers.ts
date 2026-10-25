import { type Page, expect } from '@playwright/test'

/** 1×1 PNG used for upload tests. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export async function signInAsSuperAdmin(page: Page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

/** Demo platform staff (ADR-0029): the sample Admin or Team member. */
export async function signInAsPlatform(page: Page, role: 'admin' | 'team') {
  await page.goto('/demo')
  await page.getByRole('button', { name: role === 'admin' ? 'Continue as Admin (sample)' : 'Continue as Team (sample)' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

export async function signInAsBusiness(page: Page, businessName: string) {
  await page.goto('/demo')
  await page.getByLabel('Business', { exact: true }).selectOption({ label: businessName })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible()
}

export async function confirmDialog(page: Page, buttonName: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: buttonName }).click()
  await expect(dialog).toBeHidden()
}
