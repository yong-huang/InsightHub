import { defineConfig, devices } from '@playwright/test'

// E2E smoke tests run against the Vite dev server (port 5600) so that the
// documentDiscovery plugin is available: it serves the enriched manifest,
// /dev-docs/ content, and the JSON data files the app reads on startup.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5600',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // strictPort so the url below is guaranteed to match the spawned server
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5600',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
