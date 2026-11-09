import { Document, WebIO } from '@gltf-transform/core'
import { expect, test } from '@playwright/test'
import { signInAsSuperAdmin } from './helpers'

/** A dresser modelled in millimetres: 602 x 1800 x 798 "metres" (ADR-0058). */
async function dresserInMillimetres(): Promise<Buffer> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const [x, z] = [301, 399]
  const pos = doc
    .createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(new Float32Array([-x, 0, -z, x, 0, -z, x, 1800, -z, -x, 1800, z, x, 1800, z, -x, 0, z]))
  const idx = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint16Array([0, 1, 2, 3, 4, 5]))
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(doc.createMaterial('oak')))
  doc.createScene().addChild(doc.createNode().setMesh(mesh))
  return Buffer.from(await new WebIO().writeBinary(doc))
}

// Owner 2026-11-09 (ADR-0058): a GLB of the wrong size gets a "Fix the scale" step before it is uploaded, in the worker, on desktop and phone.
test('GLB upload: a dresser made in millimetres is offered the scale fix and uploaded scaled only on the choice', async ({ page }) => {
  test.setTimeout(120_000)
  const buffer = await dresserInMillimetres()
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products/prd_sheen_chair/edit')
  await page.locator('input[type="file"][accept=".glb"]').setInputFiles({ name: 'dresser.glb', mimeType: 'model/gltf-binary', buffer })
  const panel = page.getByRole('region', { name: 'Fix the scale' })
  await expect(panel).toBeVisible({ timeout: 90_000 })
  await expect(panel).toContainText('1,800 m tall')
  await expect(panel).toContainText('made in millimetres')
  await expect(panel.getByRole('radio', { name: /Convert from millimetres/ })).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) // no sideways scroll, also at phone width
  await panel.getByRole('button', { name: 'Apply and upload' }).click()
  await expect(page.getByText(/Scale fixed: multiplied by 0\.001, now 0\.602 × 1\.8 × 0\.798 m\./)).toBeVisible({ timeout: 60_000 })
  await expect(panel).toBeHidden()
})
