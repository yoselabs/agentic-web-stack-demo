import { execSync } from "node:child_process";
import path from "node:path";
import { test as setup } from "@playwright/test";

import { PROJECT_ROOT, TEST_DATABASE_URL } from "./test-env.js";

// Reset the test database between viewport projects.
// This ensures each viewport (desktop, mobile) starts with a clean DB state,
// avoiding conflicts from hardcoded test emails across project runs.
setup("reset test database", () => {
  execSync("pnpm exec prisma db push --force-reset --skip-generate", {
    cwd: path.join(PROJECT_ROOT, "packages/db"),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      // This resets the TEST database between viewport project runs (desktop → mobile).
      // Safe: test DB uses tmpfs (in-memory), recreated from scratch each test run.
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
    },
  });
});
