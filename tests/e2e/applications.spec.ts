import { type Page, expect, test } from '@playwright/test'
import { confirmDialog, expectToast, signInAsSuperAdmin } from './helpers'

const expectErrorToast = (page: Page, text: RegExp | string) => expect(page.getByRole('alert').filter({ hasText: text }).first()).toBeVisible()

// ADR-0024: public application → admin review → approval into a draft business → owner invitation (demo mode).

async function fillWizard(page: Page, name: string, email: string) {
  await page.goto('/apply?lang=en')
  await expect(page.getByRole('heading', { level: 1, name: 'Apply as a business' })).toBeVisible()

  // Step 1: required fields are enforced before moving on.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('This field is required.').first()).toBeVisible()
  await page.getByLabel('Business name').fill(name)
  await page.getByLabel('Website').fill('www.atelier-norte.example')
  await page.getByLabel('What do you sell?').selectOption({ label: 'Furniture' })
  await page.getByLabel('About the business').fill('Too short')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Use at least 20 characters.')).toBeVisible()
  await page.getByLabel('About the business').fill('Solid oak furniture, made to order in Porto.')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Location' })).toBeVisible()
  await page.getByLabel('Country').fill('Portugal')
  await page.getByLabel('City').fill('Porto')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Contact person' })).toBeVisible()
  await page.getByLabel('Your name').fill('Rita Sousa')
  await page.getByRole('textbox', { name: /^Email/ }).fill('not-an-email')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/Enter a valid email address/)).toBeVisible()
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('radio', { name: 'Português' }).check()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Your catalogue' })).toBeVisible()
  await page.getByRole('radio', { name: '11 to 50' }).check()
  await page.getByRole('group', { name: /product photos/ }).getByRole('radio', { name: 'Yes, for every product' }).check()
  await page.getByRole('group', { name: /3D models/ }).getByRole('radio', { name: 'We need help creating them' }).check()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Review and send' })).toBeVisible()
  await expect(page.getByText('https://www.atelier-norte.example').or(page.getByText('www.atelier-norte.example'))).toBeVisible()
}

test('a business applies, is reviewed, approved as a draft and its owner invited', async ({ page }) => {
  await fillWizard(page, 'Atelier Norte', 'rita@atelier-norte.test')

  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByText('Please confirm to send your application.')).toBeVisible()
  await page.getByLabel(/I confirm the information is accurate/).check()
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()
  await expect(page.getByText(/^Reference: [A-Z0-9]{8}$/)).toBeVisible()

  // A second open application for the same business and email is refused.
  await fillWizard(page, 'atelier norte', 'rita@atelier-norte.test')
  await page.getByLabel(/I confirm the information is accurate/).check()
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByText(/already being reviewed/)).toBeVisible()

  // Admin review.
  await signInAsSuperAdmin(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Applications' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible()
  await page.getByLabel('Filter by status').selectOption({ label: 'Approved' })
  await expect(page.getByText('No applications match these filters')).toBeVisible()
  await page.getByLabel('Filter by status').selectOption({ index: 0 })
  await page.getByRole('link', { name: 'Atelier Norte' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Atelier Norte' })).toBeVisible()
  await expect(page.getByText('Solid oak furniture, made to order in Porto.')).toBeVisible()
  await expect(page.getByText('Needs help creating 3D models')).toBeVisible()

  // Reject needs a reason; cancel instead, then approve.
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reject application' }).click()
  await expect(page.getByText('Give a reason for the rejection.')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Start review' }).click()
  await expectToast(page, 'Marked as under review')
  await page.getByRole('button', { name: 'Approve' }).click()
  await confirmDialog(page, 'Approve')
  await expectToast(page, 'Application approved')
  await expect(page.getByText('Draft').first()).toBeVisible()

  // Owner invitation: prefilled from the application; demo mode says plainly that no email is sent.
  await expect(page.getByLabel('Owner email')).toHaveValue('rita@atelier-norte.test')
  await page.getByRole('button', { name: 'Invite owner' }).click()
  await confirmDialog(page, 'Invite owner')
  await expectErrorToast(page, /Owner provisioned, but the invitation email was not sent/)
  await expect(page.getByText('Invitation pending')).toBeVisible()

  // Resend respects the cooldown and the history keeps every attempt.
  await page.getByRole('button', { name: 'Resend invitation' }).click()
  await confirmDialog(page, 'Resend invitation')
  await expectErrorToast(page, 'Invitation not resent')
  await expect(page.getByText('Demo mode: no email is sent.').first()).toBeVisible()

  // The audit log lists the server-side events.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit log' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
  await expect(page.getByText(/Application submitted/).first()).toBeVisible()
})

test('the application wizard keeps a draft across a reload and offers the CTA from the landing page', async ({ page }) => {
  await page.goto('/?lang=en')
  await page.getByRole('link', { name: 'Apply as a business' }).first().click()
  await expect(page).toHaveURL(/\/apply/)
  await page.getByLabel('Business name').fill('Kept Draft')
  await page.reload()
  await expect(page.getByLabel('Business name')).toHaveValue('Kept Draft')
})
