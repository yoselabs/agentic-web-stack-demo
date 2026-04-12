import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

import { TEST_DATABASE_URL } from "./test-env.js";

// Desktop runs all features except @mobile-tagged ones
const desktopTestDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "steps/**/*.ts",
  outputDir: ".features-gen/desktop",
  tags: "not @mobile",
});

// Mobile runs all features (including @mobile-specific ones)
const mobileTestDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "steps/**/*.ts",
  outputDir: ".features-gen/mobile",
});

export default defineConfig({
  globalSetup: "./global-setup.ts",
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Desktop viewport (default)
    {
      name: "desktop",
      testDir: desktopTestDir,
      use: { browserName: "chromium" },
    },
    // Reset DB between viewport runs so each starts with clean state
    // Depends on desktop → runs after desktop finishes
    {
      name: "mobile-setup",
      testMatch: /db-reset\.setup\.ts/,
      dependencies: ["desktop"],
    },
    // Mobile viewport (iPhone 14 dimensions, chromium)
    // Depends on mobile-setup → runs after DB reset
    {
      name: "mobile",
      testDir: mobileTestDir,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ["mobile-setup"],
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
