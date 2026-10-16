import { defineConfig, devices } from '@playwright/test'

// Runs against a real server (with Postgres) serving the built SPA from SANTI_WEB_DIR.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // localhost, not 127.0.0.1: Chromium keeps the Secure session cookie on http://localhost.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8089',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
