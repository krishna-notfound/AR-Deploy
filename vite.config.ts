/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Let local dev/preview answer on business subdomains (e.g. casa-lisboa.furnish.test) when hostname mode is on.
  const root = loadEnv(mode, process.cwd(), 'VITE_').VITE_ROOT_DOMAIN
  const allowedHosts = root ? [root, `.${root}`] : []
  return {
    server: { allowedHosts },
    preview: { allowedHosts },
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
      include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
      css: false,
    },
  }
})
