// Runs after `vite build`: writes dist/sitemap.xml with every public catalogue and product page.
// Reads only what anonymous visitors can read (publishable key, RLS), with plain fetch. Never fails the build: without the
// Supabase env vars (demo mode, CI, previews) or when a request fails, the static public/sitemap.xml copy in dist stays.
import { writeFile } from 'node:fs/promises'
import { buildSitemapXml, SITE_ORIGIN } from './sitemap/sitemapXml.mjs'

const OUT = new URL('../dist/sitemap.xml', import.meta.url)
const PAGE = 1000

async function getJson(url, key, init = {}) {
  const res = await fetch(url, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.split('?')[0]}`)
  return res.json()
}

async function getAll(base, key, table, select, extra = '') {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const batch = await getJson(`${base}/rest/v1/${table}?select=${select}${extra}&order=id.asc&limit=${PAGE}&offset=${from}`, key)
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

async function collect(base, key) {
  const [businesses, products, chrome] = await Promise.all([
    getAll(base, key, 'businesses', 'id,slug,status,is_house,updated_at', '&status=eq.active'),
    getAll(base, key, 'products', 'id,slug,business_id,status,updated_at', '&status=eq.published'),
    getJson(`${base}/rest/v1/rpc/get_published_site_content`, key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_part: 'chrome' }) }),
  ])
  const content = chrome?.content ?? {}
  const slugs = (list) => (Array.isArray(list) ? list.flatMap((x) => (typeof x?.slug === 'string' ? [x.slug] : [])) : [])
  return { businesses, products, collectionSlugs: slugs(content.landingCollections), pageSlugs: slugs(content.footerPages) }
}

async function main() {
  const base = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return console.log('sitemap: not a production build, keeping the static sitemap.xml')
  if (process.env.VITE_DATA_MODE !== 'supabase' || !base || !key) return console.warn('sitemap: Supabase env vars not set (demo mode), keeping the static sitemap.xml')
  try {
    const data = await collect(base, key)
    const xml = buildSitemapXml({ ...data, origin: process.env.SITEMAP_ORIGIN || SITE_ORIGIN })
    await writeFile(OUT, xml)
    console.log(`sitemap: wrote dist/sitemap.xml with ${(xml.match(/<url>/g) ?? []).length} URLs`)
  } catch (e) {
    console.warn(`sitemap: could not read the public data (${e instanceof Error ? e.message : e}); keeping the static sitemap.xml`)
  }
}

await main()
