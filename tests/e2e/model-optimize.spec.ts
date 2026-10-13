import { crc32, deflateSync } from 'node:zlib'
import { Document, WebIO } from '@gltf-transform/core'
import { expect, test } from '@playwright/test'
import { signInAsSuperAdmin } from './helpers'

/** Real RGB PNG (gradient), so the browser can decode and re-encode it. */
function png(width: number, height: number): Uint8Array {
  const row = width * 3 + 1
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set([x % 256, y % 256, (x ^ y) % 256], y * row + 1 + x * 3)
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function glbWithLargeTexture(): Promise<Buffer> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const pos = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(new Float32Array([0, 0, 0, 0.8, 0, 0, 0.8, 0.7, 0.6]))
  const uv = doc.createAccessor().setType('VEC2').setBuffer(buffer).setArray(new Float32Array([0, 0, 1, 0, 1, 1]))
  const material = doc.createMaterial('fabric').setBaseColorTexture(doc.createTexture('base').setMimeType('image/png').setImage(png(4096, 4096)))
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv).setMaterial(material))
  doc.createScene().addChild(doc.createNode().setMesh(mesh))
  return Buffer.from(await new WebIO().writeBinary(doc))
}

// Runs with VITE_MODEL_OPTIMIZATION=on (playwright.config.ts). Production keeps it off until the client signs off.
test('GLB upload: oversized textures are reduced in the browser, with the original still available', async ({ page }) => {
  test.setTimeout(120_000)
  const buffer = await glbWithLargeTexture()
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products/prd_sheen_chair/edit')
  await page.locator('input[type="file"][accept=".glb"]').setInputFiles({ name: 'big-texture.glb', mimeType: 'model/gltf-binary', buffer })
  await expect(page.getByText('Optimized for faster loading', { exact: false })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Upload the original instead' }).click()
  await expect(page.getByText('Original file uploaded, not optimized.')).toBeVisible({ timeout: 30_000 })
})
