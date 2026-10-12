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

export const backend: BackendConfig = readBackendConfig(import.meta.env as BackendEnv)
export const isDemoMode = backend.mode === 'demo'
