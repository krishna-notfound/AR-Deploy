// Supabase Edge Function: tell staff about a new 3D model request (W5, ADR-0056). JWT verification stays on
// (supabase/config.toml). The request is read with the caller's own token, so row-level security decides what they may
// see; the service role only reads staff and preferences and writes notifications and push messages.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional: without them only the in-app list is written).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { createNotifier } from '../_shared/notifyAdmin.ts'
import { handleNotifyModelRequest } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const anonKey = env('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })
const notify = createNotifier(admin, env)

type Name = { en?: unknown; pt?: unknown }
const localized = (v: unknown): { en: string; pt?: string } => {
  const n = (v ?? {}) as Name
  return { en: typeof n.en === 'string' ? n.en : '', ...(typeof n.pt === 'string' && n.pt ? { pt: n.pt } : {}) }
}
const first = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

Deno.serve((req) =>
  handleNotifyModelRequest(req, {
    notify,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async loadRequest(token, requestId) {
      const caller = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await caller
        .from('model_requests')
        .select('requested_by, status, created_at, products(name), businesses(name)')
        .eq('id', requestId)
        .maybeSingle()
      if (error) throw new Error(`request lookup failed: ${error.code ?? 'unknown'}`)
      if (!data) return null
      const product = first(data.products as { name: unknown } | { name: unknown }[] | null)
      const business = first(data.businesses as { name: string } | { name: string }[] | null)
      return {
        businessName: business?.name ?? '',
        productName: localized(product?.name),
        requestedBy: (data.requested_by as string | null) ?? null,
        status: data.status as string,
        createdAt: data.created_at as string,
      }
    },
  }).catch((e) => {
    console.error(`notify-model-request: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)
