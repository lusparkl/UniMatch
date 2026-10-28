import { defineConfig, devices } from "@playwright/test";
import { hashSync } from "bcryptjs";
// Only this test server receives these credentials; never written to .env.
export default defineConfig({
  testDir: "./tests/e2e",
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
      NEXT_PUBLIC_APP_URL: "http://localhost:3001",
      OPENAI_API_KEY: "",
      ADMIN_EMAIL: "test-admin@example.test",
      ADMIN_PASSWORD_HASH:
        "base64:" +
        Buffer.from(hashSync("test-only-password-123", 4)).toString("base64"),
    },
  },
});
