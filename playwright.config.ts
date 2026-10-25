import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Sample models come from raw.githubusercontent.com and tests wait up to 60 s for them: the default 30 s
  // test budget was shorter than those waits, which made model tests fail on slow downloads.
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: [/\.mobile\.spec\.ts$/, /tests[\\/]visual[\\/]/], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testMatch: /\.mobile\.spec\.ts$/, testIgnore: /tests[\\/]visual[\\/]/, use: { ...devices['Pixel 7'] } },
    // Pixel guard for the pages the dashboard redesign must not touch (ADR-0031). Run it with `--project=guard`.
    {
      name: 'guard',
      testDir: './tests/visual',
      testMatch: /visual[\\/]guard\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled' } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
    // E2E covers demo mode; process env beats .env.local, so a developer's Supabase setup is not used here.
    // Model optimization is off by default (client sign-off pending, ADR-0019); E2E turns it on to test it.
    env: { VITE_DATA_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_ROOT_DOMAIN: '', VITE_MODEL_OPTIMIZATION: 'on' },
  },
})
