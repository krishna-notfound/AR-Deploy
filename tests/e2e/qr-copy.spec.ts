import { expect, test } from '@playwright/test'
import QRCode from 'qrcode'
import { signInAsSuperAdmin } from './helpers'

// §19.12 Catalog URL copying and QR code download
test('copy catalog URL and download a QR code that encodes the catalog URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signInAsSuperAdmin(page)
  await page.goto('/admin/catalogs?business=biz_casa')
  const url = 'https://casa-lisboa.example.com'
  await expect(page.getByText(url, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Copy URL' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Catalog URL copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

  // Decode the rendered QR's module grid and compare it with the QR of the catalog URL.
  const img = page.getByRole('img', { name: `QR code linking to ${url}` })
  await expect(img).toBeVisible()
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const expected = Array.from(qr.modules.data, (v) => (v ? 1 : 0)).join('')
  const actual = await img.evaluate(
    async (el, { size, margin }) => {
      const image = el as HTMLImageElement
      await image.decode()
      const c = document.createElement('canvas')
      c.width = image.naturalWidth
      c.height = image.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const px = c.width / (size + margin * 2)
      let bits = ''
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const d = ctx.getImageData(Math.floor((x + margin + 0.5) * px), Math.floor((y + margin + 0.5) * px), 1, 1).data
          bits += d[0]! < 128 ? '1' : '0'
        }
      return bits
    },
    { size, margin: 2 },
  )
  expect(actual === expected, 'QR modules must encode the catalog URL').toBe(true)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()])
  expect(download.suggestedFilename()).toBe('casa-lisboa-catalog-qr.png')

  // Switching business switches the QR target
  await page.getByLabel('Business').selectOption({ label: 'Nordhaus Living' })
  await expect(page.getByRole('img', { name: 'QR code linking to https://nordhaus.example.com' })).toBeVisible()
})
