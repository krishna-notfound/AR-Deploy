// Pure backend-config rules (no import.meta), shared by the app (backend.ts) and vite.config.ts.
// Chooses the data backend from build-time env vars (see System_arch/design/19-supabase.md).
// Demo is the safe default. Supabase is used only when explicitly selected AND fully configured;
// anything in between is reported as "misconfigured" instead of silently falling back to demo data.

export type BackendConfig =
  | { mode: 'demo' }
  | { mode: 'supabase'; url: string; publishableKey: string }
  | { mode: 'misconfigured'; problem: string }

export interface BackendEnv {
  VITE_DATA_MODE?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

/** True for keys that must never reach a browser: new `sb_secret_` keys and legacy service_role JWTs. */
function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return json.role === 'service_role'
  } catch {
    return false
  }
}

export function readBackendConfig(env: BackendEnv): BackendConfig {
  // Exact values only: services/index.ts compares the raw string at build time.
  const mode = env.VITE_DATA_MODE || 'demo'
  if (mode === 'demo') return { mode: 'demo' }
  if (mode !== 'supabase') return { mode: 'misconfigured', problem: `VITE_DATA_MODE must be exactly "demo" or "supabase", not "${mode}".` }

  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const missing = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean)
  if (missing.length) return { mode: 'misconfigured', problem: `VITE_DATA_MODE is "supabase" but ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.` }
  if (!/^https?:\/\/[^\s/]+/.test(url)) return { mode: 'misconfigured', problem: 'VITE_SUPABASE_URL must be a full URL such as https://<project-ref>.supabase.co.' }
  if (isPrivilegedKey(key))
    return {
      mode: 'misconfigured',
      problem: 'VITE_SUPABASE_PUBLISHABLE_KEY holds a secret/service_role key. Never ship it to the browser: rotate it and use the publishable key.',
    }
  return { mode: 'supabase', url, publishableKey: key }
}

/**
 * Problem that must stop a production build, or null. Production (VERCEL_ENV=production) must use
 * Supabase over https with a publishable key: demo data must never be served as the live site.
 * Local, preview and demo builds are not affected.
 */
export function productionBuildProblem(env: BackendEnv & { VERCEL_ENV?: string }): string | null {
  if (env.VERCEL_ENV !== 'production') return null
  const c = readBackendConfig(env)
  if (c.mode === 'demo') return 'Production builds need VITE_DATA_MODE=supabase (demo data must not go live).'
  if (c.mode === 'misconfigured') return c.problem
  if (!c.url.startsWith('https://')) return 'VITE_SUPABASE_URL must use https:// in production.'
  return null
}
