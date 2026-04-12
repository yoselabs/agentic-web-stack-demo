import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5433/agentic_web_stack_test";

export default async function globalSetup() {
  // Recreate test Postgres from scratch (tmpfs = clean state)
  execSync(
    "docker compose -f docker-compose.test.yml down -v 2>/dev/null; true",
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  execSync("docker compose -f docker-compose.test.yml up -d --wait", {
    cwd: ROOT,
    stdio: "inherit",
  });

  // Push schema to fresh database
  execSync("npx prisma db push --skip-generate", {
    cwd: path.join(ROOT, "packages/db"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
