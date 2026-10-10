import { defineConfig } from '@playwright/test';

// Locally you can reuse an installed Chrome: PW_CHANNEL=chrome pnpm e2e. CI downloads Chromium.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4410',
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter askstatic-demo build && node e2e/serve.mjs demo/dist 4410',
    url: 'http://localhost:4410',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
