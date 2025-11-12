import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Theresmore Automation integration tests
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI, // Fail on .only in CI
  retries: process.env.CI ? 2 : 0, // Retry on CI
  workers: 1, // Single worker to avoid race conditions
  reporter: 'list',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Webserver for local testing (optional)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run build && echo "Build complete"',
        timeout: 30000,
        reuseExistingServer: true,
      },
})
