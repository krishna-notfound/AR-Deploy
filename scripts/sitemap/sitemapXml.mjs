// Pure sitemap builder: data in, XML string out. No I/O, so it is unit-tested (sitemapXml.test.mjs).
// URL rules mirror src/lib/urls.ts path mode: catalogue /catalog/:business, product /products/:business/:product,
// collection /collections/:slug, footer page /pages/:slug, showcase piece /showcase/:product (ADR-0047).

export const SITE_ORIGIN = 'https://sanctus.company'

/** Public static routes (the same four as the original public/sitemap.xml). */
export const STATIC_PATHS = ['/', '/apply', '/privacy', '/terms']

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO = /^\d{4}-\d{2}-\d{2}T/

/** XML text escaping for element content. */
export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** A timestamp as a W3C date-time in UTC (`2026-11-28T09:30:00Z`), or undefined when it is missing or unparseable. */
export function toLastmod(value) {
  if (typeof value !== 'string' || !ISO.test(value)) return undefined
  const t = Date.parse(value)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const latest = (a, b) => (a && b ? (a > b ? a : b) : a || b)

/**
 * @param {object} data
 * @param {{ id: string, slug: string, status: string, is_house?: boolean, updated_at?: string }[]} [data.businesses]
 * @param {{ slug: string, business_id: string, status: string, updated_at?: string }[]} [data.products]
 * @param {string[]} [data.collectionSlugs]  published landing collections (/collections/:slug)
 * @param {string[]} [data.pageSlugs]        published footer pages (/pages/:slug)
 * @param {string} [data.origin]
 * @returns {string}
 */
export function buildSitemapXml({ businesses = [], products = [], collectionSlugs = [], pageSlugs = [], origin = SITE_ORIGIN } = {}) {
  /** @type {Map<string, string | undefined>} path -> lastmod; a Map makes duplicates impossible. */
  const urls = new Map()
  const add = (path, lastmod) => {
    if (!urls.has(path)) urls.set(path, lastmod)
  }

  for (const p of STATIC_PATHS) add(p)

  const active = new Map()
  const house = new Set()
  for (const b of businesses) {
    if (!b || b.status !== 'active' || !SLUG.test(b.slug ?? '')) continue
    if (b.is_house) house.add(b.id)
    else active.set(b.id, b)
  }
  const lastmods = new Map([...active.keys()].map((id) => [id, toLastmod(active.get(id).updated_at)]))

  // Published products of active businesses. The house business's pieces live at /showcase/:slug, never under /catalog or /products.
  const productEntries = []
  for (const p of products) {
    if (!p || p.status !== 'published' || !SLUG.test(p.slug ?? '')) continue
    const lastmod = toLastmod(p.updated_at)
    if (house.has(p.business_id)) {
      productEntries.push([`/showcase/${p.slug}`, lastmod])
      continue
    }
    const b = active.get(p.business_id)
    if (!b) continue
    productEntries.push([`/products/${b.slug}/${p.slug}`, lastmod])
    lastmods.set(b.id, latest(lastmods.get(b.id), lastmod))
  }

  for (const b of [...active.values()].sort((x, y) => x.slug.localeCompare(y.slug))) add(`/catalog/${b.slug}`, lastmods.get(b.id))
  for (const [path, lastmod] of productEntries.sort((x, y) => x[0].localeCompare(y[0]))) add(path, lastmod)
  for (const s of [...new Set(collectionSlugs)].sort()) if (SLUG.test(s)) add(`/collections/${s}`)
  for (const s of [...new Set(pageSlugs)].sort()) if (SLUG.test(s)) add(`/pages/${s}`)

  const body = [...urls]
    .map(([path, lastmod]) => `  <url><loc>${escapeXml(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}
