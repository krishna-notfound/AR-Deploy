// Chooses the data backend from build-time env vars (rules in backendConfig.ts, design/19-supabase.md).
import { type BackendConfig, type BackendEnv, readBackendConfig } from './backendConfig'

export { type BackendConfig, type BackendEnv, productionBuildProblem, readBackendConfig } from './backendConfig'

export const backend: BackendConfig = readBackendConfig(import.meta.env as BackendEnv)
export const isDemoMode = backend.mode === 'demo'
