import {defineConfig} from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: 'line',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm run build && pnpm exec vite --config demo/vite.config.ts --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
})
