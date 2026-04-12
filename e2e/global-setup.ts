import { execSync } from "node:child_process";
import path from "node:path";

import {
  PROJECT_ROOT,
  TEST_CONTAINER,
  TEST_DATABASE_URL,
  TEST_PORT,
} from "./test-env.js";

export default async function globalSetup() {
  // Recreate test Postgres from scratch (tmpfs = clean state)
  // Port and container name are derived from directory hash for worktree isolation
  const composeEnv = {
    ...process.env,
    TEST_PORT: String(TEST_PORT),
    TEST_CONTAINER,
  };

  execSync(
    "docker compose -f docker-compose.test.yml down -v 2>/dev/null; true",
    { cwd: PROJECT_ROOT, stdio: "inherit", env: composeEnv },
  );
  execSync("docker compose -f docker-compose.test.yml up -d --wait", {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: composeEnv,
  });

  // Push schema to fresh database
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: path.join(PROJECT_ROOT, "packages/db"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
