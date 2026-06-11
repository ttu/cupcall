import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
