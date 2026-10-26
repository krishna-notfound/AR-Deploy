// Supabase Edge Function: public AR model copies (owner decision 2026-10-26; handler.ts has the contract). JWT
// verification stays on (supabase/config.toml). The caller's own token answers who may ask (can_sync_ar_models, the
// Owner gate for { all: true }); the service role copies product-media files into the public ar-models bucket and
// writes public_url. No secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { AR_BUCKET, type ModelFormat, type SyncProduct, handleSyncArModels } from './handler.ts'

const MEDIA_BUCKET = 'product-media'
const CONTENT_TYPE: Record<ModelFormat, string> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' }

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const anonKey = env('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

type ModelRow = { format: ModelFormat; storage_path: string | null; url?: string | null; public_url: string | null }
type ProductRow = {
  id: string
  business_id: string
  status: string
  businesses: { status: string } | null
  product_models: ModelRow[] | null
  product_variants: { id: string; product_variant_models: ModelRow[] | null }[] | null
}

const fail = (what: string, e: { code?: string; statusCode?: string; name?: string } | null) =>
  new Error(`${what} failed: ${e?.code ?? e?.statusCode ?? e?.name ?? 'unknown'}`)

async function listFiles(prefix: string): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = []
  const folders: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(AR_BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw fail('list', error as { name?: string })
    for (const e of data ?? []) (e.id ? files : folders).push(`${prefix}/${e.name}`)
    if ((data ?? []).length < 1000) break
  }
  return { files, folders }
}

Deno.serve((req) =>
  handleSyncArModels(req, {
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    callerRpc: (token) => callerRpc(url, anonKey, token),
    ownerGate: (token) => gateCaller(callerRpc(url, anonKey, token), 'owner'),
    async product(productId) {
      const { data, error } = await admin
        .from('products')
        .select('id, business_id, status, businesses(status), product_models(format, storage_path, url, public_url), product_variants(id, product_variant_models(format, storage_path, public_url))')
        .eq('id', productId)
        .maybeSingle<ProductRow>()
      if (error) throw fail('product lookup', error)
      if (!data) return null
      const own = (data.product_models ?? []).map((m) => ({ variantId: null, format: m.format, storagePath: m.storage_path, url: m.url ?? null, publicUrl: m.public_url }))
      const variants = (data.product_variants ?? []).flatMap((v) =>
        (v.product_variant_models ?? []).map((m) => ({ variantId: v.id, format: m.format, storagePath: m.storage_path, url: null, publicUrl: m.public_url })),
      )
      return { id: data.id, businessId: data.business_id, status: data.status, businessStatus: data.businesses?.status ?? '', models: [...own, ...variants] } satisfies SyncProduct
    },
    async publishedProductIds() {
      const { data, error } = await admin.from('products').select('id').eq('status', 'published').limit(5000)
      if (error) throw fail('published lookup', error)
      return (data ?? []).map((r: { id: string }) => r.id)
    },
    async listFolder(folder) {
      // <business>/<product>/ holds one sub-folder per variant (and base); files sit one level down.
      const top = await listFiles(folder)
      const nested = await Promise.all(top.folders.map(listFiles))
      return [...top.files, ...nested.flatMap((n) => n.files)]
    },
    async copy(from, to, format) {
      // Download and upload (not a storage copy): a copy keeps the source's content type, and Quick Look and Scene
      // Viewer need the model type. A short cache, so an unpublished file stops being served soon.
      const file = await admin.storage.from(MEDIA_BUCKET).download(from)
      if (file.error || !file.data) throw fail('download', file.error as { name?: string })
      const up = await admin.storage.from(AR_BUCKET).upload(to, file.data, { upsert: true, contentType: CONTENT_TYPE[format], cacheControl: '3600' })
      if (up.error) throw fail('upload', up.error as { name?: string })
    },
    async remove(paths) {
      for (let i = 0; i < paths.length; i += 1000) {
        const { error } = await admin.storage.from(AR_BUCKET).remove(paths.slice(i, i + 1000))
        if (error) throw fail('remove', error as { name?: string })
      }
    },
    publicUrl: (path) => admin.storage.from(AR_BUCKET).getPublicUrl(path).data.publicUrl,
    async setPublicUrl(productId, m, value) {
      const q = m.variantId
        ? admin.from('product_variant_models').update({ public_url: value }).eq('variant_id', m.variantId).eq('product_id', productId).eq('format', m.format)
        : admin.from('product_models').update({ public_url: value }).eq('product_id', productId).eq('format', m.format)
      const { error } = await (m.storagePath ? q.eq('storage_path', m.storagePath) : q)
      if (error) throw fail('public_url update', error)
    },
  }).catch((e) => {
    console.error(`sync-ar-models: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)
