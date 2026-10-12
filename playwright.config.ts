import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testMatch: /\.mobile\.spec\.ts$/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
    // E2E covers demo mode; process env beats .env.local, so a developer's Supabase setup is not used here.
    env: { VITE_DATA_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_ROOT_DOMAIN: '' },
  },
})
