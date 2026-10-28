import "dotenv/config";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.spec.ts"],
    testTimeout: 45000,
    hookTimeout: 30000,
    restoreMocks: true,
    fileParallelism: false,
  },
});
