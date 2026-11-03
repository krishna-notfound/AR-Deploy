// @vitest-environment node
// Admin showcase (ADR-0047): the hidden house business (businesses.is_house), its guard trigger, the landing.example key in the
// publish gate and the public read, and the rollback script. Runs on the shared PGlite harness; nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { HOUSE_BUSINESS_SLUG, emptySiteContent, type SiteContent } from '../../src/domain/siteContent'

const AS_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_admin_showcase.sql'))!
const AS_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261103_admin_showcase_rollback.sql')

const id = ids(1)
const OWNER = id(21)
const ADMIN = id(22)
const ANON = ''
const BIZ = '10000000-0000-0000-0000-0000000000a1'

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${OWNER}', 'as-owner@test', now()), ('${ADMIN}', 'as-admin@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}');
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'as-admin@test', 'admin', 'active');
    insert into public.businesses (id, slug, name, status) values ('${BIZ}', 'acme-as', 'Acme', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const houseProduct = (target: PGlite, slug = 'linden') =>
  target.exec(`insert into public.products (business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
    select id, '${slug}', '{"en":"Linden"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm' from public.businesses where is_house`)

describe('the house business', () => {
  it('exists once, as an active business named Sanctus with the reserved slug; other businesses are not houses', async () => {
    const { rows } = await db.query<{ slug: string; name: string; status: string; is_house: boolean; description: string }>(
      `select slug, name, status, is_house, description from public.businesses where is_house`,
    )
    expect(rows).toEqual([{ slug: HOUSE_BUSINESS_SLUG, name: 'Sanctus', status: 'active', is_house: true, description: "The platform's own showcase pieces." }])
    expect((await db.query<{ is_house: boolean }>(`select is_house from public.businesses where id = '${BIZ}'`)).rows).toEqual([{ is_house: false }])
    expect((await db.query(`select 1 from public.business_members m join public.businesses b on b.id = m.business_id where b.is_house`)).rows).toEqual([])
  })

  it('is readable by a visitor (active) and its published pieces are public', async () => {
    await houseProduct(db)
    await db.exec(`insert into public.product_images (product_id, url, kind, is_primary) select id, 'https://example.test/h.jpg', 'gallery', true from public.products where slug = 'linden';
                   update public.products set status = 'published' where slug = 'linden'`)
    expect(await h.count(ANON, `select count(*)::int as n from public.businesses where is_house`, [], null, 'anon')).toBe(1)
    expect(await h.count(ANON, `select count(*)::int as n from public.products p join public.businesses b on b.id = p.business_id where b.is_house`, [], null, 'anon')).toBe(1)
    await db.exec(`delete from public.products where slug = 'linden'`)
  })

  it('refuses to change is_house, either way, for the owner and for an API caller; other updates still work', async () => {
    await expect(db.exec(`update public.businesses set is_house = false where is_house`)).rejects.toMatchObject({ message: 'house_business_locked' })
    await expect(db.exec(`update public.businesses set is_house = true where id = '${BIZ}'`)).rejects.toMatchObject({ message: 'house_business_locked' })
    await expect(h.probe(OWNER, `update public.businesses set is_house = true where id = '${BIZ}'`)).rejects.toThrow()
    await db.exec(`update public.businesses set description = 'The platform''s own showcase pieces.' where is_house`)
    expect(await h.affected(OWNER, `update public.businesses set description = 'Showroom' where is_house`)).toBe(1)
  })

  it('refuses to delete the house, as the owner, an admin and the service role; any other business can be deleted', async () => {
    await expect(db.exec(`delete from public.businesses where is_house`)).rejects.toMatchObject({ message: 'house_business_locked' })
    await expect(h.probe(OWNER, `delete from public.businesses where is_house`)).rejects.toThrow()
    await expect(h.svc(`select to_jsonb((with d as (delete from public.businesses where is_house returning 1) select count(*) from d)) as r`)).rejects.toThrow()
    await db.exec(`insert into public.businesses (slug, name, status) values ('temp-as', 'Temp', 'draft')`)
    await db.exec(`delete from public.businesses where slug = 'temp-as'`)
    expect((await db.query(`select 1 from public.businesses where is_house`)).rows).toHaveLength(1)
  })

  it('refuses a second house; with the trigger off the unique index still does', async () => {
    await expect(db.exec(`insert into public.businesses (slug, name, status, is_house) values ('second-house', 'Two', 'active', true)`)).rejects.toMatchObject({ message: 'house_business_locked' })
    await db.exec(`alter table public.businesses disable trigger businesses_guard_house`)
    try {
      await expect(db.exec(`insert into public.businesses (slug, name, status, is_house) values ('second-house', 'Two', 'active', true)`)).rejects.toMatchObject({ code: '23505' })
    } finally {
      await db.exec(`alter table public.businesses enable trigger businesses_guard_house`)
    }
  })

  it('keeps the guard function private', async () => {
    const r = await db.query<{ a: boolean; n: boolean }>(`select has_function_privilege('authenticated', 'private.guard_house_business()', 'execute') as a, has_function_privilege('anon', 'private.guard_house_business()', 'execute') as n`)
    expect(r.rows[0]).toEqual({ a: false, n: false })
  })
})

describe('the migration', () => {
  it('fails loudly, and changes nothing, when a real business already uses the slug', async () => {
    const before = await freshDb((n) => n < AS_MIGRATION)
    try {
      await before.exec(`insert into public.businesses (slug, name, status) values ('${HOUSE_BUSINESS_SLUG}', 'Real', 'active')`)
      await expect(before.exec(readFileSync(join(MIGRATIONS, AS_MIGRATION), 'utf8'))).rejects.toThrow(/already uses the slug sanctus-showcase/)
    } finally {
      await before.close()
    }
  }, 60_000)
})

describe('landing.example (publish gate and public read)', () => {
  const doc = (mutate: (c: SiteContent) => void = () => {}): SiteContent => {
    const c = emptySiteContent()
    mutate(c)
    return c
  }
  const withExample = (ex: unknown) => doc((c) => void ((c.landing as Record<string, unknown>).example = ex))
  async function forceDraft(content: unknown): Promise<string> {
    const { rows } = await db.query<{ b: string }>(`update public.site_content set draft = $1::jsonb, draft_updated_at = clock_timestamp() returning to_jsonb(draft_updated_at) #>> '{}' as b`, [JSON.stringify(content)])
    return rows[0]!.b
  }
  const publish = async (b: string) => (await h.call(ADMIN, 'select public.admin_publish_site_content($1::timestamptz) as r', [b])) as unknown as { version: number }
  const refuses = async (content: unknown, detail: string) => {
    const b = await forceDraft(content)
    await expect(h.probe(ADMIN, 'select public.admin_publish_site_content($1::timestamptz)', [b])).rejects.toMatchObject({ message: 'invalid_content', detail })
  }
  const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, unknown> | null }).content
  const reset = () =>
    db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
             delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

  it('validates the reference exactly like landing.featured, with landing.example.* error keys', async () => {
    await reset()
    await refuses(withExample('nope'), 'landing.example|invalid_value')
    await refuses(withExample({ businessSlug: HOUSE_BUSINESS_SLUG }), 'landing.example.productSlug|required')
    await refuses(withExample({ productSlug: 'linden' }), 'landing.example.businessSlug|required')
    await refuses(withExample({ businessSlug: 'Bad Slug', productSlug: 'linden' }), 'landing.example.businessSlug|invalid_slug')
    await refuses(withExample({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: 'x'.repeat(61) }), 'landing.example.productSlug|invalid_slug')
    expect((await publish(await forceDraft(withExample({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: 'linden' })))).version).toBeGreaterThan(0)
    await reset()
  })

  it('the chrome part returns landingExample only when published, never the draft, and no key when absent', async () => {
    await reset()
    const ref = { businessSlug: HOUSE_BUSINESS_SLUG, productSlug: 'linden' }
    expect(await publish(await forceDraft(doc()))).toBeTruthy()
    expect(await chrome()).not.toHaveProperty('landingExample')
    expect(await publish(await forceDraft(withExample(ref)))).toBeTruthy()
    expect(await chrome()).toMatchObject({ landingExample: ref })
    await forceDraft(withExample({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: 'draft-only' }))
    expect(await chrome()).toMatchObject({ landingExample: ref })
    await reset()
  })
})

describe('rollback', () => {
  it('refuses while the house has products, changing nothing', async () => {
    const rolled = await freshDb()
    try {
      await houseProduct(rolled)
      await expect(rolled.exec(readFileSync(AS_ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/still has products/)
      await rolled.exec('rollback') // the script's own transaction is left open and aborted, as in psql
      expect((await rolled.query(`select 1 from public.businesses where is_house`)).rows).toHaveLength(1)
      expect((await rolled.query(`select 1 from pg_trigger where tgname = 'businesses_guard_house'`)).rows).toHaveLength(1)
    } finally {
      await rolled.close()
    }
  }, 120_000)

  it('apply → rollback → re-apply: the column, index, trigger and house row are gone, the two functions are back, grants kept', async () => {
    const before = await freshDb((n) => n < AS_MIGRATION)
    const rolled = await freshDb()
    try {
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of ['private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)'])
          out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      expect(await defs(rolled)).not.toEqual(await defs(before))
      await rolled.exec(readFileSync(AS_ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect((await rolled.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name = 'is_house'`)).rows).toEqual([])
      expect((await rolled.query(`select 1 from public.businesses where slug = '${HOUSE_BUSINESS_SLUG}'`)).rows).toEqual([])
      expect((await rolled.query(`select to_regprocedure('private.guard_house_business()') as f, to_regclass('public.businesses_one_house') as i`)).rows).toEqual([{ f: null, i: null }])
      const grants = await rolled.query<{ a: boolean; n: boolean }>(`select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n`)
      expect(grants.rows[0]).toEqual({ a: true, n: false })
      await rolled.exec(readFileSync(join(MIGRATIONS, AS_MIGRATION), 'utf8'))
      expect((await rolled.query(`select slug from public.businesses where is_house`)).rows).toEqual([{ slug: HOUSE_BUSINESS_SLUG }])
      expect(await defs(rolled)).not.toEqual(await defs(before))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
