import { execSync } from "node:child_process";
import path from "node:path";

import {
  PROJECT_ROOT,
  TEST_CONTAINER,
  TEST_DATABASE_URL,
  TEST_PORT,
} from "./test-env.js";

function isContainerHealthy(): boolean {
  try {
    const result = execSync(
      `docker inspect --format='{{.State.Health.Status}}' ${TEST_CONTAINER} 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    return result === "healthy";
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  const composeEnv = {
    ...process.env,
    TEST_PORT: String(TEST_PORT),
    TEST_CONTAINER,
  };

  if (isContainerHealthy()) {
    // Container already running — just reset the data (much faster than recreating)
    execSync("pnpm exec prisma db push --force-reset --skip-generate", {
      cwd: path.join(PROJECT_ROOT, "packages/db"),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
      },
    });
    return;
  }

  // Cold start: create container from scratch (tmpfs = clean state)
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
