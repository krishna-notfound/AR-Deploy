// @vitest-environment node
// Storage security hardening (QA 2026-11-14, ADR-0071): bucket limits equal the largest legitimate file, avatar names, staff
// with products.edit only cannot delete or overwrite product-media files that are in use, and the business-wide AR sync gate.
// PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_storage_security_hardening.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261114_storage_security_hardening_rollback.sql')

const id = ids(17)
const TEAM = id(1) // platform Team: products.edit, no products.delete
const ADMIN = id(2) // platform Admin: products.delete
const MEMBER = id(3)
const STRANGER = id(4)
const BIZ = id(10)
const OTHER_BIZ = id(11)
const PRODUCT = id(20)
const USED = `${BIZ}/${id(40)}.png`
const USED_ORIGINAL = `${BIZ}/${id(41)}.png`
const USED_MODEL = `${BIZ}/${id(42)}.glb`
const FREE = `${BIZ}/${id(43)}.png`
const AVATAR = (uid: string, file: string) => `${uid}/${file}`
const GOOD = id(50) + '.webp'

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${TEAM}', 'ss-team@test', now()), ('${ADMIN}', 'ss-admin@test', now()), ('${MEMBER}', 'ss-member@test', now()), ('${STRANGER}', 'ss-stranger@test', now());
    insert into public.platform_members (user_id, email, role, status) values
      ('${TEAM}', 'ss-team@test', 'team', 'active'), ('${ADMIN}', 'ss-admin@test', 'admin', 'active');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'SS Co', 'ss-co', 'active'), ('${OTHER_BIZ}', 'Other Co', 'ss-other', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${PRODUCT}', '${BIZ}', 'chair', '{"en":"Chair"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
    insert into public.product_images (product_id, storage_path, original_path, kind, is_primary) values ('${PRODUCT}', '${USED}', '${USED_ORIGINAL}', 'gallery', true);
    insert into public.product_models (product_id, format, storage_path, file_name) values ('${PRODUCT}', 'glb', '${USED_MODEL}', 'chair.glb');
    update public.products set status = 'published' where id = '${PRODUCT}';
  `)
}, 120_000)
afterAll(async () => {
  await db?.close()
})

const put = (name: string, bucket = 'product-media') => db.query('insert into storage.objects (bucket_id, name) values ($1, $2) on conflict do nothing', [bucket, name]).catch(async () => {
  await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name])
})
const drop = (bucket: string) => db.query('delete from storage.objects where bucket_id = $1', [bucket])
const del = (name: string) => `delete from storage.objects where bucket_id = 'product-media' and name = '${name}'`
const upd = (name: string) => `update storage.objects set metadata = '{"x":1}'::jsonb where bucket_id = 'product-media' and name = '${name}'`
const limit = async (bucket: string) => ((await db.query<{ n: string | null }>('select file_size_limit::text as n from storage.buckets where id = $1', [bucket])).rows[0]!.n)

describe('the migration', () => {
  it('sorts after the latest earlier migration and has a rollback', () => {
    expect(MIGRATION).toMatch(/^\d{14}_storage_security_hardening\.sql$/)
    expect(MIGRATION > '20261113084852_website_editor_signin_panel_heading.sql').toBe(true)
    expect(readFileSync(ROLLBACK_SQL, 'utf8')).toContain('product_media_editor_can_change')
  })
})

describe('bucket size limits (UX-3)', () => {
  it('match the largest legitimate file of each bucket', async () => {
    expect(await limit('business-logos')).toBe(String(40 * 1024 * 1024)) // kept at 40 MB: banner originals (ADR-0065, owner 2026-11-11)
    expect(await limit('product-media')).toBe(String(40 * 1024 * 1024)) // the 40 MB USDZ
    expect(await limit('ar-models')).toBe(String(40 * 1024 * 1024))
    expect(await limit('site-content')).toBe(String(40 * 1024 * 1024)) // a .usdz of the Website Editor stays possible
    expect(await limit('avatars')).toBe(String(512 * 1024))
    expect(await limit('model-request-photos')).toBe(String(10 * 1024 * 1024))
    expect(await limit('application-files')).toBe(String(20 * 1024 * 1024))
  })

  it('only ever lowers a limit', async () => {
    await db.exec(`update storage.buckets set file_size_limit = 1048576 where id = 'product-media'`)
    for (const stmt of readFileSync(join(MIGRATIONS, MIGRATION), 'utf8').match(/^update storage\.buckets .*;$/gm) ?? []) await db.exec(stmt)
    expect(await limit('product-media')).toBe('1048576')
    await db.exec(`update storage.buckets set file_size_limit = 41943040 where id = 'product-media'`)
  })
})

describe('avatars (F-TI-1)', () => {
  const insert = (name: string) => `insert into storage.objects (bucket_id, name) values ('avatars', '${name}')`

  it('accepts {user}/{uuid}.{jpg|png|webp} in the own folder only', async () => {
    for (const ext of ['jpg', 'png', 'webp']) await h.probe(MEMBER, insert(AVATAR(MEMBER, `${id(50)}.${ext}`)))
    await expect(h.probe(MEMBER, insert(AVATAR(STRANGER, GOOD)))).rejects.toThrow()
  })

  it('refuses other extensions and non-uuid names, even for the own folder', async () => {
    for (const bad of [`${id(50)}.html`, `${id(50)}.svg`, `${id(50)}.png.html`, `${id(50)}.gif`, 'x.png', `${id(50)}/${id(51)}.png`, `${id(50)}.PNG`, `a${id(50)}.png`]) {
      await expect(h.probe(MEMBER, insert(AVATAR(MEMBER, bad))), bad).rejects.toThrow()
    }
  })

  it('a replace may not rename the file to an odd name', async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [AVATAR(MEMBER, GOOD)])
    expect(await h.affected(MEMBER, `update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' and name = '${AVATAR(MEMBER, GOOD)}'`)).toBe(1)
    await expect(h.probe(MEMBER, `update storage.objects set name = '${MEMBER}/evil.html' where bucket_id = 'avatars' and name = '${AVATAR(MEMBER, GOOD)}'`)).rejects.toThrow()
    // Deleting an old, oddly named file of the own folder is still allowed.
    await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [AVATAR(MEMBER, 'legacy.webp')])
    expect(await h.affected(MEMBER, `delete from storage.objects where bucket_id = 'avatars' and name = '${AVATAR(MEMBER, 'legacy.webp')}'`)).toBe(1)
    await drop('avatars')
  })
})

describe('product-media for staff with products.edit only (UX-4)', () => {
  beforeAll(async () => {
    for (const n of [USED, USED_ORIGINAL, USED_MODEL, FREE]) await put(n)
  })
  afterAll(async () => {
    await drop('product-media')
  })

  it('the Team role cannot delete a file a product, a photo original or a model still uses', async () => {
    for (const n of [USED, USED_ORIGINAL, USED_MODEL]) expect(await h.affected(TEAM, del(n)), n).toBe(0)
  })

  it('the Team role cannot overwrite a file that is in use', async () => {
    for (const n of [USED, USED_ORIGINAL, USED_MODEL]) expect(await h.affected(TEAM, upd(n)), n).toBe(0)
  })

  it('the Team role can still remove (and change) a file nothing references, as after replacing a picture', async () => {
    expect(await h.affected(TEAM, del(FREE))).toBe(1)
    expect(await h.affected(TEAM, upd(FREE))).toBe(1)
  })

  it('staff with products.delete, and the business own member, keep their rights', async () => {
    expect(await h.affected(ADMIN, del(USED))).toBe(1)
    expect(await h.affected(MEMBER, del(USED_MODEL))).toBe(1)
  })

  it('a stranger deletes nothing', async () => {
    expect(await h.affected(STRANGER, del(USED_ORIGINAL))).toBe(0)
    expect(await h.affected(STRANGER, del(FREE))).toBe(0)
  })

  it('the helper reveals nothing to a caller without products.edit', async () => {
    expect(await h.flag(STRANGER, `public.product_media_editor_can_change('${FREE}')`)).toBe(false)
    expect(await h.flag(MEMBER, `public.product_media_editor_can_change('${FREE}')`)).toBe(false)
    expect(await h.flag(TEAM, `public.product_media_editor_can_change('${USED_ORIGINAL}')`)).toBe(false)
    expect(await h.flag(TEAM, `public.product_media_editor_can_change('${FREE}')`)).toBe(true)
  })
})

describe('anonymous reads of product-media (SECDB-F1, unchanged)', () => {
  it('see only files a published product of an active business uses', async () => {
    await db.exec(`insert into public.product_images (product_id, storage_path, kind, is_primary) values ('${PRODUCT}', '${BIZ}/${id(60)}.png', 'gallery', false) on conflict do nothing`)
    for (const n of [`${BIZ}/${id(60)}.png`, FREE, USED_ORIGINAL]) await put(n)
    const names = async () => (await h.probe('', `select name from storage.objects where bucket_id = 'product-media' order by name`, [], null, 'anon')).rows.map((r) => (r as { name: string }).name)
    expect(await names()).toEqual([`${BIZ}/${id(60)}.png`])
    await db.exec(`update public.products set status = 'draft' where id = '${PRODUCT}'`)
    expect(await names()).toEqual([])
    await db.exec(`update public.products set status = 'published' where id = '${PRODUCT}'`)
    await drop('product-media')
  })
})

describe('can_sync_ar_models_business (RLS-01 / BL-2)', () => {
  const gate = (uid: string, biz: string) => h.flag(uid, `public.can_sync_ar_models_business('${biz}')`)

  it('lets the business member and staff who change what is public ask, and nobody else', async () => {
    expect(await gate(MEMBER, BIZ)).toBe(true)
    expect(await gate(TEAM, BIZ)).toBe(true) // products.edit
    expect(await gate(ADMIN, BIZ)).toBe(true)
    expect(await gate(MEMBER, OTHER_BIZ)).toBe(false)
    expect(await gate(STRANGER, BIZ)).toBe(false)
  })

  it('answers for a business that no longer exists (its folder is emptied by staff), and refuses null', async () => {
    expect(await gate(ADMIN, id(99))).toBe(true)
    expect(await gate(MEMBER, id(99))).toBe(false)
    expect(await h.flag(ADMIN, `public.can_sync_ar_models_business(null)`)).toBe(false)
  })

  it('is not callable by anon', async () => {
    await expect(h.probe('', `select public.can_sync_ar_models_business('${BIZ}')`, [], null, 'anon')).rejects.toThrow()
  })
})

describe('the rollback', () => {
  it('restores the earlier policies and drops the helpers', async () => {
    await db.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
    expect(await limit('business-logos')).toBe(String(40 * 1024 * 1024))
    expect(await limit('product-media')).toBe(String(50 * 1024 * 1024))
    expect((await db.query(`select to_regprocedure('public.product_media_editor_can_change(text)') as f`)).rows[0]).toEqual({ f: null })
    expect((await db.query(`select to_regprocedure('public.can_sync_ar_models_business(uuid)') as f`)).rows[0]).toEqual({ f: null })
    await put(USED)
    expect(await h.affected(TEAM, del(USED))).toBe(1) // the earlier behaviour: products.edit deletes any file
    await db.exec(`insert into storage.objects (bucket_id, name) values ('avatars', '${MEMBER}/x.html')`)
    expect(await h.affected(MEMBER, `update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars'`)).toBeGreaterThan(0)
  })
})
