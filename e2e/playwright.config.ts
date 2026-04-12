import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

import { TEST_DATABASE_URL } from "./test-env.js";

const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "steps/**/*.ts",
});

export default defineConfig({
  testDir,
  globalSetup: "./global-setup.ts",
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @project/server dev",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        BETTER_AUTH_SECRET: "test-secret-key-for-e2e-tests-only-32chars",
        BETTER_AUTH_URL: "http://localhost:3001",
        CORS_ORIGIN: "http://localhost:3000",
      },
    },
    {
      command: "pnpm --filter @project/web dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
