// The live session on prod (the operator, 2026-11-23: "Test current prod now").
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: /prod\.live\.spec\.ts/,
  timeout: 60 * 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: process.env.RC_OUT,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://rpg.zephyrex.ca',
    screenshot: 'on',
    trace: 'on',
    launchOptions: { executablePath: '/usr/bin/chromium' },
  },
});
