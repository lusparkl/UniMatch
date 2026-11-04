import { defineConfig, devices } from "@playwright/test";
// Public deployment shape: PUBLIC_MODE on, fictional fixtures, no admin or accounts.
// Admin and account flows run separately in playwright.private.config.ts.
export default defineConfig({
  testDir: "./tests/e2e/public",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://localhost:3001", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DEMO_MODE: "DEMO_FIXTURES",
      PUBLIC_MODE: "true",
      ENABLED_COUNTRIES: "Hong Kong,South Korea",
      NEXT_PUBLIC_APP_URL: "http://localhost:3001",
      OPENAI_API_KEY: "",
      // Unreachable on purpose: public pages must not need Redis.
      REDIS_URL: "redis://127.0.0.1:1",
    },
  },
});
