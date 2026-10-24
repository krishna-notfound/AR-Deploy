/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { productionBuildProblem } from './src/services/backendConfig.ts'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Stop a Vercel production build that would ship demo data or a bad Supabase config (design/20).
  // Does not cover `vercel deploy --prebuilt` from a laptop: production deploys go through Git only.
  const problem = command === 'build' ? productionBuildProblem({ ...env, VERCEL_ENV: process.env.VERCEL_ENV }) : null
  if (problem) throw new Error(`Production build blocked: ${problem}`)
  // Let local dev/preview answer on business subdomains (e.g. casa-lisboa.furnish.test) when hostname mode is on.
  const root = env.VITE_ROOT_DOMAIN
  const allowedHosts = root ? [root, `.${root}`] : []
  return {
    server: { allowedHosts },
    preview: { allowedHosts },
    // Which Vercel environment built this bundle ('production' | 'preview' | 'development'), 'local' elsewhere.
    define: { __DEPLOY_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'local') },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
      css: false,
      // Component tests drive whole pages with simulated input; 5 s is too tight once the suite runs in parallel.
      testTimeout: 20_000,
      // One jsdom worker per core starves the lazy-loaded pages (cold imports took over 20 s); half the cores is
      // faster overall and keeps timing-sensitive UI tests stable.
      maxWorkers: '50%',
      // Tests always run in demo mode, whatever a developer's .env.local says.
      env: { VITE_DATA_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_ROOT_DOMAIN: '' },
    },
  }
})
