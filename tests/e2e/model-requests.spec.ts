import { type BrowserContext, type Page, expect, test } from '@playwright/test'
import { Document, WebIO } from '@gltf-transform/core'
import { PNG_1PX, expectToast, signInAsBusiness, signInAsPlatform } from './helpers'

// S4 3D model requests, demo mode (R-S4-16, R-S4-17, R-S4-19). One serial journey in one browser context: the demo
// database lives in localStorage, so every step sees what the earlier ones did. Sign-in switches between the Casa
// Lisboa owner (switch off), the Admin and the Nordhaus owner (switch on) the way the demo account picker does.

const CASA_CHAIR = '/dashboard/products/prd_mustard_chair/edit'
const CASA_CHAIR_PUBLIC = '/products/casa-lisboa/mustard-tufted-armchair'
const NORD_CHAIR = '/dashboard/products/prd_shell_chair/edit'
const DB_KEY = 'arfurn:v1:db'
const ACCOUNT_KEY = 'arfurn:account'
/** The app's own demo store module, served by the dev server (the e2e runs against it). */
const STORE_MODULE: string = '/src/services/mock/store.ts'

/** A small valid GLB (one triangle), made with the same library the app's optimiser uses. */
async function glb(): Promise<Buffer> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const pos = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(new Float32Array([0, 0, 0, 0.6, 0, 0, 0.6, 0.8, 0.5]))
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setMaterial(doc.createMaterial('plain')))
  doc.createScene().addChild(doc.createNode().setMesh(mesh))
  return Buffer.from(await new WebIO().writeBinary(doc))
}

/** A minimal valid USDZ for the app's check: a stored zip whose first entry is a .usda scene, with an end record. */
function usdz(): Buffer {
  const name = Buffer.from('scene.usda')
  const body = Buffer.from('#usda 1.0\n(defaultPrim = "Root")\ndef Xform "Root" {}\n'.padEnd(64, ' '))
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt32LE(body.length, 18) // compressed size (stored)
  local.writeUInt32LE(body.length, 22) // uncompressed size
  local.writeUInt16LE(name.length, 26)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  return Buffer.concat([local, name, body, end])
}

const photo = (n: number) => ({ name: `request-photo-${n}.png`, mimeType: 'image/png', buffer: PNG_1PX })

async function addPhotos(page: Page, count: number, from = 1) {
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(Array.from({ length: count }, (_, i) => photo(from + i)))
}

/** Owner side: send a request for the product open in the editor with two photos. */
async function sendRequest(page: Page) {
  await addPhotos(page, 2)
  await expect(page.getByText('2 of 10 photos')).toBeVisible()
  await page.getByRole('button', { name: 'Send request' }).click()
  await expectToast(page, "Request sent. We'll email you when the model is ready.")
  await expect(page.getByText(/^Requested on /)).toBeVisible()
}

/** Staff side: open a request from the queue, start work, stage both files and deliver. */
async function deliverFromQueue(page: Page, productName: string) {
  await page.getByRole('link', { name: /^3D requests/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '3D model requests' })).toBeVisible()
  await page.getByRole('link', { name: productName, exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: productName })).toBeVisible()
  await page.getByRole('button', { name: 'Start work' }).click()
  await expectToast(page, 'Work started.')
  await expect(page.getByRole('button', { name: 'Start work' })).toHaveCount(0)
  await page.locator('input[type="file"][accept=".glb"]').setInputFiles({ name: 'request-model.glb', mimeType: 'model/gltf-binary', buffer: await glb() })
  await expect(page.getByText('request-model.glb')).toBeVisible({ timeout: 30_000 })
  await page.locator('input[type="file"][accept=".usdz"]').setInputFiles({ name: 'request-model.usdz', mimeType: 'model/vnd.usdz+zip', buffer: usdz() })
  await expect(page.getByText('request-model.usdz')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Deliver model' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: `Deliver the 3D model for ${productName}?` })).toBeVisible()
  await expect(dialog.getByText('There’s no USDZ file', { exact: false })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Deliver model' }).click()
  await expectToast(page, 'Model delivered. Demo: no email was sent.')
}

/**
 * Moves to another route without reloading the document. Files staged and delivered in demo are session-only blob
 * URLs (ADR-0007): a reload makes them stale, and the app then correctly hides the 3D view. Checks made after a
 * delivery therefore stay in the same document, like the account picker and the router do for a person.
 */
async function spa(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState({}, '', to)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** The account picker, reached without a reload (see spa). */
async function spaSignInAsBusiness(page: Page, businessName: string) {
  await spa(page, '/demo')
  await page.getByLabel('Business', { exact: true }).selectOption({ label: businessName })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

/** The stored status of the newest request for a product (the demo database as saved in localStorage). */
function requestStatus(page: Page, productId: string): Promise<string | undefined> {
  return page.evaluate(
    ([key, id]) => {
      const db = JSON.parse(localStorage.getItem(key!) ?? '{}') as { modelRequests?: { productId: string; status: string; createdAt: string }[] }
      return db.modelRequests?.filter((r) => r.productId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.status
    },
    [DB_KEY, productId],
  )
}

/** The "n with a 3D model" hint on the business Overview. */
async function productsWith3d(page: Page, navigate: (path: string) => Promise<unknown> = (path) => page.goto(path)): Promise<number> {
  await navigate('/dashboard')
  const hint = page.getByText(/\d+ with a 3D model/)
  await expect(hint).toBeVisible()
  return Number(/(\d+) with a 3D model/.exec((await hint.textContent()) ?? '')?.[1])
}

test.describe.serial('3D model requests (demo)', () => {
  test.setTimeout(150_000)
  let context: BrowserContext
  let page: Page
  let withModelBefore = 0

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await context.newPage()
  })
  test.afterAll(async () => {
    await context.close()
  })

  test('the owner of a switch-off business requests a model with photos; customers see nothing', async () => {
    await signInAsBusiness(page, 'Casa Lisboa Interiors')
    withModelBefore = await productsWith3d(page)

    await page.goto(CASA_CHAIR)
    await expect(page.getByRole('heading', { level: 1, name: 'Mustard Tufted Armchair' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Request a 3D model' })).toBeVisible()
    // The switch is off: no way to add, replace or remove a 3D file here.
    await expect(page.locator('input[type="file"][accept=".glb"]')).toHaveCount(0)
    await expect(page.locator('input[type="file"][accept=".usdz"]')).toHaveCount(0)
    await expect(page.getByText('3D models for your products are made by the Sanctus team. Request one below.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()

    // One photo is not enough; the 11th is refused with the reason.
    await addPhotos(page, 1)
    await expect(page.getByText('Add at least 2 photos.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()
    await addPhotos(page, 10, 2)
    await expect(page.getByRole('alert').filter({ hasText: 'Up to 10 photos. Remove one to add another.' })).toBeVisible()
    await expect(page.getByText('10 of 10 photos')).toBeVisible()
    await page.getByRole('button', { name: 'Remove request-photo-10.png' }).click()
    await page.getByRole('button', { name: 'Remove request-photo-9.png' }).click()
    await expect(page.getByText('8 of 10 photos')).toBeVisible()

    await page.getByLabel('Notes for the Sanctus team (optional)').fill('Oak legs, removable cushion.')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expectToast(page, "Request sent. We'll email you when the model is ready.")
    await expect(page.getByText(/^Requested on /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel request' })).toBeVisible()

    // Hidden until ready (R-S4-16): the product is published, and nothing about the request or a 3D view shows.
    await page.goto(CASA_CHAIR_PUBLIC)
    await expect(page.getByRole('heading', { level: 1, name: 'Mustard Tufted Armchair' })).toBeVisible()
    await expect(page.getByText('3D view is not available for this product yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View in 3D', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View in my home' })).toHaveCount(0)
    await expect(page.getByText('View in your space on a phone')).toHaveCount(0)
    await expect(page.getByText(/3D request|requested|coming/i)).toHaveCount(0)
  })

  test('the Admin starts the request, stages a GLB and a USDZ and delivers; no email in demo', async () => {
    await signInAsPlatform(page, 'admin')
    await deliverFromQueue(page, 'Mustard Tufted Armchair')
    // The request leaves the Open tab and shows under Delivered.
    await page.getByRole('link', { name: /^3D requests/ }).first().click()
    await page.getByRole('tab', { name: 'Delivered' }).click()
    await expect(page.getByRole('link', { name: 'Mustard Tufted Armchair' }).first()).toBeVisible()
  })

  test('after delivery the public page offers 3D, the owner sees Ready and AR ready, and the 3D count goes up', async () => {
    // Same document as the delivery (see spa): the delivered files are session-only in demo.
    await spa(page, CASA_CHAIR_PUBLIC)
    await expect(page.getByRole('heading', { level: 1, name: 'Mustard Tufted Armchair' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View in 3D', exact: true }).first()).toBeVisible()
    await expect(page.getByText('3D view is not available for this product yet.')).toHaveCount(0)

    await spaSignInAsBusiness(page, 'Casa Lisboa Interiors')
    await spa(page, CASA_CHAIR)
    await expect(page.getByText(/^Ready since /)).toBeVisible()
    await expect(page.getByText('AR ready', { exact: true })).toBeVisible()
    // Still no way to change the files: they are managed by the Sanctus team.
    await expect(page.getByText('Current 3D files, managed by the Sanctus team')).toBeVisible()
    await expect(page.locator('input[type="file"][accept=".glb"]')).toHaveCount(0)

    // Seeded Casa products with a model: the sofa delivered in the seed plus the ones with sample files.
    const after = await productsWith3d(page, (path) => spa(page, path))
    expect(after).toBe(withModelBefore + 1)
  })

  test('declining a request with a reason shows the owner the reason and a way to send a new request', async () => {
    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/model-requests')
    await page.getByRole('link', { name: 'Alfama Tall Bookcase', exact: true }).first().click()
    await page.getByRole('button', { name: 'Decline' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Decline request' }).click()
    await expect(dialog.getByText('Write a reason. It is sent to the business.')).toBeVisible()
    await dialog.getByLabel(/^Reason/).fill('The photos are blurry. Please send new ones in daylight.')
    await dialog.getByRole('button', { name: 'Decline request' }).click()
    await expectToast(page, 'Request declined. Demo: no email was sent.')

    await signInAsBusiness(page, 'Casa Lisboa Interiors')
    await page.goto('/dashboard/products/prd_bookcase/edit')
    await expect(page.getByText(/^Declined on .* Reason: The photos are blurry\. Please send new ones in daylight\.$/)).toBeVisible()
    await page.getByRole('button', { name: 'Send a new request' }).click()
    await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible()
  })

  test('the Admin turns the own-upload switch on for the business and the owner sees "Upload your own"', async () => {
    await signInAsBusiness(page, 'Casa Lisboa Interiors')
    await page.goto(CASA_CHAIR)
    await expect(page.getByRole('radio', { name: 'Upload your own' })).toHaveCount(0)

    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/businesses/biz_casa')
    const toggle = page.getByRole('switch', { name: 'Can upload its own 3D files' })
    await expect(toggle).not.toBeChecked()
    await toggle.click()
    await expectToast(page, 'Saved')
    await expect(toggle).toBeChecked()

    await signInAsBusiness(page, 'Casa Lisboa Interiors')
    await page.goto(CASA_CHAIR)
    await expect(page.getByRole('radio', { name: 'Request from Sanctus (recommended)' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Upload your own' })).toBeVisible()
  })
})

// R-S4-17. The demo database is per browser context (localStorage), so the second "browser" is a second page of the
// same context. A real second browser reads the database fresh; the first page here is brought up to date the same
// way, by loading the stored demo database into its in-memory store (what a data refetch from the server returns).
test.describe('a delivery is never undone by an editor opened before it (demo)', () => {
  test.setTimeout(150_000)

  test('the owner of a switch-on business gets "Reload", the delivered files are kept, and an untouched 3D section saves', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const owner = await context.newPage()
      await signInAsBusiness(owner, 'Nordhaus Living')
      await owner.goto(NORD_CHAIR)
      await expect(owner.getByRole('heading', { level: 1, name: 'Fjord Shell Chair' })).toBeVisible()
      // Switch on: the request is the recommended choice and "Upload your own" is the other.
      await expect(owner.getByRole('radio', { name: 'Request from Sanctus (recommended)' })).toHaveAttribute('aria-checked', 'true')
      await sendRequest(owner)
      await expect.poll(() => requestStatus(owner, 'prd_shell_chair')).toBe('requested')
      const ownerSession = await owner.evaluate((k) => localStorage.getItem(k), ACCOUNT_KEY)

      // The Admin, in a second page, delivers a model for the same product while the owner's editor stays open.
      const admin = await context.newPage()
      await signInAsPlatform(admin, 'admin')
      await deliverFromQueue(admin, 'Fjord Shell Chair')
      await expect.poll(() => requestStatus(admin, 'prd_shell_chair')).toBe('delivered')
      await admin.close()

      // The owner's page learns of the delivery without reloading the editor, and the owner session is theirs again.
      await owner.evaluate(
        async ([db, account, session, storeModule]) => {
          localStorage.setItem(account!, session!)
          const { store } = (await import(/* @vite-ignore */ storeModule!)) as { store: { replace: (d: unknown) => void } }
          store.replace(JSON.parse(localStorage.getItem(db!) ?? '{}'))
        },
        [DB_KEY, ACCOUNT_KEY, ownerSession, STORE_MODULE],
      )

      // The owner changes the 3D model in the stale editor and saves: refused, nothing is overwritten.
      await owner.getByRole('radio', { name: 'Upload your own' }).click()
      await owner.locator('input[type="file"][accept=".glb"]').setInputFiles({ name: 'owner-version.glb', mimeType: 'model/gltf-binary', buffer: await glb() })
      await expect(owner.getByText('owner-version.glb')).toBeVisible({ timeout: 30_000 })
      await owner.getByRole('button', { name: 'Save changes' }).click()
      await expect(owner.getByRole('alert').filter({ hasText: 'The Sanctus team delivered a 3D model while you were editing. Reload to see it.' }).first()).toBeVisible()

      // Reload shows the delivered files, not the owner's file.
      await owner.getByRole('button', { name: 'Reload' }).first().click()
      await owner.getByRole('radio', { name: 'Upload your own' }).click()
      await expect(owner.getByText('request-model.glb')).toBeVisible()
      await expect(owner.getByText('owner-version.glb')).toHaveCount(0)

      // Saving without touching the 3D section succeeds and keeps the delivered files.
      await owner.getByPlaceholder('e.g. Solid oak, linen upholstery').first().fill('Moulded plywood, oak legs')
      await owner.getByRole('button', { name: 'Save changes' }).click()
      await expectToast(owner, 'Changes saved')
      await expect(owner.getByText('request-model.glb')).toBeVisible()
      // The stored product still carries the delivered files (the owner's file never reached the database).
      await expect
        .poll(() =>
          owner.evaluate((k) => {
            const db = JSON.parse(localStorage.getItem(k) ?? '{}') as { products?: { id: string; material?: { en?: string }; models?: { glb?: { fileName?: string } } }[] }
            const p = db.products?.find((x) => x.id === 'prd_shell_chair')
            return `${p?.material?.en}|${p?.models?.glb?.fileName}`
          }, DB_KEY),
        )
        .toBe('Moulded plywood, oak legs|request-model.glb')
    } finally {
      await context.close()
    }
  })
})
