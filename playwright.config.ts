import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const externalURL = process.env.PLAYWRIGHT_BASE_URL;
const devURL = 'http://127.0.0.1:5173';
const buildURL = 'http://127.0.0.1:5174';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: externalURL || devURL,
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    trace: 'retain-on-failure',
  },
  projects: externalURL
    ? undefined
    : [
        { name: 'app', testIgnore: '**/seo.spec.ts' },
        { name: 'seo-build', testMatch: '**/seo.spec.ts', use: { baseURL: buildURL } },
      ],
  webServer: externalURL
    ? undefined
    : [
        {
          command: 'npm run build && npm run preview -- --port 5174 --strictPort',
          url: buildURL,
          timeout: 120000,
        },
        {
          command: 'npm run dev -- --port 5173 --strictPort',
          url: devURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      ],
});
